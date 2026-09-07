import {
  ApiErrorSchema,
  EligibleTimeQuerySchema,
  EligibleTimeResponseSchema,
  ImportTimeInputSchema,
  InvoiceCreateInputSchema,
  InvoiceListResponseSchema,
  InvoiceManualItemInputSchema,
  InvoiceMarkPaidInputSchema,
  InvoicePresentationResponseSchema,
  InvoiceResponseSchema,
  InvoiceUpdateInputSchema,
  type EligibleTimeQuery,
  type EligibleTimeResponse,
  type ImportTimeInput,
  type InvoiceCreateInput,
  type InvoiceListResponse,
  type InvoiceManualItemInput,
  type InvoiceMarkPaidInput,
  type InvoicePresentationResponse,
  type InvoiceResponse,
  type InvoiceUpdateInput,
} from "@verilio/contracts";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: ["invoices", "list"] as const,
  detail: (id: string) => ["invoices", "detail", id] as const,
  presentation: (id: string) => ["invoices", "presentation", id] as const,
  eligible: (id: string, query: EligibleTimeQuery) => ["invoices", "eligible", id, query] as const,
};

export class InvoiceApiError extends Error {
  constructor(
    message: string,
    readonly code = "INTERNAL_ERROR",
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "InvoiceApiError";
  }
}

export function getInvoices(): Promise<InvoiceListResponse> {
  return request("/api/v1/invoices", InvoiceListResponseSchema, "Invoices could not be loaded.");
}

export function getInvoice(id: string): Promise<InvoiceResponse> {
  return request(`/api/v1/invoices/${id}`, InvoiceResponseSchema, "Invoice could not be loaded.");
}

export function getInvoicePresentation(id: string): Promise<InvoicePresentationResponse> {
  return request(`/api/v1/invoices/${id}/presentation`, InvoicePresentationResponseSchema, "Invoice preview could not be loaded.");
}

export function createInvoice(input: InvoiceCreateInput): Promise<InvoiceResponse> {
  return mutation("/api/v1/invoices", "POST", InvoiceCreateInputSchema.parse(input));
}

export function updateInvoice(id: string, input: InvoiceUpdateInput): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}`, "PATCH", InvoiceUpdateInputSchema.parse(input));
}

export function getEligibleTime(id: string, input: EligibleTimeQuery): Promise<EligibleTimeResponse> {
  const query = EligibleTimeQuerySchema.parse(input);
  return request(`/api/v1/invoices/${id}/eligible-time?from=${query.from}&to=${query.to}`, EligibleTimeResponseSchema, "Eligible Time could not be loaded.");
}

export function importInvoiceTime(id: string, input: ImportTimeInput): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/import-time`, "POST", ImportTimeInputSchema.parse(input));
}

export function addManualInvoiceItem(id: string, input: InvoiceManualItemInput): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/items`, "POST", InvoiceManualItemInputSchema.parse(input));
}

export function updateManualInvoiceItem(id: string, itemId: string, input: InvoiceManualItemInput): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/items/${itemId}`, "PATCH", InvoiceManualItemInputSchema.parse(input));
}

export async function removeInvoiceItem(id: string, itemId: string): Promise<InvoiceResponse> {
  return request(`/api/v1/invoices/${id}/items/${itemId}`, InvoiceResponseSchema, "Invoice Item could not be removed.", { method: "DELETE" });
}

export function markInvoiceSent(id: string): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/mark-sent`, "POST", {});
}

export function markInvoicePaid(id: string, input: InvoiceMarkPaidInput): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/mark-paid`, "POST", InvoiceMarkPaidInputSchema.parse(input));
}

export function voidInvoice(id: string): Promise<InvoiceResponse> {
  return mutation(`/api/v1/invoices/${id}/void`, "POST", {});
}

function mutation(url: string, method: "POST" | "PATCH", body: unknown): Promise<InvoiceResponse> {
  return request(url, InvoiceResponseSchema, "Invoice could not be saved. Your entries are still here.", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request<T>(url: string, schema: { parse(value: unknown): T }, fallback: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await toApiError(response, fallback);
  return schema.parse(await response.json());
}

async function toApiError(response: Response, fallback: string): Promise<InvoiceApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) return new InvoiceApiError(result.data.error.message, result.data.error.code, result.data.error.fieldErrors);
  return new InvoiceApiError(fallback);
}
