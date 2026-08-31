import type { VerilioDatabase } from "@verilio/db";
import { checkDatabaseConnection } from "@verilio/db";
import Fastify, { type FastifyInstance } from "fastify";

import { ApiError } from "./errors.js";

export type BuildAppOptions = {
  db: VerilioDatabase;
  logger?: boolean;
  readinessCheck?: (db: VerilioDatabase) => Promise<void>;
};

export function buildApp({
  db,
  logger = true,
  readinessCheck = checkDatabaseConnection,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger,
    requestIdHeader: "x-request-id",
  });

  app.get("/health/live", async () => ({ status: "live" as const }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await readinessCheck(db);
      return { status: "ready" as const, database: "connected" as const };
    } catch (error) {
      app.log.error({ error }, "Database readiness check failed");
      return reply.status(503).send({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "The database is not ready.",
          fieldErrors: null,
          requestId: reply.request.id,
        },
      });
    }
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        fieldErrors: null,
        requestId: request.id,
      },
    }),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
          requestId: request.id,
        },
      });
    }

    request.log.error({ error }, "Unhandled API error");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        fieldErrors: null,
        requestId: request.id,
      },
    });
  });

  return app;
}
