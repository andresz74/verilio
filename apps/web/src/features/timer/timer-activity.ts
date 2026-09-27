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
