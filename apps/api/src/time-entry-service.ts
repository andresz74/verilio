import type {
  ManualTimeEntryInput,
  TimeEntryDto,
  TimeEntryUpdateInput,
  TimerStartInput,
  TimerStateResponse,
  TimerStopResponse,
} from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { businessProfiles, clients, projects, tasks, timeEntries } from "@verilio/db";
import {
  assertPositiveDurationSeconds,
  calculateDurationSeconds,
  resolveHourlyRate,
  resolveRange,
  workDateFromInstant,
} from "@verilio/domain";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { ApiError } from "./errors.js";
import { LOCAL_USER_ID } from "./settings-service.js";

type TimeEntryRow = typeof timeEntries.$inferSelect;
type TimeContext = {
  clientRate: string | null;
  projectRate: string | null;
  businessRate: string;
  timezone: string;
};

export interface TimeEntryServiceContract {
  current(): Promise<TimerStateResponse>;
  start(input: TimerStartInput): Promise<TimerStateResponse>;
  stop(): Promise<TimerStopResponse>;
  listRecent(limit: number): Promise<TimeEntryDto[]>;
  get(id: string): Promise<TimeEntryDto | null>;
  create(input: ManualTimeEntryInput): Promise<TimeEntryDto>;
  update(id: string, input: TimeEntryUpdateInput): Promise<TimeEntryDto | null>;
  delete(id: string): Promise<boolean>;
}

