import type { BusinessProfileDto, BusinessProfileInput } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { SettingsServiceContract } from "../src/settings-service.js";

const validInput: BusinessProfileInput = {
  businessName: "Andres Consulting",
  email: "andres@example.com",
  address: "100 Main Street\nNew York, NY 10001",
  phone: "",
  taxIdentifier: "",
  defaultCurrency: "USD",
  defaultHourlyRate: "85.00",
  paymentTermsDays: 30,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  defaultTaxRate: "0",
  defaultInvoiceNotes: "Thank you for your business.",
  invoiceFooter: "Payment due within 30 days.",
  timezone: "America/New_York",
};

const savedProfile: BusinessProfileDto = {
  ...validInput,
  id: "00000000-0000-4000-8000-000000000001",
  phone: null,
  taxIdentifier: null,
  defaultInvoiceNotes: validInput.defaultInvoiceNotes,
  invoiceFooter: validInput.invoiceFooter,
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
};

function createSettingsService(): SettingsServiceContract {
  return {
    get: vi.fn().mockResolvedValue(savedProfile),
    save: vi.fn().mockResolvedValue(savedProfile),
  };
}

describe("settings routes", () => {
  it("returns the current business profile", async () => {
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      settingsService: createSettingsService(),
    });

    const response = await app.inject({ method: "GET", url: "/api/v1/settings" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ settings: savedProfile });
    await app.close();
  });

  it("validates settings before persistence", async () => {
    const settingsService = createSettingsService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      settingsService,
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      payload: { ...validInput, businessName: "", timezone: "Not/A_Timezone" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          businessName: ["Business name is required"],
          timezone: ["Enter a valid IANA timezone"],
        },
      },
    });
    expect(settingsService.save).not.toHaveBeenCalled();
    await app.close();
  });

  it("saves valid settings through the service", async () => {
    const settingsService = createSettingsService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      settingsService,
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/settings",
      payload: validInput,
    });

    expect(response.statusCode).toBe(200);
    expect(settingsService.save).toHaveBeenCalledWith(validInput);
    expect(response.json()).toEqual({ settings: savedProfile });
    await app.close();
  });
});

