import { zodResolver } from "@hookform/resolvers/zod";
import {
  InvoiceCreateInputSchema,
  InvoiceManualItemInputSchema,
  type InvoiceCreateInput,
  type InvoiceDto,
  type InvoiceGrouping,
  type InvoiceItemDto,
  type InvoiceManualItemInput,
  type InvoicePresentationModel,
  type InvoiceSourceTime,
  type ImportTimeInput,
} from "@verilio/contracts";
import { calculateInvoice, calculateInvoiceLineAmount, groupInvoiceTime, type InvoiceCalculation } from "@verilio/domain";
import {
  Button,
  Checkbox,
  DateInput,
  DateRangePicker,
  Dialog,
  DialogClose,
  Field,
  InlineError,
  Select,
  StatusBadge,
  TextArea,
  TextInput,
} from "@verilio/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Clock3, Download, Eye, Plus, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { z } from "zod";

import { PageHeader } from "../../app/app-shell.js";
import { addDays, dateRangePresetOptions, getPresetRange, type DateRangePreset } from "../../shared/date-range.js";
import { getClients, clientKeys } from "../clients/client-api.js";
import { ClientSelect } from "../clients/client-select.js";
import { getSettings } from "../settings/settings-api.js";
import { formatDuration, instantFields } from "../timer/time-format.js";
import {
  InvoiceApiError,
  addManualInvoiceItem,
  createInvoice,
  getEligibleTime,
  getEligibleTimeForContext,
  getInvoice,
  getInvoicePresentation,
  importInvoiceTime,
  invoiceKeys,
  markInvoicePaid,
  markInvoiceSent,
  removeInvoiceItem,
  updateInvoice,
  updateManualInvoiceItem,
  voidInvoice,
} from "./invoice-api.js";

type InvoiceFormValues = z.input<typeof InvoiceCreateInputSchema>;
type EditorInvoiceItem = Pick<InvoiceItemDto, "id" | "kind" | "description" | "quantity" | "unitPrice" | "amount" | "sources">;
type StagedManualItem = { id: string; input: InvoiceManualItemInput };
type StagedTimeImport = { input: ImportTimeInput; entries: InvoiceSourceTime[] };

let stagedItemSequence = 0;

