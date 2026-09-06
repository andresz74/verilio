import type { ClientInput, ProjectInput } from "@verilio/contracts";
import {
  businessProfiles,
  clients,
  createDatabaseClient,
  projects,
  tasks,
  timeEntries,
  users,
} from "@verilio/db";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClientService } from "../src/client-service.js";
import { ProjectService } from "../src/project-service.js";
import { ReportService } from "../src/report-service.js";
import { TaskService } from "../src/task-service.js";
import { TimeEntryService } from "../src/time-entry-service.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const OWNER_A = "00000000-0000-4000-8000-000000000009";
const OWNER_B = "00000000-0000-4000-8000-000000000010";

function clientInput(name: string, currency: string, rate: string): ClientInput {
  return {
    name,
    email: "",
    ccRecipients: [],
    address: "",
    note: "",
    currency,
    rateMode: "override",
    defaultHourlyRate: rate,
  };
}

function projectInput(clientId: string, name: string, rate: string): ProjectInput {
  return {
    clientId,
    name,
    color: "",
    rateMode: "override",
    defaultHourlyRate: rate,
    billableByDefault: true,
    note: "",
  };
}

async function removeOwners() {
  await db.delete(timeEntries).where(inArray(timeEntries.userId, [OWNER_A, OWNER_B]));
  const ownedProjects = db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(tasks).where(inArray(tasks.projectId, ownedProjects));
  await db.delete(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(clients).where(inArray(clients.userId, [OWNER_A, OWNER_B]));
  await db.delete(users).where(inArray(users.id, [OWNER_A, OWNER_B]));
}

async function setupOwner(ownerId: string) {
  await db.insert(users).values({ id: ownerId, displayName: `M6 ${ownerId}` });
  await db.insert(businessProfiles).values({
    userId: ownerId,
    businessName: "M6 Integration",
    email: "m6@example.com",
    address: "1 Report Way",
    defaultCurrency: "USD",
    defaultHourlyRate: "70.0000",
    paymentTermsDays: 30,
    invoicePrefix: "M6",
    nextInvoiceNumber: 1,
    defaultTaxRate: "0",
    timezone: "America/New_York",
  });
}

beforeEach(removeOwners);
afterEach(removeOwners);
afterAll(async () => pool.end());

describe("M6 PostgreSQL reports", () => {
  it("aggregates workDate, historical rates, and historical currencies on the server", async () => {
    await setupOwner(OWNER_A);
    await setupOwner(OWNER_B);
    const clientService = new ClientService(db, OWNER_A);
    const projectService = new ProjectService(db, OWNER_A);
    const taskService = new TaskService(db, OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const reportService = new ReportService(db, OWNER_A);

    const usdClient = await clientService.create(clientInput("USD Client", "USD", "75.0000"));
    const eurClient = await clientService.create(clientInput("EUR Client", "EUR", "55.0000"));
    const usdProject = await projectService.create(projectInput(usdClient.id, "Historical Project", "85.0000"));
    const eurProject = await projectService.create(projectInput(eurClient.id, "Euro Project", "60.0000"));
    const usdTask = await taskService.create(usdProject.id, { name: "Release" });
    if (!usdTask) throw new Error("Task fixture failed");

    const historical = await timeService.create({
      mode: "range",
      workDate: "2026-09-05",
      startTime: "23:30",
      endTime: "01:30",
      endsNextDay: true,
      clientId: usdClient.id,
      projectId: usdProject.id,
      taskId: usdTask.id,
      description: "Historical USD work",
      billable: true,
    });
    await timeService.create({
      mode: "duration",
      workDate: "2026-09-05",
      durationSeconds: 3_600,
      clientId: eurClient.id,
      projectId: eurProject.id,
      taskId: null,
      description: "Euro work",
      billable: true,
    });
    await timeService.create({
      mode: "duration",
      workDate: "2026-09-06",
      durationSeconds: 1_800,
      clientId: usdClient.id,
      projectId: usdProject.id,
      taskId: null,
      description: "Internal notes",
      billable: false,
    });

    await projectService.update(
      usdProject.id,
      projectInput(usdClient.id, usdProject.name, "125.0000"),
    );
    await clientService.update(
      usdClient.id,
      clientInput(usdClient.name, "GBP", "75.0000"),
    );
    const current = await timeService.create({
      mode: "duration",
      workDate: "2026-09-06",
      durationSeconds: 3_600,
      clientId: usdClient.id,
      projectId: usdProject.id,
      taskId: null,
      description: "Current GBP work",
      billable: true,
    });

    expect(await timeService.get(historical.id)).toMatchObject({
      hourlyRate: "85.0000",
      currency: "USD",
      workDate: "2026-09-05",
    });
    expect(current).toMatchObject({ hourlyRate: "125.0000", currency: "GBP" });

    const otherClientService = new ClientService(db, OWNER_B);
    const otherProjectService = new ProjectService(db, OWNER_B);
    const otherClient = await otherClientService.create(clientInput("Other owner", "USD", "900.0000"));
    const otherProject = await otherProjectService.create(projectInput(otherClient.id, "Private", "900.0000"));
    await new TimeEntryService(db, OWNER_B).create({
      mode: "duration",
      workDate: "2026-09-05",
      durationSeconds: 3_600,
      clientId: otherClient.id,
      projectId: otherProject.id,
      taskId: null,
      description: "Must remain private",
      billable: true,
    });

    await taskService.setActive(usdTask.id, false);
    await projectService.setActive(usdProject.id, false);
    await clientService.setActive(usdClient.id, false);

    const summary = await reportService.summary({
      from: "2026-09-05",
      to: "2026-09-06",
      billable: "all",
      invoiceStatus: "all",
      groupBy: "client",
    });
    expect(summary).toMatchObject({
      totalTrackedSeconds: 16_200,
      billableSeconds: 14_400,
      nonBillableSeconds: 1_800,
    });
    expect(summary.billableTotals).toEqual([
      { currency: "EUR", amount: "60.00" },
      { currency: "GBP", amount: "125.00" },
      { currency: "USD", amount: "170.00" },
    ]);
    expect(summary.groups.find((group) => group.label === "USD Client")).toMatchObject({
      trackedSeconds: 12_600,
      billableSeconds: 10_800,
      billableTotals: expect.arrayContaining([
        { currency: "GBP", amount: "125.00" },
        { currency: "USD", amount: "170.00" },
      ]),
    });
    expect(summary.hoursByDay).toEqual([
      { workDate: "2026-09-05", trackedSeconds: 10_800 },
      { workDate: "2026-09-06", trackedSeconds: 5_400 },
    ]);

    const filtered = await reportService.summary({
      from: "2026-09-05",
      to: "2026-09-06",
      clientId: usdClient.id,
      projectId: usdProject.id,
      taskId: usdTask.id,
      billable: "billable",
      invoiceStatus: "not-invoiced",
      groupBy: "task",
    });
    expect(filtered).toMatchObject({
      totalTrackedSeconds: 7_200,
      billableSeconds: 7_200,
      nonBillableSeconds: 0,
      billableTotals: [{ currency: "USD", amount: "170.00" }],
    });
    expect(filtered.groups[0]).toMatchObject({ label: "Release", secondaryLabel: "Historical Project" });

    const detailed = await reportService.detailed({
      from: "2026-09-05",
      to: "2026-09-06",
      billable: "all",
      invoiceStatus: "all",
      page: 1,
      pageSize: 2,
    });
    expect(detailed).toMatchObject({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(detailed.entries).toHaveLength(2);
    const historicalPage = await reportService.detailed({
      from: "2026-09-05",
      to: "2026-09-05",
      clientId: usdClient.id,
      projectId: usdProject.id,
      billable: "all",
      invoiceStatus: "not-invoiced",
      page: 1,
      pageSize: 25,
    });
    expect(historicalPage.entries[0]).toMatchObject({
      id: historical.id,
      clientName: "USD Client",
      projectName: "Historical Project",
      taskName: "Release",
      hourlyRate: "85.0000",
      currency: "USD",
      amount: "170.00",
      invoiceStatus: "not-invoiced",
    });

    const invoiced = await reportService.summary({
      from: "2026-09-05",
      to: "2026-09-06",
      billable: "all",
      invoiceStatus: "invoiced",
      groupBy: "project",
    });
    expect(invoiced).toMatchObject({ totalTrackedSeconds: 0, groups: [], billableTotals: [] });
    await expect(
      reportService.summary({
        from: "2026-09-05",
        to: "2026-09-06",
        clientId: otherClient.id,
        billable: "all",
        invoiceStatus: "all",
        groupBy: "client",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns deterministic empty and paginated report results", async () => {
    await setupOwner(OWNER_A);
    const service = new ReportService(db, OWNER_A);
    const summary = await service.summary({
      from: "2026-01-01",
      to: "2026-01-31",
      billable: "non-billable",
      invoiceStatus: "all",
      groupBy: "project",
    });
    expect(summary).toMatchObject({
      totalTrackedSeconds: 0,
      billableSeconds: 0,
      nonBillableSeconds: 0,
      groups: [],
      hoursByDay: [],
    });
    const detailed = await service.detailed({
      from: "2026-01-01",
      to: "2026-01-31",
      billable: "all",
      invoiceStatus: "all",
      page: 3,
      pageSize: 10,
    });
    expect(detailed).toMatchObject({ entries: [], page: 3, total: 0, totalPages: 0 });
  });
});
