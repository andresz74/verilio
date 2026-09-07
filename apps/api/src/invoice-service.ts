import type {
  EligibleTimeQuery,
  EligibleTimeResponse,
  ImportTimeInput,
  InvoiceCreateInput,
  InvoiceDto,
  InvoiceListItem,
  InvoiceManualItemInput,
  InvoiceUpdateInput,
} from "@verilio/contracts";
import type { VerilioDatabase, VerilioTransaction } from "@verilio/db";
import {
  businessProfiles,
  clients,
  invoiceItems,
  invoiceItemTimeEntries,
  invoices,
  projects,
  tasks,
  timeEntries,
} from "@verilio/db";
import {
  calculateHistoricalTimeAmount,
  calculateInvoice,
  calculateInvoiceLineAmount,
  groupInvoiceTime,
  roundMoney,
  sumMoney,
} from "@verilio/domain";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  max,
  ne,
  notExists,
  sql,
} from "drizzle-orm";

import { ApiError } from "./errors.js";
import { LOCAL_USER_ID } from "./settings-service.js";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceItemRow = typeof invoiceItems.$inferSelect;

export interface InvoiceServiceContract {
  list(): Promise<InvoiceListItem[]>;
  get(id: string): Promise<InvoiceDto | null>;
  create(input: InvoiceCreateInput): Promise<InvoiceDto>;
  update(id: string, input: InvoiceUpdateInput): Promise<InvoiceDto | null>;
  eligibleTime(id: string, input: EligibleTimeQuery): Promise<EligibleTimeResponse | null>;
  importTime(id: string, input: ImportTimeInput): Promise<InvoiceDto | null>;
  addManualItem(id: string, input: InvoiceManualItemInput): Promise<InvoiceDto | null>;
  updateManualItem(id: string, itemId: string, input: InvoiceManualItemInput): Promise<InvoiceDto | null>;
  removeItem(id: string, itemId: string): Promise<InvoiceDto | null>;
}