export function InvoiceEditorPage() {
  const { invoiceId } = useParams();
  const query = useQuery({ queryKey: invoiceKeys.detail(invoiceId ?? "new"), queryFn: () => getInvoice(invoiceId!), enabled: Boolean(invoiceId) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const clientsQuery = useQuery({ queryKey: clientKeys.list({ status: "active", search: "" }), queryFn: () => getClients({ status: "active", search: "" }) });

  if (invoiceId && query.isPending) return <EditorLoading />;
  if (invoiceId && (query.isError || !query.data)) return <main><PageHeader title="Invoice" description="Draft Invoice editor" /><div className="p-6"><InlineError>Invoice could not be loaded.</InlineError></div></main>;
  if (settings.isPending) return <EditorLoading />;
  if (settings.isError || !settings.data.settings) return <main><PageHeader title="New Invoice" description="Create a traceable Draft." /><div className="p-6"><InlineError>Business settings are required before creating an Invoice.</InlineError></div></main>;

  return <InvoiceEditor invoice={query.data?.invoice ?? null} settings={settings.data.settings} clients={clientsQuery.data?.clients ?? []} />;
}

function InvoiceEditor({ invoice, settings, clients }: { invoice: InvoiceDto | null; settings: NonNullable<Awaited<ReturnType<typeof getSettings>>["settings"]>; clients: Awaited<ReturnType<typeof getClients>>["clients"] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timezoneToday = instantFields(new Date().toISOString(), settings.timezone).date;
  const [importOpen, setImportOpen] = useState(false);
  const [manualItem, setManualItem] = useState<EditorInvoiceItem | "new" | null>(null);
  const [removeItem, setRemoveItem] = useState<EditorInvoiceItem | null>(null);
  const [stagedManualItems, setStagedManualItems] = useState<StagedManualItem[]>([]);
  const [stagedTimeImport, setStagedTimeImport] = useState<StagedTimeImport | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<"sent" | "paid" | "void" | null>(null);
  const editable = !invoice || invoice.status === "draft";
  const { register, control, handleSubmit, reset, setError, setValue, formState: { errors, isDirty } } = useForm<InvoiceFormValues, unknown, InvoiceCreateInput>({
    resolver: zodResolver(InvoiceCreateInputSchema),
    defaultValues: invoiceDefaults(invoice, settings, timezoneToday),
  });
  useEffect(() => reset(invoiceDefaults(invoice, settings, timezoneToday)), [invoice, reset, settings, timezoneToday]);
  const clientId = useWatch({ control, name: "clientId" });
  const currency = useWatch({ control, name: "currency" });
  const discountType = useWatch({ control, name: "discountType" });
  const discountValue = useWatch({ control, name: "discountValue" });
  const taxPercent = useWatch({ control, name: "taxPercent" });
  const stagedItems = invoice ? invoice.items : buildStagedItems(stagedManualItems, stagedTimeImport, currency);
  const previewTotals = invoice ? null : calculatePreview(stagedItems, currency, discountType, discountValue, taxPercent);
  const selectedClient = clients.find((client) => client.id === clientId) ?? null;
  const canImport = editable && Boolean(invoice || (selectedClient && /^[A-Z]{3}$/.test(currency)));

  const save = useMutation({
    mutationFn: (values: InvoiceCreateInput) => invoice
      ? updateInvoice(invoice.id, {
          currency: values.currency,
          issueDate: values.issueDate,
          dueDate: values.dueDate,
          discountType: values.discountType,
          discountValue: values.discountValue,
          taxPercent: values.taxPercent,
          notes: values.notes,
        })
      : createInvoice({
          ...values,
          manualItems: stagedManualItems.map(({ input }) => input),
          timeImport: stagedTimeImport?.input,
        }),
    onSuccess: ({ invoice: saved }) => {
      queryClient.setQueryData(invoiceKeys.detail(saved.id), { invoice: saved });
      void queryClient.invalidateQueries({ queryKey: invoiceKeys.list });
      reset(invoiceDefaults(saved, settings, timezoneToday));
      if (!invoice) {
        setStagedManualItems([]);
        setStagedTimeImport(null);
        void navigate(`/invoices/${saved.id}`, { replace: true });
      }
    },
    onError: (error) => applyServerErrors(error, setError),
  });

  return (
    <main>
      <PageHeader
        title={invoice ? invoice.invoiceNumber : "New Invoice"}
        description={invoice ? `${statusLabel(invoice.displayStatus)} · saved snapshots and authoritative totals` : "Compose the Invoice, then save it as a Draft."}
        actions={<div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]" to="/invoices"><ArrowLeft aria-hidden="true" size={16} /> Invoices</Link>{invoice ? <StatusBadge tone={statusTone(invoice.displayStatus)}>{statusLabel(invoice.displayStatus)}</StatusBadge> : null}{invoice?.items.length ? <><Button variant="secondary" onClick={() => setPreviewOpen(true)}><Eye aria-hidden="true" size={16} /> Preview</Button><a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]" href={`/api/v1/invoices/${invoice.id}/pdf`}><Download aria-hidden="true" size={16} /> Download PDF</a></> : null}{editable ? <Button form="invoiceForm" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : invoice && !isDirty ? "Saved Draft" : "Save Draft"}</Button> : null}</div>}
      />
      <form id="invoiceForm" noValidate onSubmit={(event) => editable ? void handleSubmit((values) => save.mutate(values))(event) : event.preventDefault()}>
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-10">
          <div className="grid min-w-0 gap-6">
            {save.isError ? <InlineError>Draft could not be saved. Your entries are still here. {save.error instanceof Error ? save.error.message : ""}</InlineError> : null}
            {invoice && !editable ? <LifecycleNotice invoice={invoice} /> : null}
            <EditorSection title="Client & dates" description={invoice ? "Client identity was snapshotted on first save." : "Client currency and Business payment terms initialize this Draft."}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="invoiceClient" label="Client" error={errors.clientId?.message}>
                  <ClientSelect id="invoiceClient" disabled={Boolean(invoice)} value={clientId} {...register("clientId", { onChange: (event) => {
                    const selected = clients.find((client) => client.id === event.target.value);
                    if (!invoice && event.target.value !== clientId) setStagedTimeImport(null);
                    if (selected && !invoice) setValue("currency", selected.currency, { shouldDirty: true, shouldValidate: true });
                  } })} />
                </Field>
                <Field htmlFor="invoiceCurrency" label="Invoice currency" hint={invoice?.items.length ? "Remove all Items before changing currency." : stagedTimeImport ? "Changing currency clears staged Time. No automatic conversion." : "No automatic currency conversion."} error={errors.currency?.message}>
                  <TextInput id="invoiceCurrency" maxLength={3} disabled={!editable || Boolean(invoice?.items.length)} {...register("currency", { onChange: (event) => { const next = event.target.value.toUpperCase(); event.target.value = next; if (!invoice && next !== currency) setStagedTimeImport(null); } })} />
                </Field>
                <Field htmlFor="invoiceIssueDate" label="Issue date" error={errors.issueDate?.message}><DateInput id="invoiceIssueDate" disabled={!editable} {...register("issueDate")} /></Field>
                <Field htmlFor="invoiceDueDate" label="Due date" error={errors.dueDate?.message}><DateInput id="invoiceDueDate" disabled={!editable} {...register("dueDate")} /></Field>
              </div>
            </EditorSection>

            <EditorSection title="Imported Time / Line Items" description="Imported Time retains its historical rate, currency, and source links.">
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!canImport} onClick={() => setImportOpen(true)}><Clock3 aria-hidden="true" size={16} /> Import Time</Button>
                <Button variant="secondary" disabled={!editable} onClick={() => setManualItem("new")}><Plus aria-hidden="true" size={16} /> Add manual Item</Button>
                {!invoice && !canImport ? <p className="m-0 self-center text-xs text-[var(--color-text-muted)]">Select a client to import time.</p> : null}
              </div>
              {invoice?.status === "void" ? <p className="mb-3 text-xs text-[var(--color-text-muted)]">Source details reflect current Time records and may have changed since Void. Saved Invoice Items and totals remain historical.</p> : null}
              {stagedItems.length ? <><InvoiceItemsTable editable={editable} currency={currency} items={stagedItems} onEdit={setManualItem} onRemove={setRemoveItem} />{!invoice && stagedTimeImport ? <p role="status" className="mb-0 mt-3 text-xs text-[var(--color-text-muted)]">Imported Time is staged locally and will be reserved only after Save Draft succeeds.</p> : null}</> : <p className="m-0 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-secondary)]">This Draft has no Items yet. Empty Drafts are allowed.</p>}
            </EditorSection>

            <EditorSection title="Notes / terms" description={invoice ? `Saved payment terms: ${invoice.paymentTermsDays} days.${invoice.footer ? ` Footer: ${invoice.footer}` : ""}` : `Business payment terms default to ${settings.paymentTermsDays} days.`}>
              <Field htmlFor="invoiceNotes" label="Notes" error={errors.notes?.message}><TextArea id="invoiceNotes" rows={5} disabled={!editable} {...register("notes")} /></Field>
            </EditorSection>
          </div>

          <aside className="h-fit rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5 lg:sticky lg:top-5">
            <h2 className="m-0 text-base font-semibold">Totals</h2>
            <div className="mt-4 grid gap-4">
              <Field htmlFor="discountType" label="Discount type"><Select id="discountType" disabled={!editable} {...register("discountType")}><option value="none">No discount</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
              <Field htmlFor="discountValue" label={discountType === "fixed" ? "Discount amount" : "Discount percent"} error={errors.discountValue?.message}><TextInput id="discountValue" inputMode="decimal" disabled={!editable || discountType === "none"} {...register("discountValue")} /></Field>
              <Field htmlFor="taxPercent" label="Tax percent" error={errors.taxPercent?.message}><TextInput id="taxPercent" inputMode="decimal" disabled={!editable} {...register("taxPercent")} /></Field>
            </div>
            <InvoiceTotals invoice={invoice} preview={previewTotals} currency={currency} />
            <p className="mb-0 mt-4 text-xs text-[var(--color-text-muted)]">Server-calculated totals are authoritative after Save.</p>
            {invoice ? <LifecycleActions invoice={invoice} hasUnsavedChanges={isDirty} onAction={setLifecycleAction} /> : null}
          </aside>
        </div>
      </form>

      {importOpen && (invoice || selectedClient) ? <ImportTimeDialog invoice={invoice} clientId={invoice?.clientId ?? selectedClient!.id} clientName={invoice?.clientName ?? selectedClient!.name} currency={currency} staged={stagedTimeImport} today={timezoneToday} onStage={setStagedTimeImport} onOpenChange={setImportOpen} /> : null}
      {manualItem ? <ManualItemDialog invoice={invoice} currency={currency} item={manualItem === "new" ? null : manualItem} onStage={(input, id) => { setStagedManualItems((current) => id ? current.map((entry) => entry.id === id ? { ...entry, input } : entry) : [...current, { id: nextStagedItemId(), input }]); setManualItem(null); }} onOpenChange={(open) => { if (!open) setManualItem(null); }} /> : null}
      {removeItem ? <RemoveItemDialog invoice={invoice} item={removeItem} onRemoveLocal={() => { if (removeItem.kind === "manual") setStagedManualItems((current) => current.filter((entry) => entry.id !== removeItem.id)); else setStagedTimeImport((current) => removeSourcesFromStagedImport(current, removeItem.sources.map((source) => source.id))); setRemoveItem(null); }} onOpenChange={(open) => { if (!open) setRemoveItem(null); }} /> : null}
      {invoice && previewOpen ? <InvoicePreviewDialog invoice={invoice} onOpenChange={setPreviewOpen} /> : null}
      {invoice && lifecycleAction ? <LifecycleDialog action={lifecycleAction} invoice={invoice} paidDate={timezoneToday} onOpenChange={(open) => { if (!open) setLifecycleAction(null); }} /> : null}
    </main>
  );
}

function EditorSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return <section className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5"><h2 className="m-0 text-base font-semibold">{title}</h2><p className="mb-5 mt-1 text-xs text-[var(--color-text-muted)]">{description}</p>{children}</section>;
}

function InvoiceItemsTable({ currency, editable, items, onEdit, onRemove }: { currency: string; editable: boolean; items: EditorInvoiceItem[]; onEdit: (item: EditorInvoiceItem) => void; onRemove: (item: EditorInvoiceItem) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-sm"><thead className="bg-[var(--color-bg-subtle)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th>{editable ? <th className="px-3 py-2 text-right">Actions</th> : null}</tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{items.map((item) => <tr key={item.id}><td className="px-3 py-3"><strong>{item.description}</strong>{item.kind === "time" ? <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-[var(--color-accent-active)]">View {item.sources.length} source {item.sources.length === 1 ? "entry" : "entries"}</summary><ul className="mb-0 mt-2 grid gap-1 pl-5 text-xs text-[var(--color-text-secondary)]">{item.sources.map((source) => <li key={source.id}>{source.workDate} · {source.description} · {source.projectName}{source.taskName ? ` / ${source.taskName}` : ""} · {formatDuration(source.durationSeconds)} · {source.currency && source.hourlyRate && source.amount ? `${source.currency} ${formatMoney(source.hourlyRate, source.currency)}/hr · ${source.currency} ${formatMoney(source.amount, source.currency)}` : "Current source is non-billable"}</li>)}</ul></details> : <span className="mt-1 block text-xs text-[var(--color-text-muted)]">Manual Item</span>}</td><td className="px-3 py-3 text-right tabular-nums">{formatQuantity(item.quantity)}</td><td className="px-3 py-3 text-right tabular-nums">{currency} {formatMoney(item.unitPrice, currency)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{currency} {formatMoney(item.amount, currency)}</td>{editable ? <td className="px-3 py-3 text-right"><div className="flex justify-end gap-1">{item.kind === "manual" ? <Button size="sm" variant="quiet" onClick={() => onEdit(item)}>Edit</Button> : null}<Button size="sm" variant="quiet" onClick={() => onRemove(item)}>Remove</Button></div></td> : null}</tr>)}</tbody></table></div>;
}

function InvoiceTotals({ currency, invoice, preview }: { currency: string; invoice: InvoiceDto | null; preview: InvoiceCalculation | null }) {
  const values = invoice ?? preview ?? { subtotal: "0", discountAmount: "0", taxableSubtotal: "0", taxAmount: "0", total: "0" };
  return <dl className="mt-5 grid gap-2 border-t border-[var(--color-border-default)] pt-4 text-sm"><TotalRow label="Subtotal" value={formatMoney(values.subtotal, currency)} /><TotalRow label="Discount" value={`−${formatMoney(values.discountAmount, currency)}`} /><TotalRow label="Taxable" value={formatMoney(values.taxableSubtotal, currency)} /><TotalRow label="Tax" value={formatMoney(values.taxAmount, currency)} /><div className="mt-2 flex justify-between border-t border-[var(--color-border-strong)] pt-3 text-lg font-semibold"><dt>Total</dt><dd className="m-0 tabular-nums">{currency} {formatMoney(values.total, currency)}</dd></div></dl>;
}

function TotalRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-secondary)]">{label}</dt><dd className="m-0 tabular-nums">{value}</dd></div>; }

function ImportTimeDialog({ clientId, clientName, currency, invoice, onOpenChange, onStage, staged, today }: { clientId: string; clientName: string; currency: string; invoice: InvoiceDto | null; onOpenChange: (open: boolean) => void; onStage: (value: StagedTimeImport) => void; staged: StagedTimeImport | null; today: string }) {
  const queryClient = useQueryClient();
  const initial = staged?.input ?? getPresetRange("this-month", today);
  const [range, setRange] = useState(initial);
  const [grouping, setGrouping] = useState<InvoiceGrouping>(staged?.input.grouping ?? "project");
  const [selected, setSelected] = useState<Set<string>>(new Set(staged?.input.timeEntryIds ?? []));
  const contextQuery = { ...range, clientId, currency };
  const eligible = useQuery({ queryKey: invoice ? invoiceKeys.eligible(invoice.id, range) : invoiceKeys.eligibleForContext(contextQuery), queryFn: () => invoice ? getEligibleTime(invoice.id, range) : getEligibleTimeForContext(contextQuery) });
  const selectedEntries = eligible.data?.entries.filter((entry) => selected.has(entry.id)) ?? [];
  const mutation = useMutation({
    mutationFn: () => importInvoiceTime(invoice!.id, { ...range, timeEntryIds: [...selected], grouping }),
    onSuccess: ({ invoice: saved }) => { refreshInvoiceState(queryClient, saved); onOpenChange(false); },
  });
  const importSelected = () => {
    if (invoice) mutation.mutate();
    else {
      onStage({ input: { ...range, timeEntryIds: [...selected], grouping }, entries: selectedEntries });
      onOpenChange(false);
    }
  };
  const unavailableSelection = Boolean(selected.size && eligible.data && selectedEntries.length !== selected.size);
  return <Dialog open onOpenChange={onOpenChange} title="Import eligible Time" description={`Only billable, Not invoiced ${currency} Time for ${clientName} is shown.` } footer={<><DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose><Button disabled={!selected.size || eligible.isPending || eligible.isError || unavailableSelection || mutation.isPending} onClick={importSelected}>{mutation.isPending ? "Importing…" : `Import ${selected.size} selected`}</Button></>}>
    <div className="grid gap-4">
      <DateRangePicker from={range.from} to={range.to} preset="custom" presets={dateRangePresetOptions} onPresetChange={(preset) => { if (preset !== "custom") { setRange(getPresetRange(preset as Exclude<DateRangePreset, "custom">, today)); setSelected(new Set()); } }} onChange={(value) => { setRange(value); setSelected(new Set()); }} />
      <Field htmlFor="invoiceGrouping" label="Grouping"><Select id="invoiceGrouping" value={grouping} onChange={(event) => setGrouping(event.target.value as InvoiceGrouping)}><option value="project">Project</option><option value="task">Task</option><option value="individual">Individual</option></Select></Field>
      {eligible.isPending ? <p role="status">Loading eligible Time…</p> : eligible.isError ? <InlineError>Eligible Time could not be loaded.</InlineError> : eligible.data.entries.length === 0 ? <p className="m-0 rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-4 text-sm">No billable, Not invoiced Time was found for this Client, currency, and period.</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="m-0 text-sm"><strong>{eligible.data.count}</strong> eligible · <strong>{formatDuration(eligible.data.totalDurationSeconds)}</strong> · <strong>{currency} {formatMoney(eligible.data.totalAmount, currency)}</strong></p><div className="flex gap-2"><Button size="sm" variant="quiet" onClick={() => setSelected(new Set(eligible.data.entries.map((entry) => entry.id)))}>Select all</Button><Button size="sm" variant="quiet" onClick={() => setSelected(new Set())}>Select none</Button></div></div>
        <ul className="m-0 max-h-72 list-none divide-y divide-[var(--color-border-default)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-0">{eligible.data.entries.map((entry) => <li key={entry.id}><label className="flex cursor-pointer items-start gap-3 p-3 text-sm"><Checkbox checked={selected.has(entry.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked === true) next.add(entry.id); else next.delete(entry.id); return next; })} /><span className="min-w-0 flex-1"><strong className="block">{entry.description}</strong><span className="text-xs text-[var(--color-text-secondary)]">{entry.workDate} · {entry.projectName}{entry.taskName ? ` / ${entry.taskName}` : ""}</span></span><span className="text-right tabular-nums"><strong>{formatDuration(entry.durationSeconds)}</strong><span className="block text-xs text-[var(--color-text-secondary)]">{entry.currency} {formatMoney(entry.hourlyRate, entry.currency)}/hr · {formatMoney(entry.amount, entry.currency)}</span></span></label></li>)}</ul>
        <p aria-live="polite" className="m-0 text-sm">Selected: <strong>{selected.size}</strong> · <strong>{formatDuration(selectedEntries.reduce((sum, entry) => sum + entry.durationSeconds, 0))}</strong> · <strong>{currency} {formatMoney(sumDecimalStrings(selectedEntries.map((entry) => entry.amount)), currency)}</strong></p>
      </>}
      {mutation.isError ? <InlineError>{mutation.error instanceof Error ? mutation.error.message : "Time could not be imported."} Your selection is unchanged.</InlineError> : null}
      {unavailableSelection ? <InlineError>Some previously selected Time is no longer available. Remove the staged line or choose an available selection.</InlineError> : null}
    </div>
  </Dialog>;
}

function ManualItemDialog({ currency, invoice, item, onOpenChange, onStage }: { currency: string; invoice: InvoiceDto | null; item: EditorInvoiceItem | null; onOpenChange: (open: boolean) => void; onStage: (input: InvoiceManualItemInput, id?: string) => void }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<InvoiceManualItemInput>({ resolver: zodResolver(InvoiceManualItemInputSchema), defaultValues: item ? { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice } : { description: "", quantity: "1", unitPrice: "0" } });
  const mutation = useMutation({ mutationFn: (values: InvoiceManualItemInput) => item ? updateManualInvoiceItem(invoice!.id, item.id, values) : addManualInvoiceItem(invoice!.id, values), onSuccess: ({ invoice: saved }) => { refreshInvoiceState(queryClient, saved); onOpenChange(false); }, onError: (error) => applyServerErrors(error, setError) });
  const submit = (values: InvoiceManualItemInput) => invoice ? mutation.mutate(values) : onStage(values, item?.id);
  return <Dialog open onOpenChange={onOpenChange} title={item ? "Edit manual Item" : "Add manual Item"} description="Manual Items are independent from tracked Time." footer={<><DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose><Button form="manualItemForm" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save Item"}</Button></>}><form id="manualItemForm" className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}><Field htmlFor="itemDescription" label="Description" error={errors.description?.message}><TextInput id="itemDescription" autoFocus {...register("description")} /></Field><div className="grid grid-cols-2 gap-4"><Field htmlFor="itemQuantity" label="Quantity" error={errors.quantity?.message}><TextInput id="itemQuantity" inputMode="decimal" {...register("quantity")} /></Field><Field htmlFor="itemUnitPrice" label={`Unit price (${currency})`} error={errors.unitPrice?.message}><TextInput id="itemUnitPrice" inputMode="decimal" {...register("unitPrice")} /></Field></div>{mutation.isError ? <InlineError>{mutation.error instanceof Error ? mutation.error.message : "Item could not be saved."} Your entries are still here.</InlineError> : null}</form></Dialog>;
}

function RemoveItemDialog({ invoice, item, onOpenChange, onRemoveLocal }: { invoice: InvoiceDto | null; item: EditorInvoiceItem; onOpenChange: (open: boolean) => void; onRemoveLocal: () => void }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => removeInvoiceItem(invoice!.id, item.id), onSuccess: ({ invoice: saved }) => { refreshInvoiceState(queryClient, saved); onOpenChange(false); } });
  const remove = () => invoice ? mutation.mutate() : onRemoveLocal();
  const description = item.kind === "time" ? invoice ? `${item.sources.length} source Time ${item.sources.length === 1 ? "Entry" : "Entries"} will become Not invoiced and eligible again.` : `${item.sources.length} staged source Time ${item.sources.length === 1 ? "Entry" : "Entries"} will be removed. No Time has been reserved yet.` : "The manual Item will be removed.";
  return <Dialog open onOpenChange={onOpenChange} title={`Remove “${item.description}”?`} description={description} footer={<><DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose><Button variant="danger" disabled={mutation.isPending} onClick={remove}>{mutation.isPending ? "Removing…" : "Remove Item"}</Button></>} >{mutation.isError ? <InlineError>{mutation.error instanceof Error ? mutation.error.message : "Item could not be removed."}</InlineError> : <p className="m-0 text-sm text-[var(--color-text-secondary)]">{invoice ? "Invoice totals will be recalculated by the server." : "Preview totals will update immediately."}</p>}</Dialog>;
}

