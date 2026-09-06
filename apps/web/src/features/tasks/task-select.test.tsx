import type { TaskDto } from "@verilio/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { server } from "../../test/server.js";
import { TaskSelect } from "./task-select.js";

const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const task: TaskDto = {
  id: "44444444-4444-4444-8444-444444444444",
  projectId: PROJECT_A,
  name: "Active task",
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function Harness({ projectId = PROJECT_A }: { projectId?: string | null }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor="task-select">Task</label>
      <TaskSelect
        id="task-select"
        projectId={projectId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <output aria-label="Selected task">{value}</output>
    </div>
  );
}

function renderSelect(projectId: string | null = PROJECT_A) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness projectId={projectId} />
    </QueryClientProvider>,
  );
}

describe("TaskSelect", () => {
  it("is optional, keyboard accessible, and excludes archived or wrong-project tasks", async () => {
    const user = userEvent.setup();
    let requestedProject: string | null = null;
    let requestedAvailability: string | null = null;
    server.use(
      http.get("/api/v1/projects/:projectId/tasks", ({ params, request }) => {
        requestedProject = String(params.projectId);
        requestedAvailability = new URL(request.url).searchParams.get("availability");
        return HttpResponse.json({
          tasks: [
            task,
            { ...task, id: "55555555-5555-4555-8555-555555555555", name: "Archived", active: false },
            { ...task, id: "66666666-6666-4666-8666-666666666666", name: "Other project", projectId: PROJECT_B },
          ],
        });
      }),
    );
    renderSelect();

    const select = await screen.findByRole("combobox", { name: "Task" });
    expect(await screen.findByRole("option", { name: "Active task" })).toBeVisible();
    expect(requestedProject).toBe(PROJECT_A);
    expect(requestedAvailability).toBe("new-work");
    expect(await screen.findByRole("option", { name: "No task" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /Archived/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Other project/ })).not.toBeInTheDocument();
    await user.tab();
    expect(select).toHaveFocus();
    await user.selectOptions(select, task.id);
    expect(screen.getByRole("status", { name: "Selected task" })).toHaveTextContent(task.id);
  });

  it("has a clear disabled state without a Project", () => {
    renderSelect(null);
    expect(screen.getByRole("combobox", { name: "Task" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Select a project first" })).toBeVisible();
  });
});
