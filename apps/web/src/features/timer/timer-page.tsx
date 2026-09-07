import { zodResolver } from "@hookform/resolvers/zod";
import type { TimeEntryDto, TimerStartInput } from "@verilio/contracts";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  EmptyState,
  Field,
  InlineError,
  StatusBadge,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Plus, Square } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { PageHeader } from "../../app/app-shell.js";
import { HierarchySelects } from "../projects/hierarchy-selects.js";
import { getProjects, projectKeys } from "../projects/project-api.js";
import { getSettings } from "../settings/settings-api.js";
import { ElapsedTime } from "./elapsed-time.js";
import { DeleteTimeEntryDialog } from "./delete-time-entry-dialog.js";
import {
  TimeEntryApiError,
  getCurrentTimer,
  getRecentTimeEntries,
  startTimer,
  stopTimer,
  timerKeys,
} from "./time-entry-api.js";
import { TimeEntryFormDialog } from "./time-entry-form-dialog.js";
import { formatDuration, hierarchyLabel } from "./time-format.js";

const TimerFormSchema = z.object({
  description: z.string().trim().max(1_000),
  clientId: z.string().min(1, "Client is required"),
  projectId: z.string().min(1, "Project is required"),
  taskId: z.string(),
  billable: z.boolean(),
});
type TimerFormValues = z.infer<typeof TimerFormSchema>;

