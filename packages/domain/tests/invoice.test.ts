import { describe, expect, it } from "vitest";

import {
  calculateInvoice,
  calculateInvoiceLineAmount,
  canTransitionInvoice,
  deriveInvoiceDisplayStatus,
  durationSecondsToInvoiceQuantity,
  groupInvoiceTime,
} from "../src/index.js";

describe("invoice calculations", () => {
  it("applies rounded percentage discount before tax", () => {
    expect(calculateInvoice({
      currency: "USD",
      lines: [{ quantity: "10", unitPrice: "100" }],
      discountType: "percentage",
      discountValue: "10",
      taxPercent: "6",
    })).toEqual({
      lineAmounts: ["1000.00"],
      subtotal: "1000.00",
      discountAmount: "100.00",
      taxableSubtotal: "900.00",
      taxAmount: "54.00",
      total: "954.00",
    });
  });

  it("uses ROUND_HALF_UP, fixed discounts, zero values, and currency minor units", () => {
    expect(calculateInvoiceLineAmount("1", "10.005", "USD")).toBe("10.01");
    expect(calculateInvoiceLineAmount("1", "10.5", "JPY")).toBe("11");
    expect(calculateInvoice({
      currency: "USD",
      lines: [{ quantity: "2", unitPrice: "25" }],
      discountType: "fixed",
      discountValue: "5",
      taxPercent: "0",
    })).toMatchObject({ subtotal: "50.00", discountAmount: "5.00", taxAmount: "0.00", total: "45.00" });
    expect(calculateInvoice({
      currency: "USD",
      lines: [],
      discountType: "none",
      discountValue: "0",
      taxPercent: "0",
    }).total).toBe("0.00");
  });

  it("caps discount at subtotal", () => {
    expect(() => calculateInvoice({ currency: "USD", lines: [{ quantity: "1", unitPrice: "10" }], discountType: "fixed", discountValue: "10.01", taxPercent: "0" })).toThrow("cannot exceed subtotal");
  });
});

describe("invoice time grouping", () => {
  const entries = [
    { id: "a", description: "One", projectId: "p", projectName: "Project", taskId: "t", taskName: "Task", durationSeconds: 3_600, hourlyRate: "85.0000", currency: "USD" },
    { id: "b", description: "Two", projectId: "p", projectName: "Project", taskId: "t", taskName: "Task", durationSeconds: 1_800, hourlyRate: "85.0000", currency: "USD" },
    { id: "c", description: "Three", projectId: "p", projectName: "Project", taskId: null, taskName: null, durationSeconds: 7_200, hourlyRate: "100.0000", currency: "USD" },
  ];

  it("preserves duration precision and splits Project groups by historical rate", () => {
    expect(durationSecondsToInvoiceQuantity(1)).toBe("0.000277777778");
    const result = groupInvoiceTime(entries, "project", "USD");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ description: "Project", quantity: "1.500000000000", unitPrice: "85.0000", amount: "127.50", sourceIds: ["a", "b"] });
    expect(result[1]).toMatchObject({ quantity: "2.000000000000", unitPrice: "100.0000", amount: "200.00", sourceIds: ["c"] });
  });

  it("supports Task fallback and Individual grouping", () => {
    expect(groupInvoiceTime(entries, "task", "USD").map((line) => line.description)).toEqual(["No task — Project", "Task"]);
    expect(groupInvoiceTime(entries, "individual", "USD")).toHaveLength(3);
  });
});

describe("invoice state foundation", () => {
  it("permits only approved transitions and keeps Paid/Void terminal", () => {
    expect(canTransitionInvoice("draft", "sent")).toBe(true);
    expect(canTransitionInvoice("draft", "void")).toBe(true);
    expect(canTransitionInvoice("sent", "paid")).toBe(true);
    expect(canTransitionInvoice("sent", "void")).toBe(true);
    expect(canTransitionInvoice("draft", "paid")).toBe(false);
    expect(canTransitionInvoice("sent", "sent")).toBe(false);
    expect(canTransitionInvoice("paid", "void")).toBe(false);
    expect(canTransitionInvoice("paid", "draft")).toBe(false);
    expect(canTransitionInvoice("void", "sent")).toBe(false);
    expect(canTransitionInvoice("void", "paid")).toBe(false);
    expect(canTransitionInvoice("void", "draft")).toBe(false);
  });

  it("derives Overdue only after the due date in the current Business date", () => {
    expect(deriveInvoiceDisplayStatus({ status: "sent", dueDate: "2026-09-05", paidAt: null, currentBusinessDate: "2026-09-06" })).toBe("overdue");
    expect(deriveInvoiceDisplayStatus({ status: "sent", dueDate: "2026-09-06", paidAt: null, currentBusinessDate: "2026-09-06" })).toBe("sent");
    expect(deriveInvoiceDisplayStatus({ status: "sent", dueDate: "2026-09-07", paidAt: null, currentBusinessDate: "2026-09-06" })).toBe("sent");
    expect(deriveInvoiceDisplayStatus({ status: "paid", dueDate: "2026-09-05", paidAt: "2026-09-06", currentBusinessDate: "2026-09-07" })).toBe("paid");
    expect(deriveInvoiceDisplayStatus({ status: "void", dueDate: "2026-09-05", paidAt: null, currentBusinessDate: "2026-09-07" })).toBe("void");
  });
});
