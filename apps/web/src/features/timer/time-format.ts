import type { TimeEntryDto } from "@verilio/contracts";

export function formatClockDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remaining = safe % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Running";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function parseDurationText(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  const clock = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (clock) return Number(clock[1]) * 3_600 + Number(clock[2]) * 60;
  const hoursMinutes = /^(?:(\d+)h)?\s*(?:(\d+)m)?$/.exec(trimmed);
  if (hoursMinutes && (hoursMinutes[1] || hoursMinutes[2])) {
    return Number(hoursMinutes[1] ?? 0) * 3_600 + Number(hoursMinutes[2] ?? 0) * 60;
  }
  return null;
}

export function formatDurationInput(seconds: number | null): string {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function instantFields(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function hierarchyLabel(entry: TimeEntryDto): string {
  return [entry.clientName, entry.projectName, entry.taskName].filter(Boolean).join(" · ");
}
