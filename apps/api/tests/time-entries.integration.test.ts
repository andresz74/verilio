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
import { TaskService } from "../src/task-service.js";
import { TimeEntryService } from "../src/time-entry-service.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const OWNER_A = "00000000-0000-4000-8000-000000000007";
const OWNER_B = "00000000-0000-4000-8000-000000000008";

const clientInput: ClientInput = {
  name: "M4 Client",
  email: "",
  ccRecipients: [],
  address: "",
  note: "",
  currency: "USD",
  rateMode: "override",
  defaultHourlyRate: "90.0000",
};

function projectInput(clientId: string, name = "M4 Project", rate = "110.0000"): ProjectInput {
  return {
    clientId,
    name,
    color: "#4F46E5",
    rateMode: "override",
    defaultHourlyRate: rate,
    billableByDefault: true,
    note: "",
  };
}

async function removeOwners() {
  await db.delete(timeEntries).where(inArray(timeEntries.userId, [OWNER_A, OWNER_B]));
  const ownedProjects = db.select({ id: projects.id }).from(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(tasks).where(inArray(tasks.projectId, ownedProjects));
  await db.delete(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(clients).where(inArray(clients.userId, [OWNER_A, OWNER_B]));
  await db.delete(users).where(inArray(users.id, [OWNER_A, OWNER_B]));
}

async function setupOwner(ownerId: string, businessRate = "80.0000") {
  await db.insert(users).values({ id: ownerId, displayName: `M4 ${ownerId}` });
  await db.insert(businessProfiles).values({
    userId: ownerId,
    businessName: "M4 Integration",
    email: "m4@example.com",
    address: "1 Test Way",
    defaultCurrency: "USD",
    defaultHourlyRate: businessRate,
    paymentTermsDays: 30,
    invoicePrefix: "M4",
    nextInvoiceNumber: 1,
    defaultTaxRate: "0",
    timezone: "America/New_York",
  });
  const client = await new ClientService(db, ownerId).create(clientInput);
  const project = await new ProjectService(db, ownerId).create(projectInput(client.id));
  const task = await new TaskService(db, ownerId).create(project.id, { name: "Implementation" });
  if (!task) throw new Error("Task fixture failed");
  return { client, project, task };
}

beforeEach(removeOwners);
afterEach(removeOwners);
afterAll(async () => pool.end());

describe("M4 timer persistence and concurrency", () => {
  it("persists one running timer, recovers it, and stops the same entry with rate/work-date snapshots", async () => {
    const { client, project, task } = await setupOwner(OWNER_A);
    const startedAt = new Date("2026-09-06T03:30:00.000Z");
    const starter = new TimeEntryService(db, OWNER_A, () => startedAt);
    const started = await starter.start({
      clientId: client.id,
      projectId: project.id,
      taskId: task.id,
      description: "Late deployment",
      billable: true,
    });
    expect(started.timer).toMatchObject({ workDate: "2026-09-05", hourlyRate: null, durationSeconds: null });
    expect((await starter.current()).timer?.id).toBe(started.timer?.id);

    const stoppedAt = new Date("2026-09-06T05:00:00.000Z");
    const stopped = await new TimeEntryService(db, OWNER_A, () => stoppedAt).stop();
    expect(stopped.entry).toMatchObject({
      id: started.timer?.id,
      durationSeconds: 5_400,
      hourlyRate: "110.0000",
      workDate: "2026-09-05",
    });
    expect((await starter.current()).timer).toBeNull();

    await new ProjectService(db, OWNER_A).update(project.id, projectInput(client.id, project.name, "175.0000"));
    expect((await starter.get(stopped.entry.id))?.hourlyRate).toBe("110.0000");
    await expect(starter.stop()).rejects.toMatchObject({ code: "NO_RUNNING_TIMER" });
  });

  it("allows exactly one concurrent start and maps the loser to TIMER_ALREADY_RUNNING", async () => {
    const { client, project } = await setupOwner(OWNER_A);
    const service = new TimeEntryService(db, OWNER_A, () => new Date("2026-09-05T14:00:00.000Z"));
    const input = { clientId: client.id, projectId: project.id, taskId: null, description: "Race", billable: true };
    const results = await Promise.allSettled([service.start(input), service.start(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "TIMER_ALREADY_RUNNING", statusCode: 409 } });
    const persisted = await db.select().from(timeEntries).where(inArray(timeEntries.userId, [OWNER_A]));
    expect(persisted).toHaveLength(1);
  });
});

describe("M4 manual entries and historical edits", () => {
  it("persists range/cross-midnight and duration modes, preserves rates, and deletes completed entries", async () => {
    const { client, project, task } = await setupOwner(OWNER_A);
    const service = new TimeEntryService(db, OWNER_A, () => new Date("2026-09-07T12:00:00.000Z"));
    const range = await service.create({
      mode: "range",
      workDate: "2026-09-05",
      startTime: "23:30",
      endTime: "01:00",
      endsNextDay: true,
      clientId: client.id,
      projectId: project.id,
      taskId: task.id,
      description: "Cross-midnight support",
      billable: true,
    });
    expect(range).toMatchObject({ durationSeconds: 5_400, workDate: "2026-09-05", hourlyRate: "110.0000" });

    const duration = await service.create({
      mode: "duration",
      workDate: "2026-09-06",
      durationSeconds: 3_600,
      clientId: client.id,
      projectId: project.id,
      taskId: null,
      description: "Duration only",
      billable: false,
    });
    expect(duration).toMatchObject({ startAt: null, endAt: null, hourlyRate: null, durationSeconds: 3_600 });

    const secondProject = await new ProjectService(db, OWNER_A).create(projectInput(client.id, "New rate", "200.0000"));
    const edited = await service.update(range.id, {
      mode: "range",
      workDate: "2026-09-05",
      startTime: "22:30",
      endTime: "01:00",
      endsNextDay: true,
      clientId: client.id,
      projectId: secondProject.id,
      taskId: null,
      description: "Edited without repricing",
      billable: true,
    });
    expect(edited).toMatchObject({ durationSeconds: 9_000, hourlyRate: "110.0000", projectId: secondProject.id });

    const becameBillable = await service.update(duration.id, {
      mode: "duration",
      workDate: duration.workDate,
      durationSeconds: 3_600,
      clientId: client.id,
      projectId: secondProject.id,
      taskId: null,
      description: duration.description,
      billable: true,
    });
    expect(becameBillable?.hourlyRate).toBe("200.0000");
    expect(await service.delete(duration.id)).toBe(true);
    expect(await service.get(duration.id)).toBeNull();
  });

  it("rejects wrong-owner hierarchy and archived new work", async () => {
    const own = await setupOwner(OWNER_A);
    const other = await setupOwner(OWNER_B);
    const service = new TimeEntryService(db, OWNER_A);
    await expect(service.create({
      mode: "duration", workDate: "2026-09-05", durationSeconds: 60,
      clientId: other.client.id, projectId: other.project.id, taskId: null,
      description: "Not mine", billable: true,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await new ClientService(db, OWNER_A).setActive(own.client.id, false);
    await expect(service.start({
      clientId: own.client.id, projectId: own.project.id, taskId: own.task.id,
      description: "Archived", billable: true,
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
