import type {
  ReportDetailedQuery,
  ReportDetailedResponse,
  ReportDetailedRow,
  ReportGroupBy,
  ReportGroupRow,
  ReportSummaryQuery,
  ReportSummaryResponse,
} from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { clients, projects, tasks, timeEntries } from "@verilio/db";
import { calculateHistoricalTimeAmount, roundMoney } from "@verilio/domain";
import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import { ApiError } from "./errors.js";
import { LOCAL_USER_ID } from "./settings-service.js";

type SharedReportFilters = Pick<
  ReportSummaryQuery,
  "from" | "to" | "clientId" | "projectId" | "taskId" | "billable" | "invoiceStatus"
>;

type GroupDefinition = {
  key: SQL<string> | typeof clients.id | typeof projects.id;
  label: SQL<string> | typeof clients.name | typeof projects.name;
  secondaryLabel: SQL<string | null> | typeof clients.name | typeof projects.name;
  dimensions: Array<
    SQL | typeof clients.id | typeof clients.name | typeof projects.id | typeof projects.name
  >;
};

export interface ReportServiceContract {
  summary(input: ReportSummaryQuery): Promise<ReportSummaryResponse>;
  detailed(input: ReportDetailedQuery): Promise<ReportDetailedResponse>;
}

export class ReportService implements ReportServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
  ) {}

  async summary(input: ReportSummaryQuery): Promise<ReportSummaryResponse> {
    await this.validateHierarchy(input);
    if (input.invoiceStatus === "invoiced") return emptySummary(input);

    const where = this.where(input);
    const group = groupDefinition(input.groupBy);
    const [totalsRows, currencyRows, durationGroups, amountGroups, dayRows, projectRows] =
      await Promise.all([
        this.db
          .select({
            tracked: sql<string>`coalesce(sum(${timeEntries.durationSeconds}), 0)::bigint`,
            billable: sql<string>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.billable}), 0)::bigint`,
            nonBillable: sql<string>`coalesce(sum(${timeEntries.durationSeconds}) filter (where not ${timeEntries.billable}), 0)::bigint`,
          })
          .from(timeEntries)
          .where(where),
        this.db
          .select({
            currency: timeEntries.currency,
            rawAmount: sql<string>`sum(${timeEntries.durationSeconds}::numeric * ${timeEntries.hourlyRate} / 3600)`,
          })
          .from(timeEntries)
          .where(and(where, eq(timeEntries.billable, true), isNotNull(timeEntries.currency)))
          .groupBy(timeEntries.currency)
          .orderBy(timeEntries.currency),
        this.db
          .select({
            key: group.key,
            label: group.label,
            secondaryLabel: group.secondaryLabel,
            tracked: sql<string>`sum(${timeEntries.durationSeconds})::bigint`,
            billable: sql<string>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.billable}), 0)::bigint`,
          })
          .from(timeEntries)
          .innerJoin(clients, eq(timeEntries.clientId, clients.id))
          .innerJoin(projects, eq(timeEntries.projectId, projects.id))
          .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
          .where(where)
          .groupBy(...group.dimensions)
          .orderBy(desc(sql`sum(${timeEntries.durationSeconds})`), group.label),
        this.db
          .select({
            key: group.key,
            currency: timeEntries.currency,
            rawAmount: sql<string>`sum(${timeEntries.durationSeconds}::numeric * ${timeEntries.hourlyRate} / 3600)`,
          })
          .from(timeEntries)
          .innerJoin(clients, eq(timeEntries.clientId, clients.id))
          .innerJoin(projects, eq(timeEntries.projectId, projects.id))
          .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
          .where(and(where, eq(timeEntries.billable, true), isNotNull(timeEntries.currency)))
          .groupBy(group.key, timeEntries.currency)
          .orderBy(group.key, timeEntries.currency),
        this.db
          .select({
            workDate: timeEntries.workDate,
            tracked: sql<string>`sum(${timeEntries.durationSeconds})::bigint`,
          })
          .from(timeEntries)
          .where(where)
          .groupBy(timeEntries.workDate)
          .orderBy(timeEntries.workDate),
        this.db
          .select({
            projectId: projects.id,
            projectName: projects.name,
            tracked: sql<string>`sum(${timeEntries.durationSeconds})::bigint`,
          })
          .from(timeEntries)
          .innerJoin(projects, eq(timeEntries.projectId, projects.id))
          .where(where)
          .groupBy(projects.id, projects.name)
          .orderBy(desc(sql`sum(${timeEntries.durationSeconds})`), projects.name),
      ]);

    const totals = totalsRows[0] ?? { tracked: "0", billable: "0", nonBillable: "0" };
    const amountRowsByGroup = new Map<string, Array<{ currency: string; amount: string }>>();
    for (const row of amountGroups) {
      if (!row.currency) continue;
      const values = amountRowsByGroup.get(row.key) ?? [];
      values.push({ currency: row.currency, amount: roundMoney(row.rawAmount, row.currency) });
      amountRowsByGroup.set(row.key, values);
    }

    return {
      range: { from: input.from, to: input.to },
      totalTrackedSeconds: Number(totals.tracked),
      billableSeconds: Number(totals.billable),
      nonBillableSeconds: Number(totals.nonBillable),
      billableTotals: currencyRows.flatMap((row) =>
        row.currency
          ? [{ currency: row.currency, amount: roundMoney(row.rawAmount, row.currency) }]
          : [],
      ),
      groupBy: input.groupBy,
      groups: durationGroups.map(
        (row): ReportGroupRow => ({
          key: row.key,
          label: row.label,
          secondaryLabel: row.secondaryLabel,
          trackedSeconds: Number(row.tracked),
          billableSeconds: Number(row.billable),
          billableTotals: amountRowsByGroup.get(row.key) ?? [],
        }),
      ),
      hoursByDay: dayRows.map((row) => ({
        workDate: row.workDate,
        trackedSeconds: Number(row.tracked),
      })),
      hoursByProject: projectRows.map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        trackedSeconds: Number(row.tracked),
      })),
    };
  }

  async detailed(input: ReportDetailedQuery): Promise<ReportDetailedResponse> {
    await this.validateHierarchy(input);
    if (input.invoiceStatus === "invoiced") return emptyDetailed(input);

    const where = this.where(input);
    const [rows, totalRows] = await Promise.all([
      this.db
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
        .where(where)
        .orderBy(
          desc(timeEntries.workDate),
          sql`${timeEntries.startAt} DESC NULLS LAST`,
          desc(timeEntries.createdAt),
          desc(timeEntries.id),
        )
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.db.select({ value: count() }).from(timeEntries).where(where),
    ]);
    const total = totalRows[0]?.value ?? 0;

    return {
      range: { from: input.from, to: input.to },
      entries: rows.map(({ entry, clientName, projectName, taskName }): ReportDetailedRow => ({
        id: entry.id,
        clientId: entry.clientId,
        clientName,
        projectId: entry.projectId,
        projectName,
        taskId: entry.taskId,
        taskName,
        description: entry.description,
        mode: entry.mode as ReportDetailedRow["mode"],
        workDate: entry.workDate,
        startAt: entry.startAt?.toISOString() ?? null,
        endAt: entry.endAt?.toISOString() ?? null,
        durationSeconds: entry.durationSeconds,
        billable: entry.billable,
        hourlyRate: entry.hourlyRate,
        currency: entry.currency,
        amount: calculateHistoricalTimeAmount({
          billable: entry.billable,
          currency: entry.currency,
          durationSeconds: entry.durationSeconds ?? 0,
          hourlyRate: entry.hourlyRate,
        }),
        invoiceStatus: "not-invoiced",
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    };
  }

  private where(input: SharedReportFilters): SQL {
    return and(
      eq(timeEntries.userId, this.ownerId),
      isNotNull(timeEntries.durationSeconds),
      gte(timeEntries.workDate, input.from),
      lte(timeEntries.workDate, input.to),
      input.clientId ? eq(timeEntries.clientId, input.clientId) : undefined,
      input.projectId ? eq(timeEntries.projectId, input.projectId) : undefined,
      input.taskId ? eq(timeEntries.taskId, input.taskId) : undefined,
      input.billable === "billable"
        ? eq(timeEntries.billable, true)
        : input.billable === "non-billable"
          ? eq(timeEntries.billable, false)
          : undefined,
    )!;
  }

  private async validateHierarchy(input: SharedReportFilters): Promise<void> {
    if (input.clientId) {
      const [client] = await this.db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, input.clientId), eq(clients.userId, this.ownerId)))
        .limit(1);
      if (!client) throw invalidFilter("clientId", "Choose a client you can access.");
    }
    if (input.projectId) {
      const [project] = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, this.ownerId),
            input.clientId ? eq(projects.clientId, input.clientId) : undefined,
          ),
        )
        .limit(1);
      if (!project) throw invalidFilter("projectId", "Choose a project for the selected client.");
    }
    if (input.taskId) {
      const [task] = await this.db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(
          and(
            eq(tasks.id, input.taskId),
            eq(tasks.projectId, input.projectId!),
            eq(projects.userId, this.ownerId),
            input.clientId ? eq(projects.clientId, input.clientId) : undefined,
          ),
        )
        .limit(1);
      if (!task) throw invalidFilter("taskId", "Choose a task for the selected project.");
    }
  }
}

