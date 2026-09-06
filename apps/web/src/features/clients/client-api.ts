import {
  ApiErrorSchema,
  ClientInputSchema,
  ClientListResponseSchema,
  ClientResponseSchema,
  type ClientInput,
  type ClientListQuery,
  type ClientListResponse,
  type ClientResponse,
} from "@verilio/contracts";

export const clientKeys = {
  all: ["clients"] as const,
  list: (query: ClientListQuery) => ["clients", "list", query] as const,
  detail: (id: string) => ["clients", "detail", id] as const,
};

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function getClients(query: ClientListQuery): Promise<ClientListResponse> {
  const search = new URLSearchParams({ status: query.status });
  if (query.search) search.set("search", query.search);
  const response = await fetch(`/api/v1/clients?${search.toString()}`);
  if (!response.ok) throw await toApiError(response, "Clients could not be loaded.");
  return ClientListResponseSchema.parse(await response.json());
}

export async function getClient(id: string): Promise<ClientResponse> {
  const response = await fetch(`/api/v1/clients/${id}`);
  if (!response.ok) throw await toApiError(response, "Client could not be loaded.");
  return ClientResponseSchema.parse(await response.json());
}

export async function createClient(input: ClientInput): Promise<ClientResponse> {
  return saveClient("/api/v1/clients", "POST", input);
}

export async function updateClient(id: string, input: ClientInput): Promise<ClientResponse> {
  return saveClient(`/api/v1/clients/${id}`, "PATCH", input);
}

export async function archiveClient(id: string): Promise<ClientResponse> {
  return clientCommand(`/api/v1/clients/${id}/archive`);
}

export async function reactivateClient(id: string): Promise<ClientResponse> {
  return clientCommand(`/api/v1/clients/${id}/reactivate`);
}

async function saveClient(
  url: string,
  method: "POST" | "PATCH",
  input: ClientInput,
): Promise<ClientResponse> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ClientInputSchema.parse(input)),
  });
  if (!response.ok) throw await toApiError(response, "Client could not be saved.");
  return ClientResponseSchema.parse(await response.json());
}

async function clientCommand(url: string): Promise<ClientResponse> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw await toApiError(response, "Client status could not be changed.");
  return ClientResponseSchema.parse(await response.json());
}

async function toApiError(response: Response, fallback: string): Promise<ClientApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new ClientApiError(result.data.error.message, result.data.error.fieldErrors);
  }
  return new ClientApiError(`${fallback} Your entries are still here.`);
}
