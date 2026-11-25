// What a round is made of: which eight words (leaning towards the ones the
// player has missed), which tiles the tray holds for a word in Build, and
// which pictures stand beside the right one in Read.
//
// Pure given its random source, and run by Node as is.

import { shuffled, weightOf, weightedPick, type FactStat, type Rng } from "../deal.ts";
import type { Skill } from "./rules.ts";
import { DIGRAPHS, LEVELS, ROUND_WORDS, VOWELS, lookalike, reviewOf, soundOf, type SoundLevel, type Word } from "./words.ts";

/** `n` of `pool`, no word twice, each draw leaning towards what was missed
 *  (5), then never seen (3), then known (1). Nothing here is timed, so a
 *  slow answer is not held against a word. */
function draw(pool: Word[], n: number, stats: Record<string, FactStat>, rng: Rng): Word[] {
  let left = pool;
  const out: Word[] = [];
  while (out.length < n && left.length) {
    const w = weightedPick(left, left.map((x) => weightOf(stats[x.id], Infinity)), rng);
    out.push(w);
    left = left.filter((x) => x !== w);
  }
  return out;
}

/**
 * The words of one round, in the order they come up: as many of the level's
 * own as a round holds, filled up from the levels before when it has fewer.
 */
export function roundWords(level: SoundLevel, stats: Record<string, FactStat>, rng: Rng): Word[] {
  const own = draw(level.focus, ROUND_WORDS, stats, rng);
  const old = draw(reviewOf(level), ROUND_WORDS - own.length, stats, rng);
  return shuffled([...own, ...old], rng);
}

/** Tiles a six-year-old mixes up: they look alike, or sound alike. */
const SIMILAR: Record<string, string[]> = {
  b: ["d", "p"],
  c: ["ch", "g", "t"],
  d: ["b", "t"],
  f: ["th", "s"],
  g: ["d", "c"],
  h: ["n", "f"],
  k: ["g", "t"],
  l: ["r", "w"],
  m: ["n"],
  n: ["m"],
  p: ["b", "d"],
  r: ["l", "w"],
  s: ["sh", "f"],
  t: ["th", "d", "p"],
  w: ["r", "l"],
  ch: ["sh", "c", "t"],
  ck: ["c", "k"],
  sh: ["ch", "s"],
  th: ["f", "t", "sh"],
};

/** The three ways this game spells the k sound. */
const K_TILES = ["c", "k", "ck"];
/** Arcade's tray holds this many tiles a word does not need (fewer when there are not that many to tempt with). */
export const DISTRACTORS = 3;

/**
 * The tiles in the tray for a word in Build. Easy: exactly the ones it
 * needs. Arcade: three more that tempt (another vowel; a consonant that
 * looks or sounds like one of the word's; and, once ck has been taught,
 * another spelling of its k sound). A level never offers a digraph it has
 * not taught, and before ck is taught never offers c for k or k for c: the
 * wrong spelling of a word that sounds right is a later lesson. Shuffled,
 * and never left lying in the word's own order.
 */
export function trayFor(word: Word, skill: Skill, level: SoundLevel, rng: Rng): string[] {
  const at = LEVELS.indexOf(level);
  const taught = (tile: string) => !DIGRAPHS.includes(tile) || DIGRAPHS.indexOf(tile) < at || at === LEVELS.length - 1;
  const ckTaught = at >= LEVELS.findIndex((l) => l.id === "ck");
  const sounds = new Set(word.tiles.map(soundOf));
  const extra: string[] = [];
  const ok = (tile: string) => taught(tile) && !word.tiles.includes(tile) && !extra.includes(tile);
  const add = (from: string[]) => {
    const tile = shuffled(from.filter(ok), rng)[0];
    if (tile) extra.push(tile);
  };
  if (skill === "arcade") {
    add(VOWELS);
    const consonants = shuffled(word.tiles.filter((t) => !VOWELS.includes(t)), rng);
    // Another spelling of the same sound is a temptation only once ck is taught.
    const alike = (t: string) => (SIMILAR[t] ?? []).filter((x) => ckTaught || !sounds.has(soundOf(x)));
    add(alike(consonants[0]));
    if (ckTaught && sounds.has("k")) add(K_TILES);
    for (const c of [...consonants.slice(1), ...consonants]) if (extra.length < DISTRACTORS) add(alike(c));
    if (extra.length < DISTRACTORS) add(VOWELS);
  }
  const tiles = [...word.tiles, ...extra];
  let tray = shuffled(tiles, rng);
  // Tiles already in order would be the answer read off the tray.
  for (let i = 0; i < 8 && word.tiles.every((t, j) => tray[j] === t); i++) tray = shuffled(tiles, rng);
  if (word.tiles.every((t, j) => tray[j] === t)) tray = [...tray.slice(1), tray[0]];
  return tray;
}

/** Pictures beside the right one in Read. */
export const PICTURES = { easy: 3, arcade: 4 } as const;

/**
 * The pictures to pick from in Read: the word's own, and others from the
 * same round's pool. Arcade's are the ones that start or end with the same
 * sound, when there are any, so that only reading the whole word finds it.
 * Never two that could be taken for each other (LOOKALIKES). Shuffled.
 */
export function picturesFor(word: Word, skill: Skill, level: SoundLevel, rng: Rng): string[] {
  const first = (w: Word) => soundOf(w.tiles[0]);
  const last = (w: Word) => soundOf(w.tiles[w.tiles.length - 1]);
  const others = shuffled([...level.focus, ...reviewOf(level)].filter((w) => w.id !== word.id && !lookalike(w.id, word.id)), rng);
  const near = others.filter((w) => first(w) === first(word) || last(w) === last(word));
  const ordered = skill === "arcade" ? [...near, ...others.filter((w) => !near.includes(w))] : others;
  const wrong: Word[] = [];
  for (const w of ordered) {
    if (wrong.length === PICTURES[skill] - 1) break;
    if (!wrong.some((x) => lookalike(x.id, w.id))) wrong.push(w);
  }
  return shuffled([word, ...wrong], rng).map((w) => w.id);
}
