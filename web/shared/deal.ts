// What every cabinet's dealing shares: a random source a test can seed, how
// a player has done on each fact lately, and a draw that leans towards what
// they keep missing. A "fact" is whatever a game asks ("7+5", "chick").
//
// Pure given its random source, and run by Node as is.

/** A random source: () → [0, 1). Math.random fits; tests pass a seeded one. */
export type Rng = () => number;

/** A small seeded generator (mulberry32), for tests and replays. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** How a player has done on one fact lately (their last few answers to it). */
export interface FactStat {
  /** Answers counted (at most STAT_WINDOW). */
  seen: number;
  /** How many of those were wrong. */
  missed: number;
  /** The typical time of the right ones, in ms; null when none were right. */
  ms: number | null;
}

/** How many of a fact's latest answers a FactStat looks at. */
export const STAT_WINDOW = 5;
/** A right answer slower than this still needs work (in a game that is timed). */
export const SLOW_MS = 4_000;

/**
 * A player's FactStats from their answers, newest first: each fact's latest
 * STAT_WINDOW answers, however long ago. `ms` is the median of the right ones.
 */
export function factStats(newestFirst: { fact: string; correct: boolean; ms: number }[]): Record<string, FactStat> {
  const latest = new Map<string, { correct: boolean; ms: number }[]>();
  for (const a of newestFirst) {
    const list = latest.get(a.fact) ?? [];
    if (list.length < STAT_WINDOW) latest.set(a.fact, [...list, a]);
  }
  const stats: Record<string, FactStat> = {};
  for (const [fact, list] of latest) {
    const times = list.filter((a) => a.correct).map((a) => a.ms).sort((x, y) => x - y);
    stats[fact] = { seen: list.length, missed: list.filter((a) => !a.correct).length, ms: times.length ? times[Math.floor((times.length - 1) / 2)] : null };
  }
  return stats;
}

/** How much more likely than a mastered fact this one is to be dealt. A game
 *  with no clock passes `slowMs: Infinity`: there, slow is not a fault. */
export function weightOf(stat: FactStat | undefined, slowMs: number = SLOW_MS): number {
  if (!stat || stat.seen === 0) return 3;
  if (stat.missed > 0) return 5;
  if (stat.ms !== null && stat.ms > slowMs) return 2;
  return 1;
}

/** One of `pool`, each as likely as its weight says. */
export function weightedPick<T>(pool: T[], weights: number[], rng: Rng): T {
  let at = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    at -= weights[i];
    if (at < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
