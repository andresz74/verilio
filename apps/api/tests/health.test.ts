import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

const unusedDatabase = {} as VerilioDatabase;

describe("health endpoints", () => {
  it("reports liveness without touching the database", async () => {
    const app = buildApp({ db: unusedDatabase, logger: false });

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "live" });
    await app.close();
  });

  it("uses the standard error envelope when readiness fails", async () => {
    const app = buildApp({
      db: unusedDatabase,
      logger: false,
      readinessCheck: vi.fn().mockRejectedValue(new Error("offline")),
    });

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "The database is not ready.",
        fieldErrors: null,
      },
    });
    expect(response.json().error.requestId).toEqual(expect.any(String));
    await app.close();
  });
});

