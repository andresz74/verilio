export function calculateDurationSeconds(startAt: Date, endAt: Date): number {
  const milliseconds = endAt.getTime() - startAt.getTime();
  if (milliseconds < 0) {
    throw new RangeError("End time must not be before start time");
  }

  return Math.floor(milliseconds / 1_000);
}

export function assertPositiveDurationSeconds(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Completed time-entry duration must be a positive integer");
  }

  return value;
}

