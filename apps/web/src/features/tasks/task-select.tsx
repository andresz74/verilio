import { Select } from "@verilio/ui";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { getTasks, taskKeys } from "./task-api.js";

export type TaskSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  includeArchived?: boolean;
  placeholder?: string;
  projectId?: string | null;
};

export const TaskSelect = forwardRef<HTMLSelectElement, TaskSelectProps>(
  function TaskSelect(
    { disabled, includeArchived = false, placeholder = "No task", projectId, ...props },
    ref,
  ) {
    const query = {
      status: includeArchived ? ("all" as const) : ("active" as const),
      search: "",
      availability: includeArchived ? ("all" as const) : ("new-work" as const),
    };
    const tasksQuery = useQuery({
      queryKey: taskKeys.list(projectId ?? "", query),
      queryFn: () => getTasks(projectId ?? "", query),
      enabled: Boolean(projectId),
    });
    const tasks = (tasksQuery.data?.tasks ?? []).filter(
      (task) => task.projectId === projectId && (includeArchived || task.active),
    );

    const emptyLabel = !projectId
      ? "Select a project first"
      : tasksQuery.isPending
        ? "Loading tasks…"
        : tasksQuery.isError
          ? "Tasks unavailable"
          : tasks.length === 0
            ? "No active tasks"
            : placeholder;

    return (
      <Select
        ref={ref}
        disabled={disabled || !projectId || tasksQuery.isPending || tasksQuery.isError}
        aria-busy={Boolean(projectId) && tasksQuery.isPending}
        {...props}
      >
        <option value="">{emptyLabel}</option>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.name}
            {!task.active ? " — Archived" : ""}
          </option>
        ))}
      </Select>
    );
  },
);
