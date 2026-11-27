// What a round is made of: which eight words (leaning towards the ones the
// player has missed), and which three stand beside each in the grid.
//
// Pure given its random source, and run by Node as is.

import { shuffled, weightOf, weightedPick, type FactStat, type Rng } from "../deal.ts";
import type { Skill } from "./rules.ts";
import { CHOICES, ROUND_WORDS, alike, nothingAlike, poolOf, type SightLevel, type SightWord } from "./words.ts";

/**
 * The words of one round, in the order they come up: eight of the level's
 * own, no word twice, each draw leaning towards what was missed (5), then
 * never seen (3), then known (1). Nothing here is scored on time, so a slow
 * answer is not held against a word.
 */
export function roundWords(level: SightLevel, stats: Record<string, FactStat>, rng: Rng): SightWord[] {
  let left = level.words;
  const out: SightWord[] = [];
  while (out.length < ROUND_WORDS && left.length) {
    const w = weightedPick(left, left.map((x) => weightOf(stats[x.id], Infinity)), rng);
    out.push(w);
    left = left.filter((x) => x !== w);
  }
  return out;
}

/**
 * The four words to pick from, the right one among them, as word ids in the
 * order they are shown. Easy: the others look nothing like it. Arcade: the
 * ones that look like it first (as many as there are, up to all three), so
 * that only reading the whole word finds it. The others come from the
 * level's words and those of the levels before. Shuffled.
 */
export function choicesFor(word: SightWord, skill: Skill, level: SightLevel, rng: Rng): string[] {
  const others = shuffled(poolOf(level).filter((w) => w.id !== word.id), rng);
  const far = others.filter((w) => nothingAlike(w, word));
  const near = others.filter((w) => alike(w, word));
  const ordered = skill === "arcade" ? [...near, ...others.filter((w) => !near.includes(w))] : far;
  return shuffled([word, ...ordered.slice(0, CHOICES - 1)], rng).map((w) => w.id);
}
