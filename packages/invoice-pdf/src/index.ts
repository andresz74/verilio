import type { InvoiceDto, InvoicePresentationModel } from "@verilio/contracts";

export { renderInvoicePdf } from "./render.js";

export function buildInvoicePresentationModel(invoice: InvoiceDto): InvoicePresentationModel {
  return {
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    displayStatus: invoice.displayStatus,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    seller: invoice.sellerSnapshot,
    client: invoice.clientSnapshot,
    items: invoice.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      sortOrder: item.sortOrder,
    })),
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
    paymentTermsLabel: paymentTermsLabel(invoice.paymentTermsDays),
    footer: invoice.footer,
  };
}

function paymentTermsLabel(days: number): string {
  if (days === 0) return "Due on receipt";
  return `Payment due within ${days} ${days === 1 ? "day" : "days"}`;
}
