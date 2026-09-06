import { z } from "zod";

import {
  CurrencyCodeSchema,
  IdSchema,
  NonNegativeDecimalStringSchema,
} from "./foundation.js";

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .refine((value) => value.length === 0 || z.email().safeParse(value).success, {
    message: "Enter a valid email address",
  });

const ccRecipient = z
  .string()
  .trim()
  .max(320)
  .refine((value) => value.length === 0 || z.email().safeParse(value).success, {
    message: "Enter a valid email address",
  });

export const ClientInputSchema = z
  .object({
    name: z.string().trim().min(1, "Client name is required").max(160),
    email: optionalEmail,
    ccRecipients: z.array(ccRecipient).max(3, "Add no more than three CC recipients"),
    address: z.string().trim().max(1_000),
    note: z.string().trim().max(5_000),
    currency: CurrencyCodeSchema,
    rateMode: z.enum(["inherit", "override"]),
    defaultHourlyRate: NonNegativeDecimalStringSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.rateMode === "inherit" && value.defaultHourlyRate !== null) {
      context.addIssue({
        code: "custom",
        path: ["defaultHourlyRate"],
        message: "Inherited rates must use the business default",
      });
    }

    if (value.rateMode === "override" && value.defaultHourlyRate === null) {
      context.addIssue({
        code: "custom",
        path: ["defaultHourlyRate"],
        message: "Enter an hourly rate override",
      });
    }
  });
export type ClientInput = z.infer<typeof ClientInputSchema>;

export const ClientDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  email: z.string().nullable(),
  ccRecipients: z.array(z.string()),
  address: z.string().nullable(),
  note: z.string().nullable(),
  currency: CurrencyCodeSchema,
  defaultHourlyRate: NonNegativeDecimalStringSchema.nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ClientDto = z.infer<typeof ClientDtoSchema>;

export const ClientStatusFilterSchema = z.enum(["active", "archived", "all"]);
export type ClientStatusFilter = z.infer<typeof ClientStatusFilterSchema>;

export const ClientListQuerySchema = z.object({
  status: ClientStatusFilterSchema.default("active"),
  search: z.string().trim().max(160).default(""),
});
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;

export const ClientIdParamsSchema = z.object({ id: IdSchema });

export const ClientResponseSchema = z.object({ client: ClientDtoSchema });
export type ClientResponse = z.infer<typeof ClientResponseSchema>;

export const ClientListResponseSchema = z.object({ clients: z.array(ClientDtoSchema) });
export type ClientListResponse = z.infer<typeof ClientListResponseSchema>;
