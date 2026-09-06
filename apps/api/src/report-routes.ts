import {
  ReportDetailedQuerySchema,
  ReportSummaryQuerySchema,
} from "@verilio/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "./errors.js";
import type { ReportServiceContract } from "./report-service.js";

export function registerReportRoutes(
  app: FastifyInstance,
  service: ReportServiceContract,
): void {
  app.get("/api/v1/reports/summary", async (request) => {
    const input = parseOrThrow(ReportSummaryQuerySchema.safeParse(request.query));
    return service.summary(input);
  });

  app.get("/api/v1/reports/detailed", async (request) => {
    const input = parseOrThrow(ReportDetailedQuerySchema.safeParse(request.query));
    return service.detailed(input);
  });
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
    "Review the selected report filters.",
    fieldErrors,
  );
}
