import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { timerKeys } from "./time-entry-api.js";
import { TimerPage } from "./timer-page.js";

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
  await user.type(screen.getByRole("textbox", { name: /Description/ }), description);
  await user.selectOptions(await screen.findByLabelText("Client"), clientId);
  await user.selectOptions(await screen.findByLabelText("Project"), projectId);
  await user.selectOptions(await screen.findByLabelText("Task (optional)"), taskId);
}

describe("TimerPage", () => {
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
    await user.type(screen.getByRole("textbox", { name: /Description/ }), "Reliable timer");
    await user.selectOptions(await screen.findByLabelText("Client"), clientId);
    await user.selectOptions(await screen.findByLabelText("Project"), projectId);
    await user.selectOptions(await screen.findByLabelText("Task (optional)"), taskId);
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/No Timer is currently running/)).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: /Description/ })[0]).toHaveValue("Reliable timer");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Interrupted start");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Retry this work");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Unconfirmed start");
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.queryByText(/No Timer is currently running/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry status check" }));
    await waitFor(() => expect(screen.queryByText(/Timer state could not be confirmed/)).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Unconfirmed start");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Work from this tab");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Replacement work");
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
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue("Preserved replacement");
    expect(startCalls).toBe(1);
  });

  it("formats Recent time rates without mutating values or changing row actions", async () => {
    handlers();
    const recentEntries = [
      { ...running, id: entryId, description: "Thirty two", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.0000", currency: "USD" },
      { ...running, id: "55555555-5555-4555-8555-555555555555", description: "Fifty invoiced", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "50.0000", currency: "USD", invoice: { id: "66666666-6666-4666-8666-666666666666", invoiceNumber: "INV-7" } },
      { ...running, id: "77777777-7777-4777-8777-777777777777", description: "One decimal", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, hourlyRate: "32.5", currency: "USD" },
      { ...running, id: "88888888-8888-4888-8888-888888888888", description: "Admin", endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3_600, billable: false, hourlyRate: null, currency: null },
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
    expect(recentEntries.map((entry) => entry.hourlyRate)).toEqual(originalRates);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "View INV-7" })).toBeVisible();
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
