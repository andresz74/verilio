import type { InvoiceDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { InvoiceEditorPage } from "./invoice-editor-page.js";
import { InvoicesPage } from "./invoices-page.js";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";

const settings = {
  id: "99999999-9999-4999-8999-999999999999",
  businessName: "Verilio Studio",
  email: "billing@example.com",
  address: "1 Main St",
  phone: null,
  taxIdentifier: null,
  defaultCurrency: "USD",
  defaultHourlyRate: "80.0000",
  paymentTermsDays: 30,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 2,
  defaultTaxRate: "6.0000",
  defaultInvoiceNotes: "Thank you",
  invoiceFooter: null,
  timezone: "America/New_York",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};

const client = {
  id: clientId,
  name: "Acme",
  email: "accounts@acme.test",
  ccRecipients: [],
  address: "2 Client St",
  note: null,
  currency: "EUR",
  defaultHourlyRate: "85.0000",
  active: true,
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};

function makeInvoice(overrides: Partial<InvoiceDto> = {}): InvoiceDto {
  return {
    id: invoiceId,
    invoiceNumber: "INV-1",
    clientId,
    clientName: "Acme",
    status: "draft",
    currency: "EUR",
    issueDate: "2026-09-06",
    dueDate: "2026-10-06",
    paidAt: null,
    sellerSnapshot: { businessName: "Verilio Studio", email: "billing@example.com", address: "1 Main St", phone: null, taxIdentifier: null },
    clientSnapshot: { name: "Acme", email: "accounts@acme.test", ccRecipients: [], address: "2 Client St" },
    subtotal: "170.00",
    discountType: "percentage",
    discountValue: "10",
    discountAmount: "17.00",
    taxableSubtotal: "153.00",
    taxPercent: "6",
    taxAmount: "9.18",
    total: "162.18",
    notes: "Thank you",
    items: [{
      id: itemId,
      kind: "time",
      description: "Website",
      quantity: "2.000000000000",
      unitPrice: "85.0000",
      amount: "170.0000",
      sortOrder: 0,
      sources: [{ id: entryId, workDate: "2026-09-05", description: "Historical work", projectId: "55555555-5555-4555-8555-555555555555", projectName: "Website", taskId: null, taskName: null, durationSeconds: 7200, hourlyRate: "85.0000", currency: "EUR", amount: "170.00" }],
      createdAt: "2026-09-06T12:00:00.000Z",
      updatedAt: "2026-09-06T12:00:00.000Z",
    }],
    createdAt: "2026-09-06T12:00:00.000Z",
    updatedAt: "2026-09-06T12:00:00.000Z",
    ...overrides,
  };
}

function baseHandlers(invoice = makeInvoice()) {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients: [client] })),
    http.get("/api/v1/invoices", () => HttpResponse.json({ invoices: [{ ...invoice, items: undefined }] })),
    http.get(`/api/v1/invoices/${invoiceId}`, () => HttpResponse.json({ invoice })),
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderInvoices(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<InvoiceEditorPage />} />
          <Route path="/invoices/:invoiceId" element={<InvoiceEditorPage />} />
        </Routes>
        <LocationProbe />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Invoice pages", () => {
  it("renders an accessible Invoice list and opens a Draft", async () => {
    baseHandlers();
    const user = userEvent.setup();
    renderInvoices("/invoices");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "INV-1" })).toBeVisible();
    expect(within(table).getByText("EUR €162.18")).toBeVisible();
    expect(within(table).getByText("Draft")).toBeVisible();
    await user.click(within(table).getByRole("link", { name: "INV-1" }));
    expect(await screen.findByRole("heading", { name: "INV-1" })).toBeVisible();
  });

  it("initializes Client currency and preserves entered Draft data when save fails", async () => {
    baseHandlers();
    server.use(http.post("/api/v1/invoices", () => HttpResponse.json({ error: { code: "CONFLICT", message: "Draft save failed", fieldErrors: null, requestId: "test" } }, { status: 409 })));
    const user = userEvent.setup();
    renderInvoices("/invoices/new");
    await user.selectOptions(await screen.findByLabelText("Client"), clientId);
    expect(screen.getByLabelText("Invoice currency")).toHaveValue("EUR");
    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Keep this unsaved note");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(await screen.findByText(/Draft could not be saved/)).toBeVisible();
    expect(screen.getByLabelText("Notes")).toHaveValue("Keep this unsaved note");
    expect(screen.getByTestId("location")).toHaveTextContent("/invoices/new");
  });

  it("imports selected Time by Project by default and exposes source traceability", async () => {
    let current = makeInvoice({ items: [], subtotal: "0.00", discountAmount: "0.00", taxableSubtotal: "0.00", taxAmount: "0.00", total: "0.00" });
    baseHandlers(current);
    let importedBody: unknown;
    server.use(
      http.get(`/api/v1/invoices/${invoiceId}`, () => HttpResponse.json({ invoice: current })),
      http.get(`/api/v1/invoices/${invoiceId}/eligible-time`, () => HttpResponse.json({ invoiceId, currency: "EUR", entries: makeInvoice().items[0]!.sources, count: 1, totalDurationSeconds: 7200, totalAmount: "170.00" })),
      http.post(`/api/v1/invoices/${invoiceId}/import-time`, async ({ request }) => {
        importedBody = await request.json();
        current = makeInvoice();
        return HttpResponse.json({ invoice: current });
      }),
    );
    const user = userEvent.setup();
    renderInvoices(`/invoices/${invoiceId}`);
    await user.click(await screen.findByRole("button", { name: "Import Time" }));
    const dialog = await screen.findByRole("dialog", { name: "Import eligible Time" });
    expect(within(dialog).getByLabelText("Grouping")).toHaveValue("project");
    await user.click(within(dialog).getByRole("button", { name: "Select all" }));
    expect(within(dialog).getByText(/Selected:/)).toHaveTextContent("1");
    await user.click(within(dialog).getByRole("button", { name: "Select none" }));
    expect(within(dialog).getByRole("button", { name: "Import 0 selected" })).toBeDisabled();
    within(dialog).getByRole("button", { name: "Select all" }).focus();
    await user.keyboard("{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Import 1 selected" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import eligible Time" })).not.toBeInTheDocument());
    expect(importedBody).toMatchObject({ timeEntryIds: [entryId], grouping: "project" });
    expect(screen.getByText("View 1 source entry")).toBeVisible();
    await user.click(screen.getByText("View 1 source entry"));
    expect(screen.getByText(/Historical work/)).toBeVisible();
  });

  it("adds a manual Item, accepts approved discount/tax fields, and removes imported Time explicitly", async () => {
    let current = makeInvoice();
    baseHandlers(current);
    server.use(
      http.get(`/api/v1/invoices/${invoiceId}`, () => HttpResponse.json({ invoice: current })),
      http.post(`/api/v1/invoices/${invoiceId}/items`, async ({ request }) => {
        const body = await request.json() as { description: string; quantity: string; unitPrice: string };
        current = makeInvoice({ items: [...current.items, { id: "66666666-6666-4666-8666-666666666666", kind: "manual", description: body.description, quantity: body.quantity, unitPrice: body.unitPrice, amount: "50.0000", sortOrder: 1, sources: [], createdAt: current.createdAt, updatedAt: current.updatedAt }], subtotal: "220.00", discountAmount: "22.00", taxableSubtotal: "198.00", taxAmount: "11.88", total: "209.88" });
        return HttpResponse.json({ invoice: current });
      }),
      http.patch(`/api/v1/invoices/${invoiceId}`, async ({ request }) => {
        const body = await request.json() as { discountType: InvoiceDto["discountType"]; discountValue: string; taxPercent: string };
        current = { ...current, ...body };
        return HttpResponse.json({ invoice: current });
      }),
      http.delete(`/api/v1/invoices/${invoiceId}/items/${itemId}`, () => {
        current = makeInvoice({ items: [], subtotal: "0.00", discountAmount: "0.00", taxableSubtotal: "0.00", taxAmount: "0.00", total: "0.00" });
        return HttpResponse.json({ invoice: current });
      }),
    );
    const user = userEvent.setup();
    renderInvoices(`/invoices/${invoiceId}`);
    await user.click(await screen.findByRole("button", { name: "Add manual Item" }));
    const manual = await screen.findByRole("dialog", { name: "Add manual Item" });
    await user.type(within(manual).getByLabelText("Description"), "Design system");
    await user.clear(within(manual).getByLabelText("Quantity"));
    await user.type(within(manual).getByLabelText("Quantity"), "1");
    await user.clear(within(manual).getByLabelText(/Unit price/));
    await user.type(within(manual).getByLabelText(/Unit price/), "50");
    await user.click(within(manual).getByRole("button", { name: "Save Item" }));
    expect(await screen.findByText("Design system")).toBeVisible();
    expect(screen.getByText("EUR €209.88")).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Discount type"), "fixed");
    await user.clear(screen.getByLabelText("Discount amount"));
    await user.type(screen.getByLabelText("Discount amount"), "20");
    await user.clear(screen.getByLabelText("Tax percent"));
    await user.type(screen.getByLabelText("Tax percent"), "6");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved Draft" })).toBeVisible());

    const importedRow = screen.getByText("Website").closest("tr");
    expect(importedRow).not.toBeNull();
    await user.click(within(importedRow!).getByRole("button", { name: "Remove" }));
    const remove = await screen.findByRole("dialog", { name: /Remove “Website”/ });
    expect(within(remove).getByText(/become Not invoiced and eligible again/)).toBeVisible();
    await user.click(within(remove).getByRole("button", { name: "Remove Item" }));
    await waitFor(() => expect(screen.queryByText("View 1 source entry")).not.toBeInTheDocument());
  }, 15_000);
});