function LifecycleActions({ hasUnsavedChanges, invoice, onAction }: { hasUnsavedChanges: boolean; invoice: InvoiceDto; onAction: (action: "sent" | "paid" | "void") => void }) {
  return <div className="mt-5 grid gap-2 border-t border-[var(--color-border-default)] pt-4">
    <h3 className="m-0 text-sm font-semibold">Lifecycle</h3>
    {invoice.status === "draft" ? <><Button disabled={!invoice.items.length || hasUnsavedChanges} onClick={() => onAction("sent")}><Send aria-hidden="true" size={16} /> Mark Sent</Button>{hasUnsavedChanges ? <p className="m-0 text-xs text-[var(--color-text-muted)]">Save Draft changes before marking Sent.</p> : null}</> : null}
    {invoice.status === "sent" ? <Button onClick={() => onAction("paid")}><CheckCircle2 aria-hidden="true" size={16} /> Mark Paid</Button> : null}
    {invoice.status === "draft" || invoice.status === "sent" ? <Button variant="secondary" onClick={() => onAction("void")}><Ban aria-hidden="true" size={16} /> Void Invoice</Button> : null}
    {invoice.status === "paid" ? <p className="m-0 text-sm text-[var(--color-text-secondary)]">Paid {invoice.paidAt}. This Invoice is read-only.</p> : null}
    {invoice.status === "void" ? <p className="m-0 text-sm text-[var(--color-text-secondary)]">Void is terminal. Linked Time is available for invoicing again.</p> : null}
  </div>;
}

