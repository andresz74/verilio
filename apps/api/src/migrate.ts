import { createDatabaseClient } from "@verilio/db";
import { config as loadEnvironment } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseEnvironment } from "./env.js";

loadEnvironment({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const environment = parseEnvironment(process.env, (path) =>
  readFileSync(path, "utf8"),
);
const { db, pool } = createDatabaseClient(environment.DATABASE_URL);
const migrationsFolder =
  process.env.MIGRATIONS_PATH ??
  fileURLToPath(new URL("../../../packages/db/migrations", import.meta.url));

try {
  await migrate(db, { migrationsFolder });
  console.log("Verilio database migrations completed successfully.");
} catch (error) {
  console.error("Verilio database migrations failed.");
  throw error;
} finally {
  await pool.end();
}
