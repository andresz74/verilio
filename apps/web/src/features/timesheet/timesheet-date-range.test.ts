import { describe, expect, it } from "vitest";

import {
  formatSelectedPeriod,
  getPresetRange,
  inferPreset,
} from "./timesheet-date-range.js";

describe("timesheet date ranges", () => {
  it("uses Monday through Sunday for the current and previous week", () => {
    expect(getPresetRange("this-week", "2026-09-05")).toEqual({
      from: "2026-08-31",
      to: "2026-09-06",
    });
    expect(getPresetRange("last-week", "2026-09-05")).toEqual({
      from: "2026-08-24",
      to: "2026-08-30",
    });
  });

  it("handles rolling and month boundaries as date-only values", () => {
    expect(getPresetRange("past-two-weeks", "2026-03-03")).toEqual({
      from: "2026-02-18",
      to: "2026-03-03",
    });
    expect(getPresetRange("last-month", "2026-03-03")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("recognizes presets and labels custom periods", () => {
    expect(inferPreset("2026-09-05", "2026-09-05", "2026-09-05")).toBe("today");
    expect(inferPreset("2026-09-01", "2026-09-05", "2026-09-05")).toBe("custom");
    expect(formatSelectedPeriod("2026-09-01", "2026-09-05")).toContain("Sep 1");
  });
});
