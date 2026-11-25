// How the cabinets write their numbers.

/** A score as a cabinet shows it: six digits, zeros in front. */
export function fmtScore(n: number): string {
  return String(Math.max(0, Math.round(n))).padStart(6, "0");
}

/** A countdown: whole seconds, rounded up so it reads 0:01 until it is over. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A stopwatch: minutes, seconds and tenths. */
export function fmtStopwatch(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
}