export class InvoiceService implements InvoiceServiceContract {
  constructor(
    private readonly db: VerilioDatabase,
    private readonly ownerId = LOCAL_USER_ID,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(): Promise<InvoiceListItem[]> {
    const rows = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.userId, this.ownerId))
      .orderBy(sql`${invoices.issueDate} DESC`, sql`${invoices.createdAt} DESC`, sql`${invoices.id} DESC`);
    return Promise.all(rows.map(async ({ id }) => {
      const invoice = await this.loadDtoRequired(id);
      const { items, ...summary } = invoice;
      void items;
      return summary;
    }));
  }

  get(id: string): Promise<InvoiceDto | null> {
    return this.loadDto(id);
  }

  async create(input: InvoiceCreateInput): Promise<InvoiceDto> {
    try {
      const invoiceId = await this.db.transaction(async (tx) => {
        const [profile] = await tx
          .select()
          .from(businessProfiles)
          .where(eq(businessProfiles.userId, this.ownerId))
          .limit(1)
          .for("update");
        if (!profile) throw new ApiError(409, "SETTINGS_REQUIRED", "Complete Business settings before creating an Invoice.");
        const [client] = await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, input.clientId), eq(clients.userId, this.ownerId)))
          .limit(1);
        if (!client) throw invoiceValidation("clientId", "Choose a Client you can access.");

        const calculation = calculateOrThrow({
          currency: input.currency,
          lines: [],
          discountType: input.discountType,
          discountValue: input.discountValue,
          taxPercent: input.taxPercent,
        });
        const invoiceNumber = `${profile.invoicePrefix}${profile.nextInvoiceNumber}`;
        const [created] = await tx
          .insert(invoices)
          .values({
            userId: this.ownerId,
            invoiceNumber,
            clientId: client.id,
            status: "draft",
            currency: input.currency,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            paidAt: null,
            sellerSnapshot: {
              businessName: profile.businessName,
              email: profile.email,
              address: profile.address,
              phone: profile.phone,
              taxIdentifier: profile.taxIdentifier,
            },
            clientSnapshot: {
              name: client.name,
              email: client.email,
              ccRecipients: client.ccRecipients,
              address: client.address,
            },
            subtotal: calculation.subtotal,
            discountType: input.discountType,
            discountValue: input.discountValue,
            discountAmount: calculation.discountAmount,
            taxPercent: input.taxPercent,
            taxAmount: calculation.taxAmount,
            total: calculation.total,
            notes: emptyToNull(input.notes),
            updatedAt: this.clock(),
          })
          .returning({ id: invoices.id });
        if (!created) throw new Error("Invoice insert returned no record");
        await tx
          .update(businessProfiles)
          .set({ nextInvoiceNumber: profile.nextInvoiceNumber + 1, updatedAt: this.clock() })
          .where(eq(businessProfiles.userId, this.ownerId));
        return created.id;
      });
      return this.loadDtoRequired(invoiceId);
    } catch (error) {
      if (isConstraintViolation(error, "invoices_user_number_unique")) {
        throw new ApiError(409, "CONFLICT", "That Invoice number is already reserved. Update the next Invoice number in Settings and try again.");
      }
      throw error;
    }
  }

  async update(id: string, input: InvoiceUpdateInput): Promise<InvoiceDto | null> {
    const found = await this.db.transaction(async (tx) => {
      const invoice = await this.lockOwnedInvoice(tx, id);
      if (!invoice) return false;
      requireDraft(invoice);
      if (input.currency !== invoice.currency) {
        const [item] = await tx
          .select({ id: invoiceItems.id })
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, id))
          .limit(1);
        if (item) throw invoiceValidation("currency", "Remove all Invoice Items before changing currency.");
      }
      await tx
        .update(invoices)
        .set({
          currency: input.currency,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          discountType: input.discountType,
          discountValue: input.discountValue,
          taxPercent: input.taxPercent,
          notes: emptyToNull(input.notes),
          updatedAt: this.clock(),
        })
        .where(eq(invoices.id, id));
      await this.recalculate(tx, { ...invoice, ...input });
      return true;
    });
    return found ? this.loadDtoRequired(id) : null;
  }

  async eligibleTime(id: string, input: EligibleTimeQuery): Promise<EligibleTimeResponse | null> {
    const invoice = await this.loadOwnedRow(id);
    if (!invoice) return null;
    requireDraft(invoice);
    const reserved = this.reservedTimeExists();
    const rows = await this.db
      .select({ entry: timeEntries, projectName: projects.name, taskName: tasks.name })
      .from(timeEntries)
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(and(
        eq(timeEntries.userId, this.ownerId),
        eq(timeEntries.clientId, invoice.clientId),
        eq(timeEntries.billable, true),
        eq(timeEntries.currency, invoice.currency),
        isNotNull(timeEntries.durationSeconds),
        isNotNull(timeEntries.hourlyRate),
        gte(timeEntries.workDate, input.from),
        lte(timeEntries.workDate, input.to),
        notExists(reserved),
      ))
      .orderBy(asc(timeEntries.workDate), asc(timeEntries.createdAt), asc(timeEntries.id));
    const entries = rows.map(({ entry, projectName, taskName }) => sourceDto(entry, projectName, taskName));
    return {
      invoiceId: id,
      currency: invoice.currency,
      entries,
      count: entries.length,
      totalDurationSeconds: entries.reduce((sum, entry) => sum + entry.durationSeconds, 0),
      totalAmount: sumMoney(entries.map((entry) => entry.amount), invoice.currency),
    };
  }

  async importTime(id: string, input: ImportTimeInput): Promise<InvoiceDto | null> {
    const found = await this.db.transaction(async (tx) => {
      const invoice = await this.lockOwnedInvoice(tx, id);
      if (!invoice) return false;
      requireDraft(invoice);
      const ids = [...input.timeEntryIds].sort();
      const lockedRows = await tx
        .select({ id: timeEntries.id })
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, this.ownerId), inArray(timeEntries.id, ids)))
        .orderBy(asc(timeEntries.id))
        .for("update");
      if (lockedRows.length !== ids.length) throw invoiceValidation("timeEntryIds", "One or more Time Entries are unavailable.");
      const rows = await tx
        .select({ entry: timeEntries, projectName: projects.name, taskName: tasks.name })
        .from(timeEntries)
        .innerJoin(projects, eq(timeEntries.projectId, projects.id))
        .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
        .where(and(eq(timeEntries.userId, this.ownerId), inArray(timeEntries.id, ids)))
        .orderBy(asc(timeEntries.id));
      for (const { entry } of rows) {
        if (
          entry.clientId !== invoice.clientId ||
          !entry.billable ||
          !entry.durationSeconds ||
          !entry.hourlyRate ||
          entry.currency !== invoice.currency ||
          entry.workDate < input.from ||
          entry.workDate > input.to
        ) {
          throw invoiceValidation("timeEntryIds", "Every selected Time Entry must match this Invoice Client, currency, and billing period.");
        }
      }
      const [existing] = await tx
        .select({ id: invoiceItemTimeEntries.timeEntryId })
        .from(invoiceItemTimeEntries)
        .innerJoin(invoiceItems, eq(invoiceItemTimeEntries.invoiceItemId, invoiceItems.id))
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(and(inArray(invoiceItemTimeEntries.timeEntryId, ids), ne(invoices.status, "void")))
        .limit(1);
      if (existing) throw new ApiError(409, "TIME_ENTRY_ALREADY_INVOICED", "One or more Time Entries are already reserved by an Invoice.");

      const groups = groupInvoiceTime(
        rows.map(({ entry, projectName, taskName }) => ({
          id: entry.id,
          description: entry.description,
          projectId: entry.projectId,
          projectName,
          taskId: entry.taskId,
          taskName,
          durationSeconds: entry.durationSeconds!,
          hourlyRate: entry.hourlyRate!,
          currency: entry.currency!,
        })),
        input.grouping,
        invoice.currency,
      );
      const [sort] = await tx
        .select({ value: max(invoiceItems.sortOrder) })
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, id));
      let sortOrder = (sort?.value ?? -1) + 1;
      for (const group of groups) {
        const [item] = await tx
          .insert(invoiceItems)
          .values({ invoiceId: id, kind: "time", description: group.description, quantity: group.quantity, unitPrice: group.unitPrice, amount: group.amount, sortOrder: sortOrder++ })
          .returning({ id: invoiceItems.id });
        if (!item) throw new Error("Imported Invoice Item insert returned no record");
        await tx.insert(invoiceItemTimeEntries).values(group.sourceIds.map((timeEntryId) => ({ invoiceItemId: item.id, timeEntryId })));
      }
      await this.recalculate(tx, invoice);
      return true;
    });
    return found ? this.loadDtoRequired(id) : null;
  }

  async addManualItem(id: string, input: InvoiceManualItemInput): Promise<InvoiceDto | null> {
    const found = await this.db.transaction(async (tx) => {
      const invoice = await this.lockOwnedInvoice(tx, id);
      if (!invoice) return false;
      requireDraft(invoice);
      const amount = calculationLineOrThrow(input.quantity, input.unitPrice, invoice.currency);
      const [sort] = await tx.select({ value: max(invoiceItems.sortOrder) }).from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await tx.insert(invoiceItems).values({ invoiceId: id, kind: "manual", description: input.description.trim(), quantity: input.quantity, unitPrice: input.unitPrice, amount, sortOrder: (sort?.value ?? -1) + 1 });
      await this.recalculate(tx, invoice);
      return true;
    });
    return found ? this.loadDtoRequired(id) : null;
  }

  async updateManualItem(id: string, itemId: string, input: InvoiceManualItemInput): Promise<InvoiceDto | null> {
    const found = await this.db.transaction(async (tx) => {
      const invoice = await this.lockOwnedInvoice(tx, id);
      if (!invoice) return false;
      requireDraft(invoice);
      const [item] = await tx.select().from(invoiceItems).where(and(eq(invoiceItems.id, itemId), eq(invoiceItems.invoiceId, id))).limit(1).for("update");
      if (!item) throw new ApiError(404, "NOT_FOUND", "Invoice Item not found.");
      if (item.kind !== "manual") throw new ApiError(409, "INVOICE_STATE_INVALID", "Imported Time Items must be removed and reimported.");
      await tx.update(invoiceItems).set({ description: input.description.trim(), quantity: input.quantity, unitPrice: input.unitPrice, amount: calculationLineOrThrow(input.quantity, input.unitPrice, invoice.currency), updatedAt: this.clock() }).where(eq(invoiceItems.id, itemId));
      await this.recalculate(tx, invoice);
      return true;
    });
    return found ? this.loadDtoRequired(id) : null;
  }

  async removeItem(id: string, itemId: string): Promise<InvoiceDto | null> {
    const found = await this.db.transaction(async (tx) => {
      const invoice = await this.lockOwnedInvoice(tx, id);
      if (!invoice) return false;
      requireDraft(invoice);
      const removed = await tx.delete(invoiceItems).where(and(eq(invoiceItems.id, itemId), eq(invoiceItems.invoiceId, id))).returning({ id: invoiceItems.id });
      if (!removed.length) throw new ApiError(404, "NOT_FOUND", "Invoice Item not found.");
      await this.recalculate(tx, invoice);
      return true;
    });
    return found ? this.loadDtoRequired(id) : null;
  }

  private async lockOwnedInvoice(tx: VerilioTransaction, id: string): Promise<InvoiceRow | null> {
    const [row] = await tx.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, this.ownerId))).limit(1).for("update");
    return row ?? null;
  }

  private async loadOwnedRow(id: string): Promise<InvoiceRow | null> {
    const [row] = await this.db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.userId, this.ownerId))).limit(1);
    return row ?? null;
  }

  private reservedTimeExists() {
    return this.db
      .select({ one: sql`1` })
      .from(invoiceItemTimeEntries)
      .innerJoin(invoiceItems, eq(invoiceItemTimeEntries.invoiceItemId, invoiceItems.id))
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(
        eq(invoiceItemTimeEntries.timeEntryId, timeEntries.id),
        eq(invoices.userId, this.ownerId),
        ne(invoices.status, "void"),
      ));
  }

  private async recalculate(tx: VerilioTransaction, invoice: Pick<InvoiceRow, "id" | "currency" | "discountType" | "discountValue" | "taxPercent">): Promise<void> {
    const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)).orderBy(asc(invoiceItems.sortOrder));
    const calculation = calculateOrThrow({
      currency: invoice.currency,
      lines: items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
      discountType: invoice.discountType as "none" | "percentage" | "fixed",
      discountValue: invoice.discountValue,
      taxPercent: invoice.taxPercent,
    });
    for (const [index, item] of items.entries()) {
      const amount = calculation.lineAmounts[index];
      if (amount && amount !== roundMoney(item.amount, invoice.currency)) await tx.update(invoiceItems).set({ amount, updatedAt: this.clock() }).where(eq(invoiceItems.id, item.id));
    }
    await tx.update(invoices).set({ subtotal: calculation.subtotal, discountAmount: calculation.discountAmount, taxAmount: calculation.taxAmount, total: calculation.total, updatedAt: this.clock() }).where(eq(invoices.id, invoice.id));
  }

  private async loadDtoRequired(id: string): Promise<InvoiceDto> {
    const invoice = await this.loadDto(id);
    if (!invoice) throw new Error("Invoice could not be loaded");
    return invoice;
  }

  private async loadDto(id: string): Promise<InvoiceDto | null> {
    const row = await this.loadOwnedRow(id);
    if (!row) return null;
    const items = await this.db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder), asc(invoiceItems.id));
    const itemDtos = await Promise.all(items.map((item) => this.itemDto(item)));
    const calculation = calculateOrThrow({
      currency: row.currency,
      lines: items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
      discountType: row.discountType as "none" | "percentage" | "fixed",
      discountValue: row.discountValue,
      taxPercent: row.taxPercent,
    });
    return {
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      clientId: row.clientId,
      clientName: row.clientSnapshot.name,
      status: row.status as InvoiceDto["status"],
      currency: row.currency,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      paidAt: row.paidAt,
      sellerSnapshot: row.sellerSnapshot,
      clientSnapshot: row.clientSnapshot,
      subtotal: roundMoney(row.subtotal, row.currency),
      discountType: row.discountType as InvoiceDto["discountType"],
      discountValue: row.discountValue,
      discountAmount: roundMoney(row.discountAmount, row.currency),
      taxableSubtotal: calculation.taxableSubtotal,
      taxPercent: row.taxPercent,
      taxAmount: roundMoney(row.taxAmount, row.currency),
      total: roundMoney(row.total, row.currency),
      notes: row.notes,
      items: itemDtos,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async itemDto(item: InvoiceItemRow): Promise<InvoiceDto["items"][number]> {
    const rows = await this.db
      .select({ entry: timeEntries, projectName: projects.name, taskName: tasks.name })
      .from(invoiceItemTimeEntries)
      .innerJoin(timeEntries, eq(invoiceItemTimeEntries.timeEntryId, timeEntries.id))
      .innerJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(eq(invoiceItemTimeEntries.invoiceItemId, item.id))
      .orderBy(asc(timeEntries.workDate), asc(timeEntries.createdAt), asc(timeEntries.id));
    return {
      id: item.id,
      kind: item.kind as "manual" | "time",
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      sortOrder: item.sortOrder,
      sources: rows.map(({ entry, projectName, taskName }) => sourceDto(entry, projectName, taskName)),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}

function sourceDto(entry: typeof timeEntries.$inferSelect, projectName: string, taskName: string | null) {
  if (!entry.durationSeconds || !entry.hourlyRate || !entry.currency) throw new Error("Imported billable Time Entry is missing historical billing data");
  return {
    id: entry.id,
    workDate: entry.workDate,
    description: entry.description,
    projectId: entry.projectId,
    projectName,
    taskId: entry.taskId,
    taskName,
    durationSeconds: entry.durationSeconds,
    hourlyRate: entry.hourlyRate,
    currency: entry.currency,
    amount: calculateHistoricalTimeAmount({ billable: true, currency: entry.currency, durationSeconds: entry.durationSeconds, hourlyRate: entry.hourlyRate })!,
  };
}

function requireDraft(invoice: InvoiceRow): void {
  if (invoice.status !== "draft") throw new ApiError(409, "INVOICE_STATE_INVALID", "Only Draft Invoices can be edited in M7.");
}

function calculateOrThrow(input: Parameters<typeof calculateInvoice>[0]) {
  try {
    return calculateInvoice(input);
  } catch (error) {
    throw new ApiError(400, "INVOICE_CALCULATION_ERROR", error instanceof Error ? error.message : "Invoice totals could not be calculated.");
  }
}

function calculationLineOrThrow(quantity: string, unitPrice: string, currency: string): string {
  try {
    return calculateInvoiceLineAmount(quantity, unitPrice, currency);
  } catch (error) {
    throw new ApiError(400, "INVOICE_CALCULATION_ERROR", error instanceof Error ? error.message : "Invoice Item could not be calculated.");
  }
}

function invoiceValidation(field: string, message: string): ApiError {
  return new ApiError(400, "VALIDATION_ERROR", "Review the highlighted Invoice fields.", { [field]: [message] });
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}

function isConstraintViolation(error: unknown, constraint: string): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1) {
    const value = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (value.code === "23505" && value.constraint === constraint) return true;
    candidate = value.cause;
  }
  return false;
}