export function TimerPage() {
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntryDto | null>(null);
  const [deleting, setDeleting] = useState<TimeEntryDto | null>(null);
  const [pendingStart, setPendingStart] = useState<TimerStartInput | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const currentQuery = useQuery({ queryKey: timerKeys.current, queryFn: getCurrentTimer });
  const recentQuery = useQuery({ queryKey: timerKeys.recent, queryFn: getRecentTimeEntries });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const stopMutation = useMutation({
    mutationFn: stopTimer,
    onSuccess: (response) => {
      queryClient.setQueryData(timerKeys.current, { timer: null, serverNow: response.serverNow });
      void queryClient.invalidateQueries({ queryKey: timerKeys.recent });
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async (input: TimerStartInput) => {
      await stopTimer();
      try {
        return await startTimer(input);
      } catch (error) {
        throw new Error(
          `The current timer was stopped, but the new timer could not be started. ${error instanceof Error ? error.message : "Review the form and try again."}`,
          { cause: error },
        );
      }
    },
    onSuccess: (response) => {
      queryClient.setQueryData(timerKeys.current, response);
      void queryClient.invalidateQueries({ queryKey: timerKeys.recent });
      setPendingStart(null);
      setReplaceError(null);
    },
    onError: (error) => {
      setReplaceError(error instanceof Error ? error.message : "Timer replacement failed.");
      setPendingStart(null);
      void queryClient.invalidateQueries({ queryKey: timerKeys.current });
      void queryClient.invalidateQueries({ queryKey: timerKeys.recent });
    },
  });

  const timezone = settingsQuery.data?.settings?.timezone ?? "UTC";
  const timer = currentQuery.data?.timer ?? null;

  return (
    <main>
      <PageHeader
        title="Timer"
        description="Capture work with authoritative server time and a historical billing-rate snapshot."
        actions={<Button onClick={() => setManualOpen(true)}><Plus aria-hidden="true" size={16} /> Add time</Button>}
      />
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:px-8 lg:px-10">
        {currentQuery.isError ? <InlineError>Timer state could not be loaded. No visual timer has been started.</InlineError> : null}
        {replaceError ? <InlineError>{replaceError}</InlineError> : null}
        {timer && currentQuery.data ? (
          <section aria-label="Running timer" className="rounded-[var(--radius-lg)] border border-[var(--color-accent-default)] bg-[var(--color-accent-subtle)] p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-active)]">Running</p>
                <h2 className="mb-0 mt-1 text-lg font-semibold">{timer.description || "Untitled work"}</h2>
                <p className="mb-0 mt-1 text-sm text-[var(--color-text-secondary)]">{hierarchyLabel(timer)} · {timer.billable ? "Billable" : "Non-billable"}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-3xl font-semibold tabular-nums"><ElapsedTime startAt={timer.startAt ?? currentQuery.data.serverNow} serverNow={currentQuery.data.serverNow} /></span>
                <Button variant="secondary" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}><Square aria-hidden="true" size={15} /> {stopMutation.isPending ? "Stopping…" : "Stop"}</Button>
              </div>
            </div>
            {stopMutation.isError ? <div className="mt-4"><InlineError>Timer could not be stopped. It is still recorded as running.</InlineError></div> : null}
          </section>
        ) : null}

        <TimerComposer
          running={Boolean(timer)}
          onConflict={(input) => setPendingStart(input)}
        />

        <section aria-labelledby="recent-time-heading" className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-default)] px-5 py-4">
            <div><h2 id="recent-time-heading" className="m-0 text-base font-semibold">Recent time</h2><p className="mb-0 mt-1 text-xs text-[var(--color-text-muted)]">A compact correction view. Full history belongs in Timesheet.</p></div>
          </div>
          {recentQuery.isPending ? <p className="p-5 text-sm text-[var(--color-text-secondary)]">Loading recent time…</p> : recentQuery.isError ? <div className="p-5"><InlineError>Recent time could not be loaded.</InlineError></div> : recentQuery.data.entries.length === 0 ? <div className="p-5"><EmptyState title="No completed time yet" description="Stop a timer or add time manually to see it here." /></div> : (
            <div className="divide-y divide-[var(--color-border-default)]">
              {recentQuery.data.entries.map((entry) => (
                <article key={entry.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h3 className="m-0 truncate text-sm font-semibold">{entry.description}</h3><p className="mb-0 mt-1 text-xs text-[var(--color-text-secondary)]">{entry.workDate} · {hierarchyLabel(entry)}</p><div className="mt-2 flex gap-2"><StatusBadge tone={entry.billable ? "success" : "neutral"}>{entry.billable ? `Billable · ${entry.hourlyRate ?? "—"}/hr` : "Non-billable"}</StatusBadge><StatusBadge tone="neutral">{entry.mode}</StatusBadge></div></div>
                  <div className="flex shrink-0 items-center gap-2"><strong className="mr-2 text-sm tabular-nums">{formatDuration(entry.durationSeconds)}</strong>{entry.invoice ? <Link className="inline-flex min-h-8 items-center px-2 text-sm font-semibold text-[var(--color-accent-active)] underline" to={`/invoices/${entry.invoice.id}`}>View {entry.invoice.invoiceNumber}</Link> : <><Button size="sm" variant="secondary" onClick={() => setEditing(entry)}>Edit</Button><Button size="sm" variant="quiet" onClick={() => setDeleting(entry)}>Delete</Button></>}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {manualOpen ? <TimeEntryFormDialog entry={null} timezone={timezone} onOpenChange={setManualOpen} /> : null}
      {editing ? <TimeEntryFormDialog entry={editing} timezone={timezone} onOpenChange={(open) => { if (!open) setEditing(null); }} /> : null}
      {pendingStart ? (
        <Dialog open onOpenChange={(open) => { if (!open) setPendingStart(null); }} title="A timer is already running" description="Keep the current timer, or stop it and start the work you just entered." footer={<><DialogClose asChild><Button variant="secondary">Keep current timer</Button></DialogClose><Button disabled={replaceMutation.isPending} onClick={() => replaceMutation.mutate(pendingStart)}>{replaceMutation.isPending ? "Switching…" : "Stop current and start this one"}</Button></>}><p className="m-0 text-sm text-[var(--color-text-secondary)]">Verilio will save the current entry before attempting the new start. If the second step fails, it will say so explicitly.</p></Dialog>
      ) : null}
      {deleting ? <DeleteTimeEntryDialog entry={deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} /> : null}
    </main>
  );
}

function TimerComposer({ running, onConflict }: { running: boolean; onConflict: (input: TimerStartInput) => void }) {
  const queryClient = useQueryClient();
  const { control, formState: { errors }, handleSubmit, register, setError, setValue, reset } = useForm<TimerFormValues>({
    defaultValues: { description: "", clientId: "", projectId: "", taskId: "", billable: true },
    resolver: zodResolver(TimerFormSchema),
  });
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
    enabled: Boolean(clientId),
  });
  const mutation = useMutation({
    mutationFn: (values: TimerFormValues) => startTimer({ ...values, taskId: values.taskId || null }),
    onSuccess: (response) => {
      queryClient.setQueryData(timerKeys.current, response);
      reset();
    },
    onError: (error, values) => {
      if (error instanceof TimeEntryApiError && error.code === "TIMER_ALREADY_RUNNING") {
        onConflict({ ...values, taskId: values.taskId || null });
        return;
      }
      if (!(error instanceof TimeEntryApiError) || !error.fieldErrors) return;
      let focus = true;
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (!messages?.[0] || !["description", "clientId", "projectId", "taskId", "billable"].includes(field)) continue;
        setError(field as keyof TimerFormValues, { type: "server", message: messages[0] }, { shouldFocus: focus });
        focus = false;
      }
    },
  });
  return (
    <section aria-label={running ? "Start something else" : "What are you working on?"} className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5">
      <div className="mb-5"><h2 id="timer-composer-heading" className="m-0 text-base font-semibold">{running ? "Start something else" : "What are you working on?"}</h2>{running ? <p className="mb-0 mt-1 text-xs text-[var(--color-text-muted)]">Starting this will ask what to do with the current timer.</p> : null}</div>
      <form noValidate className="grid gap-5" onSubmit={(event) => void handleSubmit((values) => mutation.mutate(values))(event)}>
        {mutation.isError && !(mutation.error instanceof TimeEntryApiError && mutation.error.code === "TIMER_ALREADY_RUNNING") ? <InlineError>Timer could not be started. No new time is being recorded. {mutation.error instanceof Error ? mutation.error.message : ""}</InlineError> : null}
        <Field htmlFor="timerDescription" label="Description" error={errors.description?.message}><TextInput id="timerDescription" autoFocus placeholder="What are you working on?" {...register("description")} /></Field>
        <HierarchySelects value={{ clientId, projectId, taskId }} onChange={(value) => {
          if (value.projectId && value.projectId !== projectId) {
            const project = projectsQuery.data?.projects.find(
              (candidate) => candidate.id === value.projectId,
            );
            if (project) setValue("billable", project.billableByDefault, { shouldDirty: true });
          }
          setValue("clientId", value.clientId, { shouldDirty: true, shouldValidate: true });
          setValue("projectId", value.projectId, { shouldDirty: true, shouldValidate: true });
          setValue("taskId", value.taskId, { shouldDirty: true, shouldValidate: true });
        }} />
        {(errors.clientId || errors.projectId || errors.taskId) ? <p role="alert" className="m-0 text-xs text-[var(--color-danger-default)]">{errors.clientId?.message ?? errors.projectId?.message ?? errors.taskId?.message}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Controller control={control} name="billable" render={({ field }) => <label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /> Billable</label>} />
          <Button type="submit" disabled={mutation.isPending}><Clock3 aria-hidden="true" size={16} /> {mutation.isPending ? "Starting…" : "Start"}</Button>
        </div>
      </form>
    </section>
  );
}
