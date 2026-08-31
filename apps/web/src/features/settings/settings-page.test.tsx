import type { BusinessProfileDto, BusinessProfileInput } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "../../test/server.js";
import { SettingsPage } from "./settings-page.js";

const input: BusinessProfileInput = {
  businessName: "Andres Consulting",
  email: "andres@example.com",
  address: "100 Main Street",
  phone: "",
  taxIdentifier: "",
  defaultCurrency: "USD",
  defaultHourlyRate: "85.0000",
  paymentTermsDays: 30,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 7,
  defaultTaxRate: "0.0000",
  defaultInvoiceNotes: "Thank you.",
  invoiceFooter: "Payment due within 30 days.",
  timezone: "America/New_York",
};

const profile: BusinessProfileDto = {
  ...input,
  id: "00000000-0000-4000-8000-000000000001",
  phone: null,
  taxIdentifier: null,
  defaultInvoiceNotes: input.defaultInvoiceNotes,
  invoiceFooter: input.invoiceFooter,
  createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  it("loads an existing business profile", async () => {
    server.use(
      http.get("/api/v1/settings", () => HttpResponse.json({ settings: profile })),
    );

    renderPage();

    expect(await screen.findByLabelText(/Business or display name/)).toHaveValue(
      "Andres Consulting",
    );
    expect(screen.getByLabelText(/Default hourly rate/)).toHaveValue("85.0000");
    expect(screen.getByLabelText(/Invoice prefix/)).toHaveValue("INV-");
  });

  it("validates required fields before saving", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    server.use(
      http.get("/api/v1/settings", () => HttpResponse.json({ settings: null })),
      http.put("/api/v1/settings", () => {
        saveSpy();
        return HttpResponse.json({ settings: profile });
      }),
    );

    renderPage();
    await screen.findByLabelText(/Business or display name/);
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Business name is required")).toBeVisible();
    expect(screen.getByText("Business address is required")).toBeVisible();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("preserves entered values when saving fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/settings", () => HttpResponse.json({ settings: null })),
      http.put("/api/v1/settings", () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Settings could not be saved.",
              fieldErrors: null,
              requestId: "request-1",
            },
          },
          { status: 500 },
        ),
      ),
    );

    renderPage();
    const businessName = await screen.findByLabelText(/Business or display name/);
    await user.type(businessName, "Careful Studio");
    await user.type(screen.getByLabelText(/^Email/), "hello@careful.test");
    await user.type(screen.getByLabelText(/Business address/), "9 Ledger Street");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Settings could not be saved.")).toBeVisible();
    expect(businessName).toHaveValue("Careful Studio");
  });

  it("saves valid settings and shows non-blocking feedback", async () => {
    const user = userEvent.setup();
    let savedBody: unknown;
    server.use(
      http.get("/api/v1/settings", () => HttpResponse.json({ settings: profile })),
      http.put("/api/v1/settings", async ({ request }) => {
        savedBody = await request.json();
        return HttpResponse.json({ settings: profile });
      }),
    );

    renderPage();
    const businessName = await screen.findByLabelText(/Business or display name/);
    await user.clear(businessName);
    await user.type(businessName, "Andres Consulting");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent(
      "Settings saved.",
    );
    await waitFor(() => expect(savedBody).toMatchObject({ invoicePrefix: "INV-" }));
  });
});
