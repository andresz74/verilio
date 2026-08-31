import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.js";

export type VerilioDatabase = NodePgDatabase<typeof schema>;

export function createDatabaseClient(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  return { db, pool };
}

export async function checkDatabaseConnection(db: VerilioDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

