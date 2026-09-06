import type { ClientDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { ClientSelect } from "./client-select.js";

const activeClient: ClientDto = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Active Studio",
  email: null,
  ccRecipients: [],
  address: null,
  note: null,
  currency: "USD",
  defaultHourlyRate: null,
  active: true,
  createdAt: "2026-09-04T12:00:00.000Z",
  updatedAt: "2026-09-04T12:00:00.000Z",
};
const archivedClient: ClientDto = {
  ...activeClient,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Archived Studio",
  active: false,
};

function ClientSelectHarness() {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor="client-select">Client</label>
      <ClientSelect
        id="client-select"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <output aria-label="Selected client">{value}</output>
    </div>
  );
}

describe("ClientSelect", () => {
  it("loads active clients by default and supports keyboard-focused selection", async () => {
    const user = userEvent.setup();
    let requestedStatus: string | null = null;
    server.use(
      http.get("/api/v1/clients", ({ request }) => {
        requestedStatus = new URL(request.url).searchParams.get("status");
        return HttpResponse.json({ clients: [activeClient, archivedClient] });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ClientSelectHarness />
      </QueryClientProvider>,
    );

    const select = await screen.findByRole("combobox", { name: "Client" });
    expect(requestedStatus).toBe("active");
    expect(
      await screen.findByRole("option", { name: "Active Studio — USD" }),
    ).toBeVisible();
    expect(screen.queryByRole("option", { name: /Archived Studio/ })).not.toBeInTheDocument();

    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, activeClient.id);
    expect(screen.getByRole("status", { name: "Selected client" })).toHaveTextContent(
      activeClient.id,
    );
  });
});
