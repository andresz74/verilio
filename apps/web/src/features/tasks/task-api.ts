import {
  ApiErrorSchema,
  TaskInputSchema,
  TaskListResponseSchema,
  TaskResponseSchema,
  type TaskInput,
  type TaskListQuery,
  type TaskListResponse,
  type TaskResponse,
} from "@verilio/contracts";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (projectId: string, query: TaskListQuery) =>
    ["tasks", "list", projectId, query] as const,
};

export class TaskApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> | null = null,
  ) {
    super(message);
    this.name = "TaskApiError";
  }
}

export async function getTasks(
  projectId: string,
  query: TaskListQuery,
): Promise<TaskListResponse> {
  const search = new URLSearchParams({
    status: query.status,
    availability: query.availability,
  });
  if (query.search) search.set("search", query.search);
  const response = await fetch(`/api/v1/projects/${projectId}/tasks?${search.toString()}`);
  if (!response.ok) throw await toApiError(response, "Tasks could not be loaded.");
  return TaskListResponseSchema.parse(await response.json());
}

export async function createTask(projectId: string, input: TaskInput): Promise<TaskResponse> {
  return saveTask(`/api/v1/projects/${projectId}/tasks`, "POST", input);
}

export async function updateTask(id: string, input: TaskInput): Promise<TaskResponse> {
  return saveTask(`/api/v1/tasks/${id}`, "PATCH", input);
}

export async function archiveTask(id: string): Promise<TaskResponse> {
  return taskCommand(`/api/v1/tasks/${id}/archive`);
}

export async function reactivateTask(id: string): Promise<TaskResponse> {
  return taskCommand(`/api/v1/tasks/${id}/reactivate`);
}

async function saveTask(
  url: string,
  method: "POST" | "PATCH",
  input: TaskInput,
): Promise<TaskResponse> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(TaskInputSchema.parse(input)),
  });
  if (!response.ok) throw await toApiError(response, "Task could not be saved.");
  return TaskResponseSchema.parse(await response.json());
}

async function taskCommand(url: string): Promise<TaskResponse> {
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw await toApiError(response, "Task status could not be changed.");
  return TaskResponseSchema.parse(await response.json());
}

async function toApiError(response: Response, fallback: string): Promise<TaskApiError> {
  const body: unknown = await response.json().catch(() => null);
  const result = ApiErrorSchema.safeParse(body);
  if (result.success) {
    return new TaskApiError(result.data.error.message, result.data.error.fieldErrors);
  }
  return new TaskApiError(`${fallback} Your entries are still here.`);
}
