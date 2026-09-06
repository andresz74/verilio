import { Decimal } from "decimal.js";

export type DecimalInput = Decimal.Value;

export function getCurrencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", {
      currency,
      style: "currency",
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    throw new RangeError(`Unsupported currency code: ${currency}`);
  }
}

export function roundMoney(amount: DecimalInput, currency: string): string {
  const fractionDigits = getCurrencyFractionDigits(currency);
  return new Decimal(amount).toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP).toFixed(
    fractionDigits,
  );
}

export function calculateTimeValue(
  durationSeconds: number,
  hourlyRate: DecimalInput,
): Decimal {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0) {
    throw new RangeError("Duration must be a non-negative integer number of seconds");
  }

  return new Decimal(hourlyRate).mul(durationSeconds).div(3_600);
}

export function calculateHistoricalTimeAmount(input: {
  billable: boolean;
  currency: string | null;
  durationSeconds: number;
  hourlyRate: DecimalInput | null;
}): string | null {
  if (!input.billable) return null;
  if (input.hourlyRate === null || input.currency === null) {
    throw new RangeError("Billable time requires historical rate and currency snapshots");
  }
  return roundMoney(
    calculateTimeValue(input.durationSeconds, input.hourlyRate),
    input.currency,
  );
}