function LifecycleNotice({ invoice }: { invoice: InvoiceDto }) {
  const message = invoice.status === "paid"
    ? `Paid on ${invoice.paidAt}. Financial values and source Time remain locked and Invoiced.`
    : invoice.status === "void"
      ? "This Invoice remains in your records. Its linked Time Entries are available to Invoice again."
      : "Sent Invoices are read-only. Mark Paid or Void using the lifecycle actions.";
  return <div role="status" className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4 text-sm text-[var(--color-text-secondary)]"><strong className="text-[var(--color-text-primary)]">{statusLabel(invoice.displayStatus)}</strong> · {message}</div>;
}

function LifecycleDialog({ action, invoice, paidDate, onOpenChange }: { action: "sent" | "paid" | "void"; invoice: InvoiceDto; paidDate: string; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [paidAt, setPaidAt] = useState(paidDate);
  const mutation = useMutation({
    mutationFn: () => action === "sent" ? markInvoiceSent(invoice.id) : action === "paid" ? markInvoicePaid(invoice.id, { paidAt }) : voidInvoice(invoice.id),
    onSuccess: ({ invoice: saved }) => { refreshInvoiceState(queryClient, saved); onOpenChange(false); },
  });
  const content = action === "sent"
    ? { title: `Mark ${invoice.invoiceNumber} as sent?`, description: "This changes the Invoice status only. Verilio will not email the Invoice.", confirm: "Mark Sent" }
    : action === "paid"
      ? { title: `Mark ${invoice.invoiceNumber} as paid?`, description: "Record the actual payment date. Paid Invoices are terminal and read-only in MVP.", confirm: "Mark Paid" }
      : { title: `Void ${invoice.invoiceNumber}?`, description: "The Invoice remains in your records. Its linked Time Entries become available to Invoice again.", confirm: "Void Invoice" };
  return <Dialog open onOpenChange={onOpenChange} title={content.title} description={content.description} footer={<><DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose><Button variant={action === "void" ? "danger" : "primary"} disabled={mutation.isPending || (action === "paid" && !paidAt)} onClick={() => mutation.mutate()}>{mutation.isPending ? "Saving…" : content.confirm}</Button></>}>
    <div className="grid gap-4">
      {action === "paid" ? <Field htmlFor="invoicePaidDate" label="Paid date"><DateInput id="invoicePaidDate" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></Field> : null}
      {mutation.isError ? <InlineError>{mutation.error instanceof Error ? mutation.error.message : "Invoice status could not be changed."} The current status is unchanged.</InlineError> : null}
    </div>
  </Dialog>;
}

function InvoicePreviewDialog({ invoice, onOpenChange }: { invoice: InvoiceDto; onOpenChange: (open: boolean) => void }) {
  const query = useQuery({ queryKey: invoiceKeys.presentation(invoice.id), queryFn: () => getInvoicePresentation(invoice.id) });
  return <Dialog open onOpenChange={onOpenChange} title={`Preview ${invoice.invoiceNumber}`} description="Saved Invoice data used by both this preview and the server PDF." footer={<><a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent-default)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]" href={`/api/v1/invoices/${invoice.id}/pdf`}><Download aria-hidden="true" size={16} /> Download PDF</a><DialogClose asChild><Button variant="secondary">Close</Button></DialogClose></>}>
    {query.isPending ? <p role="status">Loading saved Invoice preview…</p> : query.isError ? <InlineError>Invoice preview could not be loaded. <button className="font-semibold underline" type="button" onClick={() => void query.refetch()}>Try again</button></InlineError> : <InvoicePreview model={query.data.presentation} />}
  </Dialog>;
}

