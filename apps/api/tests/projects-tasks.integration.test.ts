import type { ClientInput, ProjectInput } from "@verilio/contracts";
import { clients, createDatabaseClient, projects, tasks, users } from "@verilio/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClientService } from "../src/client-service.js";
import { ProjectService } from "../src/project-service.js";
import { TaskService } from "../src/task-service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const OWNER_A = "00000000-0000-4000-8000-000000000005";
const OWNER_B = "00000000-0000-4000-8000-000000000006";

const clientInput: ClientInput = {
  name: "M3 Client",
  email: "",
  ccRecipients: [],
  address: "",
  note: "",
  currency: "USD",
  rateMode: "override",
  defaultHourlyRate: "90.0000",
};

function projectInput(clientId: string, name = "M3 Project"): ProjectInput {
  return {
    clientId,
    name,
    color: "#4F46E5",
    rateMode: "inherit",
    defaultHourlyRate: null,
    billableByDefault: true,
    note: "Integration project",
  };
}

async function removeTestOwners(): Promise<void> {
  const ownedProjects = db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(tasks).where(inArray(tasks.projectId, ownedProjects));
  await db.delete(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(clients).where(inArray(clients.userId, [OWNER_A, OWNER_B]));
  await db.delete(users).where(inArray(users.id, [OWNER_A, OWNER_B]));
}

beforeEach(removeTestOwners);
afterEach(removeTestOwners);

afterAll(async () => {
  await pool.end();
});

describe("project and task persistence", () => {
  it("enforces Project ownership, rate behavior, archive history, and new-work availability", async () => {
    const clientsA = new ClientService(db, OWNER_A);
    const clientsB = new ClientService(db, OWNER_B);
    const projectsA = new ProjectService(db, OWNER_A);
    const clientA = await clientsA.create(clientInput);
    const clientB = await clientsB.create({ ...clientInput, name: "Other owner's client" });

    const created = await projectsA.create(projectInput(clientA.id));
    expect(created).toMatchObject({
      clientId: clientA.id,
      defaultHourlyRate: null,
      active: true,
      billableByDefault: true,
    });
    expect(await projectsA.get(created.id)).toMatchObject(created);

    await expect(projectsA.create(projectInput(clientB.id))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      db.insert(projects).values({
        userId: OWNER_A,
        clientId: clientB.id,
        name: "Cross-owner project",
        defaultHourlyRate: null,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(projects).values({
        userId: OWNER_A,
        clientId: clientA.id,
        name: "Negative-rate project",
        defaultHourlyRate: "-1",
      }),
    ).rejects.toThrow();

    const updated = await projectsA.update(created.id, {
      ...projectInput(clientA.id),
      name: "M3 Project Updated",
      rateMode: "override",
      defaultHourlyRate: "125.5000",
      billableByDefault: false,
    });
    expect(updated).toMatchObject({
      name: "M3 Project Updated",
      defaultHourlyRate: "125.5000",
      billableByDefault: false,
    });

    await clientsA.setActive(clientA.id, false);
    expect(
      await projectsA.list({
        status: "active",
        clientId: clientA.id,
        search: "",
        availability: "new-work",
      }),
    ).toEqual([]);
    expect(
      await projectsA.list({
        status: "active",
        clientId: clientA.id,
        search: "",
        availability: "all",
      }),
    ).toEqual([expect.objectContaining({ id: created.id, active: true })]);

    await clientsA.setActive(clientA.id, true);
    expect((await projectsA.setActive(created.id, false))?.active).toBe(false);
    expect(
      await projectsA.list({
        status: "active",
        clientId: clientA.id,
        search: "",
        availability: "new-work",
      }),
    ).toEqual([]);
    const [persisted] = await db.select().from(projects).where(eq(projects.id, created.id));
    expect(persisted).toMatchObject({ id: created.id, active: false });

    expect((await projectsA.setActive(created.id, true))?.active).toBe(true);
    expect(
      await projectsA.list({
        status: "active",
        clientId: clientA.id,
        search: "",
        availability: "new-work",
      }),
    ).toEqual([expect.objectContaining({ id: created.id, active: true })]);
  });

  it("keeps Tasks project-scoped, owner-isolated, and archived instead of deleted", async () => {
    const clientsA = new ClientService(db, OWNER_A);
    const clientsB = new ClientService(db, OWNER_B);
    const projectsA = new ProjectService(db, OWNER_A);
    const projectsB = new ProjectService(db, OWNER_B);
    const tasksA = new TaskService(db, OWNER_A);
    const tasksB = new TaskService(db, OWNER_B);
    const clientA = await clientsA.create(clientInput);
    const clientB = await clientsB.create({ ...clientInput, name: "Owner B" });
    const projectA = await projectsA.create(projectInput(clientA.id, "Project A"));
    const projectA2 = await projectsA.create(projectInput(clientA.id, "Project A2"));
    const projectB = await projectsB.create(projectInput(clientB.id, "Project B"));

    const taskA = await tasksA.create(projectA.id, { name: "Research" });
    const taskA2 = await tasksA.create(projectA2.id, { name: "Delivery" });
    const taskB = await tasksB.create(projectB.id, { name: "Private task" });
    expect(taskA).toMatchObject({ projectId: projectA.id, active: true });
    expect(taskA2).toMatchObject({ projectId: projectA2.id });
    expect(taskB).toMatchObject({ projectId: projectB.id });

    expect(await tasksA.list(projectA.id, { status: "all", search: "", availability: "all" })).toEqual([
      expect.objectContaining({ id: taskA?.id }),
    ]);
    expect(await tasksA.list(projectA2.id, { status: "all", search: "", availability: "all" })).toEqual([
      expect.objectContaining({ id: taskA2?.id }),
    ]);
    expect(await tasksA.list(projectB.id, { status: "all", search: "", availability: "all" })).toBeNull();
    expect(taskB && (await tasksA.update(taskB.id, { name: "Leaked" }))).toBeNull();

    if (!taskA) throw new Error("Task creation failed");
    expect(await tasksA.update(taskA.id, { name: "Discovery" })).toMatchObject({
      id: taskA.id,
      name: "Discovery",
    });
    expect((await tasksA.setActive(taskA.id, false))?.active).toBe(false);
    expect(await tasksA.list(projectA.id, { status: "active", search: "", availability: "all" })).toEqual([]);
    const [persisted] = await db.select().from(tasks).where(eq(tasks.id, taskA.id));
    expect(persisted).toMatchObject({ id: taskA.id, active: false });
    expect((await tasksA.setActive(taskA.id, true))?.active).toBe(true);
    expect(await tasksA.list(projectA.id, { status: "active", search: "", availability: "all" })).toEqual([
      expect.objectContaining({ id: taskA.id, active: true }),
    ]);

    await projectsA.setActive(projectA.id, false);
    expect(
      await tasksA.list(projectA.id, {
        status: "active",
        search: "",
        availability: "new-work",
      }),
    ).toBeNull();
    await projectsA.setActive(projectA.id, true);
    await clientsA.setActive(clientA.id, false);
    expect(
      await tasksA.list(projectA.id, {
        status: "active",
        search: "",
        availability: "new-work",
      }),
    ).toBeNull();
  });
});
