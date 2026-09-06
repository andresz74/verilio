import type { BusinessProfileDto, ClientDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { server } from "../../test/server.js";
import { ClientsPage } from "./clients-page.js";

const profile: BusinessProfileDto = {
  id: "00000000-0000-4000-8000-000000000001",
  businessName: "Andres Consulting",
  email: "andres@example.com",
  address: "100 Main Street",
  phone: null,
  taxIdentifier: null,
  defaultCurrency: "USD",
  defaultHourlyRate: "85.0000",
  paymentTermsDays: 30,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 7,
  defaultTaxRate: "0.0000",
  defaultInvoiceNotes: null,
  invoiceFooter: null,
  timezone: "America/New_York",
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

const client: ClientDto = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Northstar Studio",
  email: "billing@northstar.test",
  ccRecipients: [],
  address: null,
  note: null,
  currency: "USD",
  defaultHourlyRate: null,
  active: true,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
};

function renderPage(clients: ClientDto[] = []) {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings: profile })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients })),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ClientsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ClientsPage", () => {
  it("shows active clients with explicit currency and inherited-rate behavior", async () => {
    renderPage([client]);

    expect(await screen.findByRole("row", { name: /Northstar Studio/ })).toHaveTextContent(
      "USD",
    );
    expect(screen.getByRole("row", { name: /Northstar Studio/ })).toHaveTextContent(
      "Uses business default",
    );
  });

  it("validates create input and presents an explicit inheritance choice", async () => {
    const user = userEvent.setup();
    const createSpy = vi.fn();
    server.use(
      http.post("/api/v1/clients", () => {
        createSpy();
        return HttpResponse.json({ client }, { status: 201 });
      }),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "New client" }));
    expect(await screen.findByRole("dialog", { name: "Create client" })).toBeVisible();
    expect(screen.getByLabelText(/Use business default/)).toBeChecked();
    expect(screen.getByText(/Use business default/)).toHaveTextContent("85");

    await user.click(screen.getByRole("button", { name: "Create client" }));
    expect(await screen.findByText("Client name is required")).toBeVisible();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("requires a non-negative value when hourly rate override is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "New client" }));
    await user.type(await screen.findByLabelText(/Client name/), "Northstar Studio");
    await user.click(screen.getByLabelText("Override hourly rate"));
    await user.type(screen.getByLabelText(/Hourly rate override/), "-5");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    expect(await screen.findByText("Value must be non-negative")).toBeVisible();
  });

  it("preserves entered data when a create save fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/v1/clients", () =>
        HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Client could not be saved.",
              fieldErrors: null,
              requestId: "request-client-1",
            },
          },
          { status: 500 },
        ),
      ),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "New client" }));
    const nameInput = await screen.findByLabelText(/Client name/);
    await user.type(nameInput, "Careful Client");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    expect(await screen.findByText("Client could not be saved.")).toBeVisible();
    expect(nameInput).toHaveValue("Careful Client");
    expect(screen.getByRole("dialog", { name: "Create client" })).toBeVisible();
  });
});
