import type { TaskDto, TaskInput, TaskListQuery } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { clients, projects, tasks } from "@verilio/db";
import { and, asc, eq, ilike } from "drizzle-orm";

import { LOCAL_USER_ID } from "./settings-service.js";

type TaskRow = typeof tasks.$inferSelect;

export interface TaskServiceContract {
  list(projectId: string, query: TaskListQuery): Promise<TaskDto[] | null>;
  create(projectId: string, input: TaskInput): Promise<TaskDto | null>;
  update(id: string, input: TaskInput): Promise<TaskDto | null>;
  setActive(id: string, active: boolean): Promise<TaskDto | null>;
}

export class TaskService implements TaskServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
  ) {}

  async list(projectId: string, query: TaskListQuery): Promise<TaskDto[] | null> {
    if (!(await this.ownsProject(projectId, query.availability === "new-work"))) {
      return null;
    }

    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          query.status === "all"
            ? undefined
            : eq(tasks.active, query.status === "active"),
          query.search ? ilike(tasks.name, `%${query.search}%`) : undefined,
        ),
      )
      .orderBy(asc(tasks.name), asc(tasks.createdAt));

    return rows.map(toDto);
  }

  async create(projectId: string, input: TaskInput): Promise<TaskDto | null> {
    if (!(await this.ownsProject(projectId))) return null;

    const [row] = await this.db
      .insert(tasks)
      .values({ projectId, name: input.name.trim() })
      .returning();

    return row ? toDto(row) : null;
  }

  async update(id: string, input: TaskInput): Promise<TaskDto | null> {
    const existing = await this.findOwned(id);
    if (!existing) return null;

    const [row] = await this.db
      .update(tasks)
      .set({ name: input.name.trim(), updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();

    return row ? toDto(row) : null;
  }

  async setActive(id: string, active: boolean): Promise<TaskDto | null> {
    const existing = await this.findOwned(id);
    if (!existing) return null;

    const [row] = await this.db
      .update(tasks)
      .set({ active, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();

    return row ? toDto(row) : null;
  }

  private async ownsProject(projectId: string, requireAvailable = false): Promise<boolean> {
    const [project] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(
        clients,
        and(eq(projects.clientId, clients.id), eq(projects.userId, clients.userId)),
      )
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.userId, this.ownerId),
          requireAvailable ? eq(projects.active, true) : undefined,
          requireAvailable ? eq(clients.active, true) : undefined,
        ),
      )
      .limit(1);
    return Boolean(project);
  }

  private async findOwned(id: string): Promise<TaskRow | null> {
    const [row] = await this.db
      .select({ task: tasks })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(eq(tasks.id, id), eq(projects.userId, this.ownerId)))
      .limit(1);
    return row?.task ?? null;
  }
}

function toDto(row: TaskRow): TaskDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
