import { BusinessProfileInputSchema } from "@verilio/contracts";
import type { FastifyInstance } from "fastify";

import { ApiError } from "./errors.js";
import type { SettingsServiceContract } from "./settings-service.js";

export function registerSettingsRoutes(
  app: FastifyInstance,
  settingsService: SettingsServiceContract,
): void {
  app.get("/api/v1/settings", async () => ({ settings: await settingsService.get() }));

  app.put("/api/v1/settings", async (request) => {
    const result = BusinessProfileInputSchema.safeParse(request.body);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "form");
        fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
      }

      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Review the highlighted settings fields.",
        fieldErrors,
      );
    }

    return { settings: await settingsService.save(result.data) };
  });
}