function InvoicePreview({ model }: { model: InvoicePresentationModel }) {
  return <article className="grid gap-6 text-sm">
    <header className="flex flex-wrap justify-between gap-5 border-b border-[var(--color-border-default)] pb-5"><div><p className="m-0 text-xs font-bold tracking-[0.14em] text-[var(--color-accent-active)]">VERILIO INVOICE</p><h3 className="mb-0 mt-2 text-xl">{model.invoiceNumber}</h3></div><dl className="m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-right"><dt>Status</dt><dd className="m-0 font-semibold">{statusLabel(model.displayStatus)}</dd><dt>Issue date</dt><dd className="m-0">{model.issueDate}</dd><dt>Due date</dt><dd className="m-0">{model.dueDate}</dd>{model.paidAt ? <><dt>Paid date</dt><dd className="m-0">{model.paidAt}</dd></> : null}</dl></header>
    <div className="grid gap-5 sm:grid-cols-2"><PreviewParty label="From" name={model.seller.businessName} values={[model.seller.email, model.seller.address, model.seller.phone, model.seller.taxIdentifier]} /><PreviewParty label="Bill to" name={model.client.name} values={[model.client.email, model.client.address, ...model.client.ccRecipients]} /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse"><thead className="bg-[var(--color-bg-subtle)] text-left"><tr><th className="p-2">Description</th><th className="p-2 text-right">Quantity</th><th className="p-2 text-right">Unit price</th><th className="p-2 text-right">Amount</th></tr></thead><tbody className="divide-y divide-[var(--color-border-default)]">{model.items.map((item) => <tr key={item.id}><td className="p-2">{item.description}</td><td className="p-2 text-right tabular-nums">{formatQuantity(item.quantity)}</td><td className="p-2 text-right tabular-nums">{formatMoney(item.unitPrice, model.currency)}</td><td className="p-2 text-right font-semibold tabular-nums">{formatMoney(item.amount, model.currency)}</td></tr>)}</tbody></table></div>
    <div className="ml-auto w-full max-w-xs"><InvoicePreviewTotals model={model} /></div>
    {model.notes ? <div><h4 className="mb-1 mt-0">Notes</h4><p className="m-0 whitespace-pre-wrap text-[var(--color-text-secondary)]">{model.notes}</p></div> : null}
    <div><h4 className="mb-1 mt-0">Payment terms</h4><p className="m-0 text-[var(--color-text-secondary)]">{model.paymentTermsLabel}</p>{model.footer ? <p className="mb-0 mt-2 text-[var(--color-text-muted)]">{model.footer}</p> : null}</div>
  </article>;
}

