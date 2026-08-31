import {
  ApiErrorSchema,
  BusinessProfileInputSchema,
  SettingsResponseSchema,
  type BusinessProfileInput,
  type SettingsResponse,
} from "@verilio/contracts";

export class SettingsApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "SettingsApiError";
  }
}

export async function getSettings(): Promise<SettingsResponse> {
  const response = await fetch("/api/v1/settings");
  if (!response.ok) throw await toApiError(response);
  return SettingsResponseSchema.parse(await response.json());
}

export async function saveSettings(input: BusinessProfileInput): Promise<SettingsResponse> {
  const response = await fetch("/api/v1/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(BusinessProfileInputSchema.parse(input)),
  });
  if (!response.ok) throw await toApiError(response);
  return SettingsResponseSchema.parse(await response.json());
}

async function toApiError(response: Response): Promise<SettingsApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new SettingsApiError(result.data.error.message, result.data.error.fieldErrors);
  }

  return new SettingsApiError("Verilio could not save your settings. Your entries are still here.");
}