function groupDefinition(groupBy: ReportGroupBy): GroupDefinition {
  if (groupBy === "project") {
    return {
      key: projects.id,
      label: projects.name,
      secondaryLabel: clients.name,
      dimensions: [projects.id, projects.name, clients.name],
    };
  }
  if (groupBy === "task") {
    return {
      key: sql<string>`coalesce(${tasks.id}::text, 'unassigned:' || ${projects.id}::text)`,
      label: sql<string>`coalesce(${tasks.name}, 'No task')`,
      secondaryLabel: projects.name,
      dimensions: [
        sql`coalesce(${tasks.id}::text, 'unassigned:' || ${projects.id}::text)`,
        sql`coalesce(${tasks.name}, 'No task')`,
        projects.name,
      ],
    };
  }
  return {
    key: clients.id,
    label: clients.name,
    secondaryLabel: sql<string | null>`null`,
    dimensions: [clients.id, clients.name],
  };
}

function emptySummary(input: ReportSummaryQuery): ReportSummaryResponse {
  return {
    range: { from: input.from, to: input.to },
    totalTrackedSeconds: 0,
    billableSeconds: 0,
    nonBillableSeconds: 0,
    billableTotals: [],
    groupBy: input.groupBy,
    groups: [],
    hoursByDay: [],
    hoursByProject: [],
  };
}

function emptyDetailed(input: ReportDetailedQuery): ReportDetailedResponse {
  return {
    range: { from: input.from, to: input.to },
    entries: [],
    page: input.page,
    pageSize: input.pageSize,
    total: 0,
    totalPages: 0,
  };
}

function invalidFilter(field: string, message: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Review the selected report filters.", {
    [field]: [message],
  });
}
