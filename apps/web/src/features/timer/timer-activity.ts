import type { TimeEntryDto, TimerStartInput } from "@verilio/contracts";

// Reuse work context, never the source entry's identity or historical billing state.
export function timeEntryToTimerStartContext(entry: TimeEntryDto): TimerStartInput {
  return {
    description: entry.description,
    clientId: entry.clientId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    billable: entry.billable,
  };
}

export type RecentActivityGroup = {
  key: string;
  entries: [TimeEntryDto, ...TimeEntryDto[]];
  durationSeconds: number;
};

// Presentation of the bounded, newest-first Recent response, not all-time activity history.
export function groupRecentActivities(entries: readonly TimeEntryDto[]): RecentActivityGroup[] {
  const groups = new Map<string, RecentActivityGroup>();
  for (const entry of entries) {
    if (entry.durationSeconds === null || (entry.mode !== "duration" && !entry.endAt)) continue;
    const key = JSON.stringify([entry.description, entry.clientId, entry.projectId, entry.taskId, entry.billable]);
    const group = groups.get(key);
    if (group) {
      group.entries.push(entry);
      // Recent has at most 25 PostgreSQL integer durations: their sum is a safe JS integer.
      group.durationSeconds += entry.durationSeconds;
    } else {
      groups.set(key, { key, entries: [entry], durationSeconds: entry.durationSeconds });
    }
  }
  return [...groups.values()];
}
