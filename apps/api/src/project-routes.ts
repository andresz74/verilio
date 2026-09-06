import {
  ProjectIdParamsSchema,
  ProjectInputSchema,
  ProjectListQuerySchema,
} from "@verilio/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "./errors.js";
import type { ProjectServiceContract } from "./project-service.js";

export function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectServiceContract,
): void {
  app.get("/api/v1/projects", async (request) => {
    const query = parseOrThrow(ProjectListQuerySchema.safeParse(request.query));
    return { projects: await projectService.list(query) };
  });

  app.post("/api/v1/projects", async (request, reply) => {
    const input = parseOrThrow(ProjectInputSchema.safeParse(request.body));
    return reply.status(201).send({ project: await projectService.create(input) });
  });

  app.get("/api/v1/projects/:id", async (request) => {
    const { id } = parseOrThrow(ProjectIdParamsSchema.safeParse(request.params));
    return { project: requireProject(await projectService.get(id)) };
  });

  app.patch("/api/v1/projects/:id", async (request) => {
    const { id } = parseOrThrow(ProjectIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(ProjectInputSchema.safeParse(request.body));
    return { project: requireProject(await projectService.update(id, input)) };
  });

  app.post("/api/v1/projects/:id/archive", async (request) => {
    const { id } = parseOrThrow(ProjectIdParamsSchema.safeParse(request.params));
    return { project: requireProject(await projectService.setActive(id, false)) };
  });

  app.post("/api/v1/projects/:id/reactivate", async (request) => {
    const { id } = parseOrThrow(ProjectIdParamsSchema.safeParse(request.params));
    return { project: requireProject(await projectService.setActive(id, true)) };
  });
}

function requireProject<T>(project: T | null): T {
  if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found.");
  return project;
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
    "Review the highlighted project fields.",
    fieldErrors,
  );
}
