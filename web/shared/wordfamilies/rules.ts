// Word Families' rules: what a question may be, how an answer is written,
// and what a round is worth. The browser steps through them to draw the
// round as it happens; the server replays the same answers through the same
// functions and stores what it gets. docs/PRD.md has them in words.
//
// An answer carries its whole question, so the server judges the question
// as well as the pick: the browser deals, and nothing it deals is taken on
// trust. It is written `b|c|h|m=c`: the tiles in the tray in the order they
// were shown, and the one picked. It is stored as text
// (`answers.given_text`); `answers.fact` is the word that was said (cat),
// whose ending the screen showed.
//
// Pure, and run by Node as is.

import { RuleError, type AnswerInput, type GameRules, type JudgedAnswer, type PlayConfig, type Settled } from "../play.ts";
import { MAX_ANSWER_MS, countedMs, startRound, starsFor, stepRound } from "../soundmachine/rules.ts";
import { FAMILY_WORDS, LEVELS, ROUND_FAMILIES, ROUND_WORDS, TRAY, familyById, levelById, near, onsetsFor, type FamilyLevel } from "./words.ts";

// Scoring, stars and the time floor are Sound Machine's, exactly: a round
// of eight, 100 a right answer and 20 more for each right one before it in
// a row, stars at 5, 7 and 8 right, and each answer counted as at least
// MIN_ANSWER_MS so the server's round clock means the same here.
export { MAX_ANSWER_MS, MIN_ANSWER_MS, POINTS, STAR_RIGHT, STREAK_BONUS, countedMs, pointsFor, startRound, starsFor, stepRound, type Round } from "../soundmachine/rules.ts";

/** build: the ending is shown, a word is said; pick the tile it starts with. The only game, so far. */
export type Mode = "build";
export type Skill = "easy" | "arcade";

/** Ids are stored on plays: never rename one. */
export const MODES: GameRules["modes"] = [{ id: "build", title: "Build it", blurb: "Add the first sound", board: "score" }];

export const SKILLS: GameRules["skills"] = [
  { id: "easy", title: "Easy", blurb: "4 tiles" },
  { id: "arcade", title: "Arcade", blurb: "6 tiles, some sound alike" },
];

/** An answer as it is stored: the tiles shown, in order, then the one picked. */
export function answerText(tray: string[], pick: string): string {
  return `${tray.join("|")}=${pick}`;
}

const TILE = /^[a-z]{1,2}$/;

/** An answer read back: the tray and the pick, or null if it is not one written as `answerText` writes them. */
export function parseAnswer(text: string): { tray: string[]; pick: string } | null {
  const [shown, pick, ...more] = text.split("=");
  if (more.length || pick === undefined || !TILE.test(pick)) return null;
  const tray = shown.split("|");
  if (!tray.every((t) => TILE.test(t))) return null;
  return { tray, pick };
}

/**
 * Why this tray could not have been shown for `fact` on this level and
 * skill; null if it could. What makes a question: `fact` is one of the
 * level's words; the tray is as many tiles as the skill shows (TRAY), all
 * different, each one that may stand before the word's ending on this
 * level (onsetsFor: so no two make one sound, none spells what should not
 * be spelled, and ch, sh and th come only with the levels that ask them),
 * the word's own first tile among them. On Easy no other tile sounds like
 * it. On Arcade every tile that does is there: so an easier tray is not
 * taken as Arcade's (more tickets, the other table).
 */
export function faultOf(tray: string[], level: FamilyLevel, skill: Skill, fact: string): string | null {
  const word = level.words.find((w) => w.id === fact);
  if (!word) return `"${fact}" is not a word ${level.title} asks.`;
  const may = onsetsFor(familyById(word.family)!, level);
  for (const t of tray) if (!may.includes(t)) return `"${t}" is not a tile shown with -${word.family}.`;
  if (new Set(tray).size !== tray.length) return "A tile comes up once in a tray.";
  if (tray.length !== TRAY[skill]) return `A tray holds ${TRAY[skill]} tiles.`;
  if (!tray.includes(word.onset)) return "The word's first tile is not in the tray.";
  if (skill === "easy" && tray.some((t) => near(t, word.onset))) return "On Easy no other tile sounds like the first sound.";
  if (skill === "arcade" && may.some((t) => near(t, word.onset) && !tray.includes(t))) return "On Arcade every tile that sounds like the first sound is in the tray.";
  return null;
}

