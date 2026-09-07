import {
  EligibleTimeQuerySchema,
  ImportTimeInputSchema,
  InvoiceCreateInputSchema,
  InvoiceIdParamsSchema,
  InvoiceItemParamsSchema,
  InvoiceManualItemInputSchema,
  InvoiceUpdateInputSchema,
} from "@verilio/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodError } from "zod";

import { ApiError } from "./errors.js";
import type { InvoiceServiceContract } from "./invoice-service.js";

export function registerInvoiceRoutes(app: FastifyInstance, service: InvoiceServiceContract): void {
  app.get("/api/v1/invoices", async () => ({ invoices: await service.list() }));

  app.post("/api/v1/invoices", async (request, reply) => {
    const input = parseOrThrow(InvoiceCreateInputSchema.safeParse(request.body));
    return reply.status(201).send({ invoice: await service.create(input) });
  });

  app.get("/api/v1/invoices/:id", async (request) => {
    const { id } = parseOrThrow(InvoiceIdParamsSchema.safeParse(request.params));
    return { invoice: requireInvoice(await service.get(id)) };
  });

  app.patch("/api/v1/invoices/:id", async (request) => {
    const { id } = parseOrThrow(InvoiceIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(InvoiceUpdateInputSchema.safeParse(request.body));
    return { invoice: requireInvoice(await service.update(id, input)) };
  });

  app.get("/api/v1/invoices/:id/eligible-time", async (request) => {
    const { id } = parseOrThrow(InvoiceIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(EligibleTimeQuerySchema.safeParse(request.query));
    return requireInvoice(await service.eligibleTime(id, input));
  });

  app.post("/api/v1/invoices/:id/import-time", async (request) => {
    const { id } = parseOrThrow(InvoiceIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(ImportTimeInputSchema.safeParse(request.body));
    return { invoice: requireInvoice(await service.importTime(id, input)) };
  });

  app.post("/api/v1/invoices/:id/items", async (request, reply) => {
    const { id } = parseOrThrow(InvoiceIdParamsSchema.safeParse(request.params));
    const input = parseOrThrow(InvoiceManualItemInputSchema.safeParse(request.body));
    return reply.status(201).send({ invoice: requireInvoice(await service.addManualItem(id, input)) });
  });

  app.patch("/api/v1/invoices/:id/items/:itemId", async (request) => {
    const { id, itemId } = parseOrThrow(InvoiceItemParamsSchema.safeParse(request.params));
    const input = parseOrThrow(InvoiceManualItemInputSchema.safeParse(request.body));
    return { invoice: requireInvoice(await service.updateManualItem(id, itemId, input)) };
  });

  app.delete("/api/v1/invoices/:id/items/:itemId", async (request) => {
    const { id, itemId } = parseOrThrow(InvoiceItemParamsSchema.safeParse(request.params));
    return { invoice: requireInvoice(await service.removeItem(id, itemId)) };
  });
}

function requireInvoice<T>(invoice: T | null): T {
  if (!invoice) throw new ApiError(404, "NOT_FOUND", "Invoice not found.");
  return invoice;
}

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  throw new ApiError(400, "VALIDATION_ERROR", "Review the highlighted Invoice fields.", fieldErrors);
}
