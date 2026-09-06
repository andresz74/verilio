import { TaskStatusFilterSchema, type TaskDto } from "@verilio/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  InlineError,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useState } from "react";

import {
  archiveTask,
  getTasks,
  reactivateTask,
  taskKeys,
} from "./task-api.js";
import { TaskFormDialog } from "./task-form-dialog.js";

type EditorState = { mode: "create" } | { mode: "edit"; task: TaskDto } | null;

export function ProjectTasks({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(null);
  const [archiveTarget, setArchiveTarget] = useState<TaskDto | null>(null);
  const [statusValue, setStatusValue] = useState("active");
  const [search, setSearch] = useState("");
  const statusResult = TaskStatusFilterSchema.safeParse(statusValue);
  const status = statusResult.success ? statusResult.data : "active";
  const query = { status, search, availability: "all" as const };
  const tasksQuery = useQuery({
    queryKey: taskKeys.list(projectId, query),
    queryFn: () => getTasks(projectId, query),
  });
  const statusMutation = useMutation({
    mutationFn: ({ active, task }: { active: boolean; task: TaskDto }) =>
      active ? reactivateTask(task.id) : archiveTask(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      setArchiveTarget(null);
    },
  });

  return (
    <section
      aria-labelledby="project-tasks-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border-default)] px-5 py-4">
        <div>
          <h2 id="project-tasks-heading" className="m-0 text-base font-semibold text-[var(--color-text-primary)]">
            Tasks
          </h2>
          <p className="mb-0 mt-1 text-sm text-[var(--color-text-secondary)]">
            Project-specific categories for future time entries.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
          <Plus aria-hidden="true" size={15} /> Add task
        </Button>
      </div>

      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_11rem] sm:items-end">
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
            Search tasks
            <span className="relative">
              <Search
                aria-hidden="true"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              />
              <TextInput
                type="search"
                className="pl-9"
                value={search}
                placeholder="Search by task name"
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
            Task status
            <Select value={status} onChange={(event) => setStatusValue(event.target.value)}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </label>
        </div>

        {tasksQuery.isPending ? <Spinner label="Loading tasks" /> : null}
        {tasksQuery.isError ? (
          <InlineError>Tasks could not be loaded. Try again.</InlineError>
        ) : null}
        {statusMutation.isError && !archiveTarget ? (
          <InlineError>Task status could not be changed. Try again.</InlineError>
        ) : null}
        {tasksQuery.data ? (
          <TaskTable
            tasks={tasksQuery.data.tasks}
            status={status}
            search={search}
            statusPendingId={
              statusMutation.isPending ? statusMutation.variables.task.id : null
            }
            onEdit={(task) => setEditor({ mode: "edit", task })}
            onArchive={(task) => {
              statusMutation.reset();
              setArchiveTarget(task);
            }}
            onReactivate={(task) => {
              statusMutation.reset();
              statusMutation.mutate({ task, active: true });
            }}
          />
        ) : null}
      </div>

      {editor ? (
        <TaskFormDialog
          projectId={projectId}
          task={editor.mode === "edit" ? editor.task : null}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
        />
      ) : null}

      {archiveTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              statusMutation.reset();
              setArchiveTarget(null);
            }
          }}
          title={`Archive ${archiveTarget.name}?`}
          description="The task will be excluded from ordinary selection, while historical relationships remain intact."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ task: archiveTarget, active: false })}
              >
                {statusMutation.isPending ? "Archiving…" : "Archive task"}
              </Button>
            </>
          }
        >
          {statusMutation.isError ? (
            <InlineError>Task status could not be changed.</InlineError>
          ) : (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Archiving does not delete this task.
            </p>
          )}
        </Dialog>
      ) : null}
    </section>
  );
}

function TaskTable({
  onArchive,
  onEdit,
  onReactivate,
  search,
  status,
  statusPendingId,
  tasks,
}: {
  onArchive: (task: TaskDto) => void;
  onEdit: (task: TaskDto) => void;
  onReactivate: (task: TaskDto) => void;
  search: string;
  status: "active" | "archived" | "all";
  statusPendingId: string | null;
  tasks: TaskDto[];
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-5 py-8 text-center">
        <p className="m-0 text-sm font-medium text-[var(--color-text-primary)]">
          {search
            ? "No tasks match this search"
            : status === "active"
              ? "No active tasks yet"
              : "No tasks in this view"}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead className="bg-[var(--color-bg-subtle)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th scope="col" className="px-4 py-3">Task</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-[var(--color-border-default)]">
              <th scope="row" className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                {task.name}
              </th>
              <td className="px-4 py-3">
                <StatusBadge tone={task.active ? "success" : "neutral"}>
                  {task.active ? "Active" : "Archived"}
                </StatusBadge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button variant="quiet" size="sm" onClick={() => onEdit(task)}>
                    <Pencil aria-hidden="true" size={15} /> Rename
                  </Button>
                  {task.active ? (
                    <Button variant="quiet" size="sm" onClick={() => onArchive(task)}>
                      <Archive aria-hidden="true" size={15} /> Archive
                    </Button>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={statusPendingId === task.id}
                      onClick={() => onReactivate(task)}
                    >
                      <RotateCcw aria-hidden="true" size={15} />
                      {statusPendingId === task.id ? "Reactivating…" : "Reactivate"}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
