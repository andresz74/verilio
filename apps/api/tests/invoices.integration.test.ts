import type { ClientInput, InvoiceCreateInput, ProjectInput } from "@verilio/contracts";
import {
  businessProfiles,
  clients,
  createDatabaseClient,
  invoiceItems,
  invoiceItemTimeEntries,
  invoices,
  projects,
  tasks,
  timeEntries,
  users,
} from "@verilio/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClientService } from "../src/client-service.js";
import { InvoiceService } from "../src/invoice-service.js";
import { ProjectService } from "../src/project-service.js";
import { ReportService } from "../src/report-service.js";
import { TaskService } from "../src/task-service.js";
import { TimeEntryService } from "../src/time-entry-service.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://verilio:verilio@localhost:5432/verilio";
const { db, pool } = createDatabaseClient(databaseUrl);
const OWNER_A = "00000000-0000-4000-8000-000000000011";
const OWNER_B = "00000000-0000-4000-8000-000000000012";

const clientInput = (name = "M7 Client", currency = "USD"): ClientInput => ({
  name,
  email: "billing@example.com",
  ccRecipients: ["accounts@example.com"],
  address: "1 Original Street",
  note: "",
  currency,
  rateMode: "override",
  defaultHourlyRate: "75.0000",
});

const projectInput = (clientId: string, rate = "85.0000"): ProjectInput => ({
  clientId,
  name: "Windows",
  color: "",
  rateMode: "override",
  defaultHourlyRate: rate,
  billableByDefault: true,
  note: "",
});

const draftInput = (clientId: string, currency = "USD"): InvoiceCreateInput => ({
  clientId,
  currency,
  issueDate: "2026-09-06",
  dueDate: "2026-10-06",
  discountType: "none",
  discountValue: "0",
  taxPercent: "0",
  notes: "Thank you",
});

async function removeOwners() {
  await db.delete(invoices).where(inArray(invoices.userId, [OWNER_A, OWNER_B]));
  await db.delete(timeEntries).where(inArray(timeEntries.userId, [OWNER_A, OWNER_B]));
  const ownedProjects = db.select({ id: projects.id }).from(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(tasks).where(inArray(tasks.projectId, ownedProjects));
  await db.delete(projects).where(inArray(projects.userId, [OWNER_A, OWNER_B]));
  await db.delete(clients).where(inArray(clients.userId, [OWNER_A, OWNER_B]));
  await db.delete(users).where(inArray(users.id, [OWNER_A, OWNER_B]));
}

async function setupOwner(ownerId: string) {
  await db.insert(users).values({ id: ownerId, displayName: `M7 ${ownerId}` });
  await db.insert(businessProfiles).values({
    userId: ownerId,
    businessName: "M7 Studio",
    email: "studio@example.com",
    address: "7 Seller Road",
    phone: "555-0100",
    taxIdentifier: "TAX-7",
    defaultCurrency: "USD",
    defaultHourlyRate: "70.0000",
    paymentTermsDays: 30,
    invoicePrefix: "M7-",
    nextInvoiceNumber: 1,
    defaultTaxRate: "6.0000",
    defaultInvoiceNotes: "Default notes",
    invoiceFooter: "Payment details on file",
    timezone: "America/New_York",
  });
  const client = await new ClientService(db, ownerId).create(clientInput());
  const project = await new ProjectService(db, ownerId).create(projectInput(client.id));
  const task = await new TaskService(db, ownerId).create(project.id, { name: "Bug Fix" });
  if (!task) throw new Error("Task fixture failed");
  return { client, project, task };
}

beforeEach(removeOwners);
afterEach(removeOwners);
afterAll(async () => pool.end());

describe("M7 Invoice Draft persistence", () => {
  it("allocates distinct stable numbers under concurrent first saves and isolates owners", async () => {
    const own = await setupOwner(OWNER_A);
    const other = await setupOwner(OWNER_B);
    const service = new InvoiceService(db, OWNER_A);
    const results = await Promise.all([
      service.create(draftInput(own.client.id)),
      service.create(draftInput(own.client.id)),
    ]);
    expect(results.map((invoice) => invoice.invoiceNumber).sort()).toEqual(["M7-1", "M7-2"]);
    const edited = await service.update(results[0]!.id, {
      ...draftInput(own.client.id),
      notes: "Edited",
    });
    expect(edited?.invoiceNumber).toBe(results[0]!.invoiceNumber);
    expect(await new InvoiceService(db, OWNER_B).get(results[0]!.id)).toBeNull();
    await expect(service.create(draftInput(other.client.id))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, OWNER_A));
    expect(profile?.nextInvoiceNumber).toBe(3);
    await db.update(businessProfiles).set({ nextInvoiceNumber: 1 }).where(eq(businessProfiles.userId, OWNER_A));
    await expect(service.create(draftInput(own.client.id))).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });
  });

  it("keeps seller and Client snapshots stable after current records change", async () => {
    const own = await setupOwner(OWNER_A);
    const service = new InvoiceService(db, OWNER_A);
    const invoice = await service.create(draftInput(own.client.id));
    await new ClientService(db, OWNER_A).update(own.client.id, { ...clientInput("Renamed", "GBP"), address: "99 New Street" });
    await db.update(businessProfiles).set({ businessName: "Changed Studio", address: "99 Seller Street" }).where(eq(businessProfiles.userId, OWNER_A));
    expect(await service.get(invoice.id)).toMatchObject({
      currency: "USD",
      clientSnapshot: { name: "M7 Client", address: "1 Original Street" },
      sellerSnapshot: { businessName: "M7 Studio", address: "7 Seller Road" },
    });
  });
});

