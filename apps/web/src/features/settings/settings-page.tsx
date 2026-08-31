import { zodResolver } from "@hookform/resolvers/zod";
import {
  BusinessProfileInputSchema,
  type BusinessProfileDto,
  type BusinessProfileInput,
} from "@verilio/contracts";
import { Button, Field, InlineError, Spinner, TextArea, TextInput } from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { PageHeader } from "../../app/app-shell.js";
import { getSettings, saveSettings, SettingsApiError } from "./settings-api.js";

const settingsQueryKey = ["settings"] as const;

const emptySettings: BusinessProfileInput = {
  businessName: "",
  email: "",
  address: "",
  phone: "",
  taxIdentifier: "",
  defaultCurrency: "USD",
  defaultHourlyRate: "0.00",
  paymentTermsDays: 30,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  defaultTaxRate: "0",
  defaultInvoiceNotes: "",
  invoiceFooter: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: settingsQueryKey, queryFn: getSettings });
  const {
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<BusinessProfileInput>({
    defaultValues: emptySettings,
    resolver: zodResolver(BusinessProfileInputSchema),
  });

  useEffect(() => {
    if (settingsQuery.data && !isDirty) {
      reset(toFormValues(settingsQuery.data.settings));
    }
  }, [isDirty, reset, settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (response) => {
      queryClient.setQueryData(settingsQueryKey, response);
      reset(toFormValues(response.settings));
    },
    onError: (error) => {
      if (!(error instanceof SettingsApiError) || !error.fieldErrors) return;
      let shouldFocus = true;
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        if (!(field in emptySettings) || !messages?.[0]) continue;
        setError(
          field as keyof BusinessProfileInput,
          { type: "server", message: messages[0] },
          { shouldFocus },
        );
        shouldFocus = false;
      }
    },
  });

  if (settingsQuery.isPending) {
    return (
      <main>
        <PageHeader
          title="Settings"
          description="Configure your business identity and billing defaults."
        />
        <div className="px-5 py-10 sm:px-8 lg:px-10">
          <Spinner label="Loading settings" />
        </div>
      </main>
    );
  }

  if (settingsQuery.isError) {
    return (
      <main>
        <PageHeader
          title="Settings"
          description="Configure your business identity and billing defaults."
        />
        <div className="max-w-3xl px-5 py-10 sm:px-8 lg:px-10">
          <InlineError>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Settings could not be loaded.</span>
              <Button variant="secondary" size="sm" onClick={() => void settingsQuery.refetch()}>
                Try again
              </Button>
            </div>
          </InlineError>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Settings"
        description="Configure the identity and defaults Verilio uses for future work and invoices."
      />

      <form
        noValidate
        className="mx-auto grid max-w-5xl gap-6 px-5 py-8 sm:px-8 lg:px-10"
        onSubmit={(event) => void handleSubmit((values) => saveMutation.mutate(values))(event)}
      >
        {saveMutation.isError ? (
          <InlineError>
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Verilio could not save your settings. Your entries are still here."}
          </InlineError>
        ) : null}

        {saveMutation.isSuccess ? (
          <div
            role="status"
            className="rounded-[var(--radius-md)] bg-[var(--color-success-subtle)] px-4 py-3 text-sm font-medium text-[var(--color-success-default)]"
          >
            Settings saved.
          </div>
        ) : null}

        <SettingsSection
          title="Business"
          description="The identity and contact details shown on future invoices."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              htmlFor="businessName"
              label="Business or display name"
              required
              error={errors.businessName?.message}
            >
              <TextInput
                id="businessName"
                autoComplete="organization"
                aria-invalid={Boolean(errors.businessName)}
                aria-describedby={errors.businessName ? "businessName-error" : undefined}
                {...register("businessName")}
              />
            </Field>

            <Field htmlFor="email" label="Email" required error={errors.email?.message}>
              <TextInput
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                htmlFor="address"
                label="Business address"
                required
                error={errors.address?.message}
              >
                <TextArea
                  id="address"
                  autoComplete="street-address"
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? "address-error" : undefined}
                  {...register("address")}
                />
              </Field>
            </div>

            <Field htmlFor="phone" label="Phone" error={errors.phone?.message}>
              <TextInput id="phone" type="tel" autoComplete="tel" {...register("phone")} />
            </Field>

            <Field
              htmlFor="taxIdentifier"
              label="Tax identifier"
              error={errors.taxIdentifier?.message}
            >
              <TextInput id="taxIdentifier" {...register("taxIdentifier")} />
            </Field>

            <div className="sm:col-span-2">
              <Field
                htmlFor="timezone"
                label="Timezone"
                required
                hint="Use an IANA timezone such as America/New_York."
                error={errors.timezone?.message}
              >
                <TextInput
                  id="timezone"
                  aria-invalid={Boolean(errors.timezone)}
                  aria-describedby={errors.timezone ? "timezone-error" : "timezone-hint"}
                  {...register("timezone")}
                />
              </Field>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Billing"
          description="Defaults applied when Verilio resolves rates and prepares future invoices."
        >
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              htmlFor="defaultCurrency"
              label="Default currency"
              required
              hint="Three-letter ISO code."
              error={errors.defaultCurrency?.message}
            >
              <TextInput
                id="defaultCurrency"
                maxLength={3}
                className="uppercase"
                aria-invalid={Boolean(errors.defaultCurrency)}
                aria-describedby={
                  errors.defaultCurrency ? "defaultCurrency-error" : "defaultCurrency-hint"
                }
                {...register("defaultCurrency", {
                  setValueAs: (value: string) => value.trim().toUpperCase(),
                })}
              />
            </Field>

            <Field
              htmlFor="defaultHourlyRate"
              label="Default hourly rate"
              required
              error={errors.defaultHourlyRate?.message}
            >
              <TextInput
                id="defaultHourlyRate"
                inputMode="decimal"
                aria-invalid={Boolean(errors.defaultHourlyRate)}
                aria-describedby={errors.defaultHourlyRate ? "defaultHourlyRate-error" : undefined}
                {...register("defaultHourlyRate")}
              />
            </Field>

            <Field
              htmlFor="paymentTermsDays"
              label="Payment terms (days)"
              required
              error={errors.paymentTermsDays?.message}
            >
              <TextInput
                id="paymentTermsDays"
                type="number"
                min={0}
                max={365}
                aria-invalid={Boolean(errors.paymentTermsDays)}
                aria-describedby={errors.paymentTermsDays ? "paymentTermsDays-error" : undefined}
                {...register("paymentTermsDays", { valueAsNumber: true })}
              />
            </Field>

            <Field
              htmlFor="defaultTaxRate"
              label="Default tax (%)"
              required
              error={errors.defaultTaxRate?.message}
            >
              <TextInput
                id="defaultTaxRate"
                inputMode="decimal"
                aria-invalid={Boolean(errors.defaultTaxRate)}
                aria-describedby={errors.defaultTaxRate ? "defaultTaxRate-error" : undefined}
                {...register("defaultTaxRate")}
              />
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Invoice defaults"
          description="Numbering and copy used when a new invoice is first created."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              htmlFor="invoicePrefix"
              label="Invoice prefix"
              required
              error={errors.invoicePrefix?.message}
            >
              <TextInput
                id="invoicePrefix"
                aria-invalid={Boolean(errors.invoicePrefix)}
                aria-describedby={errors.invoicePrefix ? "invoicePrefix-error" : undefined}
                {...register("invoicePrefix")}
              />
            </Field>

            <Field
              htmlFor="nextInvoiceNumber"
              label="Next invoice number"
              required
              error={errors.nextInvoiceNumber?.message}
            >
              <TextInput
                id="nextInvoiceNumber"
                type="number"
                min={1}
                aria-invalid={Boolean(errors.nextInvoiceNumber)}
                aria-describedby={errors.nextInvoiceNumber ? "nextInvoiceNumber-error" : undefined}
                {...register("nextInvoiceNumber", { valueAsNumber: true })}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                htmlFor="defaultInvoiceNotes"
                label="Default invoice notes"
                error={errors.defaultInvoiceNotes?.message}
              >
                <TextArea id="defaultInvoiceNotes" {...register("defaultInvoiceNotes")} />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                htmlFor="invoiceFooter"
                label="Invoice footer"
                error={errors.invoiceFooter?.message}
              >
                <TextArea id="invoiceFooter" rows={3} {...register("invoiceFooter")} />
              </Field>
            </div>
          </div>
        </SettingsSection>

        <div className="flex flex-col gap-4 border-t border-[var(--color-border-default)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 max-w-2xl text-xs leading-5 text-[var(--color-text-muted)]">
            Changes apply to future work and invoices. Historical rates and saved invoice data are
            never updated retroactively.
          </p>
          <Button type="submit" disabled={saveMutation.isPending} className="shrink-0">
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </main>
  );
}

function SettingsSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <div className="border-b border-[var(--color-border-default)] px-5 py-4 sm:px-6">
        <h2 className="m-0 text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mb-0 mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
      <div className="px-5 py-5 sm:px-6 sm:py-6">{children}</div>
    </section>
  );
}

function toFormValues(settings: BusinessProfileDto | null): BusinessProfileInput {
  if (!settings) return emptySettings;
  return {
    businessName: settings.businessName,
    email: settings.email,
    address: settings.address,
    phone: settings.phone ?? "",
    taxIdentifier: settings.taxIdentifier ?? "",
    defaultCurrency: settings.defaultCurrency,
    defaultHourlyRate: settings.defaultHourlyRate,
    paymentTermsDays: settings.paymentTermsDays,
    invoicePrefix: settings.invoicePrefix,
    nextInvoiceNumber: settings.nextInvoiceNumber,
    defaultTaxRate: settings.defaultTaxRate,
    defaultInvoiceNotes: settings.defaultInvoiceNotes ?? "",
    invoiceFooter: settings.invoiceFooter ?? "",
    timezone: settings.timezone,
  };
}

