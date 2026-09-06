import type { ClientDto, ProjectDto, TaskDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { HierarchySelects, type HierarchySelection } from "./hierarchy-selects.js";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_A2 = "44444444-4444-4444-8444-444444444444";
const TASK_A = "55555555-5555-4555-8555-555555555555";

const clients: ClientDto[] = [
  {
    id: CLIENT_A,
    name: "Client A",
    email: null,
    ccRecipients: [],
    address: null,
    note: null,
    currency: "USD",
    defaultHourlyRate: null,
    active: true,
    createdAt: "2026-09-05T12:00:00.000Z",
    updatedAt: "2026-09-05T12:00:00.000Z",
  },
  {
    id: CLIENT_B,
    name: "Client B",
    email: null,
    ccRecipients: [],
    address: null,
    note: null,
    currency: "USD",
    defaultHourlyRate: null,
    active: true,
    createdAt: "2026-09-05T12:00:00.000Z",
    updatedAt: "2026-09-05T12:00:00.000Z",
  },
];
const projects: ProjectDto[] = [PROJECT_A, PROJECT_A2].map((id, index) => ({
  id,
  clientId: CLIENT_A,
  name: `Project ${index + 1}`,
  color: null,
  defaultHourlyRate: null,
  billableByDefault: true,
  note: null,
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
}));
const task: TaskDto = {
  id: TASK_A,
  projectId: PROJECT_A,
  name: "Task A",
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function Harness() {
  const [value, setValue] = useState<HierarchySelection>({
    clientId: CLIENT_A,
    projectId: PROJECT_A,
    taskId: TASK_A,
  });
  return (
    <>
      <HierarchySelects value={value} onChange={setValue} />
      <output aria-label="Hierarchy value">{JSON.stringify(value)}</output>
    </>
  );
}

describe("HierarchySelects", () => {
  it("clears Task on Project change and clears Project and Task on Client change", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/v1/clients", () => HttpResponse.json({ clients })),
      http.get("/api/v1/projects", ({ request }) => {
        const clientId = new URL(request.url).searchParams.get("clientId");
        return HttpResponse.json({
          projects: clientId === CLIENT_A ? projects : [],
        });
      }),
      http.get("/api/v1/projects/:projectId/tasks", ({ params }) =>
        HttpResponse.json({ tasks: params.projectId === PROJECT_A ? [task] : [] }),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await screen.findByRole("option", { name: "Project 2" }, { timeout: 5_000 });
    await screen.findByRole("option", { name: "Task A" }, { timeout: 5_000 });
    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), PROJECT_A2);
    expect(screen.getByRole("status", { name: "Hierarchy value" })).toHaveTextContent(
      `"projectId":"${PROJECT_A2}","taskId":""`,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Client" }), CLIENT_B);
    expect(screen.getByRole("status", { name: "Hierarchy value" })).toHaveTextContent(
      `"clientId":"${CLIENT_B}","projectId":"","taskId":""`,
    );
    expect(screen.getByRole("combobox", { name: "Task (optional)" })).toBeDisabled();
  });
});
