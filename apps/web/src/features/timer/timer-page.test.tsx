import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TimeEntryDto, TimerStartInput } from "@verilio/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { timerKeys } from "./time-entry-api.js";
import { TimerPage } from "./timer-page.js";
import { groupRecentActivities, timeEntryToTimerStartContext } from "./timer-activity.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";
const running = {
  id: entryId,
  clientId,
  clientName: "Acme",
  projectId,
  projectName: "Website",
  taskId,
  taskName: "Build",
  description: "Reliable timer",
  mode: "timer",
  workDate: "2026-09-05",
  startAt: "2026-09-05T13:59:00.000Z",
  endAt: null,
  durationSeconds: null,
  billable: true,
  hourlyRate: null,
  currency: null,
  invoice: null,
  hasInvoiceHistory: false,
  createdAt: "2026-09-05T13:59:00.000Z",
  updatedAt: "2026-09-05T13:59:00.000Z",
};

function handlers() {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings: { id: "99999999-9999-4999-8999-999999999999", businessName: "Solo", email: "solo@example.com", address: "Here", phone: null, taxIdentifier: null, defaultCurrency: "USD", defaultHourlyRate: "80.0000", paymentTermsDays: 30, invoicePrefix: "INV", nextInvoiceNumber: 1, defaultTaxRate: "0.0000", defaultInvoiceNotes: null, invoiceFooter: null, timezone: "America/New_York", createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients: [{ id: clientId, name: "Acme", email: null, ccRecipients: [], address: null, note: null, currency: "USD", defaultHourlyRate: null, active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get("/api/v1/projects", () => HttpResponse.json({ projects: [{ id: projectId, clientId, name: "Website", color: null, defaultHourlyRate: "100.0000", billableByDefault: true, note: null, active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get(`/api/v1/projects/${projectId}/tasks`, () => HttpResponse.json({ tasks: [{ id: taskId, projectId, name: "Build", active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: [] })),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<MemoryRouter><QueryClientProvider client={queryClient}><TimerPage /></QueryClientProvider></MemoryRouter>), queryClient };
}

async function fillStartForm(user: ReturnType<typeof userEvent.setup>, description: string) {
  await user.type(screen.getByRole("textbox", { name: "Activity" }), description);
  await user.selectOptions(await screen.findByLabelText("Client"), clientId);
  await user.selectOptions(await screen.findByLabelText("Project"), projectId);
  await user.selectOptions(await screen.findByLabelText("Task (optional)"), taskId);
}

const completed: TimeEntryDto = {
  ...running,
  mode: "timer",
  description: "Previous activity",
  endAt: "2026-09-05T15:00:00.000Z",
  durationSeconds: 3_600,
  hourlyRate: "32.0000",
  currency: "EUR",
};
const serverNow = "2026-09-27T14:00:00.000Z";
function continuedTimer(input: TimerStartInput): TimeEntryDto {
  return { ...running, mode: "timer", ...input, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", startAt: serverNow, workDate: "2026-09-27", createdAt: serverNow, updatedAt: serverNow };
}
function recentHandler(entry: TimeEntryDto = completed) {
  handlers();
  server.use(http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: [entry] })));
}

describe("Recent activity grouping", () => {
  it.each([
    { clientId: "55555555-5555-4555-8555-555555555555" },
    { projectId: "55555555-5555-4555-8555-555555555555" },
    { taskId: "55555555-5555-4555-8555-555555555555" },
    { taskId: null },
    { billable: false },
    { description: "previous activity" },
    { description: "Previous activity " },
  ])("keeps exact identity differences separate: %j", (different) => {
    expect(groupRecentActivities([completed, { ...completed, ...different }])).toHaveLength(2);
  });

  it("preserves response order, sums integer seconds, excludes unfinished entries, and leaves DTOs unchanged", () => {
    const entries: TimeEntryDto[] = [
      { ...completed, id: "new-b", description: "Z work", durationSeconds: 3_601, hourlyRate: "85.0000" },
      { ...completed, id: "new-a", description: "A work", taskId: null, durationSeconds: 61 },
      { ...completed, id: "old-b", description: "Z work", durationSeconds: 3_659, currency: "USD", hourlyRate: "125.0000" },
      { ...completed, id: "old-a", description: "A work", taskId: null, durationSeconds: 62 },
      { ...completed, id: "duration-b", description: "Z work", mode: "duration", startAt: null, endAt: null, durationSeconds: 240 },
      { ...completed, id: "running-b", description: "Z work", endAt: null, durationSeconds: null },
      { ...completed, id: "unfinished-b", description: "Z work", endAt: null },
    ];
    const original = structuredClone(entries);
    const groups = groupRecentActivities(entries);
    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([["new-b", "old-b", "duration-b"], ["new-a", "old-a"]]);
    expect(groups.map((group) => group.durationSeconds)).toEqual([7_500, 123]);
    expect(groups.every((group) => Number.isSafeInteger(group.durationSeconds))).toBe(true);
    expect(entries).toEqual(original);
    expect(groupRecentActivities([])).toEqual([]);
  });

  const sessions: TimeEntryDto[] = [
    { ...completed, durationSeconds: 3_600 },
    { ...completed, id: "55555555-5555-4555-8555-555555555555", workDate: "2026-09-04", startAt: "2026-09-04T23:00:00.000Z", endAt: "2026-09-05T05:00:00.000Z", durationSeconds: 7_200, hourlyRate: "50.0000", currency: "USD", invoice: { id: "66666666-6666-4666-8666-666666666666", invoiceNumber: "INV-7" }, hasInvoiceHistory: true },
    { ...completed, id: "77777777-7777-4777-8777-777777777777", workDate: "2026-09-03", mode: "duration", startAt: null, endAt: null, durationSeconds: 4_200, hourlyRate: "85.0000", hasInvoiceHistory: true },
  ];
  function groupedHandlers() {
    handlers();
    server.use(http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: sessions })));
  }

  it("expands/collapses by keyboard and preserves ordered per-session rates and mixed Invoice/history actions", async () => {
    groupedHandlers();
    server.use(http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: { ...running, description: completed.description }, serverNow })));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("3 sessions · 4h 10m")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Running timer" })).toBeVisible();
    const expand = screen.getByRole("button", { name: "Show sessions for Previous activity" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Sessions for Previous activity" })).not.toBeInTheDocument();
    expect(screen.getByText("Billable · 32.00/hr")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expand.focus();
    await user.keyboard("{Enter}");
    expect(expand).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Sessions for Previous activity" });
    expect(list.id).toBe(expand.getAttribute("aria-controls"));
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent?.slice(0, 10))).toEqual(["2026-09-05", "2026-09-04", "2026-09-03"]);
    expect(within(rows[0]!).getByText("Billable · 32.00/hr")).toBeVisible();
    expect(within(rows[0]!).getByText("Not invoiced")).toBeVisible();
    expect(within(rows[0]!).getByRole("button", { name: "Edit" })).toBeVisible();
    expect(within(rows[0]!).getByRole("button", { name: "Delete" })).toBeVisible();
    expect(rows[1]).toHaveTextContent("19:00–2026-09-05 01:00");
    expect(within(rows[1]!).getByText("Billable · 50.00/hr")).toBeVisible();
    expect(within(rows[1]!).getByRole("link", { name: "View INV-7" })).toHaveAttribute("href", "/invoices/66666666-6666-4666-8666-666666666666");
    expect(within(rows[1]!).queryByRole("button")).not.toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("Duration only");
    expect(within(rows[2]!).getByText("Billable · 85.00/hr")).toBeVisible();
    expect(within(rows[2]!).getByText("Not invoiced")).toBeVisible();
    expect(within(rows[2]!).getByText("Kept for Invoice history")).toBeVisible();
    expect(within(rows[2]!).getByRole("button", { name: "Edit" })).toBeVisible();
    expect(within(rows[2]!).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await user.keyboard(" ");
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(list).not.toBeVisible();
  });

  it("continues a collapsed group through #13 without copying a member's rate or Invoice history", async () => {
    groupedHandlers();
    let payload: unknown;
    server.use(http.post("/api/v1/timer/start", async ({ request }) => {
      payload = await request.json();
      return HttpResponse.json({ timer: continuedTimer(payload as TimerStartInput), serverNow }, { status: 201 });
    }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Continue activity" }));
    expect(await screen.findByRole("region", { name: "Running timer" })).toHaveTextContent(completed.description);
    expect(payload).toEqual(timeEntryToTimerStartContext(completed));
    expect(screen.getByText("3 sessions · 4h 10m")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Continue activity" })).toHaveLength(1);
  });

  it("regroups an individually edited session from refreshed Recent data", async () => {
    groupedHandlers();
    let entries = sessions.map((entry) => ({ ...entry }));
    server.use(
      http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries })),
      http.patch(`/api/v1/time-entries/${entryId}`, async ({ request }) => {
        const input = await request.json() as { description: string };
        entries = entries.map((entry) => entry.id === entryId ? { ...entry, description: input.description } : entry);
        return HttpResponse.json({ entry: entries[0] });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Show sessions for Previous activity" }));
    const first = screen.getAllByRole("listitem")[0]!;
    await user.click(within(first).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit time entry" });
    await user.clear(within(dialog).getByRole("textbox", { name: /Description/ }));
    await user.type(within(dialog).getByRole("textbox", { name: /Description/ }), "Different work");
    await user.click(within(dialog).getByRole("button", { name: "Save entry" }));
    expect(await screen.findByRole("heading", { name: "Different work" })).toBeVisible();
    expect(screen.getByText("2 sessions · 3h 10m")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    const single = screen.getByRole("heading", { name: "Different work" }).closest("article")!;
    expect(within(single).getByRole("button", { name: "Edit" })).toBeVisible();
    expect(within(single).getByRole("button", { name: "Delete" })).toBeVisible();
    expect(within(single).queryByRole("button", { name: /sessions/ })).not.toBeInTheDocument();
  });

  it("updates count/duration after individual Delete, then renders a single session and removes the empty group", async () => {
    groupedHandlers();
    let entries = sessions.map((entry) => ({ ...entry, invoice: null, hasInvoiceHistory: false }));
    const deleted: string[] = [];
    server.use(
      http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries })),
      http.delete("/api/v1/time-entries/:id", ({ params }) => {
        deleted.push(String(params.id));
        entries = entries.filter((entry) => entry.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Show sessions for Previous activity" }));
    for (const expectedCount of [2, 1, 0]) {
      await user.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      if (expectedCount === 2) expect(await screen.findByText("2 sessions · 3h 10m")).toBeVisible();
      if (expectedCount === 1) {
        await waitFor(() => expect(screen.queryByRole("button", { name: /sessions/ })).not.toBeInTheDocument());
        expect(screen.getByText("1h 10m")).toBeVisible();
        expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
      }
      if (expectedCount === 0) expect(await screen.findByText("No completed time yet")).toBeVisible();
    }
    expect(deleted).toEqual(sessions.map((entry) => entry.id));
  });
});

describe("Continue activity", () => {
  it.each([
    { name: "billable with Task", entry: completed },
    { name: "non-billable without Task", entry: { ...completed, taskId: null, taskName: null, billable: false, hourlyRate: null, currency: null } },
    { name: "active Invoice", entry: { ...completed, invoice: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", invoiceNumber: "INV-42" }, hasInvoiceHistory: true } },
    { name: "Void-only history", entry: { ...completed, hasInvoiceHistory: true } },
  ])("starts from $name using only work context, leaving source and composer unchanged", async ({ entry }) => {
    recentHandler(entry);
    const original = structuredClone(entry);
    const expected = { description: entry.description, clientId, projectId, taskId: entry.taskId, billable: entry.billable };
    // Test before API schema stripping too: the mapper itself must exclude history.
    expect(timeEntryToTimerStartContext(Object.freeze(entry))).toEqual(expected);
    const starts: unknown[] = [];
    server.use(http.post("/api/v1/timer/start", async ({ request }) => {
      const input = await request.json() as TimerStartInput;
      starts.push(input);
      return HttpResponse.json({ timer: continuedTimer(input), serverNow }, { status: 201 });
    }));
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await user.type(screen.getByRole("textbox", { name: "Activity" }), "Unrelated composer work");
    const button = await screen.findByRole("button", { name: "Continue activity" });
    await waitFor(() => expect(button).toBeEnabled());
    button.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("region", { name: "Running timer" })).toHaveTextContent(entry.description);
    expect(starts).toEqual([expected]);
    expect(queryClient.getQueryData(timerKeys.current)).toMatchObject({ timer: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", startAt: serverNow, workDate: "2026-09-27", hourlyRate: null, currency: null, invoice: null, hasInvoiceHistory: false } });
    expect(queryClient.getQueryData(timerKeys.recent)).toEqual({ entries: [original] });
    expect(entry).toEqual(original);
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Unrelated composer work");
    expect(screen.getByRole("article")).toHaveTextContent(entry.description);
  });

  it.each(["keep", "replace", "lost start", "lost stop"] as const)("reuses the active Timer decision and recovery: %s", async (outcome) => {
    recentHandler();
    let currentTimer: TimeEntryDto | null = { ...running, mode: "timer" };
    const starts: TimerStartInput[] = [];
    let stops = 0;
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: currentTimer, serverNow })),
      http.post("/api/v1/timer/start", async ({ request }) => {
        const input = await request.json() as TimerStartInput;
        starts.push(input);
        if (currentTimer) return HttpResponse.json({ error: { code: "TIMER_ALREADY_RUNNING", message: "A timer is already running.", fieldErrors: null, requestId: "test" } }, { status: 409 });
        currentTimer = continuedTimer(input);
        return outcome === "lost start" ? HttpResponse.error() : HttpResponse.json({ timer: currentTimer, serverNow }, { status: 201 });
      }),
      http.post("/api/v1/timer/stop", () => {
        stops += 1;
        currentTimer = null;
        return outcome === "lost stop" ? HttpResponse.error() : HttpResponse.json({ entry: completed, serverNow });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("region", { name: "Running timer" });
    await user.click(await screen.findByRole("button", { name: "Continue activity" }));
    const dialog = await screen.findByRole("dialog", { name: "A timer is already running" });
    expect(stops).toBe(0);
    if (outcome === "keep") {
      await user.click(within(dialog).getByRole("button", { name: "Keep current timer" }));
      expect(screen.getByRole("region", { name: "Running timer" })).toHaveTextContent("Reliable timer");
      expect(starts).toHaveLength(1);
      expect(stops).toBe(0);
      expect(screen.getByRole("button", { name: "Continue activity" })).toHaveFocus();
    } else {
      await user.click(within(dialog).getByRole("button", { name: "Stop current and start this activity" }));
      if (outcome === "lost stop") {
        expect(await screen.findByText("No Timer is currently running. You can try Continue activity again.")).toBeVisible();
        expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
        expect(starts).toHaveLength(1);
      } else {
        await waitFor(() => expect(screen.getByRole("region", { name: "Running timer" })).toHaveTextContent(completed.description));
        expect(starts).toEqual([timeEntryToTimerStartContext(completed), timeEntryToTimerStartContext(completed)]);
        if (outcome === "lost start") expect(await screen.findByText("Timer state refreshed. A Timer is running.")).toBeVisible();
      }
      expect(stops).toBe(1);
    }
  });

  it.each(["committed", "uncommitted", "unknown"] as const)("reconciles an ambiguous Continue Start: %s", async (outcome) => {
    recentHandler();
    let currentTimer: TimeEntryDto | null = null;
    let startCalls = 0;
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return outcome === "unknown" && startCalls > 0 ? HttpResponse.error() : HttpResponse.json({ timer: currentTimer, serverNow });
      }),
      http.post("/api/v1/timer/start", async ({ request }) => {
        startCalls += 1;
        if (outcome === "committed") currentTimer = continuedTimer(await request.json() as TimerStartInput);
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Activity" }), "Keep my draft");
    await user.click(await screen.findByRole("button", { name: "Continue activity" }));
    if (outcome === "committed") {
      expect(await screen.findByRole("region", { name: "Running timer" })).toHaveTextContent(completed.description);
    } else if (outcome === "uncommitted") {
      expect(await screen.findByText("Timer start was not confirmed. No Timer is currently running.")).toBeVisible();
    } else {
      expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
      expect(screen.getByRole("button", { name: "Continue activity" })).toBeDisabled();
      expect(screen.queryByText(/No Timer is currently running/)).not.toBeInTheDocument();
    }
    if (outcome !== "committed") expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    expect(currentReads).toBeGreaterThanOrEqual(2);
    expect(startCalls).toBe(1);
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Keep my draft");
  });

  it.each(["clientId", "projectId", "taskId"] as const)("shows normal invalid/archived %s validation without changing context", async (field) => {
    recentHandler();
    const starts: unknown[] = [];
    server.use(http.post("/api/v1/timer/start", async ({ request }) => {
      starts.push(await request.json());
      return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "Review the highlighted time-entry fields.", fieldErrors: { [field]: ["This context is archived or unavailable for new work."] }, requestId: "test" } }, { status: 400 });
    }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Continue activity" }));
    expect(await screen.findByText(/This context is archived or unavailable for new work/)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    expect(starts).toEqual([timeEntryToTimerStartContext(completed)]);
    expect(screen.getByRole("article")).toHaveTextContent(completed.description);
    expect(screen.getByLabelText("Client")).toHaveValue("");
  });
});

describe("TimerPage", () => {
  it.each([false, true])("labels free-form Activity separately from Task (running: %s)", async (isRunning) => {
    recentHandler();
    server.use(http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: isRunning ? running : null, serverNow })));
    renderPage();
    const composer = await screen.findByRole("region", { name: isRunning ? "Start something else" : "What are you working on?" });
    const activity = within(composer).getByRole("textbox", { name: "Activity" });
    expect(activity).toHaveAttribute("placeholder", "What are you working on?");
    expect(activity).toHaveAttribute("name", "description");
    expect(activity).not.toHaveAttribute("aria-label");
    expect(within(composer).queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();
    expect(within(composer).getByRole("combobox", { name: "Task (optional)" })).toBeVisible();
    const recent = screen.getByRole("region", { name: "Recent activities" });
    expect(within(recent).getByText("Grouped from the 10 most recent completed entries. Full history belongs in Timesheet.")).toBeVisible();
    expect(await within(recent).findByRole("heading", { name: completed.description })).toBeVisible();
    expect(within(recent).getByRole("button", { name: "Continue activity" })).toBeVisible();
    if (isRunning) {
      const active = screen.getByRole("region", { name: "Running timer" });
      expect(within(active).getByRole("heading", { name: running.description })).toBeVisible();
      expect(within(active).queryByText("Description")).not.toBeInTheDocument();
    }
  });

  it("associates description-keyed server validation with Activity without renaming the payload", async () => {
    handlers();
    let payload: unknown;
    server.use(http.post("/api/v1/timer/start", async ({ request }) => {
      payload = await request.json();
      return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message: "Review the highlighted fields.", fieldErrors: { description: ["Use at most 1,000 characters."] }, requestId: "test" } }, { status: 400 });
    }));
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Keep this work");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText("Use at most 1,000 characters.")).toBeVisible();
    const activity = screen.getByRole("textbox", { name: "Activity" });
    expect(activity).toHaveAccessibleDescription("Use at most 1,000 characters.");
    expect(activity).toHaveAttribute("aria-invalid", "true");
    expect(activity).toHaveFocus();
    expect(activity).toHaveValue("Keep this work");
    expect(payload).toEqual({ description: "Keep this work", clientId, projectId, taskId, billable: true });
  });

  it("uses Recent activities wording while loading and on failure", async () => {
    handlers();
    server.use(http.get("/api/v1/time-entries/recent", () => HttpResponse.error()));
    renderPage();
    expect(screen.getByText("Loading recent activities…")).toBeVisible();
    expect(await screen.findByText("Recent activities could not be loaded.")).toBeVisible();
  });

  it("validates hierarchy, starts only after persistence, and preserves input on failure", async () => {
    handlers();
    const user = userEvent.setup();
    let shouldFail = true;
    server.use(http.post("/api/v1/timer/start", async ({ request }) => {
      const input = await request.json() as { description: string };
      if (shouldFail) return HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable", fieldErrors: null, requestId: "test" } }, { status: 500 });
      return HttpResponse.json({ timer: { ...running, description: input.description }, serverNow: "2026-09-05T14:00:00.000Z" }, { status: 201 });
    }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Start" }));
    expect(await screen.findByText("Client is required")).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Activity" }), "Reliable timer");
    await user.selectOptions(await screen.findByLabelText("Client"), clientId);
    await user.selectOptions(await screen.findByLabelText("Project"), projectId);
    await user.selectOptions(await screen.findByLabelText("Task (optional)"), taskId);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/No Timer is currently running/)).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: "Activity" })[0]).toHaveValue("Reliable timer");
    shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByRole("heading", { name: "Reliable timer" })).toBeVisible();
  }, 15_000);

  it("keeps the running state authoritative when Stop fails", async () => {
    handlers();
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: running, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/stop", () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Stop failed", fieldErrors: null, requestId: "test" } }, { status: 500 })),
    );
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Reliable timer" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Timer is still running.")).toBeVisible();
    expect(screen.getByText("Running")).toBeVisible();
  });

  it("recovers a committed Start whose response is lost without clearing composer input", async () => {
    handlers();
    let currentTimer: typeof running | null = null;
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
      http.post("/api/v1/timer/start", async ({ request }) => {
        const input = await request.json() as { description: string };
        currentTimer = { ...running, description: input.description };
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await fillStartForm(user, "Interrupted start");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("heading", { name: "Interrupted start" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Interrupted start");
    expect(screen.getByText("Timer state refreshed. A Timer is running.")).toBeVisible();
    expect(screen.queryByText(/No new time is being recorded/)).not.toBeInTheDocument();
    expect(currentReads).toBeGreaterThanOrEqual(2);
    expect(queryClient.getQueryData(timerKeys.current)).toMatchObject({ timer: { description: "Interrupted start" }, serverNow: "2026-09-05T14:00:00.000Z" });
  });

  it("preserves the Start form and confirms no running Timer after an uncommitted failure", async () => {
    handlers();
    server.use(http.post("/api/v1/timer/start", () => HttpResponse.error()));
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Retry this work");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("Timer start was not confirmed. No Timer is currently running.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Retry this work");
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
  });

  it("clears unknown Start feedback after Retry confirms no Timer is running", async () => {
    handlers();
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return currentReads === 2 || currentReads === 3
          ? HttpResponse.error()
          : HttpResponse.json({ timer: null, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
      http.post("/api/v1/timer/start", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Unconfirmed start");
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Unconfirmed start");
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.queryByText(/No Timer is currently running/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    await waitFor(() => expect(screen.queryByText(/Timer state could not be confirmed/)).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Unconfirmed start");
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "What are you working on?" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    expect(currentReads).toBe(4);
  });

  it("refreshes another-tab Timer after TIMER_ALREADY_RUNNING before offering replacement", async () => {
    handlers();
    let currentTimer: typeof running | null = null;
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/start", () => {
        currentTimer = running;
        return HttpResponse.json({ error: { code: "TIMER_ALREADY_RUNNING", message: "A timer is already running.", fieldErrors: null, requestId: "test" } }, { status: 409 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Work from this tab");
    await user.click(screen.getByRole("button", { name: "Start" }));

    const dialog = await screen.findByRole("dialog", { name: "A timer is already running" });
    await user.click(within(dialog).getByRole("button", { name: "Keep current timer" }));
    expect(within(await screen.findByRole("region", { name: "Running timer" })).getByRole("heading", { name: "Reliable timer" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Work from this tab");
  });

  it("recovers a committed Stop whose response is lost and refreshes Recent time", async () => {
    handlers();
    let currentTimer: typeof running | null = running;
    let currentReads = 0;
    let recentReads = 0;
    let finishReconciliation!: () => void;
    const reconciliationGate = new Promise<void>((resolve) => { finishReconciliation = resolve; });
    server.use(
      http.get("/api/v1/timer/current", async () => {
        currentReads += 1;
        if (currentReads > 1) await reconciliationGate;
        return HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
      http.get("/api/v1/time-entries/recent", () => {
        recentReads += 1;
        return HttpResponse.json({ entries: [] });
      }),
      http.post("/api/v1/timer/stop", () => {
        currentTimer = null;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    const { queryClient } = renderPage();
    await screen.findByRole("region", { name: "Running timer" });
    await waitFor(() => expect(recentReads).toBeGreaterThanOrEqual(1));
    await user.click(within(screen.getByRole("region", { name: "Running timer" })).getByRole("button", { name: "Stop" }));
    try {
      expect(await screen.findByRole("status")).toHaveTextContent("Checking current Timer state");
      expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    } finally {
      finishReconciliation();
    }
    expect(await screen.findByText("Timer state refreshed. No Timer is currently running.")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    await waitFor(() => expect(recentReads).toBeGreaterThanOrEqual(2));
    expect(queryClient.getQueryData(timerKeys.current)).toMatchObject({ timer: null, serverNow: "2026-09-05T14:00:00.000Z" });
  });

  it("restores Running and clears unknown Stop feedback after Retry succeeds", async () => {
    handlers();
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return currentReads === 2
          ? HttpResponse.error()
          : HttpResponse.json({ timer: running, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
      http.post("/api/v1/timer/stop", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("region", { name: "Running timer" });
    await user.click(within(screen.getByRole("region", { name: "Running timer" })).getByRole("button", { name: "Stop" }));

    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    expect(screen.queryByText("Timer is still running.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    expect(await screen.findByRole("region", { name: "Running timer" })).toBeVisible();
    await waitFor(() => expect(screen.queryByText(/Timer state could not be confirmed/)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  });

  it("restores idle and clears unknown Stop feedback after Retry confirms no Timer", async () => {
    handlers();
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return currentReads === 2
          ? HttpResponse.error()
          : HttpResponse.json({ timer: currentReads === 1 ? running : null, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
      http.post("/api/v1/timer/stop", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("region", { name: "Running timer" });
    await user.click(within(screen.getByRole("region", { name: "Running timer" })).getByRole("button", { name: "Stop" }));
    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    await waitFor(() => expect(screen.queryByText(/Timer state could not be confirmed/)).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Running timer" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "What are you working on?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("recovers the actual new Timer when replacement Start commits but its response is lost", async () => {
    handlers();
    let currentTimer: typeof running | null = running;
    let startCalls = 0;
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/start", async ({ request }) => {
        startCalls += 1;
        if (startCalls === 1) {
          return HttpResponse.json({ error: { code: "TIMER_ALREADY_RUNNING", message: "A timer is already running.", fieldErrors: null, requestId: "test" } }, { status: 409 });
        }
        const input = await request.json() as { description: string };
        currentTimer = { ...running, id: "99999999-9999-4999-8999-999999999999", description: input.description };
        return HttpResponse.error();
      }),
      http.post("/api/v1/timer/stop", () => {
        currentTimer = null;
        return HttpResponse.json({ entry: { ...running, endAt: "2026-09-05T14:00:00.000Z", durationSeconds: 60, hourlyRate: "100.0000", currency: "USD" }, serverNow: "2026-09-05T14:00:00.000Z" });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Replacement work");
    await user.click(screen.getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", { name: "A timer is already running" });
    await user.click(within(dialog).getByRole("button", { name: "Stop current and start this one" }));

    expect(await screen.findByRole("heading", { name: "Replacement work" })).toBeVisible();
    expect(screen.getByText("Timer state refreshed. A Timer is running.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Replacement work");
    expect(startCalls).toBe(2);
  });

  it("does not start replacement work blindly after an ambiguous Stop", async () => {
    handlers();
    let currentTimer: typeof running | null = running;
    let startCalls = 0;
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/start", () => {
        startCalls += 1;
        return HttpResponse.json({ error: { code: "TIMER_ALREADY_RUNNING", message: "A timer is already running.", fieldErrors: null, requestId: "test" } }, { status: 409 });
      }),
      http.post("/api/v1/timer/stop", () => {
        currentTimer = null;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillStartForm(user, "Preserved replacement");
    await user.click(screen.getByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", { name: "A timer is already running" });
    await user.click(within(dialog).getByRole("button", { name: "Stop current and start this one" }));

    expect(await screen.findByText("No Timer is currently running. Your new work is still in the form.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Activity" })).toHaveValue("Preserved replacement");
    expect(startCalls).toBe(1);
  });

  it("formats Recent time rates without mutating values or changing row actions", async () => {
    handlers();
    const recentEntries = [
      { ...running, id: entryId, description: "Thirty two", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.0000", currency: "USD" },
      { ...running, id: "55555555-5555-4555-8555-555555555555", description: "Fifty invoiced", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "50.0000", currency: "USD", invoice: { id: "66666666-6666-4666-8666-666666666666", invoiceNumber: "INV-7" }, hasInvoiceHistory: true },
      { ...running, id: "77777777-7777-4777-8777-777777777777", description: "One decimal", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.5", currency: "USD" },
      { ...running, id: "88888888-8888-4888-8888-888888888888", description: "Admin", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, billable: false, hourlyRate: null, currency: null },
      { ...running, id: "99999999-9999-4999-8999-999999999999", description: "Void-history work", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.0000", currency: "USD", hasInvoiceHistory: true },
    ];
    const originalRates = recentEntries.map((entry) => entry.hourlyRate);
    server.use(
      http.get("/api/v1/time-entries/recent", () =>
        HttpResponse.json({ entries: recentEntries }),
      ),
    );

    renderPage();

    const row = (name: string) => screen.getByRole("heading", { name }).closest("article")!;
    expect(within(await waitFor(() => row("Thirty two"))).getByText("Billable · 32.00/hr")).toBeVisible();
    expect(within(row("Fifty invoiced")).getByText("Billable · 50.00/hr")).toBeVisible();
    expect(within(row("One decimal")).getByText("Billable · 32.50/hr")).toBeVisible();
    expect(within(row("Admin")).getByText("Non-billable")).toBeVisible();
    expect(within(row("Void-history work")).getByRole("button", { name: "Edit" })).toBeVisible();
    expect(within(row("Void-history work")).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(row("Void-history work")).getByText("Kept for Invoice history")).toBeVisible();
    expect(within(row("Void-history work")).queryByRole("link", { name: /View/ })).not.toBeInTheDocument();
    expect(recentEntries.map((entry) => entry.hourlyRate)).toEqual(originalRates);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "View INV-7" })).toBeVisible();
  });

  it("keeps a stale Delete dialog open and explains an Invoice-history conflict", async () => {
    handlers();
    server.use(
      http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: [{ ...running, endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.0000", currency: "USD" }] })),
      http.delete(`/api/v1/time-entries/${entryId}`, () => HttpResponse.json({ error: { code: "TIME_ENTRY_HAS_INVOICE_HISTORY", message: "This Time Entry is part of Invoice history and cannot be deleted.", fieldErrors: null, requestId: "test" } }, { status: 409 })),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete time entry?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    expect(await within(dialog).findByText("This Time Entry is part of Invoice history and cannot be deleted.")).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it("creates both manual modes and exposes edit/delete correction flows", async () => {
    handlers();
    const createdBodies: unknown[] = [];
    server.use(
      http.post("/api/v1/time-entries", async ({ request }) => {
        const body = await request.json();
        createdBodies.push(body);
        return HttpResponse.json({ entry: { ...running, ...(body as object), id: entryId, mode: (body as { mode: string }).mode, endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3600, hourlyRate: "100.0000", currency: "USD" } }, { status: 201 });
      }),
      http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: [{ ...running, endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3600, hourlyRate: "100.0000", currency: "USD" }] })),
      http.patch(`/api/v1/time-entries/${entryId}`, () => HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Save failed", fieldErrors: null, requestId: "test" } }, { status: 500 })),
      http.delete(`/api/v1/time-entries/${entryId}`, () => new HttpResponse(null, { status: 204 })),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Add time/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("textbox", { name: "Activity" })).not.toBeInTheDocument();
    await user.clear(within(dialog).getByRole("textbox", { name: /Description/ }));
    await user.type(within(dialog).getByRole("textbox", { name: /Description/ }), "Night shift");
    await user.selectOptions(within(dialog).getByLabelText("Client"), clientId);
    await user.selectOptions(await within(dialog).findByLabelText("Project"), projectId);
    await user.click(within(dialog).getByText("End is on the next calendar day"));
    await user.click(within(dialog).getByRole("button", { name: "Add time" }));
    await waitFor(() => expect(createdBodies).toHaveLength(1));
    expect(createdBodies[0]).toMatchObject({ mode: "range", endsNextDay: true });

    await user.click(screen.getByRole("button", { name: /Add time/ }));
    const durationDialog = await screen.findByRole("dialog");
    await user.click(within(durationDialog).getByRole("radio", { name: "Duration" }));
    await user.clear(within(durationDialog).getByRole("textbox", { name: /Description/ }));
    await user.type(within(durationDialog).getByRole("textbox", { name: /Description/ }), "Known duration");
    await user.selectOptions(within(durationDialog).getByLabelText("Client"), clientId);
    await user.selectOptions(await within(durationDialog).findByLabelText("Project"), projectId);
    await user.click(within(durationDialog).getByRole("button", { name: "Add time" }));
    await waitFor(() => expect(createdBodies).toHaveLength(2));
    expect(createdBodies[1]).toMatchObject({ mode: "duration", durationSeconds: 3600 });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const editDialog = await screen.findByRole("dialog");
    const description = within(editDialog).getByRole("textbox", { name: /Description/ });
    await user.clear(description);
    await user.type(description, "Edited text");
    await user.click(within(editDialog).getByRole("button", { name: "Save entry" }));
    expect(await within(editDialog).findByText("Save failed")).toBeVisible();
    expect(description).toHaveValue("Edited text");
    await user.click(within(editDialog).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const deleteDialog = await screen.findByRole("dialog");
    expect(within(deleteDialog).getByText(/cannot be undone/i)).toBeVisible();
    await user.click(within(deleteDialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }, 15_000);
});