function PreviewParty({ label, name, values }: { label: string; name: string; values: Array<string | null> }) {
  return <section><h4 className="mb-2 mt-0 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{label}</h4><strong>{name}</strong>{values.filter(Boolean).map((value) => <span className="block text-[var(--color-text-secondary)]" key={value}>{value}</span>)}</section>;
}

function InvoicePreviewTotals({ model }: { model: InvoicePresentationModel }) {
  return <dl className="grid gap-2"><TotalRow label="Subtotal" value={formatMoney(model.subtotal, model.currency)} /><TotalRow label="Discount" value={`−${formatMoney(model.discountAmount, model.currency)}`} /><TotalRow label="Taxable" value={formatMoney(model.taxableSubtotal, model.currency)} /><TotalRow label="Tax" value={formatMoney(model.taxAmount, model.currency)} /><div className="flex justify-between border-t border-[var(--color-border-strong)] pt-3 text-lg font-semibold"><dt>Total</dt><dd className="m-0 tabular-nums">{model.currency} {formatMoney(model.total, model.currency)}</dd></div></dl>;
}

function buildStagedItems(manualItems: StagedManualItem[], timeImport: StagedTimeImport | null, currency: string): EditorInvoiceItem[] {
  const timeItems = timeImport
    ? groupInvoiceTime(timeImport.entries, timeImport.input.grouping, currency).map((group, index) => ({
        id: `staged-time-${index}-${group.sourceIds.join("-")}`,
        kind: "time" as const,
        description: group.description,
        quantity: group.quantity,
        unitPrice: group.unitPrice,
        amount: group.amount,
        sources: group.sourceIds.map((id) => timeImport.entries.find((entry) => entry.id === id)!),
      }))
    : [];
  return [
    ...timeItems,
    ...manualItems.map(({ id, input }) => ({
      id,
      kind: "manual" as const,
      ...input,
      amount: calculateInvoiceLineAmount(input.quantity, input.unitPrice, currency),
      sources: [],
    })),
  ];
}

