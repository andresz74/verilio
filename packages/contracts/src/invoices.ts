import { z } from "zod";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  DecimalStringSchema,
  IdSchema,
  NonNegativeDecimalStringSchema,
} from "./foundation.js";

export const InvoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export const InvoiceDiscountTypeSchema = z.enum(["none", "percentage", "fixed"]);
export type InvoiceDiscountType = z.infer<typeof InvoiceDiscountTypeSchema>;
export const InvoiceGroupingSchema = z.enum(["project", "task", "individual"]);
export type InvoiceGrouping = z.infer<typeof InvoiceGroupingSchema>;

export const InvoiceSellerSnapshotSchema = z.object({
  businessName: z.string(),
  email: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  taxIdentifier: z.string().nullable(),
});
export const InvoiceClientSnapshotSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  ccRecipients: z.array(z.string()),
  address: z.string().nullable(),
});

const invoiceDraftShape = {
  currency: CurrencyCodeSchema,
  issueDate: DateOnlySchema,
  dueDate: DateOnlySchema,
  discountType: InvoiceDiscountTypeSchema,
  discountValue: NonNegativeDecimalStringSchema,
  taxPercent: NonNegativeDecimalStringSchema,
  notes: z.string().trim().max(10_000),
};

function validateDraft(value: { issueDate: string; dueDate: string; discountType: InvoiceDiscountType; discountValue: string; taxPercent: string }, context: z.RefinementCtx) {
  if (value.dueDate < value.issueDate) context.addIssue({ code: "custom", path: ["dueDate"], message: "Due date must be on or after issue date" });
  if (value.discountType === "none" && value.discountValue !== "0") context.addIssue({ code: "custom", path: ["discountValue"], message: "No discount must use a zero value" });
  if (value.discountType === "percentage" && Number(value.discountValue) > 100) context.addIssue({ code: "custom", path: ["discountValue"], message: "Percentage discount cannot exceed 100%" });
  if (Number(value.taxPercent) > 100) context.addIssue({ code: "custom", path: ["taxPercent"], message: "Tax percentage cannot exceed 100%" });
}

export const InvoiceCreateInputSchema = z.object({
  clientId: IdSchema,
  ...invoiceDraftShape,
}).superRefine(validateDraft);
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateInputSchema>;

export const InvoiceUpdateInputSchema = z.object(invoiceDraftShape).superRefine(validateDraft);
export type InvoiceUpdateInput = z.infer<typeof InvoiceUpdateInputSchema>;

export const InvoiceManualItemInputSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(1_000),
  quantity: NonNegativeDecimalStringSchema.refine((value) => Number(value) > 0, "Quantity must be greater than zero"),
  unitPrice: NonNegativeDecimalStringSchema,
});
export type InvoiceManualItemInput = z.infer<typeof InvoiceManualItemInputSchema>;

export const InvoiceSourceTimeSchema = z.object({
  id: IdSchema,
  workDate: DateOnlySchema,
  description: z.string(),
  projectId: IdSchema,
  projectName: z.string(),
  taskId: IdSchema.nullable(),
  taskName: z.string().nullable(),
  durationSeconds: z.number().int().positive(),
  hourlyRate: NonNegativeDecimalStringSchema,
  currency: CurrencyCodeSchema,
  amount: DecimalStringSchema,
});
export type InvoiceSourceTime = z.infer<typeof InvoiceSourceTimeSchema>;

export const InvoiceItemDtoSchema = z.object({
  id: IdSchema,
  kind: z.enum(["manual", "time"]),
  description: z.string(),
  quantity: NonNegativeDecimalStringSchema,
  unitPrice: NonNegativeDecimalStringSchema,
  amount: NonNegativeDecimalStringSchema,
  sortOrder: z.number().int().nonnegative(),
  sources: z.array(InvoiceSourceTimeSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type InvoiceItemDto = z.infer<typeof InvoiceItemDtoSchema>;

export const InvoiceDtoSchema = z.object({
  id: IdSchema,
  invoiceNumber: z.string(),
  clientId: IdSchema,
  clientName: z.string(),
  status: InvoiceStatusSchema,
  currency: CurrencyCodeSchema,
  issueDate: DateOnlySchema,
  dueDate: DateOnlySchema,
  paidAt: DateOnlySchema.nullable(),
  sellerSnapshot: InvoiceSellerSnapshotSchema,
  clientSnapshot: InvoiceClientSnapshotSchema,
  subtotal: NonNegativeDecimalStringSchema,
  discountType: InvoiceDiscountTypeSchema,
  discountValue: NonNegativeDecimalStringSchema,
  discountAmount: NonNegativeDecimalStringSchema,
  taxableSubtotal: NonNegativeDecimalStringSchema,
  taxPercent: NonNegativeDecimalStringSchema,
  taxAmount: NonNegativeDecimalStringSchema,
  total: NonNegativeDecimalStringSchema,
  notes: z.string().nullable(),
  items: z.array(InvoiceItemDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type InvoiceDto = z.infer<typeof InvoiceDtoSchema>;

export const InvoiceListItemSchema = InvoiceDtoSchema.omit({ items: true });
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>;
export const InvoiceListResponseSchema = z.object({ invoices: z.array(InvoiceListItemSchema) });
export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>;
export const InvoiceResponseSchema = z.object({ invoice: InvoiceDtoSchema });
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>;

export const InvoiceIdParamsSchema = z.object({ id: IdSchema });
export const InvoiceItemParamsSchema = z.object({ id: IdSchema, itemId: IdSchema });
export const EligibleTimeQuerySchema = z.object({ from: DateOnlySchema, to: DateOnlySchema }).refine(({ from, to }) => from <= to, { path: ["to"], message: "End date must be on or after start date" });
export type EligibleTimeQuery = z.infer<typeof EligibleTimeQuerySchema>;
export const EligibleTimeResponseSchema = z.object({
  invoiceId: IdSchema,
  currency: CurrencyCodeSchema,
  entries: z.array(InvoiceSourceTimeSchema),
  count: z.number().int().nonnegative(),
  totalDurationSeconds: z.number().int().nonnegative(),
  totalAmount: NonNegativeDecimalStringSchema,
});
export type EligibleTimeResponse = z.infer<typeof EligibleTimeResponseSchema>;

export const ImportTimeInputSchema = z.object({
  from: DateOnlySchema,
  to: DateOnlySchema,
  timeEntryIds: z.array(IdSchema).min(1, "Select at least one Time Entry").refine((values) => new Set(values).size === values.length, "Time Entry selection contains duplicates"),
  grouping: InvoiceGroupingSchema.default("project"),
}).refine(({ from, to }) => from <= to, { path: ["to"], message: "End date must be on or after start date" });
export type ImportTimeInput = z.infer<typeof ImportTimeInputSchema>;
