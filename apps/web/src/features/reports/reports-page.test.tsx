import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { ReportsIndexRedirect, ReportsPage } from "./reports-page.js";

const clientId = "11111111-1111-4111-8111-111111111111";
const secondClientId = "11111111-1111-4111-8111-111111111112";
const projectId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";

const common = {
  range: { from: "2026-09-01", to: "2026-09-07" },
  totalTrackedSeconds: 14_400,
  billableSeconds: 10_800,
  nonBillableSeconds: 3_600,
  billableTotals: [
    { currency: "EUR", amount: "60.00" },
    { currency: "USD", amount: "170.00" },
  ],
  groupBy: "client",
  groups: [
    {
      key: clientId,
      label: "Archived Acme",
      secondaryLabel: null,
      trackedSeconds: 14_400,
      billableSeconds: 10_800,
      billableTotals: [
        { currency: "EUR", amount: "60.00" },
        { currency: "USD", amount: "170.00" },
      ],
    },
  ],
  hoursByDay: [{ workDate: "2026-09-05", trackedSeconds: 14_400 }],
  hoursByProject: [{ projectId, projectName: "Website", trackedSeconds: 14_400 }],
};

const detailedEntry = {
  id: entryId,
  clientId,
  clientName: "Archived Acme",
  projectId,
  projectName: "Website",
  taskId,
  taskName: "Release",
  description: "Historical work",
  mode: "duration" as const,
  workDate: "2026-09-05",
  startAt: null,
  endAt: null,
  durationSeconds: 7_200,
  billable: true,
  hourlyRate: "85.0000",
  currency: "USD",
  invoice: null,
  amount: "170.00",
  invoiceStatus: "not-invoiced" as const,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function baseHandlers() {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings: { id: "99999999-9999-4999-8999-999999999999", businessName: "Solo", email: "solo@example.com", address: "Here", phone: null, taxIdentifier: null, defaultCurrency: "USD", defaultHourlyRate: "80.0000", paymentTermsDays: 30, invoicePrefix: "INV", nextInvoiceNumber: 1, defaultTaxRate: "0.0000", defaultInvoiceNotes: null, invoiceFooter: null, timezone: "America/New_York", createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" } })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients: [
      { id: clientId, name: "Archived Acme", email: null, ccRecipients: [], address: null, note: null, currency: "USD", defaultHourlyRate: null, active: false, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" },
      { id: secondClientId, name: "Beta", email: null, ccRecipients: [], address: null, note: null, currency: "EUR", defaultHourlyRate: null, active: true, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" },
    ] })),
    http.get("/api/v1/projects", () => HttpResponse.json({ projects: [{ id: projectId, clientId, name: "Website", color: null, defaultHourlyRate: "125.0000", billableByDefault: true, note: null, active: false, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get(`/api/v1/projects/${projectId}/tasks`, () => HttpResponse.json({ tasks: [{ id: taskId, projectId, name: "Release", active: false, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" }] })),
    http.get("/api/v1/reports/summary", () => HttpResponse.json(common)),
    http.get("/api/v1/reports/detailed", () => HttpResponse.json({
      range: common.range,
      entries: [detailedEntry],
      page: 1,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    })),
  );
}

function RoutedReports() {
  const { view } = useParams();
  return <ReportsPage view={view === "detailed" ? "detailed" : "summary"} />;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderReports(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/reports" element={<ReportsIndexRedirect />} />
          <Route path="/reports/:view" element={<RoutedReports />} />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ReportsPage", () => {
  it("defaults to Summary and displays duration separately from multi-currency value", async () => {
    baseHandlers();
    renderReports("/reports?from=2026-09-01&to=2026-09-07");
    expect(await screen.findByRole("heading", { name: "Summary" }, { timeout: 5_000 })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/reports/summary?from=2026-09-01&to=2026-09-07");
    expect(screen.getAllByText("4h").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3h").length).toBeGreaterThan(0);
    expect(screen.getByText("$170.00")).toBeVisible();
    expect(screen.getByText("€60.00")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
  });

  it("preserves filter context between views and clears dependent hierarchy state", async () => {
    baseHandlers();
    const user = userEvent.setup();
    renderReports(`/reports/summary?from=2026-09-01&to=2026-09-07&client=${clientId}&project=${projectId}&task=${taskId}&billable=billable`);
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeVisible();
    screen.getByRole("link", { name: "Detailed" }).focus();
    expect(screen.getByRole("link", { name: "Detailed" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/reports/detailed?from=2026-09-01&to=2026-09-07&client=${clientId}&project=${projectId}&task=${taskId}&billable=billable`));
    expect(await screen.findByRole("heading", { name: "Detailed entries" })).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Client"), secondClientId);
    await waitFor(() => {
      const location = screen.getByTestId("location").textContent ?? "";
      expect(location).toContain(`client=${secondClientId}`);
      expect(location).not.toContain("project=");
      expect(location).not.toContain("task=");
    });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).not.toContain("client="));
  });

  it("renders a semantic paginated Detailed table without fabricated duration timestamps", async () => {
    baseHandlers();
    const user = userEvent.setup();
    renderReports("/reports/detailed?from=2026-09-01&to=2026-09-07");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("cell", { name: "Historical work" })).toBeVisible();
    expect(within(table).getByText("USD $85.00/hr")).toBeVisible();
    expect(within(table).getByText("USD $170.00")).toBeVisible();
    expect(within(table).getAllByText("—")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("page=2"));
  });

  it("links relationship-driven Invoiced report rows to their Draft", async () => {
    baseHandlers();
    server.use(http.get("/api/v1/reports/detailed", () => HttpResponse.json({
      range: common.range,
      entries: [{ ...detailedEntry, invoice: { id: "66666666-6666-4666-8666-666666666666", invoiceNumber: "INV-7" }, invoiceStatus: "invoiced" }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    })));
    renderReports("/reports/detailed?from=2026-09-01&to=2026-09-07&invoiceStatus=invoiced");
    const link = await screen.findByRole("link", { name: "INV-7" });
    expect(link).toHaveAttribute("href", "/invoices/66666666-6666-4666-8666-666666666666");
  });

  it("keeps filters through a retryable error", async () => {
    baseHandlers();
    let fail = true;
    server.use(http.get("/api/v1/reports/summary", () => {
      if (fail) return HttpResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed", fieldErrors: null, requestId: "test" } }, { status: 500 });
      return HttpResponse.json(common);
    }));
    const user = userEvent.setup();
    renderReports("/reports/summary?from=2026-09-01&to=2026-09-07&billable=billable");
    expect(await screen.findByText(/selected filters are unchanged/)).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("billable=billable");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeVisible();
  });

  it("keeps the report structure stable while loading and explains an empty period", async () => {
    baseHandlers();
    server.use(http.get("/api/v1/reports/summary", async () => {
      await delay(100);
      return HttpResponse.json({
        ...common,
        totalTrackedSeconds: 0,
        billableSeconds: 0,
        nonBillableSeconds: 0,
        billableTotals: [],
        groups: [],
        hoursByDay: [],
        hoursByProject: [],
      });
    }));
    renderReports("/reports/summary?from=2026-09-01&to=2026-09-07");
    expect(await screen.findByRole("status", { name: "Loading Summary report" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "No time entries for this report" })).toBeVisible();
  });
});
