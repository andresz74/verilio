import {
  DateOnlySchema,
  IdSchema,
  ReportBillableFilterSchema,
  ReportGroupBySchema,
  ReportInvoiceStatusSchema,
  type ReportGroupBy,
  type ReportSummaryQuery,
} from "@verilio/contracts";

import { getPresetRange } from "../../shared/date-range.js";

export type NormalizedReportState = {
  common: Omit<ReportSummaryQuery, "groupBy">;
  groupBy: ReportGroupBy;
  page: number;
  params: URLSearchParams;
  redirect: boolean;
};

export function normalizeReportParams(
  searchParams: URLSearchParams,
  today: string,
): NormalizedReportState {
  const defaultRange = getPresetRange("this-week", today);
  const from = DateOnlySchema.safeParse(searchParams.get("from")).success ? searchParams.get("from")! : defaultRange.from;
  const to = DateOnlySchema.safeParse(searchParams.get("to")).success ? searchParams.get("to")! : defaultRange.to;
  const range = from <= to ? { from, to } : defaultRange;
  const clientResult = IdSchema.safeParse(searchParams.get("client"));
  const projectResult = IdSchema.safeParse(searchParams.get("project"));
  const taskResult = IdSchema.safeParse(searchParams.get("task"));
  const clientId = clientResult.success ? clientResult.data : undefined;
  const projectId = clientId && projectResult.success ? projectResult.data : undefined;
  const taskId = projectId && taskResult.success ? taskResult.data : undefined;
  const billableResult = ReportBillableFilterSchema.safeParse(searchParams.get("billable") ?? "all");
  const invoiceResult = ReportInvoiceStatusSchema.safeParse(searchParams.get("invoice") ?? "all");
  const groupResult = ReportGroupBySchema.safeParse(searchParams.get("group") ?? "client");
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const common = {
    ...range,
    ...(clientId ? { clientId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(taskId ? { taskId } : {}),
    billable: billableResult.success ? billableResult.data : "all" as const,
    invoiceStatus: invoiceResult.success ? invoiceResult.data : "all" as const,
  };
  const groupBy = groupResult.success ? groupResult.data : "client";
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (clientId) params.set("client", clientId);
  if (projectId) params.set("project", projectId);
  if (taskId) params.set("task", taskId);
  if (common.billable !== "all") params.set("billable", common.billable);
  if (common.invoiceStatus !== "all") params.set("invoice", common.invoiceStatus);
  if (groupBy !== "client") params.set("group", groupBy);
  if (page > 1) params.set("page", String(page));
  return {
    common,
    groupBy,
    page,
    params,
    redirect: params.toString() !== searchParams.toString(),
  };
}
