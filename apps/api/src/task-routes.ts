import {
  ProjectTaskParamsSchema,
  TaskIdParamsSchema,
  TaskInputSchema,
  TaskListQuerySchema,
} from "@verilio/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "./errors.js";
import type { TaskServiceContract } from "./task-service.js";

export function registerTaskRoutes(
  app: FastifyInstance,
  taskService: TaskServiceContract,
): void {
  app.get("/api/v1/projects/:id/tasks", async (request) => {
    const { id } = parseOrThrow(ProjectTaskParamsSchema.safeParse(request.params));
    const query = parseOrThrow(TaskListQuerySchema.safeParse(request.query));
    return { tasks: requireTasks(await taskService.list(id, query)) };
  });

  app.post("/api/v1/projects/:id/tasks", async (request, reply) => {
    const { id } = parseOrThrow(ProjectTaskParamsSchema.safeParse(request.params));
    const input = parseOrThrow(TaskInputSchema.safeParse(request.body));
    const task = requireTask(await taskService.create(id, input));
    return reply.status(201).send({ task });
  });

  app.patch("/api/v1/tasks/:id", async (request) => {
    const { id } = parseOrThrow(TaskIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(TaskInputSchema.safeParse(request.body));
    return { task: requireTask(await taskService.update(id, input)) };
  });

  app.post("/api/v1/tasks/:id/archive", async (request) => {
    const { id } = parseOrThrow(TaskIdParamsSchema.safeParse(request.params));
    return { task: requireTask(await taskService.setActive(id, false)) };
  });

  app.post("/api/v1/tasks/:id/reactivate", async (request) => {
    const { id } = parseOrThrow(TaskIdParamsSchema.safeParse(request.params));
    return { task: requireTask(await taskService.setActive(id, true)) };
  });
}

function requireTasks<T>(tasks: T[] | null): T[] {
  if (!tasks) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return tasks;
}

function requireTask<T>(task: T | null): T {
  if (!task) throw new ApiError(404, "NOT_FOUND", "Task not found.");
  return task;
}

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: ZodError },
): T {
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Review the highlighted task fields.",
    fieldErrors,
  );
}
