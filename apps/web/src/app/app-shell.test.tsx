import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { server } from "../test/server.js";
import { AppNavigation, AppShell } from "./app-shell.js";

const running = {
  id: "44444444-4444-4444-8444-444444444444",
  clientId: "11111111-1111-4111-8111-111111111111",
  clientName: "Acme",
  projectId: "22222222-2222-4222-8222-222222222222",
  projectName: "Website",
  taskId: null,
  taskName: null,
  description: "Global timer",
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

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/timer"]}>
        <Routes><Route element={<AppShell />}><Route path="/timer" element={<div>Timer page</div>} /></Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppNavigation", () => {
  it("renders only the documented primary destinations and exposes the active section", () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <AppNavigation />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Timer",
      "Timesheet",
      "Reports",
      "Clients",
      "Projects",
      "Invoices",
      "Settings",
    ]);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("supports keyboard navigation", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/timer"]}>
        <AppNavigation />
      </MemoryRouter>,
    );

    await user.tab();
    expect(screen.getByRole("link", { name: "Timer" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Timesheet" })).toHaveFocus();
  });
});

describe("global Timer indicator reconciliation", () => {
  it("resolves to idle when Stop commits but its response is lost", async () => {
    let currentTimer: typeof running | null = running;
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: currentTimer, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/stop", () => {
        currentTimer = null;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("No timer running")).toBeVisible();
    expect(screen.queryByText("Stop failed. Timer is still running.")).not.toBeInTheDocument();
  });

  it("keeps Running only after a failed Stop is reconciled as running", async () => {
    server.use(
      http.get("/api/v1/timer/current", () => HttpResponse.json({ timer: running, serverNow: "2026-09-05T14:00:00.000Z" })),
      http.post("/api/v1/timer/stop", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Timer is still running.")).toBeVisible();
    expect(screen.getByText("Running")).toBeVisible();
  });

  it("shows unconfirmed state rather than stale Running after reconciliation fails", async () => {
    let currentReads = 0;
    server.use(
      http.get("/api/v1/timer/current", () => {
        currentReads += 1;
        return currentReads === 1
          ? HttpResponse.json({ timer: running, serverNow: "2026-09-05T14:00:00.000Z" })
          : HttpResponse.error();
      }),
      http.post("/api/v1/timer/stop", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderShell();
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText(/Timer state could not be confirmed/)).toBeVisible();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.queryByText("Stop failed. Timer is still running.")).not.toBeInTheDocument();
  });
});
