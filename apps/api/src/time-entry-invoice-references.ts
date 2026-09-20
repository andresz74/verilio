import type { VerilioDatabase, VerilioTransaction } from "@verilio/db";
import { invoiceItems, invoiceItemTimeEntries, invoices } from "@verilio/db";
import { eq, inArray } from "drizzle-orm";

type ActiveInvoiceReference = { id: string; invoiceNumber: string };

export async function loadTimeEntryInvoiceReferences(
  db: VerilioDatabase | VerilioTransaction,
  ownerId: string,
  ids: string[],
): Promise<{ active: Map<string, ActiveInvoiceReference>; historical: Set<string> }> {
  const active = new Map<string, ActiveInvoiceReference>();
  const historical = new Set<string>();
  if (!ids.length) return { active, historical };

  const rows = await db
    .select({
      timeEntryId: invoiceItemTimeEntries.timeEntryId,
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      userId: invoices.userId,
    })
    .from(invoiceItemTimeEntries)
    .innerJoin(invoiceItems, eq(invoiceItemTimeEntries.invoiceItemId, invoiceItems.id))
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .where(inArray(invoiceItemTimeEntries.timeEntryId, ids));

  // Callers supply owner-scoped Time IDs. Any link blocks deletion, but only owned active Invoices are exposed.
  for (const row of rows) {
    historical.add(row.timeEntryId);
    if (row.userId === ownerId && row.status !== "void") active.set(row.timeEntryId, { id: row.id, invoiceNumber: row.invoiceNumber });
  }
  return { active, historical };
}
