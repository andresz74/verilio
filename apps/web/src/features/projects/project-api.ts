import {
  ApiErrorSchema,
  ProjectInputSchema,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  type ProjectInput,
  type ProjectListQuery,
  type ProjectListResponse,
  type ProjectResponse,
} from "@verilio/contracts";

export const projectKeys = {
  all: ["projects"] as const,
  list: (query: ProjectListQuery) => ["projects", "list", query] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export class ProjectApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "ProjectApiError";
  }
}

export async function getProjects(query: ProjectListQuery): Promise<ProjectListResponse> {
  const search = new URLSearchParams({
    status: query.status,
    availability: query.availability,
  });
  if (query.clientId) search.set("clientId", query.clientId);
  if (query.search) search.set("search", query.search);
  const response = await fetch(`/api/v1/projects?${search.toString()}`);
  if (!response.ok) throw await toApiError(response, "Projects could not be loaded.");
  return ProjectListResponseSchema.parse(await response.json());
}

export async function getProject(id: string): Promise<ProjectResponse> {
  const response = await fetch(`/api/v1/projects/${id}`);
  if (!response.ok) throw await toApiError(response, "Project could not be loaded.");
  return ProjectResponseSchema.parse(await response.json());
}

export async function createProject(input: ProjectInput): Promise<ProjectResponse> {
  return saveProject("/api/v1/projects", "POST", input);
}

export async function updateProject(
  id: string,
  input: ProjectInput,
): Promise<ProjectResponse> {
  return saveProject(`/api/v1/projects/${id}`, "PATCH", input);
}

export async function archiveProject(id: string): Promise<ProjectResponse> {
  return projectCommand(`/api/v1/projects/${id}/archive`);
}

export async function reactivateProject(id: string): Promise<ProjectResponse> {
  return projectCommand(`/api/v1/projects/${id}/reactivate`);
}

async function saveProject(
  url: string,
  method: "POST" | "PATCH",
  input: ProjectInput,
): Promise<ProjectResponse> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ProjectInputSchema.parse(input)),
  });
  if (!response.ok) throw await toApiError(response, "Project could not be saved.");
  return ProjectResponseSchema.parse(await response.json());
}

async function projectCommand(url: string): Promise<ProjectResponse> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw await toApiError(response, "Project status could not be changed.");
  return ProjectResponseSchema.parse(await response.json());
}

async function toApiError(response: Response, fallback: string): Promise<ProjectApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new ProjectApiError(result.data.error.message, result.data.error.fieldErrors);
  }
  return new ProjectApiError(`${fallback} Your entries are still here.`);
}