describe("M7 eligible Time, reservation, grouping, and release", () => {
  it("enforces historical currency/date/billable eligibility and keeps archived history eligible", async () => {
    const own = await setupOwner(OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const usd = await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "Historical USD", billable: true });
    await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 600, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "Non-billable", billable: false });
    await timeService.create({ mode: "duration", workDate: "2026-08-01", durationSeconds: 600, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "Outside", billable: true });
    await new ProjectService(db, OWNER_A).setActive(own.project.id, false);
    await new ClientService(db, OWNER_A).update(own.client.id, clientInput("M7 Client", "GBP"));
    const invoiceService = new InvoiceService(db, OWNER_A);
    const gbpInvoice = await invoiceService.create(draftInput(own.client.id, "GBP"));
    expect((await invoiceService.eligibleTime(gbpInvoice.id, { from: "2026-09-01", to: "2026-09-30" }))?.entries).toEqual([]);
    const usdInvoice = await invoiceService.create(draftInput(own.client.id, "USD"));
    const eligible = await invoiceService.eligibleTime(usdInvoice.id, { from: "2026-09-01", to: "2026-09-30" });
    expect(eligible).toMatchObject({ count: 1, totalDurationSeconds: 3_600, totalAmount: "85.00" });
    expect(eligible?.entries[0]).toMatchObject({ id: usd.id, projectName: "Windows", taskName: "Bug Fix", currency: "USD", hourlyRate: "85.0000" });
  });

  it("groups by Project by default, splits mixed rates, reserves reports/time, and releases a whole line", async () => {
    const own = await setupOwner(OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const first = await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "First", billable: true });
    await new ProjectService(db, OWNER_A).update(own.project.id, projectInput(own.client.id, "100.0000"));
    const second = await timeService.create({ mode: "duration", workDate: "2026-09-06", durationSeconds: 7_200, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "Second", billable: true });
    const service = new InvoiceService(db, OWNER_A);
    const invoice = await service.create(draftInput(own.client.id));
    const imported = await service.importTime(invoice.id, { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [first.id, second.id], grouping: "project" });
    expect(imported?.items).toHaveLength(2);
    expect(imported?.items.map((item) => [item.unitPrice, item.sources.length])).toEqual([["85.0000", 1], ["100.0000", 1]]);
    expect(imported).toMatchObject({ subtotal: "285.00", total: "285.00" });
    expect((await timeService.get(first.id))?.invoice).toMatchObject({ id: invoice.id, invoiceNumber: "M7-1" });
    await expect(timeService.update(first.id, { mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "Changed", billable: true })).rejects.toMatchObject({ code: "TIME_ENTRY_INVOICED" });
    await expect(timeService.delete(first.id)).rejects.toMatchObject({ code: "TIME_ENTRY_INVOICED" });
    await expect(service.update(invoice.id, { ...draftInput(own.client.id, "GBP") })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await service.eligibleTime(invoice.id, { from: "2026-09-01", to: "2026-09-30" }))?.entries).toHaveLength(0);
    const reports = new ReportService(db, OWNER_A);
    expect((await reports.detailed({ from: "2026-09-01", to: "2026-09-30", billable: "all", invoiceStatus: "invoiced", page: 1, pageSize: 25 })).entries).toHaveLength(2);
    expect((await reports.detailed({ from: "2026-09-01", to: "2026-09-30", billable: "all", invoiceStatus: "not-invoiced", page: 1, pageSize: 25 })).entries).toHaveLength(0);
    expect((await reports.summary({ from: "2026-09-01", to: "2026-09-30", billable: "all", invoiceStatus: "invoiced", groupBy: "project" })).totalTrackedSeconds).toBe(10_800);
    expect((await reports.summary({ from: "2026-09-01", to: "2026-09-30", billable: "all", invoiceStatus: "not-invoiced", groupBy: "project" })).totalTrackedSeconds).toBe(0);
    const line = imported!.items.find((item) => item.sources.some((source) => source.id === first.id))!;
    await service.removeItem(invoice.id, line.id);
    expect((await timeService.get(first.id))?.invoice).toBeNull();
    expect((await service.eligibleTime(invoice.id, { from: "2026-09-01", to: "2026-09-30" }))?.entries.map((entry) => entry.id)).toContain(first.id);
  });

  it("allows exactly one concurrent reservation of the same Time Entry", async () => {
    const own = await setupOwner(OWNER_A);
    const entry = await new TimeEntryService(db, OWNER_A).create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "Race", billable: true });
    const service = new InvoiceService(db, OWNER_A);
    const [a, b] = await Promise.all([service.create(draftInput(own.client.id)), service.create(draftInput(own.client.id))]);
    const command = { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entry.id], grouping: "individual" as const };
    const results = await Promise.allSettled([service.importTime(a.id, command), service.importTime(b.id, command)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "TIME_ENTRY_ALREADY_INVOICED", statusCode: 409 } });
    const persistedItems = await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, [a.id, b.id]));
    expect(persistedItems).toHaveLength(1);
  });

  it("supports Task and Individual imports with an explicit no-Task fallback", async () => {
    const own = await setupOwner(OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const withTask = await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 1_800, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "Task work", billable: true });
    const withoutTask = await timeService.create({ mode: "duration", workDate: "2026-09-06", durationSeconds: 1_800, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "General work", billable: true });
    const service = new InvoiceService(db, OWNER_A);
    const invoice = await service.create(draftInput(own.client.id));
    const command = { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [withTask.id, withoutTask.id] };
    const byTask = await service.importTime(invoice.id, { ...command, grouping: "task" });
    expect(byTask?.items.map((item) => item.description).sort()).toEqual(["Bug Fix", "No task — Windows"]);
    for (const item of byTask!.items) await service.removeItem(invoice.id, item.id);
    const individually = await service.importTime(invoice.id, { ...command, grouping: "individual" });
    expect(individually?.items.map((item) => item.description).sort()).toEqual(["General work", "Task work"]);
    expect(individually?.items.every((item) => item.sources.length === 1)).toBe(true);
  });
});

