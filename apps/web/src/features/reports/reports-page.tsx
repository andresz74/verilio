import {
  DateOnlySchema,
  type ReportDetailedQuery,
  type ReportDetailedRow,
  type ReportGroupBy,
  type ReportSummaryQuery,
} from "@verilio/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  Button,
  DateRangePicker,
  EmptyState,
  Field,
  InlineError,
  Select,
  StatusBadge,
} from "@verilio/ui";
import { BarChart3, List } from "lucide-react";
import { useMemo } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import {
  dateRangePresetOptions,
  formatSelectedPeriod,
  formatWorkDate,
  getPresetRange,
  inferPreset,
  type DateRangePreset,
} from "../../shared/date-range.js";
import { ClientSelect } from "../clients/client-select.js";
import { ProjectSelect } from "../projects/project-select.js";
import { getSettings } from "../settings/settings-api.js";
import { TaskSelect } from "../tasks/task-select.js";
import { formatDuration, instantFields } from "../timer/time-format.js";
import {
  getDetailedReport,
  getSummaryReport,
  reportKeys,
} from "./report-api.js";
import { normalizeReportParams } from "./report-url-state.js";

const PAGE_SIZE = 25;
export type ReportView = "summary" | "detailed";

export function ReportsIndexRedirect() {
  const { search } = useLocation();
  return <Navigate replace to={`/reports/summary${search}`} />;
}

