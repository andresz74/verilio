import {
  ManualTimeEntryInputSchema,
  RecentTimeEntriesQuerySchema,
  TimeEntryIdParamsSchema,
  TimeEntryUpdateInputSchema,
  TimerStartInputSchema,
} from "@verilio/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "./errors.js";
import type { TimeEntryServiceContract } from "./time-entry-service.js";

export function registerTimeEntryRoutes(
  app: FastifyInstance,
  service: TimeEntryServiceContract,
): void {
  app.get("/api/v1/timer/current", () => service.current());

  app.post("/api/v1/timer/start", async (request, reply) => {
    const input = parseOrThrow(TimerStartInputSchema.safeParse(request.body));
    return reply.status(201).send(await service.start(input));
  });

  app.post("/api/v1/timer/stop", () => service.stop());

  app.get("/api/v1/time-entries/recent", async (request) => {
    const { limit } = parseOrThrow(RecentTimeEntriesQuerySchema.safeParse(request.query));
    return { entries: await service.listRecent(limit) };
  });

  app.post("/api/v1/time-entries", async (request, reply) => {
    const input = parseOrThrow(ManualTimeEntryInputSchema.safeParse(request.body));
    return reply.status(201).send({ entry: await service.create(input) });
  });

  app.get("/api/v1/time-entries/:id", async (request) => {
    const { id } = parseOrThrow(TimeEntryIdParamsSchema.safeParse(request.params));
    return { entry: requireEntry(await service.get(id)) };
  });

  app.patch("/api/v1/time-entries/:id", async (request) => {
    const { id } = parseOrThrow(TimeEntryIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(TimeEntryUpdateInputSchema.safeParse(request.body));
    return { entry: requireEntry(await service.update(id, input)) };
  });

  app.delete("/api/v1/time-entries/:id", async (request, reply) => {
    const { id } = parseOrThrow(TimeEntryIdParamsSchema.safeParse(request.params));
    if (!(await service.delete(id))) throw new ApiError(404, "NOT_FOUND", "Time entry not found.");
    return reply.status(204).send();
  });
}

function requireEntry<T>(entry: T | null): T {
  if (!entry) throw new ApiError(404, "NOT_FOUND", "Time entry not found.");
  return entry;
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
    "Review the highlighted time-entry fields.",
    fieldErrors,
  );
}
