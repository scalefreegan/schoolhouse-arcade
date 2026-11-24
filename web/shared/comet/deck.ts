// Which card comes next, and which wrong answers Easy skill offers beside
// the right one. Not uniform: a fact the player keeps missing comes up more
// (docs/PRD.md, "Which card comes next").
//
// Pure given its random source, and run by Node as is.

import { answerOf, parseFact } from "./facts.ts";

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
/** A right answer slower than this still needs work. */
export const SLOW_MS = 4_000;
/** A fact does not come back within this many cards of itself. */
export const NO_REPEAT = 3;
/** A card missed in this round returns this many cards later. */
export const RETURN_AFTER = 4;

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

/** How much more likely than a mastered fact this one is to be dealt. */
export function weightOf(stat: FactStat | undefined): number {
  if (!stat || stat.seen === 0) return 3;
  if (stat.missed > 0) return 5;
  if (stat.ms !== null && stat.ms > SLOW_MS) return 2;
  return 1;
}

export interface Deck {
  facts: string[];
  stats: Record<string, FactStat>;
  /** The last few facts dealt, newest last. */
  recent: string[];
  /** Missed cards waiting to come back: the fact, and the deal it is due on. */
  returns: { fact: string; due: number }[];
  /** Cards dealt so far. */
  dealt: number;
}

export function newDeck(facts: string[], stats: Record<string, FactStat> = {}): Deck {
  return { facts, stats, recent: [], returns: [], dealt: 0 };
}

/** Deal the next card. A missed card that is due comes first; otherwise a
 *  weighted draw from the facts not dealt in the last few cards. */
export function deal(deck: Deck, rng: Rng): { fact: string; deck: Deck } {
  const window = Math.min(NO_REPEAT, deck.facts.length - 1);
  const blocked = new Set(window > 0 ? deck.recent.slice(-window) : []);
  let fact: string | undefined;
  let returns = deck.returns;
  const due = returns.findIndex((r) => r.due <= deck.dealt && !blocked.has(r.fact));
  if (due >= 0) {
    fact = returns[due].fact;
    returns = returns.filter((_, i) => i !== due);
  } else {
    const pool = deck.facts.filter((f) => !blocked.has(f));
    const weights = pool.map((f) => weightOf(deck.stats[f]));
    let at = rng() * weights.reduce((a, b) => a + b, 0);
    fact = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      at -= weights[i];
      if (at < 0) {
        fact = pool[i];
        break;
      }
    }
  }
  return { fact, deck: { ...deck, returns, recent: [...deck.recent, fact].slice(-NO_REPEAT), dealt: deck.dealt + 1 } };
}

/** The card just dealt was missed: bring it back a few cards on (once at a time). */
export function missed(deck: Deck, fact: string): Deck {
  if (deck.returns.some((r) => r.fact === fact)) return deck;
  return { ...deck, returns: [...deck.returns, { fact, due: deck.dealt + RETURN_AFTER - 1 }] };
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The largest number an answer button may show. */
const MAX_CHOICE = 20;

/**
 * Four answers for Easy skill: the right one and three tempting wrong ones
 * (one off, the other operation's answer, two off), never below 0, no
 * repeats, in random order.
 */
export function choicesFor(factText: string, rng: Rng): number[] {
  const fact = parseFact(factText);
  if (!fact) throw new Error(`not a fact: ${factText}`);
  const answer = answerOf(fact);
  const other = fact.op === "+" ? fact.a - fact.b : fact.a + fact.b;
  const ok = (n: number) => n >= 0 && n <= MAX_CHOICE && n !== answer;
  // In order of temptation; each group shuffled so the wrong ones vary.
  const tempting = [...shuffled([answer - 1, answer + 1], rng), other, ...shuffled([answer - 2, answer + 2], rng), ...shuffled([answer + 3, answer - 3, answer + 4, answer + 5], rng)];
  const wrong: number[] = [];
  for (const n of tempting) {
    if (wrong.length === 3) break;
    if (ok(n) && !wrong.includes(n)) wrong.push(n);
  }
  return shuffled([answer, ...wrong], rng);
}
