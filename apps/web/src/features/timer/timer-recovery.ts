import type { TimerStateResponse } from "@verilio/contracts";
import type { QueryClient } from "@tanstack/react-query";

import { getCurrentTimer, timerKeys } from "./time-entry-api.js";

export const TIMER_STATE_UNKNOWN_MESSAGE = "Timer state could not be confirmed. Check your connection and try again.";
export const TIMER_STATE_CHECKING_MESSAGE = "Checking current Timer state…";

export type TimerReconciliation =
  | { status: "confirmed"; state: TimerStateResponse }
  | { status: "unknown" };

export async function reconcileCurrentTimer(queryClient: QueryClient): Promise<TimerReconciliation> {
  try {
    await queryClient.cancelQueries({ queryKey: timerKeys.current });
    const state = await queryClient.fetchQuery({
      queryKey: timerKeys.current,
      queryFn: getCurrentTimer,
      staleTime: 0,
      retry: false,
    });
    return { status: "confirmed", state };
  } catch {
    return { status: "unknown" };
  }
}
