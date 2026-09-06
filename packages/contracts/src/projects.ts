import { z } from "zod";

import { IdSchema, NonNegativeDecimalStringSchema } from "./foundation.js";

export const ProjectInputSchema = z
  .object({
    clientId: IdSchema,
    name: z.string().trim().min(1, "Project name is required").max(160),
    color: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || /^#[0-9A-Fa-f]{6}$/.test(value),
        "Color must use #RRGGBB format",
      ),
    rateMode: z.enum(["inherit", "override"]),
    defaultHourlyRate: NonNegativeDecimalStringSchema.nullable(),
    billableByDefault: z.boolean(),
    note: z.string().trim().max(5_000),
  })
  .superRefine((value, context) => {
    if (value.rateMode === "inherit" && value.defaultHourlyRate !== null) {
      context.addIssue({
        code: "custom",
        path: ["defaultHourlyRate"],
        message: "Inherited rates must use the client or business default",
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
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

export const ProjectDtoSchema = z.object({
  id: IdSchema,
  clientId: IdSchema,
  name: z.string(),
  color: z.string().nullable(),
  defaultHourlyRate: NonNegativeDecimalStringSchema.nullable(),
  billableByDefault: z.boolean(),
  note: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectDto = z.infer<typeof ProjectDtoSchema>;

export const ProjectStatusFilterSchema = z.enum(["active", "archived", "all"]);
export type ProjectStatusFilter = z.infer<typeof ProjectStatusFilterSchema>;

export const ProjectListQuerySchema = z.object({
  status: ProjectStatusFilterSchema.default("active"),
  clientId: IdSchema.optional(),
  search: z.string().trim().max(160).default(""),
  availability: z.enum(["all", "new-work"]).default("all"),
});
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

export const ProjectIdParamsSchema = z.object({ id: IdSchema });

export const ProjectResponseSchema = z.object({ project: ProjectDtoSchema });
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const ProjectListResponseSchema = z.object({ projects: z.array(ProjectDtoSchema) });
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
