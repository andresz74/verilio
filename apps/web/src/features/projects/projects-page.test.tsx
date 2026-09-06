import type { BusinessProfileDto, ClientDto, ProjectDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { server } from "../../test/server.js";
import { ProjectsPage } from "./projects-page.js";

const client: ClientDto = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Northstar Studio",
  email: null,
  ccRecipients: [],
  address: null,
  note: null,
  currency: "USD",
  defaultHourlyRate: "90.0000",
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};
const project: ProjectDto = {
  id: "22222222-2222-4222-8222-222222222222",
  clientId: client.id,
  name: "Website redesign",
  color: "#4F46E5",
  defaultHourlyRate: null,
  billableByDefault: true,
  note: "Launch project",
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};
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
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function renderPage(projects: ProjectDto[] = []) {
  server.use(
    http.get("/api/v1/settings", () => HttpResponse.json({ settings: profile })),
    http.get("/api/v1/clients", () => HttpResponse.json({ clients: [client] })),
    http.get("/api/v1/projects", () => HttpResponse.json({ projects })),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ProjectsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ProjectsPage", () => {
  it("shows client context and explicit inherited-rate behavior", async () => {
    renderPage([project]);
    const row = await screen.findByRole("row", { name: /Website redesign/ });
    expect(row).toHaveTextContent("Northstar Studio");
    expect(row).toHaveTextContent("Inherits Client 90.0000/hr");
    expect(row).toHaveTextContent("Billable");
  });

  it("requires a client and project name and exposes the rate inheritance choice", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "New project" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Create project" }));
    await user.selectOptions(dialog.getByRole("combobox", { name: /^Client/ }), client.id);
    expect(dialog.getByLabelText(/Use inherited rate/)).toBeChecked();
    expect(dialog.getByText(/Use inherited rate/)).toHaveTextContent("Client");
    expect(dialog.getByText(/Use inherited rate/)).toHaveTextContent("90");

    await user.click(dialog.getByRole("button", { name: "Create project" }));
    expect(await dialog.findByText("Project name is required")).toBeVisible();
  });

  it("validates a non-negative Project rate override", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "New project" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Create project" }));
    await user.selectOptions(dialog.getByRole("combobox", { name: /^Client/ }), client.id);
    await user.type(dialog.getByRole("textbox", { name: /^Project name/ }), "New project");
    await user.click(dialog.getByLabelText("Override hourly rate"));
    await user.type(dialog.getByRole("textbox", { name: /^Hourly rate override/ }), "-5");
    await user.click(dialog.getByRole("button", { name: "Create project" }));
    expect(await dialog.findByText("Value must be non-negative")).toBeVisible();
  });

  it("preserves entered Project data when persistence fails", async () => {
    const user = userEvent.setup();
    const createSpy = vi.fn();
    server.use(
      http.post("/api/v1/projects", () => {
        createSpy();
        return HttpResponse.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Project could not be saved.",
              fieldErrors: null,
              requestId: "request-project-1",
            },
          },
          { status: 500 },
        );
      }),
    );
    renderPage();
    await user.click(screen.getByRole("button", { name: "New project" }));
    const dialogElement = await screen.findByRole("dialog", { name: "Create project" });
    const dialog = within(dialogElement);
    await user.selectOptions(dialog.getByRole("combobox", { name: /^Client/ }), client.id);
    const nameInput = dialog.getByRole("textbox", { name: /^Project name/ });
    await user.type(nameInput, "Careful project");
    await user.click(dialog.getByRole("button", { name: "Create project" }));

    expect(await dialog.findByText("Project could not be saved.")).toBeVisible();
    expect(createSpy).toHaveBeenCalledOnce();
    expect(nameInput).toHaveValue("Careful project");
    expect(dialogElement).toBeVisible();
  });
});
