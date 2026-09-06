import { ClientSelect } from "../clients/client-select.js";
import { TaskSelect } from "../tasks/task-select.js";
import { ProjectSelect } from "./project-select.js";

export type HierarchySelection = {
  clientId: string;
  projectId: string;
  taskId: string;
};

export function HierarchySelects({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (value: HierarchySelection) => void;
  value: HierarchySelection;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
        Client
        <ClientSelect
          disabled={disabled}
          value={value.clientId}
          onChange={(event) =>
            onChange({ clientId: event.target.value, projectId: "", taskId: "" })
          }
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
        Project
        <ProjectSelect
          clientId={value.clientId}
          disabled={disabled}
          value={value.projectId}
          onChange={(event) =>
            onChange({ ...value, projectId: event.target.value, taskId: "" })
          }
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
        Task (optional)
        <TaskSelect
          projectId={value.projectId}
          disabled={disabled}
          value={value.taskId}
          onChange={(event) => onChange({ ...value, taskId: event.target.value })}
        />
      </label>
    </div>
  );
}
