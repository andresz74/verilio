import Decimal from "decimal.js";

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
