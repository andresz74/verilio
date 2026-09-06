import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { TimesheetPage } from "./timesheet-page.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const rangeId = "44444444-4444-4444-8444-444444444444";
const durationId = "55555555-5555-4555-8555-555555555555";

const rangeEntry = {
  id: rangeId,
  clientId,
  clientName: "Archived Acme",
  projectId,
  projectName: "Website",
  taskId,
  taskName: "Release",
  description: "Cross-midnight release",
  mode: "range" as const,
  workDate: "2026-09-05",
  startAt: "2026-09-06T03:30:00.000Z",
  endAt: "2026-09-06T05:00:00.000Z",
  durationSeconds: 5_400,
  billable: true,
  hourlyRate: "100.0000",
  currency: "USD",
  createdAt: "2026-09-06T05:00:00.000Z",
  updatedAt: "2026-09-06T05:00:00.000Z",
};
const durationEntry = {
  ...rangeEntry,
  id: durationId,
  description: "Duration note",
  mode: "duration" as const,
  workDate: "2026-09-04",
  startAt: null,
  endAt: null,
  durationSeconds: 3_600,
  billable: false,
  hourlyRate: null,
  currency: null,
};

function baseHandlers() {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings: { id: "99999999-9999-4999-8999-999999999999", businessName: "Solo", email: "solo@example.com", address: "Here", phone: null, taxIdentifier: null, defaultCurrency: "USD", defaultHourlyRate: "80.0000", paymentTermsDays: 30, invoicePrefix: "INV", nextInvoiceNumber: 1, defaultTaxRate: "0.0000", defaultInvoiceNotes: null, invoiceFooter: null, timezone: "America/New_York", createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients: [{ id: clientId, name: "Archived Acme", email: null, ccRecipients: [], address: null, note: null, currency: "USD", defaultHourlyRate: null, active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get("/api/v1/projects", () => HttpResponse.json({ projects: [{ id: projectId, clientId, name: "Website", color: null, defaultHourlyRate: "100.0000", billableByDefault: true, note: null, active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get(`/api/v1/projects/${projectId}/tasks`, () => HttpResponse.json({ tasks: [{ id: taskId, projectId, name: "Release", active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
  );
}

function response(entries = [rangeEntry, durationEntry]) {
  const dailyTotals = Object.entries(
    entries.reduce<Record<string, number>>((totals, entry) => {
      totals[entry.workDate] = (totals[entry.workDate] ?? 0) + (entry.durationSeconds ?? 0);
      return totals;
    }, {}),
  ).map(([workDate, durationSeconds]) => ({ workDate, durationSeconds }));
  return {
    entries,
    dailyTotals,
    totalDurationSeconds: dailyTotals.reduce((sum, day) => sum + day.durationSeconds, 0),
    page: 1,
    pageSize: 25,
    total: entries.length,
    totalPages: entries.length ? 1 : 0,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntry = "/timesheet?from=2026-09-01&to=2026-09-07") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <TimesheetPage />
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("TimesheetPage", () => {
  it("defaults to a URL-backed current week", async () => {
    baseHandlers();
    server.use(http.get("/api/v1/time-entries", () => HttpResponse.json(response([]))));
    renderPage("/timesheet");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/));
    expect(await screen.findByRole("heading", { name: "No time tracked for this period" })).toBeVisible();
  });

  it("renders work-date groups, complete daily totals, and mode-aware times", async () => {
    baseHandlers();
    server.use(http.get("/api/v1/time-entries", () => HttpResponse.json(response())));
    renderPage();
    const september5 = await screen.findByRole("heading", { name: /Saturday, September 5/ });
    const firstGroup = september5.closest("section");
    expect(firstGroup).not.toBeNull();
    expect(within(firstGroup!).getAllByText("1h 30m")).toHaveLength(2);
    expect(within(firstGroup!).getByText(/Sep 5, 11:30 PM → Sep 6, 1:00 AM/)).toBeVisible();
    expect(screen.getByRole("heading", { name: /Friday, September 4/ })).toBeVisible();
    expect(screen.getByText("Duration only")).toBeVisible();
    expect(screen.getAllByText("Not invoiced")).toHaveLength(2);
    expect(screen.getByText("2h 30m")).toBeVisible();
  });

  it("keeps range and search state in the URL", async () => {
    baseHandlers();
    server.use(http.get("/api/v1/time-entries", () => HttpResponse.json(response([]))));
    const user = userEvent.setup();
    renderPage();
    fireEvent.change(await screen.findByLabelText("From"), { target: { value: "2026-09-04" } });
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("from=2026-09-04"));
    await user.type(screen.getByLabelText("Search descriptions"), "release");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("q=release"));
  });

  it("reuses add/edit/delete dialogs and moves an edited entry to its new group", async () => {
    baseHandlers();
    let entries = [rangeEntry];
    server.use(
      http.get("/api/v1/time-entries", () => HttpResponse.json(response(entries))),
      http.patch(`/api/v1/time-entries/${rangeId}`, async ({ request }) => {
        const body = await request.json() as { workDate: string; description: string };
        entries = [{ ...rangeEntry, ...body }];
        return HttpResponse.json({ entry: entries[0] });
      }),
      http.delete(`/api/v1/time-entries/${rangeId}`, () => {
        entries = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Add time" }));
    expect(await screen.findByRole("dialog", { name: "Add time manually" })).toBeVisible();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    const edit = screen.getByRole("button", { name: "Edit" });
    edit.focus();
    await user.keyboard("{Enter}");
    const editDialog = await screen.findByRole("dialog", { name: "Edit time entry" });
    fireEvent.change(within(editDialog).getByLabelText(/Work date/), { target: { value: "2026-09-03" } });
    await user.click(within(editDialog).getByRole("button", { name: "Save entry" }));
    expect(await screen.findByRole("heading", { name: /Thursday, September 3/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Delete time entry?" });
    expect(within(deleteDialog).getByText(/Cross-midnight release/)).toBeVisible();
    await user.click(within(deleteDialog).getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByRole("heading", { name: "No time tracked for this period" })).toBeVisible();
  }, 15_000);

  it("shows a retryable inline error without losing filters", async () => {
    baseHandlers();
    let attempts = 0;
    server.use(http.get("/api/v1/time-entries", () => {
      attempts += 1;
      return attempts === 1 ? HttpResponse.json({ message: "fail" }, { status: 500 }) : HttpResponse.json(response([]));
    }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "No time tracked for this period" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("from=2026-09-01&to=2026-09-07");
  });
});
