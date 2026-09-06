import { DateOnlySchema, type TimeEntryDto, type TimeEntryListQuery } from "@verilio/contracts";
import {
  Button,
  DateRangePicker,
  EmptyState,
  InlineError,
  StatusBadge,
  TextInput,
} from "@verilio/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";

import { PageHeader } from "../../app/app-shell.js";
import { getSettings } from "../settings/settings-api.js";
import { DeleteTimeEntryDialog } from "../timer/delete-time-entry-dialog.js";
import {
  getTimeEntries,
  timeEntryKeys,
} from "../timer/time-entry-api.js";
import { TimeEntryFormDialog } from "../timer/time-entry-form-dialog.js";
import { formatDuration, hierarchyLabel, instantFields } from "../timer/time-format.js";
import {
  formatSelectedPeriod,
  formatWorkDate,
  getPresetRange,
  inferPreset,
  timesheetPresetOptions,
  type TimesheetPreset,
} from "./timesheet-date-range.js";

const PAGE_SIZE = 25;

export function TimesheetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualOpen, setManualOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntryDto | null>(null);
  const [deleting, setDeleting] = useState<TimeEntryDto | null>(null);
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  if (settingsQuery.isPending) return <TimesheetLoading />;
  if (settingsQuery.isError || !settingsQuery.data.settings) {
    return (
      <main>
        <PageHeader title="Timesheet" description="Review and correct your tracked work by day." />
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:px-10">
          <InlineError>Business settings could not be loaded. Retry before reviewing time.</InlineError>
        </div>
      </main>
    );
  }

  const timezone = settingsQuery.data.settings.timezone;
  const today = instantFields(new Date().toISOString(), timezone).date;
  const normalized = normalizeFilters(searchParams, today);
  if (normalized.redirect) {
    return <Navigate replace to={`/timesheet?${normalized.params.toString()}`} />;
  }

  return (
    <TimesheetContent
      filters={normalized.filters}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
      timezone={timezone}
      today={today}
      manualOpen={manualOpen}
      setManualOpen={setManualOpen}
      editing={editing}
      setEditing={setEditing}
      deleting={deleting}
      setDeleting={setDeleting}
    />
  );
}

