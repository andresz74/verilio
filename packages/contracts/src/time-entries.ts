import { z } from "zod";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  IdSchema,
  NonNegativeDecimalStringSchema,
  PaginationSchema,
} from "./foundation.js";

export const TimeEntryModeSchema = z.enum(["timer", "range", "duration"]);
export type TimeEntryMode = z.infer<typeof TimeEntryModeSchema>;

const description = z.string().trim().max(1_000);
const requiredDescription = description.min(1, "Description is required");
const hierarchy = {
  clientId: IdSchema,
  projectId: IdSchema,
  taskId: z.union([IdSchema, z.literal(""), z.null()]).transform((value) => value || null),
};

export const TimerStartInputSchema = z.object({
  ...hierarchy,
  description,
  billable: z.boolean(),
});
export type TimerStartInput = z.infer<typeof TimerStartInputSchema>;

export const TimeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:30");

const completedCommon = {
  ...hierarchy,
  description: requiredDescription,
  billable: z.boolean(),
};

const rangeFields = {
  workDate: DateOnlySchema,
  startTime: TimeOfDaySchema,
  endTime: TimeOfDaySchema,
  endsNextDay: z.boolean(),
};

export const ManualRangeInputSchema = z.object({
  ...completedCommon,
  mode: z.literal("range"),
  ...rangeFields,
});

export const ManualDurationInputSchema = z.object({
  ...completedCommon,
  mode: z.literal("duration"),
  workDate: DateOnlySchema,
  durationSeconds: z.number().int().positive("Duration must be greater than zero"),
});

export const ManualTimeEntryInputSchema = z.discriminatedUnion("mode", [
  ManualRangeInputSchema,
  ManualDurationInputSchema,
]);
export type ManualTimeEntryInput = z.infer<typeof ManualTimeEntryInputSchema>;

const TimerEditInputSchema = z.object({
  ...completedCommon,
  mode: z.literal("timer"),
  ...rangeFields,
});

export const TimeEntryUpdateInputSchema = z.discriminatedUnion("mode", [
  TimerEditInputSchema,
  ManualRangeInputSchema,
  ManualDurationInputSchema,
]);
export type TimeEntryUpdateInput = z.infer<typeof TimeEntryUpdateInputSchema>;

export const TimeEntryDtoSchema = z.object({
  id: IdSchema,
  clientId: IdSchema,
  clientName: z.string(),
  projectId: IdSchema,
  projectName: z.string(),
  taskId: IdSchema.nullable(),
  taskName: z.string().nullable(),
  description: z.string(),
  mode: TimeEntryModeSchema,
  workDate: DateOnlySchema,
  startAt: z.iso.datetime().nullable(),
  endAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  billable: z.boolean(),
  hourlyRate: NonNegativeDecimalStringSchema.nullable(),
  currency: CurrencyCodeSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TimeEntryDto = z.infer<typeof TimeEntryDtoSchema>;

export const TimerStateResponseSchema = z.object({
  timer: TimeEntryDtoSchema.nullable(),
  serverNow: z.iso.datetime(),
});
export type TimerStateResponse = z.infer<typeof TimerStateResponseSchema>;

export const TimerStopResponseSchema = z.object({
  entry: TimeEntryDtoSchema,
  serverNow: z.iso.datetime(),
});
export type TimerStopResponse = z.infer<typeof TimerStopResponseSchema>;

export const TimeEntryResponseSchema = z.object({ entry: TimeEntryDtoSchema });
export type TimeEntryResponse = z.infer<typeof TimeEntryResponseSchema>;

export const RecentTimeEntriesResponseSchema = z.object({
  entries: z.array(TimeEntryDtoSchema),
});
export type RecentTimeEntriesResponse = z.infer<typeof RecentTimeEntriesResponseSchema>;

export const RecentTimeEntriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export const TimeEntryListQuerySchema = PaginationSchema.extend({
  from: DateOnlySchema,
  to: DateOnlySchema,
  search: z.string().trim().max(200).default(""),
}).refine(({ from, to }) => from <= to, {
  path: ["to"],
  message: "End date must be on or after start date",
});
export type TimeEntryListQuery = z.infer<typeof TimeEntryListQuerySchema>;

export const TimeEntryDailyTotalSchema = z.object({
  workDate: DateOnlySchema,
  durationSeconds: z.number().int().nonnegative(),
});
export type TimeEntryDailyTotal = z.infer<typeof TimeEntryDailyTotalSchema>;

export const TimeEntryListResponseSchema = z.object({
  entries: z.array(TimeEntryDtoSchema),
  dailyTotals: z.array(TimeEntryDailyTotalSchema),
  totalDurationSeconds: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type TimeEntryListResponse = z.infer<typeof TimeEntryListResponseSchema>;

export const TimeEntryIdParamsSchema = z.object({ id: IdSchema });