export class TimeEntryService implements TimeEntryServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async current(): Promise<TimerStateResponse> {
    const serverNow = this.clock();
    const [row] = await this.db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, this.ownerId),
          eq(timeEntries.mode, "timer"),
          isNull(timeEntries.endAt),
        ),
      )
      .limit(1);
    return { timer: row ? await this.loadDto(row.id) : null, serverNow: serverNow.toISOString() };
  }

  async start(input: TimerStartInput): Promise<TimerStateResponse> {
    const context = await this.requireContext(input, true);
    const existing = await this.current();
    if (existing.timer) {
      throw new ApiError(409, "TIMER_ALREADY_RUNNING", "A timer is already running.");
    }
    const serverNow = this.clock();

    try {
      const [row] = await this.db
        .insert(timeEntries)
        .values({
          userId: this.ownerId,
          clientId: input.clientId,
          projectId: input.projectId,
          taskId: input.taskId,
          description: input.description.trim(),
          mode: "timer",
          workDate: workDateFromInstant(serverNow, context.timezone),
          startAt: serverNow,
          endAt: null,
          durationSeconds: null,
          billable: input.billable,
          hourlyRate: null,
        })
        .returning({ id: timeEntries.id });
      if (!row) throw new Error("Timer insert returned no record");
      return { timer: await this.loadDto(row.id), serverNow: serverNow.toISOString() };
    } catch (error) {
      if (isRunningTimerUniqueViolation(error)) {
        throw new ApiError(409, "TIMER_ALREADY_RUNNING", "A timer is already running.");
      }
      throw error;
    }
  }

  async stop(): Promise<TimerStopResponse> {
    const [running] = await this.db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, this.ownerId),
          eq(timeEntries.mode, "timer"),
          isNull(timeEntries.endAt),
        ),
      )
      .limit(1);
    if (!running || !running.startAt) {
      throw new ApiError(409, "NO_RUNNING_TIMER", "No timer is currently running.");
    }

    const serverNow = this.clock();
    const durationSeconds = Math.max(1, calculateDurationSeconds(running.startAt, serverNow));
    const context = await this.requireContext(running, false);
    const hourlyRate = resolveHourlyRate({
      billable: running.billable,
      projectRate: context.projectRate,
      clientRate: context.clientRate,
      businessRate: context.businessRate,
    });
    const [updated] = await this.db
      .update(timeEntries)
      .set({ endAt: serverNow, durationSeconds, hourlyRate, updatedAt: serverNow })
      .where(
        and(
          eq(timeEntries.id, running.id),
          eq(timeEntries.userId, this.ownerId),
          isNull(timeEntries.endAt),
        ),
      )
      .returning({ id: timeEntries.id });
    if (!updated) {
      throw new ApiError(409, "NO_RUNNING_TIMER", "No timer is currently running.");
    }
    const entry = await this.loadDto(updated.id);
    if (!entry) throw new Error("Stopped timer could not be loaded");
    return { entry, serverNow: serverNow.toISOString() };
  }

  async listRecent(limit: number): Promise<TimeEntryDto[]> {
    const rows = await this.db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, this.ownerId), isNotNull(timeEntries.durationSeconds)))
      .orderBy(desc(timeEntries.updatedAt), desc(timeEntries.createdAt))
      .limit(limit);
    return Promise.all(rows.map(({ id }) => this.loadDtoRequired(id)));
  }

  get(id: string): Promise<TimeEntryDto | null> {
    return this.loadDto(id);
  }

  async create(input: ManualTimeEntryInput): Promise<TimeEntryDto> {
    const context = await this.requireContext(input, true);
    const timing = this.resolveCompletedTiming(input, context.timezone);
    const hourlyRate = resolveHourlyRate({
      billable: input.billable,
      projectRate: context.projectRate,
      clientRate: context.clientRate,
      businessRate: context.businessRate,
    });
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        userId: this.ownerId,
        clientId: input.clientId,
        projectId: input.projectId,
        taskId: input.taskId,
        description: input.description.trim(),
        mode: input.mode,
        ...timing,
        billable: input.billable,
        hourlyRate,
      })
      .returning({ id: timeEntries.id });
    if (!row) throw new Error("Time entry insert returned no record");
    return this.loadDtoRequired(row.id);
  }

  async update(id: string, input: TimeEntryUpdateInput): Promise<TimeEntryDto | null> {
    const existing = await this.loadOwnedRow(id);
    if (!existing) return null;
    if (!existing.durationSeconds || !existing.endAt && existing.mode === "timer") {
      throw new ApiError(409, "TIME_ENTRY_NOT_EDITABLE", "Stop the timer before editing it.");
    }
    if (existing.mode !== input.mode) {
      throw validationError("mode", "The time-entry mode cannot be changed.");
    }
    const hierarchyChanged =
      existing.clientId !== input.clientId ||
      existing.projectId !== input.projectId ||
      existing.taskId !== input.taskId;
    const context = await this.requireContext(input, hierarchyChanged);
    const timing = this.resolveCompletedTiming(input, context.timezone);
    const hourlyRate =
      existing.billable && input.billable
        ? existing.hourlyRate
        : resolveHourlyRate({
            billable: input.billable,
            projectRate: context.projectRate,
            clientRate: context.clientRate,
            businessRate: context.businessRate,
          });
    const [row] = await this.db
      .update(timeEntries)
      .set({
        clientId: input.clientId,
        projectId: input.projectId,
        taskId: input.taskId,
        description: input.description.trim(),
        ...timing,
        billable: input.billable,
        hourlyRate,
        updatedAt: this.clock(),
      })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, this.ownerId)))
      .returning({ id: timeEntries.id });
    return row ? this.loadDtoRequired(row.id) : null;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.loadOwnedRow(id);
    if (!existing) return false;
    if (!existing.durationSeconds) {
      throw new ApiError(409, "TIME_ENTRY_NOT_EDITABLE", "A running timer cannot be deleted.");
    }
    const rows = await this.db
      .delete(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, this.ownerId)))
      .returning({ id: timeEntries.id });
    return rows.length > 0;
  }

  private resolveCompletedTiming(input: TimeEntryUpdateInput | ManualTimeEntryInput, timezone: string) {
    try {
      if (input.mode === "duration") {
        return {
          workDate: input.workDate,
          startAt: null,
          endAt: null,
          durationSeconds: assertPositiveDurationSeconds(input.durationSeconds),
        };
      }
      return resolveRange(
        input.workDate,
        input.startTime,
        input.endTime,
        input.endsNextDay,
        timezone,
      );
    } catch (error) {
      throw validationError(
        "endTime",
        error instanceof Error ? error.message : "Enter a valid time range.",
      );
    }
  }

  private async requireContext(
    input: { clientId: string; projectId: string; taskId: string | null },
    requireAvailable: boolean,
  ): Promise<TimeContext> {
    const [profile] = await this.db
      .select({
        businessRate: businessProfiles.defaultHourlyRate,
        timezone: businessProfiles.timezone,
      })
      .from(businessProfiles)
      .where(eq(businessProfiles.userId, this.ownerId))
      .limit(1);
    if (!profile) {
      throw new ApiError(409, "SETTINGS_REQUIRED", "Complete Business settings before tracking time.");
    }
    const [client] = await this.db
      .select({ rate: clients.defaultHourlyRate, active: clients.active })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.userId, this.ownerId)))
      .limit(1);
    if (!client || requireAvailable && !client.active) {
      throw validationError("clientId", "Choose an active client you can access.");
    }
    const [project] = await this.db
      .select({ rate: projects.defaultHourlyRate, active: projects.active })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.clientId, input.clientId),
          eq(projects.userId, this.ownerId),
        ),
      )
      .limit(1);
    if (!project || requireAvailable && !project.active) {
      throw validationError("projectId", "Choose an active project for the selected client.");
    }
    if (input.taskId) {
      const [task] = await this.db
        .select({ active: tasks.active })
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), eq(tasks.projectId, input.projectId)))
        .limit(1);
      if (!task || requireAvailable && !task.active) {
        throw validationError("taskId", "Choose an active task for the selected project.");
      }
    }
    return {
      clientRate: client.rate,
      projectRate: project.rate,
      businessRate: profile.businessRate,
      timezone: profile.timezone,
    };
  }

  private async loadOwnedRow(id: string): Promise<TimeEntryRow | null> {
    const [row] = await this.db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, this.ownerId)))
      .limit(1);
    return row ?? null;
  }

  private async loadDtoRequired(id: string): Promise<TimeEntryDto> {
    const entry = await this.loadDto(id);
    if (!entry) throw new Error("Time entry could not be loaded");
    return entry;
  }

  private async loadDto(id: string): Promise<TimeEntryDto | null> {
    const [row] = await this.db
      .select({
        entry: timeEntries,
        clientName: clients.name,
        projectName: projects.name,
        taskName: tasks.name,
      })
      .from(timeEntries)
      .innerJoin(clients, eq(timeEntries.clientId, clients.id))
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, this.ownerId)))
      .limit(1);
    return row ? toDto(row.entry, row.clientName, row.projectName, row.taskName) : null;
  }
}

function toDto(
  row: TimeEntryRow,
  clientName: string,
  projectName: string,
  taskName: string | null,
): TimeEntryDto {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName,
    projectId: row.projectId,
    projectName,
    taskId: row.taskId,
    taskName,
    description: row.description,
    mode: row.mode as TimeEntryDto["mode"],
    workDate: row.workDate,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    billable: row.billable,
    hourlyRate: row.hourlyRate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validationError(field: string, message: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Review the highlighted time-entry fields.", {
    [field]: [message],
  });
}

function isRunningTimerUniqueViolation(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; candidate && depth < 4; depth += 1) {
    if (typeof candidate === "object") {
      const value = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (
        value.code === "23505" &&
        value.constraint === "time_entries_one_running_timer_per_user"
      ) {
        return true;
      }
      candidate = value.cause;
    } else break;
  }
  return false;
}
