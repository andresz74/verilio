import type { VerilioDatabase } from "@verilio/db";
import { checkDatabaseConnection } from "@verilio/db";
import Fastify, { type FastifyInstance } from "fastify";

import { registerClientRoutes } from "./client-routes.js";
import { ClientService, type ClientServiceContract } from "./client-service.js";
import { ApiError } from "./errors.js";
import { registerInvoiceRoutes } from "./invoice-routes.js";
import { InvoiceService, type InvoiceServiceContract } from "./invoice-service.js";
import { registerProjectRoutes } from "./project-routes.js";
import { ProjectService, type ProjectServiceContract } from "./project-service.js";
import { registerReportRoutes } from "./report-routes.js";
import { ReportService, type ReportServiceContract } from "./report-service.js";
import { registerSettingsRoutes } from "./settings-routes.js";
import {
  SettingsService,
  type SettingsServiceContract,
} from "./settings-service.js";
import { registerTaskRoutes } from "./task-routes.js";
import { TaskService, type TaskServiceContract } from "./task-service.js";
import { registerTimeEntryRoutes } from "./time-entry-routes.js";
import {
  TimeEntryService,
  type TimeEntryServiceContract,
} from "./time-entry-service.js";

export type BuildAppOptions = {
  db: VerilioDatabase;
  logger?: boolean;
  readinessCheck?: (db: VerilioDatabase) => Promise<void>;
  clientService?: ClientServiceContract;
  invoiceService?: InvoiceServiceContract;
  projectService?: ProjectServiceContract;
  reportService?: ReportServiceContract;
  settingsService?: SettingsServiceContract;
  taskService?: TaskServiceContract;
  timeEntryService?: TimeEntryServiceContract;
};

export function buildApp({
  db,
  logger = true,
  readinessCheck = checkDatabaseConnection,
  clientService = new ClientService(db),
  invoiceService = new InvoiceService(db),
  projectService = new ProjectService(db),
  reportService = new ReportService(db),
  settingsService = new SettingsService(db),
  taskService = new TaskService(db),
  timeEntryService = new TimeEntryService(db),
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

  registerSettingsRoutes(app, settingsService);
  registerClientRoutes(app, clientService);
  registerInvoiceRoutes(app, invoiceService);
  registerProjectRoutes(app, projectService);
  registerReportRoutes(app, reportService);
  registerTaskRoutes(app, taskService);
  registerTimeEntryRoutes(app, timeEntryService);

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

    request.log.error({ err: error }, "Unhandled API error");
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
