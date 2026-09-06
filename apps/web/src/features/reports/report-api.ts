import {
  ApiErrorSchema,
  ReportDetailedQuerySchema,
  ReportDetailedResponseSchema,
  ReportSummaryQuerySchema,
  ReportSummaryResponseSchema,
  type ReportDetailedQuery,
  type ReportDetailedResponse,
  type ReportSummaryQuery,
  type ReportSummaryResponse,
} from "@verilio/contracts";

export const reportKeys = {
  all: ["reports"] as const,
  summary: (filters: ReportSummaryQuery) => ["reports", "summary", filters] as const,
  detailed: (filters: ReportDetailedQuery) => ["reports", "detailed", filters] as const,
};

export class ReportApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "ReportApiError";
  }
}

export async function getSummaryReport(
  input: ReportSummaryQuery,
): Promise<ReportSummaryResponse> {
  const filters = ReportSummaryQuerySchema.parse(input);
  return request(
    `/api/v1/reports/summary?${serialize(filters).toString()}`,
    ReportSummaryResponseSchema,
  );
}

export async function getDetailedReport(
  input: ReportDetailedQuery,
): Promise<ReportDetailedResponse> {
  const filters = ReportDetailedQuerySchema.parse(input);
  const search = serialize(filters);
  search.set("page", String(filters.page));
  search.set("pageSize", String(filters.pageSize));
  return request(`/api/v1/reports/detailed?${search.toString()}`, ReportDetailedResponseSchema);
}

function serialize(input: ReportSummaryQuery | ReportDetailedQuery): URLSearchParams {
  const search = new URLSearchParams({
    from: input.from,
    to: input.to,
    billable: input.billable,
    invoiceStatus: input.invoiceStatus,
  });
  if (input.clientId) search.set("clientId", input.clientId);
  if (input.projectId) search.set("projectId", input.projectId);
  if (input.taskId) search.set("taskId", input.taskId);
  if ("groupBy" in input) search.set("groupBy", input.groupBy);
  return search;
}

async function request<T>(
  url: string,
  schema: { parse(value: unknown): T },
): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

async function toApiError(response: Response): Promise<ReportApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new ReportApiError(result.data.error.message, result.data.error.fieldErrors);
  }
  return new ReportApiError("Reports could not be loaded. Your filters are unchanged.");
}
