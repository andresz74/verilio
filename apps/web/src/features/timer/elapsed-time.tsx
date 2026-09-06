import { useEffect, useState } from "react";

import { formatClockDuration } from "./time-format.js";

export function ElapsedTime({ startAt, serverNow }: { startAt: string; serverNow: string }) {
  const [offset] = useState(
    () => new Date(serverNow).getTime() - Date.now(),
  );
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  const seconds = Math.max(
    0,
    Math.floor((tick + offset - new Date(startAt).getTime()) / 1_000),
  );
  return <time className="tabular-nums" dateTime={`PT${seconds}S`}>{formatClockDuration(seconds)}</time>;
}
