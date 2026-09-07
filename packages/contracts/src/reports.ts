import { z } from "zod";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  DecimalStringSchema,
  IdSchema,
  PaginationSchema,
} from "./foundation.js";
import { TimeEntryDtoSchema } from "./time-entries.js";

export const ReportBillableFilterSchema = z.enum(["all", "billable", "non-billable"]);
export type ReportBillableFilter = z.infer<typeof ReportBillableFilterSchema>;

export const ReportInvoiceStatusSchema = z.enum(["all", "not-invoiced", "invoiced"]);
export type ReportInvoiceStatus = z.infer<typeof ReportInvoiceStatusSchema>;

export const ReportGroupBySchema = z.enum(["client", "project", "task"]);
export type ReportGroupBy = z.infer<typeof ReportGroupBySchema>;

const reportFilterShape = {
  from: DateOnlySchema,
  to: DateOnlySchema,
  clientId: IdSchema.optional(),
  projectId: IdSchema.optional(),
  taskId: IdSchema.optional(),
  billable: ReportBillableFilterSchema.default("all"),
  invoiceStatus: ReportInvoiceStatusSchema.default("all"),
};

function validateReportFilters(
  value: {
    from: string;
    to: string;
    clientId?: string | undefined;
    projectId?: string | undefined;
    taskId?: string | undefined;
  },
  context: z.RefinementCtx,
) {
  if (value.from > value.to) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "End date must be on or after start date",
    });
  }
  if (value.projectId && !value.clientId) {
    context.addIssue({
      code: "custom",
      path: ["projectId"],
      message: "Choose a client before filtering by project",
    });
  }
  if (value.taskId && !value.projectId) {
    context.addIssue({
      code: "custom",
      path: ["taskId"],
      message: "Choose a project before filtering by task",
    });
  }
}

export const ReportSummaryQuerySchema = z
  .object({
    ...reportFilterShape,
    groupBy: ReportGroupBySchema.default("client"),
  })
  .superRefine(validateReportFilters);
export type ReportSummaryQuery = z.infer<typeof ReportSummaryQuerySchema>;

export const ReportDetailedQuerySchema = z
  .object({
    ...reportFilterShape,
    ...PaginationSchema.shape,
  })
  .superRefine(validateReportFilters);
export type ReportDetailedQuery = z.infer<typeof ReportDetailedQuerySchema>;

export const ReportCurrencyTotalSchema = z.object({
  currency: CurrencyCodeSchema,
  amount: DecimalStringSchema,
});
export type ReportCurrencyTotal = z.infer<typeof ReportCurrencyTotalSchema>;

export const ReportGroupRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  secondaryLabel: z.string().nullable(),
  trackedSeconds: z.number().int().nonnegative(),
  billableSeconds: z.number().int().nonnegative(),
  billableTotals: z.array(ReportCurrencyTotalSchema),
});
export type ReportGroupRow = z.infer<typeof ReportGroupRowSchema>;

export const ReportDaySeriesRowSchema = z.object({
  workDate: DateOnlySchema,
  trackedSeconds: z.number().int().nonnegative(),
});

export const ReportProjectSeriesRowSchema = z.object({
  projectId: IdSchema,
  projectName: z.string(),
  trackedSeconds: z.number().int().nonnegative(),
});

export const ReportSummaryResponseSchema = z.object({
  range: z.object({ from: DateOnlySchema, to: DateOnlySchema }),
  totalTrackedSeconds: z.number().int().nonnegative(),
  billableSeconds: z.number().int().nonnegative(),
  nonBillableSeconds: z.number().int().nonnegative(),
  billableTotals: z.array(ReportCurrencyTotalSchema),
  groupBy: ReportGroupBySchema,
  groups: z.array(ReportGroupRowSchema),
  hoursByDay: z.array(ReportDaySeriesRowSchema),
  hoursByProject: z.array(ReportProjectSeriesRowSchema),
});
export type ReportSummaryResponse = z.infer<typeof ReportSummaryResponseSchema>;

export const ReportDetailedRowSchema = TimeEntryDtoSchema.extend({
  amount: DecimalStringSchema.nullable(),
  invoiceStatus: z.enum(["not-invoiced", "invoiced"]),
});
export type ReportDetailedRow = z.infer<typeof ReportDetailedRowSchema>;

export const ReportDetailedResponseSchema = z.object({
  range: z.object({ from: DateOnlySchema, to: DateOnlySchema }),
  entries: z.array(ReportDetailedRowSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type ReportDetailedResponse = z.infer<typeof ReportDetailedResponseSchema>;
