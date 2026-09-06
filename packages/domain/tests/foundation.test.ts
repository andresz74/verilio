import { describe, expect, it } from "vitest";

import {
  assertDateOnly,
  assertPositiveDurationSeconds,
  calculateDurationSeconds,
  calculateHistoricalTimeAmount,
  calculateTimeValue,
  getCurrencyFractionDigits,
  isDateOnly,
  roundMoney,
} from "../src/index.js";

describe("date-only values", () => {
  it("accepts real calendar dates and rejects rollovers", () => {
    expect(isDateOnly("2026-08-31")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(assertDateOnly("2024-02-29")).toBe("2024-02-29");
  });
});

describe("duration boundaries", () => {
  it("calculates elapsed whole seconds", () => {
    expect(
      calculateDurationSeconds(
        new Date("2026-08-31T23:30:00.000Z"),
        new Date("2026-09-01T01:00:00.000Z"),
      ),
    ).toBe(5_400);
  });

  it("rejects invalid completed durations", () => {
    expect(() => assertPositiveDurationSeconds(0)).toThrow(RangeError);
    expect(() =>
      calculateDurationSeconds(
        new Date("2026-09-01T01:00:00.000Z"),
        new Date("2026-08-31T23:30:00.000Z"),
      ),
    ).toThrow(RangeError);
  });
});

describe("decimal-safe money", () => {
  it("calculates time value without binary floating-point authority", () => {
    const value = calculateTimeValue(9_000, "85");
    expect(value.toFixed(2)).toBe("212.50");
  });

  it("uses currency minor units and half-up rounding", () => {
    expect(getCurrencyFractionDigits("USD")).toBe(2);
    expect(getCurrencyFractionDigits("JPY")).toBe(0);
    expect(roundMoney("10.005", "USD")).toBe("10.01");
  });

  it("calculates historical time amounts and excludes non-billable time", () => {
    expect(
      calculateHistoricalTimeAmount({
        billable: true,
        currency: "USD",
        durationSeconds: 5_400,
        hourlyRate: "85.0000",
      }),
    ).toBe("127.50");
    expect(
      calculateHistoricalTimeAmount({
        billable: false,
        currency: null,
        durationSeconds: 5_400,
        hourlyRate: null,
      }),
    ).toBeNull();
  });

  it("rejects incomplete billable snapshots", () => {
    expect(() =>
      calculateHistoricalTimeAmount({
        billable: true,
        currency: null,
        durationSeconds: 3_600,
        hourlyRate: "85.0000",
      }),
    ).toThrow("historical rate and currency");
  });
});
