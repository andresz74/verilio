import type { ProjectDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { ProjectSelect } from "./project-select.js";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const project: ProjectDto = {
  id: "33333333-3333-4333-8333-333333333333",
  clientId: CLIENT_A,
  name: "Active project",
  color: null,
  defaultHourlyRate: null,
  billableByDefault: true,
  note: null,
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function Harness({ clientId = CLIENT_A }: { clientId?: string | null }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor="project-select">Project</label>
      <ProjectSelect
        id="project-select"
        clientId={clientId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <output aria-label="Selected project">{value}</output>
    </div>
  );
}

function renderSelect(clientId: string | null = CLIENT_A) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness clientId={clientId} />
    </QueryClientProvider>,
  );
}

describe("ProjectSelect", () => {
  it("requests new-work projects and excludes archived or wrong-client records", async () => {
    const user = userEvent.setup();
    let requestedClient: string | null = null;
    let availability: string | null = null;
    server.use(
      http.get("/api/v1/projects", ({ request }) => {
        const params = new URL(request.url).searchParams;
        requestedClient = params.get("clientId");
        availability = params.get("availability");
        return HttpResponse.json({
          projects: [
            project,
            { ...project, id: "44444444-4444-4444-8444-444444444444", name: "Archived", active: false },
            { ...project, id: "55555555-5555-4555-8555-555555555555", name: "Other client", clientId: CLIENT_B },
          ],
        });
      }),
    );
    renderSelect();

    const select = await screen.findByRole("combobox", { name: "Project" });
    expect(await screen.findByRole("option", { name: "Active project" })).toBeVisible();
    expect(requestedClient).toBe(CLIENT_A);
    expect(availability).toBe("new-work");
    expect(screen.queryByRole("option", { name: /Archived/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Other client/ })).not.toBeInTheDocument();
    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, project.id);
    expect(screen.getByRole("status", { name: "Selected project" })).toHaveTextContent(project.id);
  });

  it("has a clear disabled state without a Client", () => {
    renderSelect(null);
    expect(screen.getByRole("combobox", { name: "Project" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Select a client first" })).toBeVisible();
  });
});