function calculatePreview(items: EditorInvoiceItem[], currency: string, discountType: InvoiceFormValues["discountType"], discountValue: string, taxPercent: string): InvoiceCalculation | null {
  try {
    return calculateInvoice({
      currency,
      lines: items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
      discountType,
      discountValue,
      taxPercent,
    });
  } catch {
    return null;
  }
}

function removeSourcesFromStagedImport(staged: StagedTimeImport | null, sourceIds: string[]): StagedTimeImport | null {
  if (!staged) return null;
  const removed = new Set(sourceIds);
  const entries = staged.entries.filter((entry) => !removed.has(entry.id));
  if (!entries.length) return null;
  return {
    entries,
    input: { ...staged.input, timeEntryIds: staged.input.timeEntryIds.filter((id) => !removed.has(id)) },
  };
}

function nextStagedItemId(): string {
  stagedItemSequence += 1;
  return `staged-manual-${stagedItemSequence}`;
}

function refreshInvoiceState(queryClient: ReturnType<typeof useQueryClient>, invoice: InvoiceDto) {
  queryClient.setQueryData(invoiceKeys.detail(invoice.id), { invoice });
  void queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
  void queryClient.invalidateQueries({ queryKey: ["time-entries"] });
}

function invoiceDefaults(invoice: InvoiceDto | null, settings: NonNullable<Awaited<ReturnType<typeof getSettings>>["settings"]>, today: string): InvoiceFormValues {
  return invoice ? { clientId: invoice.clientId, currency: invoice.currency, issueDate: invoice.issueDate, dueDate: invoice.dueDate, discountType: invoice.discountType, discountValue: invoice.discountValue, taxPercent: invoice.taxPercent, notes: invoice.notes ?? "" } : { clientId: "", currency: settings.defaultCurrency, issueDate: today, dueDate: addDays(today, settings.paymentTermsDays), discountType: "none", discountValue: "0", taxPercent: settings.defaultTaxRate, notes: settings.defaultInvoiceNotes ?? "" };
}

function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>) {
  if (!(error instanceof InvoiceApiError) || !error.fieldErrors) return;
  let focus = true;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if (!messages?.[0]) continue;
    setError(field as Path<T>, { type: "server", message: messages[0] }, { shouldFocus: focus });
    focus = false;
  }
}

function formatMoney(value: string, currency: string): string { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value)); }
function formatQuantity(value: string): string { return String(Number(value)); }
function statusLabel(status: InvoiceDto["displayStatus"]): string { return status.charAt(0).toUpperCase() + status.slice(1); }
function statusTone(status: InvoiceDto["displayStatus"]): "neutral" | "info" | "success" | "warning" | "danger" { return status === "paid" ? "success" : status === "overdue" ? "warning" : status === "void" ? "danger" : status === "sent" ? "info" : "neutral"; }
function sumDecimalStrings(values: string[]): string {
  const scale = Math.max(0, ...values.map((value) => value.split(".")[1]?.length ?? 0));
  const total = values.reduce((sum, value) => { const [whole, fraction = ""] = value.split("."); return sum + BigInt(`${whole}${fraction.padEnd(scale, "0")}`); }, 0n);
  if (!scale) return total.toString();
  const text = total.toString().padStart(scale + 1, "0");
  return `${text.slice(0, -scale)}.${text.slice(-scale)}`;
}

function EditorLoading() { return <main><PageHeader title="Invoice" description="Loading Draft editor." /><div className="mx-auto max-w-7xl p-6"><div role="status" aria-label="Loading Invoice" className="h-80 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)]"><span className="sr-only">Loading Invoice…</span></div></div></main>; }
