import {
  resolveHourlyRate,
  resolveRange,
  workDateFromInstant,
  zonedDateTimeToInstant,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("time domain", () => {
  it("resolves historical rates in explicit, project, client, business order", () => {
    const base = {
      billable: true,
      explicitRate: null,
      projectRate: null,
      clientRate: null,
      businessRate: "80.0000",
    };
    expect(resolveHourlyRate(base)).toBe("80.0000");
    expect(resolveHourlyRate({ ...base, clientRate: "90.0000" })).toBe("90.0000");
    expect(
      resolveHourlyRate({ ...base, clientRate: "90.0000", projectRate: "100.0000" }),
    ).toBe("100.0000");
    expect(
      resolveHourlyRate({
        ...base,
        explicitRate: "125.0000",
        projectRate: "100.0000",
        clientRate: "90.0000",
      }),
    ).toBe("125.0000");
    expect(resolveHourlyRate({ ...base, billable: false, projectRate: "100.0000" })).toBeNull();
  });

  it("derives work dates in the configured IANA timezone", () => {
    const instant = new Date("2026-09-06T03:30:00.000Z");
    expect(workDateFromInstant(instant, "America/New_York")).toBe("2026-09-05");
    expect(workDateFromInstant(instant, "UTC")).toBe("2026-09-06");
  });

  it("calculates explicit cross-midnight ranges", () => {
    expect(
      resolveRange("2026-09-05", "23:30", "01:00", true, "America/New_York"),
    ).toMatchObject({ workDate: "2026-09-05", durationSeconds: 5_400 });
  });

  it("rejects invalid same-day and daylight-saving gap ranges", () => {
    expect(() =>
      resolveRange("2026-09-05", "23:30", "01:00", false, "America/New_York"),
    ).toThrow("before start");
    expect(() =>
      zonedDateTimeToInstant("2026-03-08", "02:30", "America/New_York"),
    ).toThrow("does not exist");
  });
});