describe("M7 manual Items and authoritative totals", () => {
  it("creates, edits, removes manual Items and recalculates discount then tax", async () => {
    const own = await setupOwner(OWNER_A);
    const service = new InvoiceService(db, OWNER_A);
    const invoice = await service.create(draftInput(own.client.id));
    const withItem = await service.addManualItem(invoice.id, { description: "Consulting package", quantity: "10", unitPrice: "100" });
    const item = withItem!.items[0]!;
    const calculated = await service.update(invoice.id, { ...draftInput(own.client.id), discountType: "percentage", discountValue: "10", taxPercent: "6" });
    expect(calculated).toMatchObject({ subtotal: "1000.00", discountAmount: "100.00", taxableSubtotal: "900.00", taxAmount: "54.00", total: "954.00" });
    const edited = await service.updateManualItem(invoice.id, item.id, { description: "Consulting", quantity: "2", unitPrice: "100" });
    expect(edited).toMatchObject({ subtotal: "200.00", total: "190.80" });
    await expect(service.addManualItem(invoice.id, { description: "Bad", quantity: "1", unitPrice: "-1" })).rejects.toMatchObject({ code: "INVOICE_CALCULATION_ERROR" });
    expect((await service.removeItem(invoice.id, item.id))?.total).toBe("0.00");
  });
});

