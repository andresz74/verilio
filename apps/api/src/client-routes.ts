import {
  ClientIdParamsSchema,
  ClientInputSchema,
  ClientListQuerySchema,
} from "@verilio/contracts";
import type { ZodError } from "zod";
import type { FastifyInstance } from "fastify";

import type { ClientServiceContract } from "./client-service.js";
import { ApiError } from "./errors.js";

export function registerClientRoutes(
  app: FastifyInstance,
  clientService: ClientServiceContract,
): void {
  app.get("/api/v1/clients", async (request) => {
    const query = parseOrThrow(ClientListQuerySchema.safeParse(request.query));
    return { clients: await clientService.list(query) };
  });

  app.post("/api/v1/clients", async (request, reply) => {
    const input = parseOrThrow(ClientInputSchema.safeParse(request.body));
    return reply.status(201).send({ client: await clientService.create(input) });
  });

  app.get("/api/v1/clients/:id", async (request) => {
    const { id } = parseOrThrow(ClientIdParamsSchema.safeParse(request.params));
    return { client: requireClient(await clientService.get(id)) };
  });

  app.patch("/api/v1/clients/:id", async (request) => {
    const { id } = parseOrThrow(ClientIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(ClientInputSchema.safeParse(request.body));
    return { client: requireClient(await clientService.update(id, input)) };
  });

  app.post("/api/v1/clients/:id/archive", async (request) => {
    const { id } = parseOrThrow(ClientIdParamsSchema.safeParse(request.params));
    return { client: requireClient(await clientService.setActive(id, false)) };
  });

  app.post("/api/v1/clients/:id/reactivate", async (request) => {
    const { id } = parseOrThrow(ClientIdParamsSchema.safeParse(request.params));
    return { client: requireClient(await clientService.setActive(id, true)) };
  });
}

function requireClient<T>(client: T | null): T {
  if (!client) {
    throw new ApiError(404, "NOT_FOUND", "Client not found.");
  }
  return client;
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
    "Review the highlighted client fields.",
    fieldErrors,
  );
}
