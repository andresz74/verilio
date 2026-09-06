import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
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
  return render(<MemoryRouter><QueryClientProvider client={queryClient}><TimerPage /></QueryClientProvider></MemoryRouter>);
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
    expect(await screen.findByText(/No new time is being recorded/)).toBeVisible();
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
    expect(await screen.findByText(/still recorded as running/)).toBeVisible();
    expect(screen.getByText("Running")).toBeVisible();
  });

  it("creates both manual modes and exposes edit/delete correction flows", async () => {
    handlers();
    const createdBodies: unknown[] = [];
    server.use(
      http.post("/api/v1/time-entries", async ({ request }) => {
        const body = await request.json();
        createdBodies.push(body);
        return HttpResponse.json({ entry: { ...running, ...(body as object), id: entryId, mode: (body as { mode: string }).mode, endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3600, hourlyRate: "100.0000" } }, { status: 201 });
      }),
      http.get("/api/v1/time-entries/recent", () => HttpResponse.json({ entries: [{ ...running, endAt: "2026-09-05T15:00:00.000Z", durationSeconds: 3600, hourlyRate: "100.0000" }] })),
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
  });
});
