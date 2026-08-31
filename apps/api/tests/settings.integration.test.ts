import type { BusinessProfileInput } from "@verilio/contracts";
import { businessProfiles, createDatabaseClient, users } from "@verilio/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { SettingsService } from "../src/settings-service.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const TEST_USER_ID = "00000000-0000-4000-8000-000000000002";

const input: BusinessProfileInput = {
  businessName: "Verilio Test Studio",
  email: "billing@verilio.test",
  address: "42 Ledger Lane",
  phone: "+1 212 555 0199",
  taxIdentifier: "TAX-123",
  defaultCurrency: "USD",
  defaultHourlyRate: "95.2500",
  paymentTermsDays: 21,
  invoicePrefix: "VER-",
  nextInvoiceNumber: 42,
  defaultTaxRate: "8.8750",
  defaultInvoiceNotes: "Thank you.",
  invoiceFooter: "ACH preferred.",
  timezone: "America/New_York",
};

async function removeTestOwner(): Promise<void> {
  await db.delete(businessProfiles).where(eq(businessProfiles.userId, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
}

beforeEach(removeTestOwner);
afterEach(removeTestOwner);

afterAll(async () => {
  await pool.end();
});

describe("settings persistence", () => {
  it("persists and reloads billing defaults through the API", async () => {
    const app = buildApp({
      db,
      logger: false,
      settingsService: new SettingsService(db, TEST_USER_ID),
    });

    const emptyResponse = await app.inject({ method: "GET", url: "/api/v1/settings" });
    expect(emptyResponse.statusCode).toBe(200);
    expect(emptyResponse.json()).toEqual({ settings: null });

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      payload: input,
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toMatchObject({
      settings: {
        defaultCurrency: "USD",
        defaultHourlyRate: "95.2500",
        paymentTermsDays: 21,
        invoicePrefix: "VER-",
        nextInvoiceNumber: 42,
        defaultTaxRate: "8.8750",
      },
    });

    const reloadResponse = await app.inject({ method: "GET", url: "/api/v1/settings" });
    expect(reloadResponse.statusCode).toBe(200);
    expect(reloadResponse.json()).toMatchObject(saveResponse.json());

    await app.close();
  });
});
