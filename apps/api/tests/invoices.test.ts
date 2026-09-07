import type {
  EligibleTimeResponse,
  InvoiceDto,
  InvoicePresentationModel,
} from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { ApiError } from "../src/errors.js";
import type { InvoiceServiceContract } from "../src/invoice-service.js";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";

const invoice: InvoiceDto = {
  id: invoiceId,
  invoiceNumber: "INV-1",
  clientId,
  clientName: "Acme",
  status: "draft",
  displayStatus: "draft",
  currency: "USD",
  issueDate: "2026-09-06",
  dueDate: "2026-10-06",
  paidAt: null,
  sellerSnapshot: { businessName: "Verilio Studio", email: "billing@example.com", address: "1 Main St", phone: null, taxIdentifier: null },
  clientSnapshot: { name: "Acme", email: "accounts@acme.test", ccRecipients: [], address: "2 Client St" },
  subtotal: "0.00",
  discountType: "none",
  discountValue: "0",
  discountAmount: "0.00",
  taxableSubtotal: "0.00",
  taxPercent: "0",
  taxAmount: "0.00",
  total: "0.00",
  notes: null,
  paymentTermsDays: 30,
  footer: null,
  items: [],
  createdAt: "2026-09-06T12:00:00.000Z",
  updatedAt: "2026-09-06T12:00:00.000Z",
};

const eligible: EligibleTimeResponse = {
  invoiceId,
  currency: "USD",
  entries: [],
  count: 0,
  totalDurationSeconds: 0,
  totalAmount: "0.00",
};

const presentation: InvoicePresentationModel = {
  invoiceNumber: invoice.invoiceNumber,
  status: invoice.status,
  displayStatus: invoice.displayStatus,
  currency: invoice.currency,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  paidAt: invoice.paidAt,
  seller: invoice.sellerSnapshot,
  client: invoice.clientSnapshot,
  items: [],
  subtotal: invoice.subtotal,
  discountType: invoice.discountType,
  discountValue: invoice.discountValue,
  discountAmount: invoice.discountAmount,
  taxableSubtotal: invoice.taxableSubtotal,
  taxPercent: invoice.taxPercent,
  taxAmount: invoice.taxAmount,
  total: invoice.total,
  notes: invoice.notes,
  paymentTermsDays: invoice.paymentTermsDays,
  paymentTermsLabel: "Payment due within 30 days",
  footer: invoice.footer,
};

const draftInput = {
  clientId,
  currency: "USD",
  issueDate: "2026-09-06",
  dueDate: "2026-10-06",
  discountType: "none" as const,
  discountValue: "0",
  taxPercent: "0",
  notes: "",
};

function service(): InvoiceServiceContract {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(invoice),
    create: vi.fn().mockResolvedValue(invoice),
    update: vi.fn().mockResolvedValue(invoice),
    eligibleTime: vi.fn().mockResolvedValue(eligible),
    importTime: vi.fn().mockResolvedValue(invoice),
    addManualItem: vi.fn().mockResolvedValue(invoice),
    updateManualItem: vi.fn().mockResolvedValue(invoice),
    removeItem: vi.fn().mockResolvedValue(invoice),
    presentation: vi.fn().mockResolvedValue(presentation),
    pdf: vi.fn().mockResolvedValue({ buffer: Buffer.from("%PDF-test"), filename: "invoice-INV-1.pdf" }),
    markSent: vi.fn().mockResolvedValue(invoice),
    markPaid: vi.fn().mockResolvedValue(invoice),
    void: vi.fn().mockResolvedValue(invoice),
  };
}

describe("invoice routes", () => {
  it("exposes Draft, eligible-Time, import, and Item routes", async () => {
    const invoiceService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, invoiceService });

    expect((await app.inject({ method: "GET", url: "/api/v1/invoices" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/invoices", payload: draftInput })).statusCode).toBe(201);
    expect(invoiceService.create).toHaveBeenCalledWith(draftInput);
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}/presentation` })).json()).toEqual({ presentation });
    const pdf = await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}/pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe('attachment; filename="invoice-INV-1.pdf"');
    expect((await app.inject({ method: "PATCH", url: `/api/v1/invoices/${invoiceId}`, payload: { ...draftInput, taxPercent: "6" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}/eligible-time?from=2026-09-01&to=2026-09-30` })).statusCode).toBe(200);
    expect(invoiceService.eligibleTime).toHaveBeenCalledWith(invoiceId, { from: "2026-09-01", to: "2026-09-30" });
    expect((await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/import-time`, payload: { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entryId] } })).statusCode).toBe(200);
    expect(invoiceService.importTime).toHaveBeenCalledWith(invoiceId, { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entryId], grouping: "project" });
    expect((await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/items`, payload: { description: "Consulting", quantity: "2", unitPrice: "100" } })).statusCode).toBe(201);
    expect((await app.inject({ method: "PATCH", url: `/api/v1/invoices/${invoiceId}/items/${itemId}`, payload: { description: "Consulting", quantity: "3", unitPrice: "100" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/invoices/${invoiceId}/items/${itemId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/mark-sent` })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/mark-paid`, payload: { paidAt: "2026-09-06" } })).statusCode).toBe(200);
    expect(invoiceService.markPaid).toHaveBeenCalledWith(invoiceId, { paidAt: "2026-09-06" });
    expect((await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/void` })).statusCode).toBe(200);
    await app.close();
  });

  it("rejects invalid Draft calculations and import selections before service calls", async () => {
    const invoiceService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, invoiceService });
    const draft = await app.inject({ method: "POST", url: "/api/v1/invoices", payload: { ...draftInput, currency: "US", dueDate: "2026-09-01" } });
    expect(draft.statusCode).toBe(400);
    expect(draft.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", fieldErrors: { currency: [expect.any(String)], dueDate: [expect.any(String)] } } });
    expect(invoiceService.create).not.toHaveBeenCalled();

    const importResponse = await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/import-time`, payload: { from: "2026-09-30", to: "2026-09-01", timeEntryIds: [] } });
    expect(importResponse.statusCode).toBe(400);
    expect(importResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(invoiceService.importTime).not.toHaveBeenCalled();
    const paid = await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/mark-paid`, payload: { paidAt: "09/06/2026" } });
    expect(paid.statusCode).toBe(400);
    expect(invoiceService.markPaid).not.toHaveBeenCalled();
    await app.close();
  });

  it("maps missing Invoices and stable reservation conflicts", async () => {
    const invoiceService = service();
    vi.mocked(invoiceService.get).mockResolvedValue(null);
    vi.mocked(invoiceService.pdf).mockResolvedValue(null);
    vi.mocked(invoiceService.importTime).mockRejectedValue(new ApiError(409, "TIME_ENTRY_ALREADY_INVOICED", "Time is already reserved."));
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, invoiceService });
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/v1/invoices/${invoiceId}/pdf` })).statusCode).toBe(404);
    const response = await app.inject({ method: "POST", url: `/api/v1/invoices/${invoiceId}/import-time`, payload: { from: "2026-09-01", to: "2026-09-30", timeEntryIds: [entryId], grouping: "individual" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "TIME_ENTRY_ALREADY_INVOICED" } });
    await app.close();
  });
});
