import type { DateOnly } from "@verilio/contracts";

import { assertDateOnly } from "./date-only.js";
import { assertPositiveDurationSeconds, calculateDurationSeconds } from "./duration.js";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimezone(instant: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function workDateFromInstant(instant: Date, timezone: string): DateOnly {
  const { year, month, day } = partsInTimezone(instant, timezone);
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function addDays(dateOnly: DateOnly, days: number): DateOnly {
  assertDateOnly(dateOnly);
  const [year, month, day] = dateOnly.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function zonedDateTimeToInstant(
  dateOnly: DateOnly,
  time: string,
  timezone: string,
): Date {
  assertDateOnly(dateOnly);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError("Invalid time of day");
  const [year, month, day] = dateOnly.split("-").map(Number) as [number, number, number];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desired;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsInTimezone(new Date(candidate), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += desired - actualAsUtc;
  }

  const instant = new Date(candidate);
  const actual = partsInTimezone(instant, timezone);
  if (
    actual.year !== year ||
    actual.month !== month ||
    actual.day !== day ||
    actual.hour !== hour ||
    actual.minute !== minute
  ) {
    throw new RangeError("This local time does not exist in the configured timezone");
  }
  return instant;
}

export function resolveRange(
  workDate: DateOnly,
  startTime: string,
  endTime: string,
  endsNextDay: boolean,
  timezone: string,
): { startAt: Date; endAt: Date; durationSeconds: number; workDate: DateOnly } {
  const startAt = zonedDateTimeToInstant(workDate, startTime, timezone);
  const endDate = endsNextDay ? addDays(workDate, 1) : workDate;
  const endAt = zonedDateTimeToInstant(endDate, endTime, timezone);
  const durationSeconds = assertPositiveDurationSeconds(calculateDurationSeconds(startAt, endAt));
  return {
    startAt,
    endAt,
    durationSeconds,
    workDate: workDateFromInstant(startAt, timezone),
  };
}

export function resolveHourlyRate({
  billable,
  explicitRate,
  projectRate,
  clientRate,
  businessRate,
}: {
  billable: boolean;
  explicitRate?: string | null;
  projectRate?: string | null;
  clientRate?: string | null;
  businessRate: string;
}): string | null {
  if (!billable) return null;
  return explicitRate ?? projectRate ?? clientRate ?? businessRate;
}
