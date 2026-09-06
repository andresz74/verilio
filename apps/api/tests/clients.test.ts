import type { ClientDto, ClientInput } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { ClientServiceContract } from "../src/client-service.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const validInput: ClientInput = {
  name: "Northstar Studio",
  email: "billing@northstar.test",
  ccRecipients: ["accounts@northstar.test"],
  address: "8 Market Street",
  note: "Monthly billing",
  currency: "USD",
  rateMode: "inherit",
  defaultHourlyRate: null,
};
const savedClient: ClientDto = {
  id: clientId,
  name: validInput.name,
  email: validInput.email,
  ccRecipients: validInput.ccRecipients,
  address: validInput.address,
  note: validInput.note,
  currency: validInput.currency,
  defaultHourlyRate: null,
  active: true,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

function createClientService(): ClientServiceContract {
  return {
    list: vi.fn().mockResolvedValue([savedClient]),
    get: vi.fn().mockResolvedValue(savedClient),
    create: vi.fn().mockResolvedValue(savedClient),
    update: vi.fn().mockResolvedValue(savedClient),
    setActive: vi.fn().mockImplementation((_id: string, active: boolean) =>
      Promise.resolve({ ...savedClient, active }),
    ),
  };
}

describe("client routes", () => {
  it("validates create input before persistence", async () => {
    const clientService = createClientService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      clientService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: {
        ...validInput,
        name: "",
        email: "not-an-email",
        rateMode: "override",
        defaultHourlyRate: "-1",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          name: ["Client name is required"],
          email: ["Enter a valid email address"],
          defaultHourlyRate: ["Value must be non-negative"],
        },
      },
    });
    expect(clientService.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("creates, reads, lists, and updates clients through the service boundary", async () => {
    const clientService = createClientService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      clientService,
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/clients",
      payload: validInput,
    });
    expect(createResponse.statusCode).toBe(201);
    expect(clientService.create).toHaveBeenCalledWith(validInput);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/clients?status=archived&search=north",
    });
    expect(listResponse.statusCode).toBe(200);
    expect(clientService.list).toHaveBeenCalledWith({
      status: "archived",
      search: "north",
    });

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/v1/clients/${clientId}`,
    });
    expect(getResponse.statusCode).toBe(200);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/clients/${clientId}`,
      payload: { ...validInput, name: "Northstar Labs" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(clientService.update).toHaveBeenCalledWith(clientId, {
      ...validInput,
      name: "Northstar Labs",
    });
    await app.close();
  });

  it("uses explicit archive and reactivate commands", async () => {
    const clientService = createClientService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      clientService,
    });

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/archive`,
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(clientService.setActive).toHaveBeenCalledWith(clientId, false);

    const reactivateResponse = await app.inject({
      method: "POST",
      url: `/api/v1/clients/${clientId}/reactivate`,
    });
    expect(reactivateResponse.statusCode).toBe(200);
    expect(clientService.setActive).toHaveBeenCalledWith(clientId, true);
    await app.close();
  });

  it("returns not found without leaking another owner's client", async () => {
    const clientService = createClientService();
    vi.mocked(clientService.get).mockResolvedValue(null);
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      clientService,
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/clients/${clientId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });
});