function TimesheetContent({
  deleting,
  editing,
  filters,
  manualOpen,
  searchParams,
  setDeleting,
  setEditing,
  setManualOpen,
  setSearchParams,
  timezone,
  today,
}: {
  deleting: TimeEntryDto | null;
  editing: TimeEntryDto | null;
  filters: TimeEntryListQuery;
  manualOpen: boolean;
  searchParams: URLSearchParams;
  setDeleting: (entry: TimeEntryDto | null) => void;
  setEditing: (entry: TimeEntryDto | null) => void;
  setManualOpen: (open: boolean) => void;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  timezone: string;
  today: string;
}) {
  const query = useQuery({
    queryKey: timeEntryKeys.list(filters),
    queryFn: () => getTimeEntries(filters),
  });
  const preset = searchParams.get("preset") === "custom"
    ? "custom"
    : inferPreset(filters.from, filters.to, today);

  if (query.data && filters.page > Math.max(1, query.data.totalPages)) {
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    return <Navigate replace to={`/timesheet?${next.toString()}`} />;
  }

  const updateParams = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value && !(key === "page" && value === "1")) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  };

  const groups = groupEntries(query.data?.entries ?? []);
  const dailyTotals = new Map(
    query.data?.dailyTotals.map((day) => [day.workDate, day.durationSeconds]) ?? [],
  );

  return (
    <main>
      <PageHeader
        title="Timesheet"
        description="Review tracked work by its authoritative work date."
        actions={
          <Button onClick={() => setManualOpen(true)}>
            <Plus aria-hidden="true" size={16} /> Add time
          </Button>
        }
      />
      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <section
          aria-label="Timesheet filters"
          className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5"
        >
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            preset={preset}
            presets={timesheetPresetOptions}
            onPresetChange={(value) => {
              if (value === "custom") {
                updateParams({ preset: "custom" });
                return;
              }
              const range = getPresetRange(value as Exclude<TimesheetPreset, "custom">, today);
              updateParams({ from: range.from, to: range.to, page: "1", preset: null });
            }}
            onChange={(range) => {
              if (!DateOnlySchema.safeParse(range.from).success || !DateOnlySchema.safeParse(range.to).success) return;
              if (range.from !== filters.from && range.from > range.to) range.to = range.from;
              if (range.to !== filters.to && range.to < range.from) range.from = range.to;
              updateParams({ from: range.from, to: range.to, page: "1", preset: "custom" });
            }}
          />
          <SearchForm
            key={filters.search}
            value={filters.search}
            onSearch={(search) => updateParams({ q: search || null, page: "1" })}
          />
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Selected period</p>
            <h2 className="mb-0 mt-1 text-lg font-semibold">{formatSelectedPeriod(filters.from, filters.to)}</h2>
          </div>
          {query.data ? (
            <p className="m-0 text-sm text-[var(--color-text-secondary)]">
              <strong className="tabular-nums text-[var(--color-text-primary)]">{formatDuration(query.data.totalDurationSeconds)}</strong>
              {" · "}{query.data.total} {query.data.total === 1 ? "entry" : "entries"}
            </p>
          ) : null}
        </div>

        {query.isPending ? (
          <TimesheetSkeleton />
        ) : query.isError ? (
          <InlineError>
            Timesheet could not be loaded. Your selected period is unchanged.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>
              Try again
            </button>
          </InlineError>
        ) : query.data.entries.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5">
            <EmptyState
              title={filters.search ? "No matching time entries" : "No time tracked for this period"}
              description={filters.search ? "No time entries match this search in the selected date range." : "Track work or add missing time without changing this selected period."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={() => setManualOpen(true)}><Plus aria-hidden="true" size={16} /> Add time</Button>
                  <Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-accent-default)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]" to="/timer"><Clock3 aria-hidden="true" size={16} /> Start Timer</Link>
                </div>
              }
            />
          </div>
        ) : (
          <div className="grid gap-4" aria-label="Time entries by work date">
            {groups.map(([workDate, entries]) => (
              <TimesheetDayGroup
                key={workDate}
                workDate={workDate}
                entries={entries}
                total={dailyTotals.get(workDate) ?? 0}
                timezone={timezone}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}

        {query.data && query.data.totalPages > 1 ? (
          <nav aria-label="Timesheet pages" className="flex items-center justify-between gap-4">
            <Button variant="secondary" disabled={filters.page <= 1} onClick={() => updateParams({ page: String(filters.page - 1) })}>Previous</Button>
            <span className="text-sm text-[var(--color-text-secondary)]">Page <strong className="tabular-nums text-[var(--color-text-primary)]">{filters.page}</strong> of {query.data.totalPages}</span>
            <Button variant="secondary" disabled={filters.page >= query.data.totalPages} onClick={() => updateParams({ page: String(filters.page + 1) })}>Next</Button>
          </nav>
        ) : null}
      </div>

      {manualOpen ? <TimeEntryFormDialog entry={null} timezone={timezone} onOpenChange={setManualOpen} /> : null}
      {editing ? <TimeEntryFormDialog entry={editing} timezone={timezone} onOpenChange={(open) => { if (!open) setEditing(null); }} /> : null}
      {deleting ? <DeleteTimeEntryDialog entry={deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} /> : null}
    </main>
  );
}

function SearchForm({ value, onSearch }: { value: string; onSearch: (value: string) => void }) {
  const [search, setSearch] = useState(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(search.trim());
  };
  return (
    <form className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-4 sm:flex-row sm:items-end" onSubmit={submit} role="search">
      <label className="grid flex-1 gap-1.5 text-sm font-medium" htmlFor="timesheetSearch">
        Search descriptions
        <TextInput id="timesheetSearch" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. code review" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary"><Search aria-hidden="true" size={16} /> Search</Button>
        {value ? <Button variant="quiet" onClick={() => onSearch("")}>Clear</Button> : null}
      </div>
    </form>
  );
}

function TimesheetDayGroup({
  entries,
  onDelete,
  onEdit,
  timezone,
  total,
  workDate,
}: {
  entries: TimeEntryDto[];
  onDelete: (entry: TimeEntryDto) => void;
  onEdit: (entry: TimeEntryDto) => void;
  timezone: string;
  total: number;
  workDate: string;
}) {
  return (
    <section aria-labelledby={`day-${workDate}`} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-5 py-3">
        <h3 id={`day-${workDate}`} className="m-0 text-sm font-semibold">{formatWorkDate(workDate)}</h3>
        <strong className="text-sm tabular-nums">{formatDuration(total)}</strong>
      </header>
      <ul className="m-0 list-none divide-y divide-[var(--color-border-default)] p-0">
        {entries.map((entry) => (
          <li key={entry.id}>
            <TimeEntryRow entry={entry} timezone={timezone} onEdit={onEdit} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimeEntryRow({ entry, onDelete, onEdit, timezone }: { entry: TimeEntryDto; onDelete: (entry: TimeEntryDto) => void; onEdit: (entry: TimeEntryDto) => void; timezone: string }) {
  return (
    <article className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
      <div className="min-w-0">
        <h4 className="m-0 truncate text-sm font-semibold">{entry.description}</h4>
        <p className="mb-0 mt-1 text-xs text-[var(--color-text-secondary)]">{hierarchyLabel(entry)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusBadge tone={entry.billable ? "success" : "neutral"}>{entry.billable ? "Billable" : "Non-billable"}</StatusBadge>
          <StatusBadge tone="neutral">Not invoiced</StatusBadge>
          <StatusBadge tone="neutral">{entry.mode === "duration" ? "Duration" : entry.mode === "timer" ? "Timer" : "Range"}</StatusBadge>
        </div>
      </div>
      <div className="md:text-right">
        <p className="m-0 text-sm text-[var(--color-text-secondary)]">{formatEntryTiming(entry, timezone)}</p>
        <strong className="mt-1 block text-base tabular-nums">{formatDuration(entry.durationSeconds)}</strong>
      </div>
      <div className="flex gap-2 md:justify-end">
        <Button size="sm" variant="secondary" onClick={() => onEdit(entry)}>Edit</Button>
        <Button size="sm" variant="quiet" onClick={() => onDelete(entry)}>Delete</Button>
      </div>
    </article>
  );
}

function formatEntryTiming(entry: TimeEntryDto, timezone: string): string {
  if (entry.mode === "duration" || !entry.startAt || !entry.endAt) return "Duration only";
  const start = instantFields(entry.startAt, timezone);
  const end = instantFields(entry.endAt, timezone);
  const time = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
  };
  if (start.date === end.date) return `${time(start.time)}–${time(end.time)}`;
  return `${formatWorkDate(start.date, "short")}, ${time(start.time)} → ${formatWorkDate(end.date, "short")}, ${time(end.time)}`;
}

function groupEntries(entries: TimeEntryDto[]): Array<[string, TimeEntryDto[]]> {
  const groups = new Map<string, TimeEntryDto[]>();
  for (const entry of entries) groups.set(entry.workDate, [...(groups.get(entry.workDate) ?? []), entry]);
  return [...groups.entries()];
}

function normalizeFilters(searchParams: URLSearchParams, today: string): { redirect: boolean; params: URLSearchParams; filters: TimeEntryListQuery } {
  const defaultRange = getPresetRange("this-week", today);
  const from = DateOnlySchema.safeParse(searchParams.get("from")).success ? searchParams.get("from")! : defaultRange.from;
  const to = DateOnlySchema.safeParse(searchParams.get("to")).success ? searchParams.get("to")! : defaultRange.to;
  const range = from <= to ? { from, to } : defaultRange;
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const search = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const normalized = new URLSearchParams();
  normalized.set("from", range.from);
  normalized.set("to", range.to);
  if (search) normalized.set("q", search);
  if (searchParams.get("preset") === "custom") normalized.set("preset", "custom");
  if (page > 1) normalized.set("page", String(page));
  const redirect = normalized.toString() !== searchParams.toString();
  return { redirect, params: normalized, filters: { ...range, page, pageSize: PAGE_SIZE, search } };
}

function TimesheetLoading() {
  return <main><PageHeader title="Timesheet" description="Review and correct your tracked work by day." /><div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:px-10"><TimesheetSkeleton /></div></main>;
}

function TimesheetSkeleton() {
  return <div aria-label="Loading timesheet" role="status" className="grid gap-3"><div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] motion-reduce:animate-none" /><div className="h-44 animate-pulse rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] motion-reduce:animate-none" /><span className="sr-only">Loading timesheet…</span></div>;
}
