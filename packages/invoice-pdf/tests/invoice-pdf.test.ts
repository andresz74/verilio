import type { InvoiceDto } from "@verilio/contracts";
import { describe, expect, it } from "vitest";

import { buildInvoicePresentationModel, renderInvoicePdf } from "../src/index.js";

const invoice: InvoiceDto = {
  id: "11111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-42",
  clientId: "22222222-2222-4222-8222-222222222222",
  clientName: "Client Before",
  status: "sent",
  displayStatus: "overdue",
  currency: "USD",
  issueDate: "2026-09-01",
  dueDate: "2026-09-05",
  paidAt: null,
  sellerSnapshot: { businessName: "Saved Studio", email: "billing@saved.test", address: "1 Saved Way", phone: "555-0100", taxIdentifier: "TAX-42" },
  clientSnapshot: { name: "Saved Client", email: "ap@saved.test", ccRecipients: ["owner@saved.test"], address: "2 Saved Road" },
  subtotal: "1000.00",
  discountType: "percentage",
  discountValue: "10",
  discountAmount: "100.00",
  taxableSubtotal: "900.00",
  taxPercent: "6",
  taxAmount: "54.00",
  total: "954.00",
  notes: "Saved notes",
  paymentTermsDays: 30,
  footer: "Saved footer",
  items: [{
    id: "33333333-3333-4333-8333-333333333333",
    kind: "manual",
    description: "Saved consulting",
    quantity: "10",
    unitPrice: "100.0000",
    amount: "1000.00",
    sortOrder: 0,
    sources: [],
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  }],
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
};

describe("Invoice presentation", () => {
  it("maps ordered persisted values and saved snapshots without live domain data", () => {
    expect(buildInvoicePresentationModel(invoice)).toEqual({
      invoiceNumber: "INV-42",
      status: "sent",
      displayStatus: "overdue",
      currency: "USD",
      issueDate: "2026-09-01",
      dueDate: "2026-09-05",
      paidAt: null,
      seller: invoice.sellerSnapshot,
      client: invoice.clientSnapshot,
      items: [{ id: invoice.items[0]!.id, kind: "manual", description: "Saved consulting", quantity: "10", unitPrice: "100.0000", amount: "1000.00", sortOrder: 0 }],
      subtotal: "1000.00",
      discountType: "percentage",
      discountValue: "10",
      discountAmount: "100.00",
      taxableSubtotal: "900.00",
      taxPercent: "6",
      taxAmount: "54.00",
      total: "954.00",
      notes: "Saved notes",
      paymentTermsDays: 30,
      paymentTermsLabel: "Payment due within 30 days",
      footer: "Saved footer",
    });
  });

  it("renders a non-empty valid PDF buffer", async () => {
    const buffer = await renderInvoicePdf(buildInvoicePresentationModel(invoice));
    const repeated = await renderInvoicePdf(buildInvoicePresentationModel(invoice));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(1_000);
    expect(repeated.equals(buffer)).toBe(true);
  });
});
