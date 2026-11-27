// Sight Word Sprint's words: the short, common words a first reader has to
// know on sight, most of which the letter sounds do not explain (the, of,
// said, where). A word's id is its spelling, as it is written ("I" is a
// capital); it is what an answer is recorded against and never changes once
// live. docs/PRD.md has the list.
//
// No two words in the game sound alike: the word is asked by voice alone, so
// "to" has no "two" beside it, "there" no "their", "no" no "know". A word
// that would bring a second spelling of a sound already here does not
// belong in the list.
//
// Pure, and run by Node as is.

export interface SightWord {
  /** Its spelling. */
  id: string;
}

export interface SightLevel {
  /** Stored on plays: never rename one. */
  id: string;
  title: string;
  /** Three of its words, for the set-up screen. */
  blurb: string;
  /** The words a round on this level asks. */
  words: SightWord[];
}

const level = (id: string, title: string, list: string): SightLevel => {
  const words = list.split(" ").map((w) => ({ id: w }));
  return { id, title, blurb: words.slice(0, 3).map((w) => w.id).join(" "), words };
};

/** A trail in five stretches, in the order they open. Ten words each. */
export const LEVELS: SightLevel[] = [
  level("meadow", "Meadow", "the I a to is you and we my go"),
  level("woods", "Woods", "of was are he she me no so do see"),
  level("creek", "Creek", "said have they with what for here come some like"),
  level("hills", "Hills", "where there were when who want look one does from"),
  level("summit", "Summit", "could would because people your very again any many put"),
];

export const WORDS: SightWord[] = LEVELS.flatMap((l) => l.words);

export function wordById(id: string): SightWord | undefined {
  return WORDS.find((w) => w.id === id);
}

export function levelById(id: string): SightLevel | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Words in a round. */
export const ROUND_WORDS = 8;
/** Words to pick from, the right one among them. */
export const CHOICES = 4;

/** The words a question on this level may show: its own and those of the levels before it. */
export function poolOf(level: SightLevel): SightWord[] {
  return LEVELS.slice(0, LEVELS.indexOf(level) + 1).flatMap((l) => l.words);
}

// ---------- how alike two words look ----------

const low = (w: SightWord) => w.id.toLowerCase();

/** Same length, and the same letter in every place but one: me and we, were and here. */
function oneLetterApart(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differ = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
  return differ === 1;
}

/**
 * Two words a first reader takes for one another: they start with the same
 * letter (the, they, there), end in the same two (where, there, here), or
 * are one letter apart (me, we; no, so, go). Arcade's wrong words are these
 * where there are any. From the spelling: here, the spelling is the lesson.
 */
export function alike(a: SightWord, b: SightWord): boolean {
  const [x, y] = [low(a), low(b)];
  if (x === y) return false;
  if (x[0] === y[0]) return true;
  if (x.length >= 2 && y.length >= 2 && x.slice(-2) === y.slice(-2)) return true;
  return oneLetterApart(x, y);
}

/** Two words nobody mixes up at a glance: not alike, and not ending in the same letter either. Easy's wrong words. */
export function nothingAlike(a: SightWord, b: SightWord): boolean {
  const [x, y] = [low(a), low(b)];
  return x !== y && !alike(a, b) && x.at(-1) !== y.at(-1);
}

// ---------- speech ----------

/** Each word is one clip, said plainly: `sight-<the word in small letters>`. A
 *  clip's name is its own across every game's clips (scripts/speech/build.mjs). */
export const sightClip = (wordId: string): string => `sight-${wordId.toLowerCase()}`;

export const SPEECH_DIR = "speech/sight-word-sprint";

/** Every clip the game can play. The speech script makes exactly these. */
export function allClips(): string[] {
  return WORDS.map((w) => sightClip(w.id));
}

/** Where a word's clip is fetched from. */
export function sayUrl(w: SightWord): string {
  return `/${SPEECH_DIR}/${sightClip(w.id)}.mp3`;
}
