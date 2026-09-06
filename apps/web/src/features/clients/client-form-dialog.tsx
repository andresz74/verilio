import { zodResolver } from "@hookform/resolvers/zod";
import {
  ClientInputSchema,
  type ClientDto,
  type ClientInput,
} from "@verilio/contracts";
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  InlineError,
  TextArea,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ChangeEvent } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  ClientApiError,
  clientKeys,
  createClient,
  updateClient,
} from "./client-api.js";

export type BusinessRateDefaults = {
  currency: string;
  hourlyRate: string | null;
};

export function ClientFormDialog({
  businessDefaults,
  client,
  onOpenChange,
}: {
  businessDefaults: BusinessRateDefaults;
  client: ClientDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = client !== null;
  const {
    formState: { errors, isDirty },
    control,
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
  } = useForm<ClientInput>({
    defaultValues: toFormValues(client, businessDefaults.currency),
    resolver: zodResolver(ClientInputSchema),
  });
  const rateMode = useWatch({ control, name: "rateMode" });
  const defaultHourlyRate = useWatch({ control, name: "defaultHourlyRate" });
  const rateModeField = register("rateMode", {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.value === "inherit") {
        setValue("defaultHourlyRate", null, {
          shouldDirty: true,
          shouldValidate: false,
        });
      } else if (defaultHourlyRate === null) {
        setValue("defaultHourlyRate", "", {
          shouldDirty: true,
          shouldValidate: false,
        });
      }
    },
  });

  useEffect(() => {
    if (!isDirty) reset(toFormValues(client, businessDefaults.currency));
  }, [businessDefaults.currency, client, isDirty, reset]);

  const saveMutation = useMutation({
    mutationFn: (input: ClientInput) =>
      client ? updateClient(client.id, input) : createClient(input),
    onSuccess: (response) => {
      queryClient.setQueryData(clientKeys.detail(response.client.id), response);
      void queryClient.invalidateQueries({ queryKey: clientKeys.all });
      onOpenChange(false);
    },
    onError: (error) => {
      if (!(error instanceof ClientApiError) || !error.fieldErrors) return;
      let shouldFocus = true;
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (!messages?.[0] || !(field in toFormValues(client, businessDefaults.currency))) {
          continue;
        }
        setError(
          field as keyof ClientInput,
          { type: "server", message: messages[0] },
          { shouldFocus },
        );
        shouldFocus = false;
      }
    },
  });

  const formId = isEditing ? `edit-client-${client.id}` : "create-client";

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit client" : "Create client"}
      description="Client details become defaults for future projects, time, and invoices."
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button form={formId} type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending
              ? "Saving…"
              : isEditing
                ? "Save client"
                : "Create client"}
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
              : "Client could not be saved. Your entries are still here."}
          </InlineError>
        ) : null}

        <Field htmlFor="clientName" label="Client name" required error={errors.name?.message}>
          <TextInput
            id="clientName"
            autoComplete="organization"
            autoFocus
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "clientName-error" : undefined}
            {...register("name")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field htmlFor="clientEmail" label="Email" error={errors.email?.message}>
            <TextInput
              id="clientEmail"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "clientEmail-error" : undefined}
              {...register("email")}
            />
          </Field>

          <Field
            htmlFor="clientCurrency"
            label="Currency"
            required
            hint="Default currency for future invoices."
            error={errors.currency?.message}
          >
            <TextInput
              id="clientCurrency"
              maxLength={3}
              className="uppercase"
              aria-invalid={Boolean(errors.currency)}
              aria-describedby={errors.currency ? "clientCurrency-error" : "clientCurrency-hint"}
              {...register("currency", {
                setValueAs: (value: string) => value.trim().toUpperCase(),
              })}
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
              <span className="block font-medium">{businessRateLabel(businessDefaults)}</span>
              <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                Future work follows the current business default.
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
                htmlFor="clientHourlyRate"
                label="Hourly rate override"
                required
                error={errors.defaultHourlyRate?.message}
              >
                <TextInput
                  id="clientHourlyRate"
                  inputMode="decimal"
                  aria-invalid={Boolean(errors.defaultHourlyRate)}
                  aria-describedby={
                    errors.defaultHourlyRate ? "clientHourlyRate-error" : undefined
                  }
                  {...register("defaultHourlyRate")}
                />
              </Field>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="m-0 grid gap-4 border-0 p-0">
          <legend className="mb-1 text-sm font-medium text-[var(--color-text-primary)]">
            CC recipients
          </legend>
          <p className="m-0 -mt-3 text-xs text-[var(--color-text-muted)]">
            Optional invoice-copy recipients. Add up to three.
          </p>
          {[0, 1, 2].map((index) => (
            <Field
              key={index}
              htmlFor={`clientCc${index}`}
              label={`CC recipient ${index + 1}`}
              error={errors.ccRecipients?.[index]?.message}
            >
              <TextInput
                id={`clientCc${index}`}
                type="email"
                aria-invalid={Boolean(errors.ccRecipients?.[index])}
                aria-describedby={
                  errors.ccRecipients?.[index] ? `clientCc${index}-error` : undefined
                }
                {...register(`ccRecipients.${index}`)}
              />
            </Field>
          ))}
        </fieldset>

        <Field htmlFor="clientAddress" label="Address" error={errors.address?.message}>
          <TextArea id="clientAddress" rows={3} {...register("address")} />
        </Field>

        <Field htmlFor="clientNote" label="Note" error={errors.note?.message}>
          <TextArea id="clientNote" rows={3} {...register("note")} />
        </Field>
      </form>
    </Dialog>
  );
}

function toFormValues(client: ClientDto | null, businessCurrency: string): ClientInput {
  const ccRecipients = client?.ccRecipients ?? [];
  return {
    name: client?.name ?? "",
    email: client?.email ?? "",
    ccRecipients: [ccRecipients[0] ?? "", ccRecipients[1] ?? "", ccRecipients[2] ?? ""],
    address: client?.address ?? "",
    note: client?.note ?? "",
    currency: client?.currency ?? businessCurrency,
    rateMode: client?.defaultHourlyRate === null || !client ? "inherit" : "override",
    defaultHourlyRate: client?.defaultHourlyRate ?? null,
  };
}

function businessRateLabel(defaults: BusinessRateDefaults): string {
  if (defaults.hourlyRate === null) return "Use business default";
  const numericRate = Number(defaults.hourlyRate);
  const formatted = Number.isFinite(numericRate)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: defaults.currency,
        maximumFractionDigits: 4,
      }).format(numericRate)
    : `${defaults.currency} ${defaults.hourlyRate}`;
  return `Use business default — ${formatted}/hr`;
}
