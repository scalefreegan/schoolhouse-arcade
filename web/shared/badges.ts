// The badges. Each is earned once per player and never taken away; each
// pays a ticket bonus the moment it is won. Whether one is earned is a pure
// question about what the player has done so far (BadgeFacts), so the
// server can ask it after every play, and a badge added later is handed to
// everyone who already deserves it the next time they play.
//
// An id is stored on a player's row and can gate a prize: never rename one.
// Pure, and run by Node as is.

import { LEVELS } from "./comet/facts.ts";
import { MAX_STARS } from "./play.ts";
import { LEVELS as RHYME_LEVELS } from "./rhymetime/words.ts";
import { LEVELS as SIGHT_LEVELS } from "./sightwords/words.ts";
import { LEVELS as FAMILY_LEVELS } from "./wordfamilies/words.ts";
import { LEVELS as SOUND_LEVELS } from "./soundmachine/words.ts";

/** What a player has done, across every game. */
export interface BadgeFacts {
  /** Rounds finished. */
  plays: number;
  /** Right answers, ever. */
  right: number;
  /** The longest run of right answers in one round. */
  bestCombo: number;
  /** Finished Sprints without a miss. */
  cleanSprints: number;
  /** Stars per game id, per level id. */
  stars: Record<string, Record<string, number>>;
}

export interface Badge {
  id: string;
  title: string;
  /** How to earn it, in words a six-year-old can read. */
  how: string;
  /** Its bonus, paid once. */
  tickets: number;
  /** Its drawing and colours (web/src/sprites/art.ts). */
  sprite: string;
  palette: string;
  earned(f: BadgeFacts): boolean;
}

const COMET = "comet-cards";
const cometStars = (f: BadgeFacts, level: string): number => f.stars[COMET]?.[level] ?? 0;
const everyCometLevel = (f: BadgeFacts, stars: number): boolean => LEVELS.every((l) => cometStars(f, l.id) >= stars);

const SOUND = "sound-machine";
const soundStars = (f: BadgeFacts, level: string): number => f.stars[SOUND]?.[level] ?? 0;
const everySoundLevel = (f: BadgeFacts, stars: number): boolean => SOUND_LEVELS.every((l) => soundStars(f, l.id) >= stars);
/** What a Sound Machine level is called on its badge. */
const SOUND_NAMES: Record<string, string> = { cvc: "3 Sounds", ch: "CH", ck: "CK", sh: "SH", th: "TH", mix: "Mix" };
const BELLS = ["lime", "cyan", "rose", "violet", "gold", "orange"];

const RHYME = "rhyme-time";
const rhymeStars = (f: BadgeFacts, level: string): number => f.stars[RHYME]?.[level] ?? 0;

const SIGHT = "sight-word-sprint";
const sightStars = (f: BadgeFacts, level: string): number => f.stars[SIGHT]?.[level] ?? 0;
const FAMILY = "word-families";
const familyStars = (f: BadgeFacts, level: string): number => f.stars[FAMILY]?.[level] ?? 0;

const MEDALS = ["lime", "cyan", "rose", "violet", "gold"];

