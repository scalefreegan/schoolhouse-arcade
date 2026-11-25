// Rhyme Time's words: every picture it can show, the sounds that make each
// one rhyme (or not), and its levels. Two words rhyme when their vowel and
// everything after it sound the same: cat, hat, chat and bat are the
// family "a-t". A rhyme is this data, never a guess from the spelling.
//
// Sound Machine's words are used as they are (the same ids, pictures and
// clips); the words added here are Rhyme Time's own and are not Sound
// Machine words. A word's id is its spelling and is stored on every answer
// (`answers.fact`, and in `answers.given_text`): never renamed once live.
// docs/PRD.md has the list.
//
// Pure, and run by Node as is.

import { TILE_SOUND, WORDS as SOUND_WORDS, LOOKALIKES as SOUND_LOOKALIKES, clipUrl as soundMachineClipUrl, wordClip } from "../soundmachine/words.ts";

export interface RhymeWord {
  /** Its spelling, lower case. Stored on answers: never renamed. */
  id: string;
  /** Its drawing (web/src/sprites/art.ts). */
  picture: string;
  /** Its first sound, as a sound id: "k" for cat and kick, "ch" for chick. */
  first: string;
  /** Its short vowel. */
  vowel: string;
  /** Its last sound ("k" for sock: c, k and ck are one sound). */
  last: string;
  /** Sound Machine has it: its clip is Sound Machine's. */
  shared: boolean;
}

/** The sound each letter or digraph makes here: Sound Machine's, and the two
 *  consonants only Rhyme Time's words have (v of van, j of jet). */
const SOUND_OF: Record<string, string> = { ...TILE_SOUND, v: "v", j: "j" };

function word(spelt: string, shared: boolean): RhymeWord {
  const parts = spelt.split("-");
  if (parts.length !== 3) throw new Error(`${spelt}: a word here is three sounds`);
  const [first, vowel, last] = parts.map((p) => SOUND_OF[p]);
  if (!first || !vowel || !last) throw new Error(`${spelt}: a sound with no id`);
  const id = parts.join("");
  return { id, picture: `w_${id}`, first, vowel, last, shared };
}

/** The words only Rhyme Time has, added so the rhyme families are bigger. */
const OWN: RhymeWord[] = ["b-a-t", "v-a-n", "f-a-n", "p-a-n", "c-a-p", "m-a-p", "w-i-g", "h-e-n", "p-e-n", "t-e-n", "n-e-t", "j-e-t", "m-o-p", "m-u-g", "r-u-g", "b-u-n"].map((s) => word(s, false));

/** Every word, each once: Sound Machine's in its order, then the new ones. */
export const WORDS: RhymeWord[] = [...SOUND_WORDS.map((w) => word(w.tiles.join("-"), true)), ...OWN];

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export function wordById(id: string): RhymeWord | undefined {
  return BY_ID.get(id);
}

/** A word's rhyme family: its vowel and the sound after it ("a-t"). */
export const rhymeOf = (w: RhymeWord): string => `${w.vowel}-${w.last}`;

/** Two different words that rhyme. */
export function rhymes(a: RhymeWord, b: RhymeWord): boolean {
  return a.id !== b.id && rhymeOf(a) === rhymeOf(b);
}

/**
 * Families whose rhyme is doubtful in an American accent, kept out of each
 * other's questions altogether: many speakers say pin and pen alike (the
 * short i and e run together before n), so pen beside pin would be a wrong
 * answer that is right to the ear that hears it.
 */
export const DOUBTFUL: [string, string][] = [["i-n", "e-n"]];

/** Two words that may not stand in one question: their rhyme is doubtful. */
export function doubtful(a: RhymeWord, b: RhymeWord): boolean {
  const x = rhymeOf(a);
  const y = rhymeOf(b);
  return DOUBTFUL.some(([p, q]) => (p === x && q === y) || (p === y && q === x));
}

