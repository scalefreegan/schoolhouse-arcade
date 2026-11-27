// Word Families' words: the endings (-at, -ig, -ock), the words each makes
// when a first sound is put before it (cat, bat, hat), and the levels. A
// word's id is its spelling; it is what an answer is recorded against and
// never changes once live, and neither does a family's id (its ending) or a
// tile. docs/PRD.md has the list.
//
// The tiles and sounds are Sound Machine's: one tile, one sound, short
// vowels, a hard c, the quiet th. A word Sound Machine or Rhyme Time already
// says is said with that game's clip; the rest are this game's own.
//
// Pure, and run by Node as is.

import { WORDS as RHYME_WORDS, sayUrl as rhymeUrl } from "../rhymetime/words.ts";
import { clipUrl as soundMachineUrl, soundClip, soundOf, wordClip } from "../soundmachine/words.ts";

/** An ending and the words built on it: the family "at". */
export interface Family {
  /** Its ending as it is spelled ("at", "ock"). Names its clip: never renamed. */
  id: string;
  /** The ending's tiles: ["a", "t"], ["o", "ck"]. */
  tiles: string[];
}

export interface FamilyWord {
  /** Its spelling, lower case. Stored on every answer: never renamed. */
  id: string;
  /** The tile it starts with: "c" for cat, "ch" for chat. The answer. */
  onset: string;
  /** Its family's id: "at". */
  family: string;
}

/** A level's share of one family: the words of it the level asks. */
export interface FamilyGroup {
  family: Family;
  words: FamilyWord[];
}

export interface FamilyLevel {
  /** Stored on plays and stars: never renamed. */
  id: string;
  title: string;
  /** Two of its words, for the set-up screen. */
  blurb: string;
  groups: FamilyGroup[];
  /** Every word the level asks. */
  words: FamilyWord[];
}

/** One family as it is listed below: its ending in tiles, the first tiles of
 *  its words, and those that start with ch, sh or th (asked only on Mix). */
interface Listed {
  family: Family;
  plain: FamilyWord[];
  digraph: FamilyWord[];
}

function listed(ending: string, onsets: string, digraphs = ""): Listed {
  const tiles = ending.split("-");
  const family: Family = { id: tiles.join(""), tiles };
  const words = (list: string): FamilyWord[] => (list ? list.split(" ").map((onset) => ({ id: onset + family.id, onset, family: family.id })) : []);
  return { family, plain: words(onsets), digraph: words(digraphs) };
}

// Every word is a real one a six-year-old has met, said the way its tiles
// say (no "was" in -as, no "put" in -ut), and every family has at least a
// round's four. A family that would put a word nobody wants on a child's
// screen in its list is not here (-it, -uck, -um, -ag).
const A = [listed("a-t", "b c f h m p r s", "ch"), listed("a-n", "c f m p r t"), listed("a-p", "c m n t l g")];
const I = [listed("i-g", "b d f p w"), listed("i-n", "b f p t w", "ch th sh"), listed("i-p", "d h l r s t", "ch sh")];
const O = [listed("o-p", "h m p t c", "ch sh"), listed("o-t", "c d h p g l n", "sh"), listed("o-g", "d l f h")];
const EU = [listed("e-t", "n p w b g l m s"), listed("e-n", "h p t m d"), listed("e-d", "b r f l", "sh"), listed("u-g", "b h m r t d"), listed("u-n", "b f r s")];
// The ck endings come with every first sound taught so far: ch, sh and th are in Sound Machine's levels before ck's, or with it.
const CK = [listed("a-ck", "b p s r t sh"), listed("e-ck", "n d p ch"), listed("i-ck", "k l p s th ch"), listed("o-ck", "r s l d sh")];

const EVERY: Listed[] = [...A, ...I, ...O, ...EU, ...CK];

export const FAMILIES: Family[] = EVERY.map((l) => l.family);

function level(id: string, title: string, lists: Listed[], all = false): FamilyLevel {
  const groups = lists.map((l) => ({ family: l.family, words: all ? [...l.plain, ...l.digraph] : l.plain }));
  const words = groups.flatMap((g) => g.words);
  return { id, title, blurb: `${words[0].id} ${words[1].id}`, groups, words };
}

/**
 * In unlock order: the short a endings, then i, then o, then e and u, then
 * the endings in ck, then every family at once with the words that start
 * with ch, sh or th (chat, thin, shop).
 */
