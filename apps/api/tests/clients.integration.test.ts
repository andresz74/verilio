import type { ClientInput } from "@verilio/contracts";
import { clients, createDatabaseClient, users } from "@verilio/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClientService } from "../src/client-service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const OWNER_A = "00000000-0000-4000-8000-000000000003";
const OWNER_B = "00000000-0000-4000-8000-000000000004";

const inheritedInput: ClientInput = {
  name: "Northstar Studio",
  email: "billing@northstar.test",
  ccRecipients: ["accounts@northstar.test", ""],
  address: "8 Market Street",
  note: "Monthly billing",
  currency: "EUR",
  rateMode: "inherit",
  defaultHourlyRate: null,
};

async function removeTestOwners(): Promise<void> {
  await db.delete(clients).where(inArray(clients.userId, [OWNER_A, OWNER_B]));
  await db.delete(users).where(inArray(users.id, [OWNER_A, OWNER_B]));
}

beforeEach(removeTestOwners);
afterEach(removeTestOwners);

afterAll(async () => {
  await pool.end();
});

describe("client persistence", () => {
  it("persists, updates, archives, and reactivates without losing the record", async () => {
    const service = new ClientService(db, OWNER_A);
    const otherOwnerService = new ClientService(db, OWNER_B);

    const created = await service.create(inheritedInput);
    expect(created).toMatchObject({
      name: "Northstar Studio",
      currency: "EUR",
      defaultHourlyRate: null,
      active: true,
      ccRecipients: ["accounts@northstar.test"],
    });
    expect(await service.get(created.id)).toMatchObject(created);
    expect(await otherOwnerService.get(created.id)).toBeNull();
    expect(await otherOwnerService.list({ status: "all", search: "" })).toEqual([]);

    const updated = await service.update(created.id, {
      ...inheritedInput,
      name: "Northstar Labs",
      currency: "USD",
      rateMode: "override",
      defaultHourlyRate: "125.5000",
    });
    expect(updated).toMatchObject({
      name: "Northstar Labs",
      currency: "USD",
      defaultHourlyRate: "125.5000",
    });

    const archived = await service.setActive(created.id, false);
    expect(archived?.active).toBe(false);
    expect(await service.list({ status: "active", search: "" })).toEqual([]);
    expect(await service.list({ status: "archived", search: "northstar" })).toEqual([
      expect.objectContaining({ id: created.id, active: false }),
    ]);

    const [persisted] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, created.id));
    expect(persisted).toMatchObject({ id: created.id, active: false });

    const reactivated = await service.setActive(created.id, true);
    expect(reactivated?.active).toBe(true);
    expect(await service.list({ status: "active", search: "" })).toEqual([
      expect.objectContaining({ id: created.id, active: true }),
    ]);
  });
});
