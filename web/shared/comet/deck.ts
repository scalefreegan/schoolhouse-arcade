// Which card comes next, and which wrong answers Easy skill offers beside
// the right one. Not uniform: a fact the player keeps missing comes up more
// (docs/PRD.md, "Which card comes next").
//
// Pure given its random source, and run by Node as is.

import { shuffled, weightOf, weightedPick, type FactStat, type Rng } from "../deal.ts";
import { answerOf, parseFact } from "./facts.ts";

// The arcade's own (shared/deal.ts), handed on to whoever already asks here.
export { SLOW_MS, STAT_WINDOW, factStats, seeded, weightOf, type FactStat, type Rng } from "../deal.ts";

/** A fact does not come back within this many cards of itself. */
export const NO_REPEAT = 3;
/** A card missed in this round returns this many cards later. */
export const RETURN_AFTER = 4;

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
    fact = weightedPick(pool, pool.map((f) => weightOf(deck.stats[f])), rng);
  }
  return { fact, deck: { ...deck, returns, recent: [...deck.recent, fact].slice(-NO_REPEAT), dealt: deck.dealt + 1 } };
}

/** The card just dealt was missed: bring it back a few cards on (once at a time). */
export function missed(deck: Deck, fact: string): Deck {
  if (deck.returns.some((r) => r.fact === fact)) return deck;
  return { ...deck, returns: [...deck.returns, { fact, due: deck.dealt + RETURN_AFTER - 1 }] };
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
