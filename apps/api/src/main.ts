import { createDatabaseClient } from "@verilio/db";
import { config as loadEnvironment } from "dotenv";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { parseEnvironment } from "./env.js";

loadEnvironment({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

const environment = parseEnvironment(process.env);
const { db, pool } = createDatabaseClient(environment.DATABASE_URL);
const app = buildApp({ db });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Shutting down Verilio API");
  await app.close();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  app.log.fatal({ error }, "Verilio API failed to start");
  await pool.end();
  process.exitCode = 1;
}
