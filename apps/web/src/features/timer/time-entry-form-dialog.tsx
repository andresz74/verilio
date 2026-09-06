import { zodResolver } from "@hookform/resolvers/zod";
import type {
  ManualTimeEntryInput,
  TimeEntryDto,
  TimeEntryUpdateInput,
} from "@verilio/contracts";
import {
  Button,
  Checkbox,
  DateInput,
  Dialog,
  DialogClose,
  DurationInput,
  Field,
  InlineError,
  TextInput,
  TimeInput,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { HierarchySelects } from "../projects/hierarchy-selects.js";
import { getProjects, projectKeys } from "../projects/project-api.js";
import {
  TimeEntryApiError,
  createTimeEntry,
  timerKeys,
  updateTimeEntry,
} from "./time-entry-api.js";
import {
  formatDurationInput,
  instantFields,
  parseDurationText,
} from "./time-format.js";

const FormSchema = z.object({
  mode: z.enum(["range", "duration"]),
  workDate: z.string().min(1, "Date is required"),
  startTime: z.string(),
  endTime: z.string(),
  endsNextDay: z.boolean(),
  durationText: z.string(),
  description: z.string().trim().min(1, "Description is required"),
  clientId: z.string().min(1, "Client is required"),
  projectId: z.string().min(1, "Project is required"),
  taskId: z.string(),
  billable: z.boolean(),
}).superRefine((value, context) => {
  if (value.mode === "range") {
    if (!value.startTime) context.addIssue({ code: "custom", path: ["startTime"], message: "Start is required" });
    if (!value.endTime) context.addIssue({ code: "custom", path: ["endTime"], message: "End is required" });
  } else if (!parseDurationText(value.durationText)) {
    context.addIssue({ code: "custom", path: ["durationText"], message: "Enter a positive duration such as 1:30 or 90m" });
  }
});

type FormValues = z.infer<typeof FormSchema>;

export function TimeEntryFormDialog({
  entry,
  onOpenChange,
  timezone,
}: {
  entry: TimeEntryDto | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const defaults = toDefaults(entry, timezone);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<FormValues>({ defaultValues: defaults, resolver: zodResolver(FormSchema) });
  const mode = useWatch({ control, name: "mode" });
  const clientId = useWatch({ control, name: "clientId" });
  const projectId = useWatch({ control, name: "projectId" });
  const taskId = useWatch({ control, name: "taskId" });
  const projectQuery = {
    status: "active" as const,
    clientId: clientId || undefined,
    search: "",
    availability: "new-work" as const,
  };
  const projectsQuery = useQuery({
    queryKey: projectKeys.list(projectQuery),
    queryFn: () => getProjects(projectQuery),
    enabled: Boolean(clientId) && !entry,
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const common = {
        clientId: values.clientId,
        projectId: values.projectId,
        taskId: values.taskId || null,
        description: values.description,
        billable: values.billable,
        workDate: values.workDate,
      };
      const input = values.mode === "duration"
        ? { ...common, mode: "duration" as const, durationSeconds: parseDurationText(values.durationText) ?? 0 }
        : {
            ...common,
            mode: entry?.mode === "timer" ? "timer" as const : "range" as const,
            startTime: values.startTime,
            endTime: values.endTime,
            endsNextDay: values.endsNextDay,
          };
      return entry
        ? updateTimeEntry(entry.id, input as TimeEntryUpdateInput)
        : createTimeEntry(input as ManualTimeEntryInput);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: timerKeys.recent });
      void queryClient.invalidateQueries({ queryKey: timerKeys.current });
      onOpenChange(false);
    },
    onError: (error) => {
      if (!(error instanceof TimeEntryApiError) || !error.fieldErrors) return;
      let focus = true;
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (!messages?.[0] || !(field in defaults)) continue;
        setError(field as keyof FormValues, { type: "server", message: messages[0] }, { shouldFocus: focus });
        focus = false;
      }
    },
  });
  const formId = entry ? `edit-time-entry-${entry.id}` : "create-time-entry";

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={entry ? "Edit time entry" : "Add time manually"}
      description="Work dates stay in your Business timezone. Completed billable work keeps its saved historical rate."
      footer={<>
        <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
        <Button type="submit" form={formId} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : entry ? "Save entry" : "Add time"}
        </Button>
      </>}
    >
      <form id={formId} noValidate className="grid gap-5" onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)}>
        {mutation.isError ? <InlineError>{mutation.error instanceof Error ? mutation.error.message : "Time entry could not be saved. Your entries are still here."}</InlineError> : null}
        {!entry ? (
          <fieldset className="flex gap-4 border-0 p-0">
            <legend className="sr-only">Entry mode</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" value="range" {...register("mode")} /> Start / End</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" value="duration" {...register("mode")} /> Duration</label>
          </fieldset>
        ) : <p className="m-0 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{entry.mode === "duration" ? "Duration entry" : "Start / End entry"}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field htmlFor="timeWorkDate" label="Work date" required error={errors.workDate?.message}>
            <DateInput id="timeWorkDate" aria-invalid={Boolean(errors.workDate)} {...register("workDate")} />
          </Field>
          {mode === "range" ? <>
            <Field htmlFor="timeStart" label="Start" required error={errors.startTime?.message}>
              <TimeInput id="timeStart" aria-invalid={Boolean(errors.startTime)} {...register("startTime")} />
            </Field>
            <Field htmlFor="timeEnd" label="End" required error={errors.endTime?.message}>
              <TimeInput id="timeEnd" aria-invalid={Boolean(errors.endTime)} {...register("endTime")} />
            </Field>
          </> : (
            <Field htmlFor="timeDuration" label="Duration" required error={errors.durationText?.message} hint="Examples: 1:30, 1h 30m, or 90m">
              <DurationInput id="timeDuration" aria-invalid={Boolean(errors.durationText)} {...register("durationText")} />
            </Field>
          )}
        </div>
        {mode === "range" ? (
          <Controller control={control} name="endsNextDay" render={({ field }) => (
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              End is on the next calendar day
            </label>
          )} />
        ) : null}
        <Field htmlFor="timeDescription" label="Description" required error={errors.description?.message}>
          <TextInput id="timeDescription" autoFocus aria-invalid={Boolean(errors.description)} {...register("description")} />
        </Field>
        <HierarchySelects
          value={{ clientId, projectId, taskId }}
          onChange={(value) => {
            if (!entry && value.projectId && value.projectId !== projectId) {
              const project = projectsQuery.data?.projects.find(
                (candidate) => candidate.id === value.projectId,
              );
              if (project) setValue("billable", project.billableByDefault, { shouldDirty: true });
            }
            setValue("clientId", value.clientId, { shouldDirty: true, shouldValidate: true });
            setValue("projectId", value.projectId, { shouldDirty: true, shouldValidate: true });
            setValue("taskId", value.taskId, { shouldDirty: true, shouldValidate: true });
          }}
        />
        {(errors.clientId || errors.projectId || errors.taskId) ? (
          <p role="alert" className="m-0 text-xs text-[var(--color-danger-default)]">
            {errors.clientId?.message ?? errors.projectId?.message ?? errors.taskId?.message}
          </p>
        ) : null}
        <Controller control={control} name="billable" render={({ field }) => (
          <label className="flex items-center gap-3 text-sm font-medium">
            <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /> Billable
          </label>
        )} />
      </form>
    </Dialog>
  );
}

function toDefaults(entry: TimeEntryDto | null, timezone: string): FormValues {
  if (!entry) {
    const today = instantFields(new Date().toISOString(), timezone).date;
    return { mode: "range", workDate: today, startTime: "09:00", endTime: "10:00", endsNextDay: false, durationText: "1:00", description: "", clientId: "", projectId: "", taskId: "", billable: true };
  }
  const start = entry.startAt ? instantFields(entry.startAt, timezone) : null;
  const end = entry.endAt ? instantFields(entry.endAt, timezone) : null;
  return {
    mode: entry.mode === "duration" ? "duration" : "range",
    workDate: entry.workDate,
    startTime: start?.time ?? "",
    endTime: end?.time ?? "",
    endsNextDay: Boolean(start && end && start.date !== end.date),
    durationText: formatDurationInput(entry.durationSeconds),
    description: entry.description,
    clientId: entry.clientId,
    projectId: entry.projectId,
    taskId: entry.taskId ?? "",
    billable: entry.billable,
  };
}