describe("M8 Invoice PDF and lifecycle", () => {
  it("builds deterministic saved presentation data and a real PDF after live records change", async () => {
    const own = await setupOwner(OWNER_A);
    const service = new InvoiceService(db, OWNER_A, () => new Date("2026-09-06T16:00:00.000Z"));
    const time = await new TimeEntryService(db, OWNER_A).create({ mode: "duration", workDate: "2026-09-01", durationSeconds: 36_000, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "Saved historical work", billable: true });
    const draft = await service.create({ ...draftInput(own.client.id), issueDate: "2026-09-01", dueDate: "2026-09-05" });
    const saved = await service.importTime(draft.id, { from: "2026-09-01", to: "2026-09-01", timeEntryIds: [time.id], grouping: "project" });
    await service.update(draft.id, { ...draftInput(own.client.id), issueDate: "2026-09-01", dueDate: "2026-09-05", discountType: "percentage", discountValue: "10", taxPercent: "6" });
    await new ProjectService(db, OWNER_A).update(own.project.id, projectInput(own.client.id, "125.0000"));
    await new ClientService(db, OWNER_A).update(own.client.id, { ...clientInput("Changed Client", "GBP"), address: "99 Changed Client Street", defaultHourlyRate: "150.0000" });
    await db.update(businessProfiles).set({ businessName: "Changed Studio", address: "99 Changed Seller Street", defaultHourlyRate: "200.0000", paymentTermsDays: 7, invoiceFooter: "Changed footer" }).where(eq(businessProfiles.userId, OWNER_A));

    const presentation = await service.presentation(draft.id);
    expect(presentation).toMatchObject({
      displayStatus: "draft",
      seller: { businessName: "M7 Studio", address: "7 Seller Road" },
      client: { name: "M7 Client", address: "1 Original Street" },
      items: [{ description: "Windows", quantity: "10.000000000000", unitPrice: "85.0000", amount: "850.0000" }],
      subtotal: "850.00",
      discountAmount: "85.00",
      taxableSubtotal: "765.00",
      taxAmount: "45.90",
      total: "810.90",
      currency: "USD",
      paymentTermsDays: 30,
      paymentTermsLabel: "Payment due within 30 days",
      footer: "Payment details on file",
    });
    expect(saved?.invoiceNumber).toBe(draft.invoiceNumber);
    const pdf = await service.pdf(draft.id);
    expect(pdf?.filename).toBe(`invoice-${draft.invoiceNumber}.pdf`);
    expect(pdf?.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf?.buffer.byteLength).toBeGreaterThan(1_000);
    expect(await new InvoiceService(db, OWNER_B).presentation(draft.id)).toBeNull();
    expect(await new InvoiceService(db, OWNER_B).pdf(draft.id)).toBeNull();
  });

  it("enforces Draft → Sent → Paid, derives Overdue by Business date, and preserves financial history", async () => {
    const own = await setupOwner(OWNER_A);
    const service = new InvoiceService(db, OWNER_A, () => new Date("2026-09-06T16:00:00.000Z"));
    const draft = await service.create({ ...draftInput(own.client.id), issueDate: "2026-09-01", dueDate: "2026-09-05" });
    await expect(service.markPaid(draft.id, { paidAt: "2026-09-06" })).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    await expect(service.markSent(draft.id)).rejects.toMatchObject({ code: "INVOICE_CALCULATION_ERROR" });
    await expect(service.pdf(draft.id)).rejects.toMatchObject({ code: "INVOICE_CALCULATION_ERROR" });
    const withItem = await service.addManualItem(draft.id, { description: "Lifecycle work", quantity: "3", unitPrice: "85" });
    const before = { number: withItem?.invoiceNumber, seller: withItem?.sellerSnapshot, client: withItem?.clientSnapshot, subtotal: withItem?.subtotal, total: withItem?.total, currency: withItem?.currency };
    const sent = await service.markSent(draft.id);
    expect(sent).toMatchObject({ status: "sent", displayStatus: "overdue", paidAt: null });
    await expect(service.markSent(draft.id)).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    await expect(service.update(draft.id, { ...draftInput(own.client.id) })).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    const paid = await service.markPaid(draft.id, { paidAt: "2026-09-04" });
    expect(paid).toMatchObject({ status: "paid", displayStatus: "paid", paidAt: "2026-09-04" });
    expect({ number: paid?.invoiceNumber, seller: paid?.sellerSnapshot, client: paid?.clientSnapshot, subtotal: paid?.subtotal, total: paid?.total, currency: paid?.currency }).toEqual(before);
    await expect(service.void(draft.id)).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    await expect(service.markPaid(draft.id, { paidAt: "2026-09-06" })).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
  });

  it("voids without deleting history, releases Time, and allows re-invoicing", async () => {
    const own = await setupOwner(OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const entry = await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: own.task.id, description: "Void release", billable: true });
    const service = new InvoiceService(db, OWNER_A);
    const first = await service.create(draftInput(own.client.id));
    const imported = await service.importTime(first.id, { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entry.id], grouping: "project" });
    await service.markSent(first.id);
    const voided = await service.void(first.id);
    expect(voided).toMatchObject({ status: "void", displayStatus: "void", invoiceNumber: first.invoiceNumber });
    expect(voided?.items[0]?.sources[0]?.id).toBe(entry.id);
    expect((await timeService.get(entry.id))?.invoice).toBeNull();
    expect((await new ReportService(db, OWNER_A).detailed({ from: "2026-09-01", to: "2026-09-30", billable: "all", invoiceStatus: "not-invoiced", page: 1, pageSize: 25 })).entries[0]?.id).toBe(entry.id);
    const second = await service.create(draftInput(own.client.id));
    expect((await service.eligibleTime(second.id, { from: "2026-09-01", to: "2026-09-30" }))?.entries.map(({ id }) => id)).toContain(entry.id);
    await service.importTime(second.id, { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entry.id], grouping: "individual" });
    expect((await timeService.get(entry.id))?.invoice?.id).toBe(second.id);
    const historicalLinks = await db.select().from(invoiceItemTimeEntries).where(eq(invoiceItemTimeEntries.timeEntryId, entry.id));
    expect(historicalLinks).toHaveLength(2);
    expect((await service.get(first.id))?.items[0]?.sources[0]?.id).toBe(entry.id);
    expect(imported?.items).toHaveLength(1);
    await expect(service.markSent(first.id)).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    await expect(service.markPaid(first.id, { paidAt: "2026-09-06" })).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });
    await expect(service.update(first.id, { ...draftInput(own.client.id) })).rejects.toMatchObject({ code: "INVOICE_STATE_INVALID" });

    const emptyDraft = await service.create(draftInput(own.client.id));
    expect(await service.void(emptyDraft.id)).toMatchObject({ status: "void", invoiceNumber: emptyDraft.invoiceNumber });
  });

  it("serializes concurrent Paid and Void terminal transitions and keeps Paid Time reserved", async () => {
    const own = await setupOwner(OWNER_A);
    const timeService = new TimeEntryService(db, OWNER_A);
    const entry = await timeService.create({ mode: "duration", workDate: "2026-09-05", durationSeconds: 3_600, clientId: own.client.id, projectId: own.project.id, taskId: null, description: "Terminal race", billable: true });
    const service = new InvoiceService(db, OWNER_A);
    const invoice = await service.create(draftInput(own.client.id));
    await service.importTime(invoice.id, { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entry.id], grouping: "individual" });
    await service.markSent(invoice.id);
    const results = await Promise.allSettled([
      service.markPaid(invoice.id, { paidAt: "2026-09-06" }),
      service.void(invoice.id),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "INVOICE_STATE_INVALID", statusCode: 409 } });
    const terminal = await service.get(invoice.id);
    expect(["paid", "void"]).toContain(terminal?.status);
    const replacement = await service.create(draftInput(own.client.id));
    const eligible = await service.eligibleTime(replacement.id, { from: "2026-09-01", to: "2026-09-30" });
    expect(eligible?.entries.some(({ id }) => id === entry.id)).toBe(terminal?.status === "void");
    if (terminal?.status === "paid") expect((await timeService.get(entry.id))?.invoice?.id).toBe(invoice.id);
  });
});
