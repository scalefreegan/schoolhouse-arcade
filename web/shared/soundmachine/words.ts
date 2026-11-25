// Sound Machine's words: what each is built from, which level teaches it,
// and what it sounds like. A word's id is its spelling; it is what an answer
// is recorded against ("chick") and a tile is what a Build answer is made of
// ("ch-i-ck") and where a Split answer is cut ("ch|i|ck"), so neither ever
// changes once live. docs/PRD.md has the list.
//
// Pure, and run by Node as is.

/** One sound (a phoneme) the machine can say. `id` names its clip
 *  (sound-<id>.mp3) and is never renamed. */
export interface Sound {
  id: string;
  /** How it is written in IPA: what the speech script asks the voice for. */
  ipa: string;
  /** It can be held (mmm, sss, a vowel); a stop (b, k, tʃ) cannot. */
  held: boolean;
  /** A word that has it, for the grown-up's Sound check. */
  as: string;
}

/** Every sound the words below use. Short vowels, single consonants, and
 *  the three digraph sounds. c, k and ck are one sound: k. */
export const SOUNDS: Sound[] = [
  { id: "a", ipa: "æ", held: true, as: "cat" },
  { id: "e", ipa: "ɛ", held: true, as: "bed" },
  { id: "i", ipa: "ɪ", held: true, as: "pig" },
  { id: "o", ipa: "ɑ", held: true, as: "dog" },
  { id: "u", ipa: "ʌ", held: true, as: "sun" },
  { id: "b", ipa: "b", held: false, as: "bed" },
  { id: "d", ipa: "d", held: false, as: "dog" },
  { id: "f", ipa: "f", held: true, as: "fish" },
  { id: "g", ipa: "ɡ", held: false, as: "pig" },
  { id: "h", ipa: "h", held: true, as: "hat" },
  { id: "k", ipa: "k", held: false, as: "cat, kick, duck" },
  { id: "l", ipa: "l", held: true, as: "log" },
  { id: "m", ipa: "m", held: true, as: "moth" },
  { id: "n", ipa: "n", held: true, as: "sun" },
  { id: "p", ipa: "p", held: false, as: "pig" },
  { id: "r", ipa: "ɹ", held: true, as: "rock" },
  { id: "s", ipa: "s", held: true, as: "sun" },
  { id: "t", ipa: "t", held: false, as: "cat" },
  { id: "w", ipa: "w", held: true, as: "web" },
  { id: "ch", ipa: "tʃ", held: false, as: "chip" },
  { id: "sh", ipa: "ʃ", held: true, as: "ship" },
  { id: "th", ipa: "θ", held: true, as: "bath" },
];

export const VOWELS = ["a", "e", "i", "o", "u"];
/** Two letters, one sound, one tile. In the order the levels teach them. */
export const DIGRAPHS = ["ch", "ck", "sh", "th"];

/**
 * The sound each tile makes, by sound id. In this game a tile makes one
 * sound wherever it appears: the vowels are always short, c is always hard,
 * th is always the quiet one of "bath" (never the buzzing one of "this"). A
 * word that would break that does not belong in the list. The tests pin
 * every tile to its sound and every sound to its IPA; that each word is
 * really said the way its tiles say is not something a test here can hear:
 * it is checked when the clips are made (speech-to-text, in
 * `scripts/speech/build.mjs --verify`) and by ear on the Sound check page.
 */
export const TILE_SOUND: Record<string, string> = {
  a: "a", e: "e", i: "i", o: "o", u: "u",
  b: "b", c: "k", d: "d", f: "f", g: "g", h: "h", k: "k", l: "l", m: "m", n: "n", p: "p", r: "r", s: "s", t: "t", w: "w",
  ch: "ch", ck: "k", sh: "sh", th: "th",
};

export function soundOf(tile: string): string | undefined {
  return Object.hasOwn(TILE_SOUND, tile) ? TILE_SOUND[tile] : undefined;
}

export interface Word {
  /** Its spelling, lower case. Stored on every answer: never renamed. */
  id: string;
  /** Its sounds in order, one tile each: ["ch", "i", "ck"]. */
  tiles: string[];
  /** Its drawing (web/src/sprites/art.ts). */
  picture: string;
}

const word = (spelt: string): Word => {
  const tiles = spelt.split("-");
  const id = tiles.join("");
  return { id, tiles, picture: `w_${id}` };
};

/** What a Build answer is stored as: the tiles placed, in order ("ch-i-ck"). */
export function tilesKey(tiles: string[]): string {
  return tiles.join("-");
}

/** What a Split answer is stored as: the word's letters, cut where the
 *  player cut them ("sh|i|p"). The right one cuts it into its tiles. */
export function splitKey(pieces: string[]): string {
  return pieces.join("|");
}

/** A word's letters cut into pieces: `cuts[i]` is a cut between letter i and letter i + 1. */
export function piecesOf(spelt: string, cuts: boolean[]): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (let i = 0; i < spelt.length; i++) {
    piece += spelt[i];
    if (i === spelt.length - 1 || cuts[i]) {
      pieces.push(piece);
      piece = "";
    }
  }
  return pieces;
}

