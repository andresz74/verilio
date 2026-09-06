import { zodResolver } from "@hookform/resolvers/zod";
import { TaskInputSchema, type TaskDto, type TaskInput } from "@verilio/contracts";
import { Button, Dialog, DialogClose, Field, InlineError, TextInput } from "@verilio/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import {
  TaskApiError,
  createTask,
  taskKeys,
  updateTask,
} from "./task-api.js";

export function TaskFormDialog({
  onOpenChange,
  projectId,
  task,
}: {
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task: TaskDto | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = task !== null;
  const {
    formState: { errors },
    handleSubmit,
    register,
    setError,
  } = useForm<TaskInput>({
    defaultValues: { name: task?.name ?? "" },
    resolver: zodResolver(TaskInputSchema),
  });
  const mutation = useMutation({
    mutationFn: (input: TaskInput) =>
      task ? updateTask(task.id, input) : createTask(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      onOpenChange(false);
    },
    onError: (error) => {
      if (!(error instanceof TaskApiError) || !error.fieldErrors?.name?.[0]) return;
      setError("name", { type: "server", message: error.fieldErrors.name[0] }, { shouldFocus: true });
    },
  });
  const formId = isEditing ? `edit-task-${task.id}` : `create-task-${projectId}`;

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={isEditing ? "Rename task" : "Create task"}
      description="Tasks are project-specific and optional on future time entries."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button form={formId} type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEditing ? "Save task" : "Create task"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="grid gap-5"
        onSubmit={(event) => void handleSubmit((input) => mutation.mutate(input))(event)}
      >
        {mutation.isError ? (
          <InlineError>
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Task could not be saved. Your entry is still here."}
          </InlineError>
        ) : null}
        <Field htmlFor="taskName" label="Task name" required error={errors.name?.message}>
          <TextInput
            id="taskName"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "taskName-error" : undefined}
            {...register("name")}
          />
        </Field>
      </form>
    </Dialog>
  );
}
