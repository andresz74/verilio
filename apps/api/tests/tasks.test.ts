import type { TaskDto, TaskInput } from "@verilio/contracts";
import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { TaskServiceContract } from "../src/task-service.js";

const projectId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const input: TaskInput = { name: "Design review" };
const task: TaskDto = {
  id: taskId,
  projectId,
  name: input.name,
  active: true,
  createdAt: "2026-09-05T12:00:00.000Z",
  updatedAt: "2026-09-05T12:00:00.000Z",
};

function createTaskService(): TaskServiceContract {
  return {
    list: vi.fn().mockResolvedValue([task]),
    create: vi.fn().mockResolvedValue(task),
    update: vi.fn().mockResolvedValue(task),
    setActive: vi.fn().mockImplementation((_id: string, active: boolean) =>
      Promise.resolve({ ...task, active }),
    ),
  };
}

describe("task routes", () => {
  it("validates task creation before persistence", async () => {
    const taskService = createTaskService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      taskService,
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/tasks`,
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { name: ["Task name is required"] },
      },
    });
    expect(taskService.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("lists and creates tasks only through the project path", async () => {
    const taskService = createTaskService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      taskService,
    });

    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}/tasks?status=archived&search=design`,
        })
      ).statusCode,
    ).toBe(200);
    expect(taskService.list).toHaveBeenCalledWith(projectId, {
      status: "archived",
      search: "design",
      availability: "all",
    });

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/projects/${projectId}/tasks`,
          payload: input,
        })
      ).statusCode,
    ).toBe(201);
    expect(taskService.create).toHaveBeenCalledWith(projectId, input);
    await app.close();
  });

  it("renames, archives, and reactivates an owned task", async () => {
    const taskService = createTaskService();
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      taskService,
    });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/tasks/${taskId}`,
      payload: { name: "Final design review" },
    });
    expect(taskService.update).toHaveBeenCalledWith(taskId, {
      name: "Final design review",
    });
    await app.inject({ method: "POST", url: `/api/v1/tasks/${taskId}/archive` });
    expect(taskService.setActive).toHaveBeenCalledWith(taskId, false);
    await app.inject({ method: "POST", url: `/api/v1/tasks/${taskId}/reactivate` });
    expect(taskService.setActive).toHaveBeenCalledWith(taskId, true);
    await app.close();
  });

  it("returns not found for a project outside the owner hierarchy", async () => {
    const taskService = createTaskService();
    vi.mocked(taskService.list).mockResolvedValue(null);
    const app = buildApp({
      db: {} as VerilioDatabase,
      logger: false,
      taskService,
    });
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/tasks`,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
