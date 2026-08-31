import { createDatabaseClient } from "@verilio/db";
import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);

afterAll(async () => {
  await pool.end();
});

describe("database readiness", () => {
  it("reaches PostgreSQL through the API readiness endpoint", async () => {
    const app = buildApp({ db, logger: false });

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready", database: "connected" });
    await app.close();
  });
});
