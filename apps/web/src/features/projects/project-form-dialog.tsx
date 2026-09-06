import { zodResolver } from "@hookform/resolvers/zod";
import {
  ProjectInputSchema,
  type ClientDto,
  type ProjectDto,
  type ProjectInput,
} from "@verilio/contracts";
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  Field,
  InlineError,
  TextArea,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { ClientSelect } from "../clients/client-select.js";
import {
  ProjectApiError,
  createProject,
  projectKeys,
  updateProject,
} from "./project-api.js";

export type ProjectRateDefaults = {
  businessCurrency: string;
  businessRate: string | null;
  clients: ClientDto[];
};

export function ProjectFormDialog({
  defaults,
  onOpenChange,
  project,
}: {
  defaults: ProjectRateDefaults;
  onOpenChange: (open: boolean) => void;
  project: ProjectDto | null;
}) {
  const queryClient = useQueryClient();
  const isEditing = project !== null;
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<ProjectInput>({
    defaultValues: toFormValues(project),
    resolver: zodResolver(ProjectInputSchema),
  });
  const clientId = useWatch({ control, name: "clientId" });
  const rateMode = useWatch({ control, name: "rateMode" });
  const defaultHourlyRate = useWatch({ control, name: "defaultHourlyRate" });
  const selectedClient = defaults.clients.find((client) => client.id === clientId) ?? null;
  const rateModeField = register("rateMode", {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value === "inherit") {
        setValue("defaultHourlyRate", null, { shouldDirty: true, shouldValidate: false });
      } else if (defaultHourlyRate === null) {
        setValue("defaultHourlyRate", "", { shouldDirty: true, shouldValidate: false });
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: (input: ProjectInput) =>
      project ? updateProject(project.id, input) : createProject(input),
    onSuccess: (response) => {
      queryClient.setQueryData(projectKeys.detail(response.project.id), response);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onOpenChange(false);
    },
    onError: (error) => {
      if (!(error instanceof ProjectApiError) || !error.fieldErrors) return;
      let shouldFocus = true;
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (!messages?.[0] || !(field in toFormValues(project))) continue;
        setError(
          field as keyof ProjectInput,
          { type: "server", message: messages[0] },
          { shouldFocus },
        );
        shouldFocus = false;
      }
    },
  });

  const formId = isEditing ? `edit-project-${project.id}` : "create-project";

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit project" : "Create project"}
      description="Projects organize client work and establish defaults for future time entries."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button form={formId} type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending
              ? "Saving…"
              : isEditing
                ? "Save project"
                : "Create project"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="grid gap-5"
        onSubmit={(event) =>
          void handleSubmit((values) => saveMutation.mutate(values))(event)
        }
      >
        {saveMutation.isError ? (
          <InlineError>
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Project could not be saved. Your entries are still here."}
          </InlineError>
        ) : null}

        <Controller
          control={control}
          name="clientId"
          render={({ field }) => (
            <Field
              htmlFor="projectClient"
              label="Client"
              required
              error={errors.clientId?.message}
              hint="Projects belong to exactly one client."
            >
              <ClientSelect
                id="projectClient"
                includeArchived={isEditing}
                value={field.value}
                onBlur={field.onBlur}
                onChange={field.onChange}
                aria-invalid={Boolean(errors.clientId)}
                aria-describedby={errors.clientId ? "projectClient-error" : "projectClient-hint"}
              />
            </Field>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <Field
            htmlFor="projectName"
            label="Project name"
            required
            error={errors.name?.message}
          >
            <TextInput
              id="projectName"
              autoFocus
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "projectName-error" : undefined}
              {...register("name")}
            />
          </Field>
          <Field
            htmlFor="projectColor"
            label="Color"
            hint="Optional #RRGGBB"
            error={errors.color?.message}
          >
            <TextInput
              id="projectColor"
              placeholder="#4F46E5"
              maxLength={7}
              aria-invalid={Boolean(errors.color)}
              aria-describedby={errors.color ? "projectColor-error" : "projectColor-hint"}
              {...register("color")}
            />
          </Field>
        </div>

        <fieldset className="m-0 grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-4">
          <legend className="px-1 text-sm font-medium text-[var(--color-text-primary)]">
            Hourly rate
          </legend>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-text-primary)]">
            <input
              type="radio"
              value="inherit"
              className="mt-0.5 size-4 accent-[var(--color-accent-default)]"
              {...rateModeField}
            />
            <span>
              <span className="block font-medium">
                {inheritedRateLabel(selectedClient, defaults)}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Future work resolves Client first, then Business.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-text-primary)]">
            <input
              type="radio"
              value="override"
              className="mt-0.5 size-4 accent-[var(--color-accent-default)]"
              {...rateModeField}
            />
            <span className="font-medium">Override hourly rate</span>
          </label>
          {rateMode === "override" ? (
            <div className="pl-7">
              <Field
                htmlFor="projectHourlyRate"
                label="Hourly rate override"
                required
                hint={selectedClient ? `Amount in ${selectedClient.currency}` : undefined}
                error={errors.defaultHourlyRate?.message}
              >
                <TextInput
                  id="projectHourlyRate"
                  inputMode="decimal"
                  aria-invalid={Boolean(errors.defaultHourlyRate)}
                  aria-describedby={
                    errors.defaultHourlyRate
                      ? "projectHourlyRate-error"
                      : selectedClient
                        ? "projectHourlyRate-hint"
                        : undefined
                  }
                  {...register("defaultHourlyRate")}
                />
              </Field>
            </div>
          ) : null}
        </fieldset>

        <Controller
          control={control}
          name="billableByDefault"
          render={({ field }) => (
            <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-4 text-sm text-[var(--color-text-primary)]">
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-describedby="projectBillable-hint"
              />
              <span>
                <span className="block font-medium">Billable by default</span>
                <span id="projectBillable-hint" className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                  New time entries for this project start as billable.
                </span>
              </span>
            </label>
          )}
        />

        <Field htmlFor="projectNote" label="Note" error={errors.note?.message}>
          <TextArea
            id="projectNote"
            rows={4}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={errors.note ? "projectNote-error" : undefined}
            {...register("note")}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function toFormValues(project: ProjectDto | null): ProjectInput {
  return {
    clientId: project?.clientId ?? "",
    name: project?.name ?? "",
    color: project?.color ?? "",
    rateMode: project?.defaultHourlyRate === null || !project ? "inherit" : "override",
    defaultHourlyRate: project?.defaultHourlyRate ?? null,
    billableByDefault: project?.billableByDefault ?? true,
    note: project?.note ?? "",
  };
}

function inheritedRateLabel(
  client: ClientDto | null,
  defaults: ProjectRateDefaults,
): string {
  if (client?.defaultHourlyRate !== null && client?.defaultHourlyRate !== undefined) {
    return `Use inherited rate — Client ${formatRate(client.defaultHourlyRate, client.currency)}/hr`;
  }
  if (defaults.businessRate !== null) {
    return `Use inherited rate — Business ${formatRate(defaults.businessRate, defaults.businessCurrency)}/hr`;
  }
  return "Use inherited rate";
}

function formatRate(rate: string, currency: string): string {
  const numericRate = Number(rate);
  return Number.isFinite(numericRate)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 4,
      }).format(numericRate)
    : `${currency} ${rate}`;
}