/**
 * Pictures that could be taken for one another: never shown in one question.
 * Sound Machine's, and those of the new pictures: a cap and a hat, a mug and
 * a cup, a net and a web, a pen and a pin, a hen and a chick, a map and a
 * path, the number ten and the sum on the board.
 */
export const LOOKALIKES: [string, string][] = [
  ...SOUND_LOOKALIKES,
  ["cap", "hat"],
  ["mug", "cup"],
  ["net", "web"],
  ["pen", "pin"],
  ["hen", "chick"],
  ["map", "path"],
  ["ten", "math"],
];

export function lookalike(a: string, b: string): boolean {
  return LOOKALIKES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** No sound in the same place: a different first sound, vowel and last sound. Easy's wrong pictures share nothing with what they stand beside. */
export function nothingAlike(a: RhymeWord, b: RhymeWord): boolean {
  return a.first !== b.first && a.vowel !== b.vowel && a.last !== b.last;
}

/** A near miss: the same first sound, or the same vowel, without rhyming. Arcade's wrong pictures are these where there are any. */
export function tempting(wrong: RhymeWord, of: RhymeWord): boolean {
  return wrong.id !== of.id && !rhymes(wrong, of) && (wrong.first === of.first || wrong.vowel === of.vowel);
}

export interface RhymeLevel {
  /** Stored on plays and stars: never renamed. */
  id: string;
  title: string;
  /** A rhyme it holds, for the set-up screen. */
  blurb: string;
  /** Every word a question on this level may show. */
  words: RhymeWord[];
}

const list = (ids: string): RhymeWord[] =>
  ids.split(" ").map((id) => {
    const w = wordById(id);
    if (!w) throw new Error(`no word "${id}"`);
    return w;
  });

/**
 * In unlock order. A level is a set of rhyme families: the short a and i
 * ones first, then o, e and u, then the families that end in ck, sh or th
 * (with the words that end so and rhyme with nothing, to stand beside them).
 * Mix is every word.
 */
export const LEVELS: RhymeLevel[] = [
  { id: "a-i", title: "a i", blurb: "cat hat", words: list("cat hat chat bat van fan pan cap map pin chin thin pig wig chip ship") },
  { id: "o-e-u", title: "o e u", blurb: "dog log", words: list("dog log chop shop mop bed shed hen pen ten net jet web bug mug rug sun bun cup") },
  { id: "ck-sh-th", title: "ck sh th", blurb: "fish dish", words: list("rock sock lock shock kick lick chick thick neck check fish dish bath path math sack cash rich duck moth") },
  { id: "mix", title: "Mix", blurb: "all", words: WORDS },
];

export function levelById(id: string): RhymeLevel | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Questions in a round. */
export const ROUND_QUESTIONS = 8;

/** Another word of this one's family on the level that may stand beside it: not doubtful, not a lookalike. */
export function partnersOf(w: RhymeWord, level: RhymeLevel): RhymeWord[] {
  return level.words.filter((x) => rhymes(x, w) && !lookalike(x.id, w.id));
}

/** The words a question on this level can be about: those with a rhyme on the level. */
export function anchorsOf(level: RhymeLevel): RhymeWord[] {
  return level.words.filter((w) => partnersOf(w, level).length > 0);
}

// ---------- speech ----------

/** Rhyme Time's own clips live here; a word Sound Machine has is said with Sound Machine's clip. */
export const SPEECH_DIR = "speech/rhyme-time";

/** Every clip Rhyme Time makes of its own: one a new word, said plainly
 *  (`word-<id>`, as Sound Machine names its clips). The speech script makes exactly these. */
export function ownClips(): string[] {
  return WORDS.filter((w) => !w.shared).map((w) => wordClip(w.id));
}

/** Where a word's clip is fetched from. */
export function sayUrl(w: RhymeWord): string {
  return w.shared ? soundMachineClipUrl(wordClip(w.id)) : `/${SPEECH_DIR}/${wordClip(w.id)}.mp3`;
}
