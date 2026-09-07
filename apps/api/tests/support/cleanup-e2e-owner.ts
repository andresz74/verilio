import {
  businessProfiles,
  clients,
  createDatabaseClient,
  invoices,
  projects,
  tasks,
  timeEntries,
  users,
} from "@verilio/db";
import { eq, inArray } from "drizzle-orm";

const E2E_OWNER_ID = "00000000-0000-4000-8000-000000000090";
const databaseUrl = process.env.DATABASE_URL;
const ownerId = process.env.LOCAL_USER_ID;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for E2E cleanup");
}

if (ownerId !== E2E_OWNER_ID) {
  throw new Error(
    `Refusing E2E cleanup for unexpected owner ${ownerId ?? "(missing)"}`,
  );
}

const { db, pool } = createDatabaseClient(databaseUrl);

try {
  await db.transaction(async (transaction) => {
    await transaction.delete(invoices).where(eq(invoices.userId, ownerId));
    await transaction.delete(timeEntries).where(eq(timeEntries.userId, ownerId));

    const ownedProjects = transaction
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, ownerId));
    await transaction.delete(tasks).where(inArray(tasks.projectId, ownedProjects));
    await transaction.delete(projects).where(eq(projects.userId, ownerId));
    await transaction.delete(clients).where(eq(clients.userId, ownerId));
    await transaction.delete(users).where(eq(users.id, ownerId));

    if (process.env.E2E_SEED_SETTINGS === "true") {
      await transaction.insert(users).values({
        id: ownerId,
        displayName: "Verilio E2E",
      });
      await transaction.insert(businessProfiles).values({
        userId: ownerId,
        businessName: "Verilio E2E Studio",
        email: "billing@verilio.test",
        address: "42 Ledger Lane",
        defaultCurrency: "USD",
        defaultHourlyRate: "85.0000",
        paymentTermsDays: 30,
        invoicePrefix: "E2E-",
        nextInvoiceNumber: 1,
        defaultTaxRate: "0",
        timezone: "America/New_York",
      });
    }
  });
} finally {
  await pool.end();
}