export const BADGES: Badge[] = [
  { id: "first-game", title: "First Game", how: "Finish a game", tickets: 10, sprite: "rocket", palette: "default", earned: (f) => f.plays >= 1 },
  ...LEVELS.map(
    (l, i): Badge => ({
      id: `comet-${l.id}`,
      title: `${l.title} Star`,
      how: `Get a star on ${l.title}`,
      tickets: 25,
      sprite: "medal",
      palette: MEDALS[i % MEDALS.length],
      earned: (f) => cometStars(f, l.id) >= 1,
    }),
  ),
  { id: "combo-10", title: "Hot Streak", how: "10 right in a row", tickets: 20, sprite: "flame", palette: "default", earned: (f) => f.bestCombo >= 10 },
  { id: "combo-25", title: "Unstoppable", how: "25 right in a row", tickets: 50, sprite: "bolt", palette: "default", earned: (f) => f.bestCombo >= 25 },
  { id: "right-100", title: "100 Club", how: "100 right answers", tickets: 30, sprite: "gem", palette: "cyan", earned: (f) => f.right >= 100 },
  { id: "right-1000", title: "1000 Club", how: "1000 right answers", tickets: 150, sprite: "gem", palette: "magenta", earned: (f) => f.right >= 1000 },
  { id: "clean-sprint", title: "Clean Sweep", how: "A Sprint with no misses", tickets: 40, sprite: "comet", palette: "default", earned: (f) => f.cleanSprints >= 1 },
  { id: "arcade-ace", title: "Arcade Ace", how: "2 stars on every Comet Cards level", tickets: 200, sprite: "trophy", palette: "default", earned: (f) => everyCometLevel(f, 2) },
  { id: "comet-champion", title: "Comet Champion", how: "3 stars on every Comet Cards level", tickets: 500, sprite: "crown", palette: "default", earned: (f) => everyCometLevel(f, MAX_STARS) },
  // Sound Machine's. The badges above that speak of levels mean Comet Cards' levels, as they always have (and now say so).
  ...SOUND_LEVELS.map(
    (l, i): Badge => ({
      id: `sound-${l.id}`,
      title: `${SOUND_NAMES[l.id] ?? l.title} Star`,
      how: `Get a star on ${SOUND_NAMES[l.id] ?? l.title} in Sound Machine`,
      tickets: 25,
      sprite: "bell",
      palette: BELLS[i % BELLS.length],
      earned: (f) => soundStars(f, l.id) >= 1,
    }),
  ),
  { id: "sound-builder", title: "Word Builder", how: "A star on every Sound Machine level", tickets: 100, sprite: "cog", palette: "default", earned: (f) => everySoundLevel(f, 1) },
  { id: "sound-champion", title: "Sound Champion", how: "3 stars on every Sound Machine level", tickets: 300, sprite: "megaphone", palette: "default", earned: (f) => everySoundLevel(f, MAX_STARS) },
  // Rhyme Time's: a first star anywhere in it, and every level at three.
  { id: "rhyme-ear", title: "Good Ear", how: "Get a star in Rhyme Time", tickets: 25, sprite: "ear", palette: "default", earned: (f) => RHYME_LEVELS.some((l) => rhymeStars(f, l.id) >= 1) },
  { id: "rhyme-champion", title: "Rhyme Champion", how: "3 stars on every Rhyme Time level", tickets: 300, sprite: "jukebox", palette: "gold", earned: (f) => RHYME_LEVELS.every((l) => rhymeStars(f, l.id) >= MAX_STARS) },
  // Sight Word Sprint's, as Rhyme Time's: a first star anywhere in it, and every level at three.
  { id: "sight-blazer", title: "Trail Blazer", how: "Get a star in Sight Word Sprint", tickets: 25, sprite: "shoe", palette: "default", earned: (f) => SIGHT_LEVELS.some((l) => sightStars(f, l.id) >= 1) },
  { id: "sight-champion", title: "Trail Champion", how: "3 stars on every Sight Word Sprint level", tickets: 300, sprite: "trail", palette: "gold", earned: (f) => SIGHT_LEVELS.every((l) => sightStars(f, l.id) >= MAX_STARS) },
  // Word Families', the same: a first star anywhere in it, and every level at three.
  { id: "family-door", title: "Open Door", how: "Get a star in Word Families", tickets: 25, sprite: "door", palette: "default", earned: (f) => FAMILY_LEVELS.some((l) => familyStars(f, l.id) >= 1) },
  { id: "family-champion", title: "Family Champion", how: "3 stars on every Word Families level", tickets: 300, sprite: "house", palette: "gold", earned: (f) => FAMILY_LEVELS.every((l) => familyStars(f, l.id) >= MAX_STARS) },
];

export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}

/** The badges a player with these facts deserves and does not hold yet, in list order. */
export function newBadges(f: BadgeFacts, held: string[]): Badge[] {
  return BADGES.filter((b) => !held.includes(b.id) && b.earned(f));
}
