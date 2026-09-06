import type {
  TimeEntryDto,
  TimerStartInput,
} from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { ApiError } from "../src/errors.js";
import type { TimeEntryServiceContract } from "../src/time-entry-service.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const startInput: TimerStartInput = {
  clientId,
  projectId,
  taskId: null,
  description: "Build timer",
  billable: true,
};
const entry: TimeEntryDto = {
  id: entryId,
  clientId,
  clientName: "Acme",
  projectId,
  projectName: "Website",
  taskId: null,
  taskName: null,
  description: "Build timer",
  mode: "timer",
  workDate: "2026-09-05",
  startAt: "2026-09-05T14:00:00.000Z",
  endAt: null,
  durationSeconds: null,
  billable: true,
  hourlyRate: null,
  createdAt: "2026-09-05T14:00:00.000Z",
  updatedAt: "2026-09-05T14:00:00.000Z",
};

function service(): TimeEntryServiceContract {
  return {
    current: vi.fn().mockResolvedValue({ timer: entry, serverNow: "2026-09-05T14:00:10.000Z" }),
    start: vi.fn().mockResolvedValue({ timer: entry, serverNow: "2026-09-05T14:00:00.000Z" }),
    stop: vi.fn().mockResolvedValue({ entry: { ...entry, endAt: "2026-09-05T14:01:00.000Z", durationSeconds: 60, hourlyRate: "100.0000" }, serverNow: "2026-09-05T14:01:00.000Z" }),
    list: vi.fn().mockResolvedValue({ entries: [], dailyTotals: [], totalDurationSeconds: 0, page: 1, pageSize: 25, total: 0, totalPages: 0 }),
    listRecent: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(entry),
    create: vi.fn().mockResolvedValue(entry),
    update: vi.fn().mockResolvedValue(entry),
    delete: vi.fn().mockResolvedValue(true),
  };
}

describe("time-entry routes", () => {
  it("validates timer hierarchy input before calling the service", async () => {
    const timeEntryService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, timeEntryService });
    const response = await app.inject({ method: "POST", url: "/api/v1/timer/start", payload: { ...startInput, projectId: "bad" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", fieldErrors: { projectId: [expect.any(String)] } } });
    expect(timeEntryService.start).not.toHaveBeenCalled();
    await app.close();
  });

  it("exposes current, start, stop, manual CRUD, and recent-time routes", async () => {
    const timeEntryService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, timeEntryService });
    expect((await app.inject({ method: "GET", url: "/api/v1/timer/current" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/timer/start", payload: startInput })).statusCode).toBe(201);
    expect(timeEntryService.start).toHaveBeenCalledWith(startInput);
    expect((await app.inject({ method: "POST", url: "/api/v1/timer/stop" })).statusCode).toBe(200);
    const manual = { ...startInput, mode: "duration", workDate: "2026-09-05", durationSeconds: 3600 };
    expect((await app.inject({ method: "POST", url: "/api/v1/time-entries", payload: manual })).statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/api/v1/time-entries/recent" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/time-entries?from=2026-09-01&to=2026-09-07" })).statusCode).toBe(200);
    expect(timeEntryService.list).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-07",
      page: 1,
      pageSize: 25,
      search: "",
    });
    expect((await app.inject({ method: "GET", url: `/api/v1/time-entries/${entryId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/time-entries/${entryId}` })).statusCode).toBe(204);
    await app.close();
  });

  it("validates historical date ranges and pagination", async () => {
    const timeEntryService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, timeEntryService });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/time-entries?from=2026-09-07&to=2026-09-01&pageSize=0",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(timeEntryService.list).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns stable timer conflict codes", async () => {
    const timeEntryService = service();
    vi.mocked(timeEntryService.start).mockRejectedValue(new ApiError(409, "TIMER_ALREADY_RUNNING", "A timer is already running."));
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, timeEntryService });
    const response = await app.inject({ method: "POST", url: "/api/v1/timer/start", payload: startInput });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "TIMER_ALREADY_RUNNING" } });
    await app.close();
  });
});