export const LEVELS: FamilyLevel[] = [
  level("a", "a", A),
  level("i", "i", I),
  level("o", "o", O),
  level("e-u", "e u", EU),
  level("ck", "ck", CK),
  level("mix", "Mix", EVERY, true),
];

/** Every word, each once: Mix asks them all. */
export const WORDS: FamilyWord[] = LEVELS[LEVELS.length - 1].words;

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export function wordById(id: string): FamilyWord | undefined {
  return BY_ID.get(id);
}

export function familyById(id: string): Family | undefined {
  return FAMILIES.find((f) => f.id === id);
}

export function levelById(id: string): FamilyLevel | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Words in a round, and how they are made up: two families, four words of each, one family after the other. */
export const ROUND_WORDS = 8;
export const ROUND_FAMILIES = 2;
export const FAMILY_WORDS = ROUND_WORDS / ROUND_FAMILIES;

/** Tiles to pick from, the right one among them, by skill. */
export const TRAY = { easy: 4, arcade: 6 } as const;

// ---------- the tiles a tray may hold ----------

/** Every tile a word here can start with: Sound Machine's consonants, and its digraphs that begin a word. */
export const ONSETS = ["b", "c", "d", "f", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "w", "ch", "sh", "th"];

/**
 * What a first tile and an ending must never spell on a child's screen,
 * though the word asked is another: a tile is not offered where it would.
 */
export const BLOCKED = ["cock", "dick", "nig", "wog", "wop", "fap"];

/**
 * The tiles that may stand in a tray for this family. c and k are one
 * sound, so only one of them is ever there, the one that spelling takes: k
 * before e and i (kick), c before a, o and u (cat). So no two tiles in a
 * tray make the same sound, and the word said has one right tile.
 */
export function onsetsFor(family: Family): string[] {
  const soft = family.tiles[0] === "e" || family.tiles[0] === "i";
  return ONSETS.filter((t) => (t === "c" ? !soft : t === "k" ? soft : true) && !BLOCKED.includes(t + family.id));
}

/**
 * First sounds a six-year-old takes for one another, by ear or by the look
 * of the letter: b and p, b and d, d and t, g and k, m and n, f and th, s
 * and sh, sh and ch, s and th, r and w, r and l. By sound id.
 */
export const NEAR: [string, string][] = [["b", "p"], ["b", "d"], ["d", "t"], ["g", "k"], ["m", "n"], ["f", "th"], ["s", "sh"], ["ch", "sh"], ["s", "th"], ["r", "w"], ["l", "r"]];

/** Two tiles whose sounds are taken for one another. Easy's tray has none beside the answer; Arcade's has every one there is. */
export function near(a: string, b: string): boolean {
  const [x, y] = [soundOf(a), soundOf(b)];
  return NEAR.some(([p, q]) => (p === x && q === y) || (p === y && q === x));
}

// ---------- speech ----------

/** This game's own clips live here: the endings, and the words no other game says. */
export const SPEECH_DIR = "speech/word-families";

/** An ending said on its own ("at"): `rime-<the ending>`. */
export const rimeClip = (familyId: string): string => `rime-${familyId}`;

const SAID_ELSEWHERE = new Map(RHYME_WORDS.map((w) => [w.id, rhymeUrl(w)]));

/** The words only this game says. */
export function ownWords(): FamilyWord[] {
  return WORDS.filter((w) => !SAID_ELSEWHERE.has(w.id));
}

/** Every clip this game makes of its own: each ending, and each word no other game says (`word-<id>`, as theirs are named). The speech script makes exactly these. */
export function ownClips(): string[] {
  return [...FAMILIES.map((f) => rimeClip(f.id)), ...ownWords().map((w) => wordClip(w.id))];
}

/** Where a word's clip is fetched from. */
export function sayUrl(w: FamilyWord): string {
  return SAID_ELSEWHERE.get(w.id) ?? `/${SPEECH_DIR}/${wordClip(w.id)}.mp3`;
}

/** Where an ending's clip is fetched from. */
export function rimeUrl(family: Family): string {
  return `/${SPEECH_DIR}/${rimeClip(family.id)}.mp3`;
}

/** Where a first tile's sound is fetched from: Sound Machine's clip of it. */
export function onsetUrl(tile: string): string {
  return soundMachineUrl(soundClip(soundOf(tile) ?? tile));
}
