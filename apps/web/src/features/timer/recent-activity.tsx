import type { TimeEntryDto } from "@verilio/contracts";
import { Button, StatusBadge } from "@verilio/ui";
import { ChevronDown, ChevronUp, Play } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import type { RecentActivityGroup } from "./timer-activity.js";
import { formatDuration, formatHourlyRate, hierarchyLabel, instantFields } from "./time-format.js";

type EntryActions = {
  onEdit: (entry: TimeEntryDto) => void;
  onDelete: (entry: TimeEntryDto) => void;
};

export function RecentActivity({ group, timezone, startDisabled, onContinue, onEdit, onDelete }: EntryActions & {
  group: RecentActivityGroup;
  timezone: string;
  startDisabled: boolean;
  onContinue: (entry: TimeEntryDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sessionsId = useId();
  const entry = group.entries[0];
  const multiple = group.entries.length > 1;
  const description = entry.description || "Untitled work";
  return (
    <article className="min-w-0 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="m-0 break-words text-sm font-semibold">{description}</h3>
          <p className="mb-0 mt-1 break-words text-xs text-[var(--color-text-secondary)]">{multiple ? hierarchyLabel(entry) : `${entry.workDate} · ${hierarchyLabel(entry)}`}</p>
          {multiple ? <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={entry.billable ? "success" : "neutral"}>{entry.billable ? "Billable" : "Non-billable"}</StatusBadge>
            <span className="text-sm tabular-nums">{group.entries.length} sessions · {formatDuration(group.durationSeconds)}</span>
          </div> : <SessionBadges entry={entry} />}
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {!multiple ? <strong className="mr-2 text-sm tabular-nums">{formatDuration(entry.durationSeconds)}</strong> : null}
          <Button size="sm" variant="quiet" aria-label="Continue activity" disabled={startDisabled} onClick={() => onContinue(entry)}><Play aria-hidden="true" size={16} /> Continue</Button>
          {multiple ? <Button size="sm" variant="quiet" aria-label={`${expanded ? "Hide" : "Show"} sessions for ${description}`} aria-expanded={expanded} aria-controls={sessionsId} onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
            {expanded ? "Hide sessions" : "Show sessions"}
          </Button> : <SessionActions entry={entry} onEdit={onEdit} onDelete={onDelete} />}
        </div>
      </div>
      {multiple ? <ul id={sessionsId} aria-label={`Sessions for ${description}`} hidden={!expanded} className="mb-0 mt-3 list-none divide-y divide-[var(--color-border-default)] border-t border-[var(--color-border-default)] p-0">
        {group.entries.map((session) => <li key={session.id} className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-xs text-[var(--color-text-secondary)]">{session.workDate} · {sessionRange(session, timezone)}</p>
            <SessionBadges entry={session} />
            {!session.invoice ? <p className="mb-0 mt-1 text-xs text-[var(--color-text-muted)]">Not invoiced</p> : null}
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <strong className="mr-2 text-sm tabular-nums">{formatDuration(session.durationSeconds)}</strong>
            <SessionActions entry={session} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </li>)}
      </ul> : null}
    </article>
  );
}

function SessionBadges({ entry }: { entry: TimeEntryDto }) {
  return <div className="mt-2 flex flex-wrap gap-2">
    <StatusBadge tone={entry.billable ? "success" : "neutral"}>{entry.billable ? `Billable · ${entry.hourlyRate ? formatHourlyRate(entry.hourlyRate) : "—"}/hr` : "Non-billable"}</StatusBadge>
    <StatusBadge tone="neutral">{entry.mode}</StatusBadge>
  </div>;
}

function SessionActions({ entry, onEdit, onDelete }: EntryActions & { entry: TimeEntryDto }) {
  return entry.invoice ? <Link className="inline-flex min-h-8 items-center px-2 text-sm font-semibold text-[var(--color-accent-active)] underline" to={`/invoices/${entry.invoice.id}`}>View {entry.invoice.invoiceNumber}</Link> : <>
    <Button size="sm" variant="secondary" onClick={() => onEdit(entry)}>Edit</Button>
    {entry.hasInvoiceHistory ? <span className="text-xs text-[var(--color-text-muted)]">Kept for Invoice history</span> : <Button size="sm" variant="quiet" onClick={() => onDelete(entry)}>Delete</Button>}
  </>;
}

function sessionRange(entry: TimeEntryDto, timezone: string): string {
  if (!entry.startAt || !entry.endAt) return "Duration only";
  const start = instantFields(entry.startAt, timezone);
  const end = instantFields(entry.endAt, timezone);
  return `${start.time}–${start.date === end.date ? "" : `${end.date} `}${end.time}`;
}
