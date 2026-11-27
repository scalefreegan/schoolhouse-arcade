// What a round is made of: which two families and which four words of each
// (leaning towards the ones the player has missed), and which tiles stand
// in the tray beside each word's own.
//
// Pure given its random source, and run by Node as is.

import { shuffled, weightOf, weightedPick, type FactStat, type Rng } from "../deal.ts";
import type { Skill } from "./rules.ts";
import { FAMILY_WORDS, ROUND_FAMILIES, TRAY, familyById, near, onsetsFor, type FamilyGroup, type FamilyLevel, type FamilyWord } from "./words.ts";

/** Draw `n` of `pool` without putting any back, each draw weighted. */
function draw<T>(pool: T[], n: number, weight: (x: T) => number, rng: Rng): T[] {
  let left = pool;
  const out: T[] = [];
  while (out.length < n && left.length) {
    const x = weightedPick(left, left.map(weight), rng);
    out.push(x);
    left = left.filter((y) => y !== x);
  }
  return out;
}

/**
 * The words of one round, in the order they come up: two of the level's
 * families, four words of the first and then four of the second, so the
 * ending stays while the first sound changes. No word twice. Each draw
 * leans towards what was missed (5), then never seen (3), then known (1): a
 * family by its words together, a word by its own. Nothing here is scored
 * on time, so a slow answer is not held against a word.
 */
export function roundWords(level: FamilyLevel, stats: Record<string, FactStat>, rng: Rng): FamilyWord[] {
  const weigh = (w: FamilyWord) => weightOf(stats[w.id], Infinity);
  const groups = draw<FamilyGroup>(level.groups, ROUND_FAMILIES, (g) => g.words.reduce((sum, w) => sum + weigh(w), 0) / g.words.length, rng);
  return groups.flatMap((g) => draw(g.words, FAMILY_WORDS, weigh, rng));
}

/**
 * The tray for a word: its own first tile and the others, as tiles in the
 * order they are shown. The others come first from the family's own words
 * on the level (so most tiles make a real word, and only the one said is
 * right), then from every tile that may stand before the ending. Easy:
 * none that sounds like the answer. Arcade: every one that does, first.
 * Shuffled.
 */
export function trayFor(word: FamilyWord, skill: Skill, level: FamilyLevel, rng: Rng): string[] {
  const family = familyById(word.family)!;
  const kin = new Set(level.words.filter((w) => w.family === word.family).map((w) => w.onset));
  const others = shuffled(onsetsFor(family).filter((t) => t !== word.onset), rng);
  const byKin = [...others.filter((t) => kin.has(t)), ...others.filter((t) => !kin.has(t))];
  const ordered = skill === "arcade" ? [...byKin.filter((t) => near(t, word.onset)), ...byKin.filter((t) => !near(t, word.onset))] : byKin.filter((t) => !near(t, word.onset));
  return shuffled([word.onset, ...ordered.slice(0, TRAY[skill] - 1)], rng);
}
