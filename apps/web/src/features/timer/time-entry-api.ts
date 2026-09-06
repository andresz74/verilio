import {
  ApiErrorSchema,
  ManualTimeEntryInputSchema,
  RecentTimeEntriesResponseSchema,
  TimeEntryListQuerySchema,
  TimeEntryListResponseSchema,
  TimeEntryResponseSchema,
  TimeEntryUpdateInputSchema,
  TimerStartInputSchema,
  TimerStateResponseSchema,
  TimerStopResponseSchema,
  type ManualTimeEntryInput,
  type RecentTimeEntriesResponse,
  type TimeEntryListQuery,
  type TimeEntryListResponse,
  type TimeEntryResponse,
  type TimeEntryUpdateInput,
  type TimerStartInput,
  type TimerStateResponse,
  type TimerStopResponse,
} from "@verilio/contracts";

export const timerKeys = {
  current: ["timer", "current"] as const,
  recent: ["time-entries", "recent"] as const,
};

export const timeEntryKeys = {
  all: ["time-entries"] as const,
  list: (filters: TimeEntryListQuery) => ["time-entries", "list", filters] as const,
};

export class TimeEntryApiError extends Error {
  constructor(
    message: string,
    readonly code: string = "INTERNAL_ERROR",
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "TimeEntryApiError";
  }
}

export async function getCurrentTimer(): Promise<TimerStateResponse> {
  return request("/api/v1/timer/current", TimerStateResponseSchema, "Timer state could not be loaded.");
}

export async function startTimer(input: TimerStartInput): Promise<TimerStateResponse> {
  return request("/api/v1/timer/start", TimerStateResponseSchema, "Timer could not be started.", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TimerStartInputSchema.parse(input)),
  });
}

export async function stopTimer(): Promise<TimerStopResponse> {
  return request("/api/v1/timer/stop", TimerStopResponseSchema, "Timer could not be stopped.", {
    method: "POST",
  });
}

export async function getRecentTimeEntries(): Promise<RecentTimeEntriesResponse> {
  return request(
    "/api/v1/time-entries/recent?limit=10",
    RecentTimeEntriesResponseSchema,
    "Recent time could not be loaded.",
  );
}

export async function getTimeEntries(input: TimeEntryListQuery): Promise<TimeEntryListResponse> {
  const query = TimeEntryListQuerySchema.parse(input);
  const search = new URLSearchParams({
    from: query.from,
    to: query.to,
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) search.set("search", query.search);
  return request(
    `/api/v1/time-entries?${search.toString()}`,
    TimeEntryListResponseSchema,
    "Timesheet could not be loaded.",
  );
}

export async function createTimeEntry(input: ManualTimeEntryInput): Promise<TimeEntryResponse> {
  return request("/api/v1/time-entries", TimeEntryResponseSchema, "Time entry could not be saved.", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ManualTimeEntryInputSchema.parse(input)),
  });
}

export async function updateTimeEntry(
  id: string,
  input: TimeEntryUpdateInput,
): Promise<TimeEntryResponse> {
  return request(
    `/api/v1/time-entries/${id}`,
    TimeEntryResponseSchema,
    "Time entry could not be saved.",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(TimeEntryUpdateInputSchema.parse(input)),
    },
  );
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const response = await fetch(`/api/v1/time-entries/${id}`, { method: "DELETE" });
  if (!response.ok) throw await toApiError(response, "Time entry could not be deleted.");
}

async function request<T>(
  url: string,
  schema: { parse(value: unknown): T },
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await toApiError(response, fallback);
  return schema.parse(await response.json());
}

async function toApiError(response: Response, fallback: string): Promise<TimeEntryApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new TimeEntryApiError(
      result.data.error.message,
      result.data.error.code,
      result.data.error.fieldErrors,
    );
  }
  return new TimeEntryApiError(`${fallback} Your entries are still here.`);
}