export interface SoundLevel {
  /** Stored on plays and stars: never renamed. */
  id: string;
  title: string;
  blurb: string;
  /** The words that carry what this level teaches. A round takes as many of
   *  these as it can hold. */
  focus: Word[];
}

/**
 * In unlock order. Every word is three sounds: consonant, short vowel,
 * consonant, where a digraph is one consonant. No blends, no long vowels,
 * no silent letters, no x. A level's words use only what it and the levels
 * before it teach, and every one can be drawn so a six-year-old names it.
 */
export const LEVELS: SoundLevel[] = [
  {
    id: "cvc",
    title: "3 sounds",
    blurb: "c-a-t",
    focus: ["c-a-t", "h-a-t", "b-e-d", "w-e-b", "p-i-g", "p-i-n", "d-o-g", "l-o-g", "s-u-n", "b-u-g", "c-u-p"].map(word),
  },
  { id: "ch", title: "ch", blurb: "ch-i-p", focus: ["ch-i-p", "ch-i-n", "ch-o-p", "ch-a-t", "r-i-ch"].map(word) },
  { id: "ck", title: "ck", blurb: "d-u-ck", focus: ["d-u-ck", "s-o-ck", "r-o-ck", "l-o-ck", "k-i-ck", "n-e-ck", "s-a-ck", "l-i-ck"].map(word) },
  { id: "sh", title: "sh", blurb: "sh-i-p", focus: ["sh-i-p", "sh-o-p", "sh-e-d", "f-i-sh", "d-i-sh", "c-a-sh"].map(word) },
  { id: "th", title: "th", blurb: "b-a-th", focus: ["b-a-th", "m-o-th", "p-a-th", "m-a-th", "th-i-n", "th-i-ck"].map(word) },
  { id: "mix", title: "Mix", blurb: "ch-i-ck", focus: [] },
];

/** The words with two digraphs, which only the last level can ask for. */
const TWO_DIGRAPHS: Word[] = ["ch-i-ck", "ch-e-ck", "sh-o-ck"].map(word);
// The mix is every digraph word there is.
LEVELS[LEVELS.length - 1].focus = [...LEVELS.slice(1, -1).flatMap((l) => l.focus), ...TWO_DIGRAPHS];

/** Every word, each once, in level order. */
export const WORDS: Word[] = [...LEVELS.slice(0, -1).flatMap((l) => l.focus), ...TWO_DIGRAPHS];

const BY_ID = new Map(WORDS.map((w) => [w.id, w]));

export function wordById(id: string): Word | undefined {
  return BY_ID.get(id);
}

export function levelById(id: string): SoundLevel | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Words in a round. */
export const ROUND_WORDS = 8;

/**
 * The words a level may fill a round up with when it has fewer than a
 * round's worth of its own: everything the levels before it taught. (ch has
 * five words a six-year-old can name from a picture; the other three in its
 * round are ones already learned.)
 */
export function reviewOf(level: SoundLevel): Word[] {
  if (level.focus.length >= ROUND_WORDS) return [];
  const own = new Set(level.focus.map((w) => w.id));
  const at = LEVELS.indexOf(level);
  return LEVELS.slice(0, at).flatMap((l) => l.focus).filter((w) => !own.has(w.id));
}

/** How many of a round's words may come from the levels before. */
export function reviewRoom(level: SoundLevel): number {
  return Math.max(0, ROUND_WORDS - level.focus.length);
}

/**
 * Pictures that could be taken for one another: never offered side by side
 * in Read, where the picture is the answer.
 */
export const LOOKALIKES: [string, string][] = [
  ["bug", "moth"],
  ["shop", "shed"],
  ["cash", "rich"],
  ["thin", "thick"],
  ["chick", "duck"],
  ["rock", "sack"],
  ["cup", "dish"],
  ["chin", "neck"],
  ["chin", "lick"],
  ["log", "chop"],
  ["chin", "shock"],
];

export function lookalike(a: string, b: string): boolean {
  return LOOKALIKES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// ---------- speech ----------

/** A clip's id: a word said whole, or one sound on its own. It is the file's
 *  name under web/public/speech/sound-machine/ and its key in the manifest. */
export const wordClip = (wordId: string): string => `word-${wordId}`;
/** The same word said slowly and clearly, as a teacher says it for a child: still one word. */
export const slowClip = (wordId: string): string => `word-${wordId}-slow`;
export const soundClip = (soundId: string): string => `sound-${soundId}`;
/** The clip a tile plays. */
export const tileClip = (tile: string): string => soundClip(TILE_SOUND[tile]);

/** Every clip the game can play. The speech script makes exactly these. */
export function allClips(): string[] {
  return [...SOUNDS.map((s) => soundClip(s.id)), ...WORDS.map((w) => wordClip(w.id)), ...WORDS.map((w) => slowClip(w.id))];
}

export const SPEECH_DIR = "speech/sound-machine";
export const clipUrl = (clip: string): string => `/${SPEECH_DIR}/${clip}.mp3`;
