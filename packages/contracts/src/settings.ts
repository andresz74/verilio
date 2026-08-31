import { z } from "zod";

import { CurrencyCodeSchema, NonNegativeDecimalStringSchema } from "./foundation.js";

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const optionalShortText = z.string().trim().max(255);
const optionalLongText = z.string().trim().max(5_000);

export const BusinessProfileInputSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(160),
  email: z.email("Enter a valid email address").max(320),
  address: z.string().trim().min(1, "Business address is required").max(1_000),
  phone: optionalShortText,
  taxIdentifier: optionalShortText,
  defaultCurrency: CurrencyCodeSchema,
  defaultHourlyRate: NonNegativeDecimalStringSchema,
  paymentTermsDays: z.number().int().min(0).max(365),
  invoicePrefix: z.string().trim().min(1, "Invoice prefix is required").max(32),
  nextInvoiceNumber: z.number().int().positive().max(999_999_999),
  defaultTaxRate: NonNegativeDecimalStringSchema.refine(
    (value) => Number(value) <= 100,
    "Tax rate cannot exceed 100%",
  ),
  defaultInvoiceNotes: optionalLongText,
  invoiceFooter: optionalLongText,
  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required")
    .refine(isIanaTimezone, "Enter a valid IANA timezone"),
});
export type BusinessProfileInput = z.infer<typeof BusinessProfileInputSchema>;

export const BusinessProfileDtoSchema = BusinessProfileInputSchema.extend({
  id: z.uuid(),
  phone: z.string().nullable(),
  taxIdentifier: z.string().nullable(),
  defaultInvoiceNotes: z.string().nullable(),
  invoiceFooter: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type BusinessProfileDto = z.infer<typeof BusinessProfileDtoSchema>;

export const SettingsResponseSchema = z.object({
  settings: BusinessProfileDtoSchema.nullable(),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

