// What a round is made of: which eight words its questions are about
// (leaning towards the ones the player has missed), and each question's
// pictures: the rhyme and the wrong ones, or the pair and the odd one.
//
// Pure given its random source, and run by Node as is.

import { shuffled, weightOf, weightedPick, type FactStat, type Rng } from "../deal.ts";
import { PICTURES, faultOf, type Mode, type Question, type Skill } from "./rules.ts";
import { ROUND_QUESTIONS, anchorsOf, nothingAlike, partnersOf, rhymeOf, rhymes, standsBeside, tempting, type RhymeLevel, type RhymeWord } from "./words.ts";

/** A pair of rhyming words as one key, the same either way round ("cat+hat"). */
export const pairKey = (a: RhymeWord, b: RhymeWord): string => [a.id, b.id].sort().join("+");

/** One question of a round, before its pictures are dealt: the word it is about, and the word of its family that stands beside it (the rhyme to find, or the other of the pair). */
export interface Planned {
  anchor: RhymeWord;
  partner: RhymeWord;
}

/**
 * A round, in the order its questions come up: eight different words to ask
 * about, each draw leaning towards what was missed (5), then never seen (3),
 * then known (1); nothing here is timed, so slow is not a fault. A family is
 * not asked about twice while the level has one not yet asked. Each word
 * gets a partner of its family, one not yet shown this round where there is
 * one. In Odd one out a pair is never asked twice (the server refuses it),
 * so a word whose every pair has been asked is not drawn.
 */
export function roundPlan(level: RhymeLevel, mode: Mode, stats: Record<string, FactStat>, rng: Rng): Planned[] {
  const out: Planned[] = [];
  const pairs = new Set<string>();
  const shown = new Set<string>();
  const open = (w: RhymeWord) => partnersOf(w, level).filter((p) => mode === "find" || !pairs.has(pairKey(w, p)));
  let left = anchorsOf(level);
  while (out.length < ROUND_QUESTIONS) {
    left = left.filter((w) => open(w).length > 0);
    if (!left.length) break;
    const used = new Set(out.map((q) => rhymeOf(q.anchor)));
    const fresh = left.filter((w) => !used.has(rhymeOf(w)));
    const from = fresh.length ? fresh : left;
    const anchor = weightedPick(from, from.map((x) => weightOf(stats[x.id], Infinity)), rng);
    const partner = firstThose(open(anchor), (p) => !shown.has(p.id), rng)[0];
    out.push({ anchor, partner });
    pairs.add(pairKey(anchor, partner));
    shown.add(anchor.id).add(partner.id);
    left = left.filter((x) => x !== anchor);
  }
  return out;
}

/** Those that `first` picks out (shuffled), then the rest (shuffled). */
function firstThose(pool: RhymeWord[], first: (w: RhymeWord) => boolean, rng: Rng): RhymeWord[] {
  return [...shuffled(pool.filter(first), rng), ...shuffled(pool.filter((w) => !first(w)), rng)];
}

/**
 * One question about `anchor`, with `partner` (of its family) beside it.
 *
 * Find it: the anchor is the call; the partner is the rhyme; and wrong ones
 * from other families, no two of one family. Easy: 3 pictures, the wrong
 * ones sharing no sound in the same place with the call. Arcade: 4, the
 * wrong ones tempting (the call's first sound, or its vowel) where the level
 * has them.
 *
 * Odd one out: the anchor and the partner, and one word that rhymes with
 * neither. Easy: it shares no sound in the same place with either. Arcade:
 * it shares the first sound or the vowel with the pair where the level has
 * one.
 *
 * What comes out always passes faultOf (a test deals every pair on every level).
 */
export function questionFor(mode: Mode, skill: Skill, level: RhymeLevel, { anchor, partner }: Planned, rng: Rng): Question {
  for (let attempt = 0; attempt < 12; attempt++) {
    const q = mode === "find" ? findAround(skill, level, anchor, partner, rng) : oddAround(skill, level, anchor, partner, rng);
    if (q && !faultOf(q, level, skill, anchor.id)) return q;
  }
  throw new Error(`no ${mode} question for "${anchor.id}" and "${partner.id}" on ${level.id} (${skill})`);
}

function findAround(skill: Skill, level: RhymeLevel, call: RhymeWord, rhyme: RhymeWord, rng: Rng): Question | null {
  const pool = level.words.filter((w) => !rhymes(w, call) && w.id !== call.id && (skill === "arcade" || nothingAlike(w, call)));
  const wrong: RhymeWord[] = [];
  for (const w of firstThose(pool, (x) => skill === "arcade" && tempting(x, call), rng)) {
    if (wrong.length === PICTURES.find[skill] - 1) break;
    if (standsBeside(w, [call, rhyme, ...wrong]) && !wrong.some((x) => rhymeOf(x) === rhymeOf(w))) wrong.push(w);
  }
  if (wrong.length < PICTURES.find[skill] - 1) return null;
  return { mode: "find", call: call.id, choices: shuffled([rhyme, ...wrong], rng).map((w) => w.id) };
}

function oddAround(skill: Skill, level: RhymeLevel, a: RhymeWord, b: RhymeWord, rng: Rng): Question | null {
  const pool = level.words.filter((w) => !rhymes(w, a) && w.id !== a.id && (skill === "arcade" || (nothingAlike(w, a) && nothingAlike(w, b))));
  const near = (w: RhymeWord) => skill === "arcade" && (tempting(w, a) || tempting(w, b));
  const odd = firstThose(pool, near, rng).find((w) => standsBeside(w, [a, b]));
  if (!odd) return null;
  return { mode: "odd", call: null, choices: shuffled([a, b, odd], rng).map((w) => w.id) };
}
