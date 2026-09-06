import { z } from "zod";

import { IdSchema } from "./foundation.js";

export const TaskInputSchema = z.object({
  name: z.string().trim().min(1, "Task name is required").max(160),
});
export type TaskInput = z.infer<typeof TaskInputSchema>;

export const TaskDtoSchema = z.object({
  id: IdSchema,
  projectId: IdSchema,
  name: z.string(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TaskDto = z.infer<typeof TaskDtoSchema>;

export const TaskStatusFilterSchema = z.enum(["active", "archived", "all"]);
export type TaskStatusFilter = z.infer<typeof TaskStatusFilterSchema>;

export const TaskListQuerySchema = z.object({
  status: TaskStatusFilterSchema.default("active"),
  search: z.string().trim().max(160).default(""),
  availability: z.enum(["all", "new-work"]).default("all"),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const ProjectTaskParamsSchema = z.object({ id: IdSchema });
export const TaskIdParamsSchema = z.object({ id: IdSchema });

export const TaskResponseSchema = z.object({ task: TaskDtoSchema });
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.object({ tasks: z.array(TaskDtoSchema) });
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
