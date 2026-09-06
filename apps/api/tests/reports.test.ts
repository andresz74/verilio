import type { VerilioDatabase } from "@verilio/db";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { ReportServiceContract } from "../src/report-service.js";

function service(): ReportServiceContract {
  return {
    summary: vi.fn().mockResolvedValue({
      range: { from: "2026-09-01", to: "2026-09-07" },
      totalTrackedSeconds: 0,
      billableSeconds: 0,
      nonBillableSeconds: 0,
      billableTotals: [],
      groupBy: "client",
      groups: [],
      hoursByDay: [],
      hoursByProject: [],
    }),
    detailed: vi.fn().mockResolvedValue({
      range: { from: "2026-09-01", to: "2026-09-07" },
      entries: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    }),
  };
}

describe("report routes", () => {
  it("parses shared Summary and Detailed filters", async () => {
    const reportService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, reportService });
    const filters = "from=2026-09-01&to=2026-09-07&billable=billable&invoiceStatus=not-invoiced";

    expect((await app.inject({ method: "GET", url: `/api/v1/reports/summary?${filters}` })).statusCode).toBe(200);
    expect(reportService.summary).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-07",
      billable: "billable",
      invoiceStatus: "not-invoiced",
      groupBy: "client",
    });

    expect((await app.inject({ method: "GET", url: `/api/v1/reports/detailed?${filters}` })).statusCode).toBe(200);
    expect(reportService.detailed).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-07",
      billable: "billable",
      invoiceStatus: "not-invoiced",
      page: 1,
      pageSize: 25,
    });
    await app.close();
  });

  it("rejects invalid dates and hierarchy-shaped filters", async () => {
    const reportService = service();
    const app = buildApp({ db: {} as VerilioDatabase, logger: false, reportService });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/reports/summary?from=2026-09-07&to=2026-09-01&projectId=22222222-2222-4222-8222-222222222222",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: {
          projectId: [expect.any(String)],
          to: [expect.any(String)],
        },
      },
    });
    expect(reportService.summary).not.toHaveBeenCalled();
    await app.close();
  });
});
