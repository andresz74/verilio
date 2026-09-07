import { Decimal } from "decimal.js";

import { roundMoney, type DecimalInput } from "./money.js";

export type InvoiceDiscountType = "none" | "percentage" | "fixed";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceGrouping = "project" | "task" | "individual";

export type InvoiceCalculation = {
  lineAmounts: string[];
  subtotal: string;
  discountAmount: string;
  taxableSubtotal: string;
  taxAmount: string;
  total: string;
};

export function calculateInvoiceLineAmount(
  quantity: DecimalInput,
  unitPrice: DecimalInput,
  currency: string,
): string {
  const quantityValue = new Decimal(quantity);
  const priceValue = new Decimal(unitPrice);
  if (!quantityValue.isPositive()) throw new RangeError("Quantity must be greater than zero");
  if (priceValue.isNegative()) throw new RangeError("Unit price must be non-negative");
  return roundMoney(quantityValue.mul(priceValue), currency);
}

export function calculateInvoice(input: {
  currency: string;
  lines: Array<{ quantity: DecimalInput; unitPrice: DecimalInput }>;
  discountType: InvoiceDiscountType;
  discountValue: DecimalInput;
  taxPercent: DecimalInput;
}): InvoiceCalculation {
  const discountValue = new Decimal(input.discountValue);
  const taxPercent = new Decimal(input.taxPercent);
  if (discountValue.isNegative()) throw new RangeError("Discount must be non-negative");
  if (input.discountType === "percentage" && discountValue.gt(100)) {
    throw new RangeError("Percentage discount cannot exceed 100%");
  }
  if (taxPercent.isNegative() || taxPercent.gt(100)) {
    throw new RangeError("Tax percentage must be between 0 and 100");
  }

  const lineAmounts = input.lines.map((line) =>
    calculateInvoiceLineAmount(line.quantity, line.unitPrice, input.currency),
  );
  const subtotalValue = lineAmounts.reduce(
    (sum, amount) => sum.plus(amount),
    new Decimal(0),
  );
  const subtotal = roundMoney(subtotalValue, input.currency);
  const rawDiscount =
    input.discountType === "none"
      ? new Decimal(0)
      : input.discountType === "percentage"
        ? subtotalValue.mul(discountValue).div(100)
        : discountValue;
  const discountAmount = roundMoney(rawDiscount, input.currency);
  if (new Decimal(discountAmount).gt(subtotalValue)) {
    throw new RangeError("Discount cannot exceed subtotal");
  }
  const taxableValue = subtotalValue.minus(discountAmount);
  const taxableSubtotal = roundMoney(taxableValue, input.currency);
  const taxAmount = roundMoney(taxableValue.mul(taxPercent).div(100), input.currency);
  const total = roundMoney(taxableValue.plus(taxAmount), input.currency);

  return { lineAmounts, subtotal, discountAmount, taxableSubtotal, taxAmount, total };
}

export function durationSecondsToInvoiceQuantity(durationSeconds: number): string {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("Duration must be a positive integer number of seconds");
  }
  return new Decimal(durationSeconds).div(3_600).toDecimalPlaces(12).toFixed(12);
}

export type InvoiceTimeSource = {
  id: string;
  description: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  durationSeconds: number;
  hourlyRate: string;
  currency: string;
};

export type GroupedInvoiceTime = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sourceIds: string[];
};

export function groupInvoiceTime(
  entries: InvoiceTimeSource[],
  grouping: InvoiceGrouping,
  invoiceCurrency: string,
): GroupedInvoiceTime[] {
  const groups = new Map<string, { description: string; rate: string; entries: InvoiceTimeSource[] }>();
  for (const entry of entries) {
    if (entry.currency !== invoiceCurrency) {
      throw new RangeError("Time Entry currency must match Invoice currency");
    }
    const baseKey =
      grouping === "individual"
        ? entry.id
        : grouping === "task"
          ? entry.taskId ?? `no-task:${entry.projectId}`
          : entry.projectId;
    const description =
      grouping === "individual"
        ? entry.description
        : grouping === "task"
          ? entry.taskName ?? `No task — ${entry.projectName}`
          : entry.projectName;
    const key = `${baseKey}:${entry.hourlyRate}`;
    const group = groups.get(key) ?? { description, rate: entry.hourlyRate, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const result = [...groups.values()].map((group) => {
    const durationSeconds = group.entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
    const quantity = durationSecondsToInvoiceQuantity(durationSeconds);
    return {
      description: group.description,
      quantity,
      unitPrice: group.rate,
      amount: calculateInvoiceLineAmount(quantity, group.rate, invoiceCurrency),
      sourceIds: group.entries.map((entry) => entry.id),
    };
  });
  return grouping === "individual"
    ? result
    : result.sort((left, right) =>
        left.description.localeCompare(right.description) ||
        new Decimal(left.unitPrice).cmp(right.unitPrice),
      );
}

const allowedTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["paid", "void"],
  paid: [],
  void: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return allowedTransitions[from].includes(to);
}