export function ReportsPage({ view }: { view: ReportView }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  if (settingsQuery.isPending) return <ReportsLoading />;
  if (settingsQuery.isError || !settingsQuery.data.settings) {
    return (
      <main>
        <PageHeader title="Reports" description="Turn tracked time into billing intelligence." />
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
          <InlineError>Business settings could not be loaded. Retry before reviewing reports.</InlineError>
        </div>
      </main>
    );
  }

  const timezone = settingsQuery.data.settings.timezone;
  const today = instantFields(new Date().toISOString(), timezone).date;
  const state = normalizeReportParams(searchParams, today);
  if (state.redirect) {
    return <Navigate replace to={`/reports/${view}?${state.params.toString()}`} />;
  }

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in values)) next.delete("page");
    setSearchParams(next);
  };
  const defaultRange = getPresetRange("this-week", today);
  const hasNonDefaultFilters =
    state.common.from !== defaultRange.from ||
    state.common.to !== defaultRange.to ||
    Boolean(state.common.clientId || state.common.projectId || state.common.taskId) ||
    state.common.billable !== "all" ||
    state.common.invoiceStatus !== "all" ||
    state.groupBy !== "client";

  return (
    <main>
      <PageHeader title="Reports" description="Review server-calculated time and historical billable value." />
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <ReportNavigation view={view} searchParams={state.params} />
        <section
          aria-label="Report filters"
          className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5"
        >
          <DateRangePicker
            idPrefix="reportRange"
            from={state.common.from}
            to={state.common.to}
            preset={inferPreset(state.common.from, state.common.to, today)}
            presets={dateRangePresetOptions}
            onPresetChange={(value) => {
              if (value === "custom") return;
              const range = getPresetRange(value as Exclude<DateRangePreset, "custom">, today);
              updateParams({ from: range.from, to: range.to });
            }}
            onChange={(range) => {
              if (!DateOnlySchema.safeParse(range.from).success || !DateOnlySchema.safeParse(range.to).success) return;
              if (range.from !== state.common.from && range.from > range.to) range.to = range.from;
              if (range.to !== state.common.to && range.to < range.from) range.from = range.to;
              updateParams({ from: range.from, to: range.to });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field htmlFor="reportClient" label="Client">
              <ClientSelect
                id="reportClient"
                includeArchived
                placeholder="All clients"
                value={state.common.clientId ?? ""}
                onChange={(event) =>
                  updateParams({ client: event.target.value || null, project: null, task: null })
                }
              />
            </Field>
            <Field htmlFor="reportProject" label="Project">
              <ProjectSelect
                id="reportProject"
                includeArchived
                clientId={state.common.clientId ?? null}
                placeholder="All projects"
                value={state.common.projectId ?? ""}
                onChange={(event) =>
                  updateParams({ project: event.target.value || null, task: null })
                }
              />
            </Field>
            <Field htmlFor="reportTask" label="Task">
              <TaskSelect
                id="reportTask"
                includeArchived
                projectId={state.common.projectId ?? null}
                placeholder="All tasks"
                value={state.common.taskId ?? ""}
                onChange={(event) => updateParams({ task: event.target.value || null })}
              />
            </Field>
            <Field htmlFor="reportBillable" label="Billable state">
              <Select
                id="reportBillable"
                value={state.common.billable}
                onChange={(event) => updateParams({ billable: event.target.value === "all" ? null : event.target.value })}
              >
                <option value="all">All</option>
                <option value="billable">Billable</option>
                <option value="non-billable">Non-billable</option>
              </Select>
            </Field>
            <Field htmlFor="reportInvoice" label="Invoice state">
              <Select
                id="reportInvoice"
                value={state.common.invoiceStatus}
                onChange={(event) => updateParams({ invoice: event.target.value === "all" ? null : event.target.value })}
              >
                <option value="all">All</option>
                <option value="not-invoiced">Not invoiced</option>
                <option value="invoiced">Invoiced</option>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--color-border-default)] pt-4">
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              Period: <strong className="text-[var(--color-text-primary)]">{formatSelectedPeriod(state.common.from, state.common.to)}</strong>
            </p>
            {hasNonDefaultFilters ? (
              <Button
                variant="quiet"
                onClick={() => setSearchParams({ from: defaultRange.from, to: defaultRange.to })}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </section>

        {view === "summary" ? (
          <SummaryReport common={state.common} groupBy={state.groupBy} updateParams={updateParams} />
        ) : (
          <DetailedReport common={state.common} page={state.page} updateParams={updateParams} timezone={timezone} />
        )}
      </div>
    </main>
  );
}

function ReportNavigation({ view, searchParams }: { view: ReportView; searchParams: URLSearchParams }) {
  const search = searchParams.toString();
  const links: Array<{ label: string; icon: typeof BarChart3; view: ReportView }> = [
    { label: "Summary", icon: BarChart3, view: "summary" },
    { label: "Detailed", icon: List, view: "detailed" },
  ];
  return (
    <nav aria-label="Report views" className="flex w-fit rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1">
      {links.map(({ icon: Icon, label, view: target }) => (
        <Link
          key={target}
          aria-current={view === target ? "page" : undefined}
          className={`inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] ${view === target ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-active)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)]"}`}
          to={`/reports/${target}${search ? `?${search}` : ""}`}
        >
          <Icon aria-hidden="true" size={16} /> {label}
        </Link>
      ))}
    </nav>
  );
}

function SummaryReport({
  common,
  groupBy,
  updateParams,
}: {
  common: Omit<ReportSummaryQuery, "groupBy">;
  groupBy: ReportGroupBy;
  updateParams: (values: Record<string, string | null>) => void;
}) {
  const filters = { ...common, groupBy } satisfies ReportSummaryQuery;
  const query = useQuery({
    queryKey: reportKeys.summary(filters),
    queryFn: () => getSummaryReport(filters),
  });
  if (query.isPending) return <ReportSkeleton label="Loading Summary report" />;
  if (query.isError) return <ReportError message={query.error.message} onRetry={() => void query.refetch()} />;
  if (query.data.totalTrackedSeconds === 0) return <ReportEmpty />;

  return (
    <div className="grid gap-5">
      <section aria-labelledby="summaryMetrics" className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5">
        <h2 id="summaryMetrics" className="m-0 text-base font-semibold">Summary</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          <Metric label="Total tracked" value={formatDuration(query.data.totalTrackedSeconds)} />
          <Metric label="Billable" value={formatDuration(query.data.billableSeconds)} />
          <Metric label="Non-billable" value={formatDuration(query.data.nonBillableSeconds)} />
        </dl>
        <div className="mt-5 border-t border-[var(--color-border-default)] pt-4">
          <h3 className="m-0 text-sm font-semibold">Billable value</h3>
          {query.data.billableTotals.length ? (
            <dl className="mt-3 grid max-w-md gap-2">
              {query.data.billableTotals.map((total) => (
                <div key={total.currency} className="grid grid-cols-[4rem_1fr] items-baseline gap-4">
                  <dt className="text-sm font-semibold text-[var(--color-text-secondary)]">{total.currency}</dt>
                  <dd className="m-0 text-right text-lg font-semibold tabular-nums">{formatMoney(total.amount, total.currency)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mb-0 mt-2 text-sm text-[var(--color-text-muted)]">No billable value in this period.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="groupedResults" className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border-default)] px-5 py-4">
          <div>
            <h2 id="groupedResults" className="m-0 text-base font-semibold">Grouped results</h2>
            <p className="mb-0 mt-1 text-xs text-[var(--color-text-muted)]">Amounts remain separated by historical currency.</p>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-text-secondary)]" htmlFor="reportGroupBy">
            Group by
            <Select id="reportGroupBy" value={groupBy} onChange={(event) => updateParams({ group: event.target.value })}>
              <option value="client">Client</option>
              <option value="project">Project</option>
              <option value="task">Task</option>
            </Select>
          </label>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead className="bg-[var(--color-bg-subtle)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr><th className="px-5 py-3" scope="col">Name</th><th className="px-5 py-3 text-right" scope="col">Tracked</th><th className="px-5 py-3 text-right" scope="col">Billable</th><th className="px-5 py-3 text-right" scope="col">Billable value</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-default)]">
              {query.data.groups.map((group) => (
                <tr key={group.key}>
                  <th className="px-5 py-3 text-left font-semibold" scope="row">{group.label}{group.secondaryLabel ? <span className="mt-0.5 block text-xs font-normal text-[var(--color-text-muted)]">{group.secondaryLabel}</span> : null}</th>
                  <td className="px-5 py-3 text-right tabular-nums">{formatDuration(group.trackedSeconds)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatDuration(group.billableSeconds)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{group.billableTotals.length ? group.billableTotals.map((total) => <span key={total.currency} className="block">{total.currency} {formatMoney(total.amount, total.currency)}</span>) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DetailedReport({
  common,
  page,
  timezone,
  updateParams,
}: {
  common: Omit<ReportSummaryQuery, "groupBy">;
  page: number;
  timezone: string;
  updateParams: (values: Record<string, string | null>) => void;
}) {
  const filters = { ...common, page, pageSize: PAGE_SIZE } satisfies ReportDetailedQuery;
  const query = useQuery({
    queryKey: reportKeys.detailed(filters),
    queryFn: () => getDetailedReport(filters),
  });
  if (query.isPending) return <ReportSkeleton label="Loading Detailed report" />;
  if (query.isError) return <ReportError message={query.error.message} onRetry={() => void query.refetch()} />;
  if (query.data.entries.length === 0) return <ReportEmpty />;

  return (
    <section aria-labelledby="detailedResults" className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <header className="border-b border-[var(--color-border-default)] px-5 py-4">
        <h2 id="detailedResults" className="m-0 text-base font-semibold">Detailed entries</h2>
        <p className="mb-0 mt-1 text-xs text-[var(--color-text-muted)]">{query.data.total} {query.data.total === 1 ? "entry" : "entries"}; rates and currencies are historical snapshots.</p>
      </header>
      <DetailedTable entries={query.data.entries} timezone={timezone} />
      {query.data.totalPages > 1 ? (
        <nav aria-label="Detailed report pages" className="flex items-center justify-between gap-4 border-t border-[var(--color-border-default)] px-5 py-4">
          <Button variant="secondary" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>Previous</Button>
          <span className="text-sm text-[var(--color-text-secondary)]">Page <strong className="tabular-nums text-[var(--color-text-primary)]">{page}</strong> of {query.data.totalPages}</span>
          <Button variant="secondary" disabled={page >= query.data.totalPages} onClick={() => updateParams({ page: String(page + 1) })}>Next</Button>
        </nav>
      ) : null}
    </section>
  );
}

const reportTableFeatures = tableFeatures({});
const columnHelper = createColumnHelper<typeof reportTableFeatures, ReportDetailedRow>();
const detailedColumns = columnHelper.columns([
  columnHelper.accessor("workDate", { header: "Date", cell: (info) => formatWorkDate(info.getValue(), "short") }),
  columnHelper.accessor("description", { header: "Description", cell: (info) => <span className="font-semibold">{info.getValue()}</span> }),
  columnHelper.accessor("clientName", { header: "Client" }),
  columnHelper.accessor("projectName", { header: "Project" }),
  columnHelper.accessor("taskName", { header: "Task", cell: (info) => info.getValue() ?? "—" }),
  columnHelper.accessor("startAt", { header: "Start", cell: (info) => formatInstant(info.getValue(), info.table.options.meta as string) }),
  columnHelper.accessor("endAt", { header: "End", cell: (info) => formatInstant(info.getValue(), info.table.options.meta as string) }),
  columnHelper.accessor("durationSeconds", { header: "Duration", cell: (info) => formatDuration(info.getValue()) }),
  columnHelper.accessor("billable", { header: "Billing", cell: (info) => <StatusBadge tone={info.getValue() ? "success" : "neutral"}>{info.getValue() ? "Billable" : "Non-billable"}</StatusBadge> }),
  columnHelper.accessor("hourlyRate", { header: "Rate", cell: (info) => info.row.original.currency && info.getValue() ? `${info.row.original.currency} ${formatMoney(info.getValue()!, info.row.original.currency)}/hr` : "—" }),
  columnHelper.accessor("amount", { header: "Amount", cell: (info) => info.row.original.currency && info.getValue() ? `${info.row.original.currency} ${formatMoney(info.getValue()!, info.row.original.currency)}` : "—" }),
  columnHelper.accessor("invoiceStatus", { header: "Invoice", cell: (info) => info.row.original.invoice ? <Link className="font-semibold text-[var(--color-accent-active)] underline" to={`/invoices/${info.row.original.invoice.id}`}>{info.row.original.invoice.invoiceNumber}</Link> : <StatusBadge tone="neutral">Not invoiced</StatusBadge> }),
]);

function DetailedTable({ entries, timezone }: { entries: ReportDetailedRow[]; timezone: string }) {
  const data = useMemo(() => entries, [entries]);
  const table = useTable({
    data,
    columns: detailedColumns,
    features: reportTableFeatures,
    meta: timezone,
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead className="bg-[var(--color-bg-subtle)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>{headerGroup.headers.map((header) => <th key={header.id} scope="col" className={numericColumns.has(header.column.id) ? "px-4 py-3 text-right" : "px-4 py-3"}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</th>)}</tr>
          ))}
        </thead>
        <tbody className="divide-y divide-[var(--color-border-default)]">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>{row.getAllCells().map((cell) => <td key={cell.id} className={numericColumns.has(cell.column.id) ? "whitespace-nowrap px-4 py-3 text-right tabular-nums" : "max-w-64 px-4 py-3"}><table.FlexRender cell={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const numericColumns = new Set(["startAt", "endAt", "durationSeconds", "hourlyRate", "amount"]);

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-default)] pb-2 sm:block sm:border-0 sm:pb-0"><dt className="text-sm text-[var(--color-text-secondary)]">{label}</dt><dd className="m-0 mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>;
}

function ReportSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="grid gap-3"><div className="h-36 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] motion-reduce:animate-none" /><div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] motion-reduce:animate-none" /><span className="sr-only">{label}…</span></div>;
}

function ReportsLoading() {
  return <main><PageHeader title="Reports" description="Turn tracked time into billing intelligence." /><div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:px-10"><ReportSkeleton label="Loading reports" /></div></main>;
}

function ReportError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <InlineError>{message} Your selected filters are unchanged. <button type="button" className="font-semibold underline" onClick={onRetry}>Try again</button></InlineError>;
}

function ReportEmpty() {
  return <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5"><EmptyState title="No time entries for this report" description="Adjust the selected period or filters to include tracked time." /></div>;
}

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

function formatInstant(value: string | null, timezone: string): string {
  if (!value) return "—";
  const { time } = instantFields(value, timezone);
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
}
