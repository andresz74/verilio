import { z } from "zod";

export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

export const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code");
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const DateOnlySchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}, "Date must be a valid YYYY-MM-DD calendar date");
export type DateOnly = z.infer<typeof DateOnlySchema>;

export const DecimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/, "Value must be a decimal string");
export type DecimalString = z.infer<typeof DecimalStringSchema>;

export const NonNegativeDecimalStringSchema = DecimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "Value must be non-negative",
);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const ApiFieldErrorsSchema = z.record(z.string(), z.array(z.string())).nullable();

export const ApiErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "DATABASE_UNAVAILABLE",
]);

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    fieldErrors: ApiFieldErrorsSchema,
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