function configOf(config: PlayConfig): { level: FamilyLevel; skill: Skill } {
  const level = levelById(config.level);
  if (!level) throw new RuleError(`Word Families has no level "${config.level}".`);
  if (!MODES.some((m) => m.id === config.mode)) throw new RuleError(`Word Families has no game "${config.mode}".`);
  if (!SKILLS.some((s) => s.id === config.skill)) throw new RuleError(`Word Families has no skill "${config.skill}".`);
  return { level, skill: config.skill as Skill };
}

/** An answer's longest text: six tiles of up to two letters, and the pick. */
const MAX_TEXT = 24;

/**
 * Judge and score a whole play from its answers alone. Each answer is the
 * tray that was shown and the tile picked (`answerText`); the server checks
 * the question could have been put (faultOf) and judges the pick itself: it
 * is right when it is the first tile of the word that was said (`fact`).
 * Refused: a word the level does not ask, or one word twice; more words
 * than a round has, or words that are not a round's (two families, up to
 * four words of one and then of the other); a tray that could not have been shown; a pick that is
 * not one of its tiles; a time that cannot be. A time under MIN_ANSWER_MS is
 * counted as MIN_ANSWER_MS.
 */
export function settle(config: PlayConfig, inputs: AnswerInput[]): Settled {
  const { level, skill } = configOf(config);
  if (!Array.isArray(inputs) || inputs.length > ROUND_WORDS) throw new RuleError("That is not a round of Word Families.");
  const own = new Map(level.words.map((w) => [w.id, w]));
  const asked = new Set<string>();
  /** The families so far, in the order they came, and how many words of the last. */
  const families: string[] = [];
  let run = 0;
  let round = startRound();
  const answers: JudgedAnswer[] = [];
  for (const input of inputs) {
    const fact = typeof input?.fact === "string" ? input.fact : "";
    const word = own.get(fact);
    if (!word) throw new RuleError(`"${String(input?.fact)}" is not a word ${level.title} asks.`);
    if (asked.has(fact)) throw new RuleError(`"${fact}" comes up once in a round.`);
    asked.add(fact);
    if (families.at(-1) === word.family) run++;
    else {
      if (families.includes(word.family) || families.length === ROUND_FAMILIES) throw new RuleError(`A round is ${ROUND_FAMILIES} families, one after the other.`);
      families.push(word.family);
      run = 1;
    }
    if (run > FAMILY_WORDS) throw new RuleError(`A round has ${FAMILY_WORDS} words of a family.`);
    if (!Number.isFinite(input.ms) || input.ms < 0 || input.ms > MAX_ANSWER_MS) throw new RuleError("An answer's time is out of range.");
    const given = input.given;
    if (typeof given !== "string" || given.length > MAX_TEXT) throw new RuleError("An answer must be the tiles shown and the tile picked.");
    const read = parseAnswer(given);
    if (!read) throw new RuleError(`"${given}" is not a tray of tiles and a pick.`);
    const fault = faultOf(read.tray, level, skill, fact);
    if (fault) throw new RuleError(fault);
    if (!read.tray.includes(read.pick)) throw new RuleError(`"${read.pick}" is not one of the tiles shown.`);
    const ms = countedMs(input.ms);
    const correct = read.pick === word.onset;
    answers.push({ fact, given, ms, correct });
    round = stepRound(round, { correct, ms });
  }
  return {
    answers,
    score: round.score,
    right: round.right,
    wrong: round.wrong,
    bestCombo: round.bestStreak,
    timeMs: round.ms,
    finished: round.over,
    stars: starsFor(round),
    board: "score",
  };
}

/** Tickets for a right answer, by skill. */
export const TICKETS_EASY = 1;
export const TICKETS_ARCADE = 2;

export function pay(config: PlayConfig, settled: Settled): number {
  return settled.right * (config.skill === "arcade" ? TICKETS_ARCADE : TICKETS_EASY);
}

export const wordFamilyRules: GameRules = {
  levels: LEVELS.map(({ id, title, blurb }) => ({ id, title, blurb })),
  modes: MODES,
  skills: SKILLS,
  settle,
  pay,
};
