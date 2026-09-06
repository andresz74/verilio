export type TimesheetPreset =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "past-two-weeks"
  | "this-month"
  | "last-month"
  | "custom";

export const timesheetPresetOptions = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "past-two-weeks", label: "Past two weeks" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "custom", label: "Custom range" },
] satisfies Array<{ value: TimesheetPreset; label: string }>;

export function getPresetRange(
  preset: Exclude<TimesheetPreset, "custom">,
  today: string,
): { from: string; to: string } {
  const thisWeekStart = addDays(today, -weekdayOffset(today));
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const date = addDays(today, -1);
      return { from: date, to: date };
    }
    case "this-week":
      return { from: thisWeekStart, to: addDays(thisWeekStart, 6) };
    case "last-week": {
      const from = addDays(thisWeekStart, -7);
      return { from, to: addDays(from, 6) };
    }
    case "past-two-weeks":
      return { from: addDays(today, -13), to: today };
    case "this-month":
      return monthRange(today, 0);
    case "last-month":
      return monthRange(today, -1);
  }
}

export function inferPreset(from: string, to: string, today: string): TimesheetPreset {
  for (const option of timesheetPresetOptions) {
    if (option.value === "custom") continue;
    const range = getPresetRange(option.value, today);
    if (range.from === from && range.to === to) return option.value;
  }
  return "custom";
}

export function formatWorkDate(value: string, style: "long" | "short" = "long"): string {
  const date = parseDate(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : undefined,
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
  }).format(date);
}

export function formatSelectedPeriod(from: string, to: string): string {
  if (from === to) return formatWorkDate(from);
  return `${formatWorkDate(from, "short")} – ${formatWorkDate(to, "short")}`;
}

function weekdayOffset(value: string): number {
  const day = parseDate(value).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function monthRange(today: string, offset: number): { from: string; to: string } {
  const current = parseDate(today);
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: serialize(first), to: serialize(last) };
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return serialize(date);
}

function parseDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function serialize(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
