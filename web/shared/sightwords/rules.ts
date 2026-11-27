// Sight Word Sprint's rules: what a question may be, how an answer is
// written, and what a round is worth. The browser steps through them to draw
// the round as it happens; the server replays the same answers through the
// same functions and stores what it gets. docs/PRD.md has them in words.
//
// An answer carries its whole question, so the server judges the question
// as well as the pick: the browser deals, and nothing it deals is taken on
// trust. It is written `the|you|is|my=you`: the four words in the order
// they were shown, and the one picked. It is stored as text
// (`answers.given_text`); `answers.fact` is the word that was said.
//
// Pure, and run by Node as is.

import { RuleError, type AnswerInput, type GameRules, type JudgedAnswer, type PlayConfig, type Settled } from "../play.ts";
import { MAX_ANSWER_MS, countedMs, startRound, starsFor, stepRound } from "../soundmachine/rules.ts";
import { CHOICES, LEVELS, ROUND_WORDS, alike, levelById, nothingAlike, poolOf, wordById, type SightLevel } from "./words.ts";

// Scoring, stars and the time floor are Sound Machine's, exactly: a round
// of eight, 100 a right answer and 20 more for each right one before it in
// a row, stars at 5, 7 and 8 right, and each answer counted as at least
// MIN_ANSWER_MS so the server's round clock means the same here.
export { MAX_ANSWER_MS, MIN_ANSWER_MS, POINTS, STAR_RIGHT, STREAK_BONUS, countedMs, pointsFor, startRound, starsFor, stepRound, type Round } from "../soundmachine/rules.ts";

/** hear: a word is said; tap it among four written ones. The only game, so far. */
export type Mode = "hear";
export type Skill = "easy" | "arcade";

/** Ids are stored on plays: never rename one. */
export const MODES: GameRules["modes"] = [{ id: "hear", title: "Hear it", blurb: "Tap the word", board: "score" }];

export const SKILLS: GameRules["skills"] = [
  { id: "easy", title: "Easy", blurb: "Words that look different" },
  { id: "arcade", title: "Arcade", blurb: "Words that look alike" },
];

/**
 * How fast the runner goes, 0 (a jog) to TOP_SPEED, from the run of right
 * answers: each one in a row is a step faster, and a miss is a jog again.
 * Only something to see: no score, star or ticket comes of it, and nothing
 * the player has earned is lost with it.
 */
export const TOP_SPEED = 4;
export function speedOf(streak: number): number {
  return Math.max(0, Math.min(TOP_SPEED, Math.floor(streak)));
}

/**
 * What the runner does as a right answer lands, from the run of right
 * answers it makes: a jump for the first, a higher leap for the second, a
 * spin in the air for the third, a backflip for the fourth, two turns for
 * the fifth, and then spin, flip and double over again. Nothing for a miss.
 * Like the speed, only something to see. Ids name the drawing's motion
 * (index.css), nothing stored.
 */
export const TRICKS = ["jump", "leap", "spin", "flip", "double"] as const;
export type Trick = (typeof TRICKS)[number];
export function trickOf(streak: number): Trick | null {
  const n = Math.floor(streak);
  if (!(n >= 1)) return null;
  return n <= TRICKS.length ? TRICKS[n - 1] : TRICKS[2 + ((n - TRICKS.length - 1) % 3)];
}

/** An answer as it is stored: the words shown, in order, then the one picked. */
export function answerText(choices: string[], pick: string): string {
  return `${choices.join("|")}=${pick}`;
}

const ID = /^[A-Za-z]{1,8}$/;

/** An answer read back: the words shown and the pick, or null if it is not one written as `answerText` writes them. */
export function parseAnswer(text: string): { choices: string[]; pick: string } | null {
  const [shown, pick, ...more] = text.split("=");
  if (more.length || pick === undefined || !ID.test(pick)) return null;
  const choices = shown.split("|");
  if (!choices.every((c) => ID.test(c))) return null;
  return { choices, pick };
}

/**
 * Why these words could not have been shown for `fact` on this level and
 * skill; null if they could. What makes a question: four different words,
 * each the level's or an earlier level's, `fact` (one of the level's own)
 * among them. On Easy the three others look nothing like it. On Arcade the
 * question has to tempt as much as it can: as many of the others look like
 * `fact` as there are such words to show, up to all three. So an easier
 * question is not taken as Arcade's (more tickets, the other table) where
 * the level could have made it harder.
 */
export function faultOf(choices: string[], level: SightLevel, skill: Skill, fact: string): string | null {
  const word = level.words.find((w) => w.id === fact);
  if (!word) return `"${fact}" is not a word ${level.title} asks.`;
  const pool = poolOf(level);
  for (const id of choices) if (!pool.some((w) => w.id === id)) return `"${id}" is not a word ${level.title} shows.`;
  if (new Set(choices).size !== choices.length) return "A word comes up once in a question.";
  if (choices.length !== CHOICES) return `A question shows ${CHOICES} words.`;
  if (!choices.includes(fact)) return "The word said is not among the words shown.";
  const wrong = choices.filter((id) => id !== fact).map((id) => wordById(id)!);
  if (skill === "easy" && wrong.some((w) => !nothingAlike(w, word))) return "On Easy the other words look nothing like the word.";
  if (skill === "arcade" && wrong.filter((w) => alike(w, word)).length < Math.min(CHOICES - 1, pool.filter((w) => alike(w, word)).length)) return "On Arcade the other words look like the word, as many as can.";
  return null;
}

function configOf(config: PlayConfig): { level: SightLevel; skill: Skill } {
  const level = levelById(config.level);
  if (!level) throw new RuleError(`Sight Word Sprint has no level "${config.level}".`);
  if (!MODES.some((m) => m.id === config.mode)) throw new RuleError(`Sight Word Sprint has no game "${config.mode}".`);
  if (!SKILLS.some((s) => s.id === config.skill)) throw new RuleError(`Sight Word Sprint has no skill "${config.skill}".`);
  return { level, skill: config.skill as Skill };
}

/** An answer's longest text: four words of up to eight letters, and the pick. */
const MAX_TEXT = 48;

/**
 * Judge and score a whole play from its answers alone. Each answer is the
 * words that were shown and the one picked (`answerText`); the server checks
 * the question could have been put (faultOf) and judges the pick itself: it
 * is right when it is the word that was said (`fact`). Refused: a word the
 * level does not ask, or one word twice; more words than a round has; a
 * question that could not have been put; a pick that is not one of the
 * words shown; a time that cannot be. A time under MIN_ANSWER_MS is counted
 * as MIN_ANSWER_MS.
 */
export function settle(config: PlayConfig, inputs: AnswerInput[]): Settled {
  const { level, skill } = configOf(config);
  if (!Array.isArray(inputs) || inputs.length > ROUND_WORDS) throw new RuleError("That is not a round of Sight Word Sprint.");
  const own = new Set(level.words.map((w) => w.id));
  const asked = new Set<string>();
  let round = startRound();
  const answers: JudgedAnswer[] = [];
  for (const input of inputs) {
    const fact = typeof input?.fact === "string" ? input.fact : "";
    if (!own.has(fact)) throw new RuleError(`"${String(input?.fact)}" is not a word ${level.title} asks.`);
    if (asked.has(fact)) throw new RuleError(`"${fact}" comes up once in a round.`);
    asked.add(fact);
    if (!Number.isFinite(input.ms) || input.ms < 0 || input.ms > MAX_ANSWER_MS) throw new RuleError("An answer's time is out of range.");
    const given = input.given;
    if (typeof given !== "string" || given.length > MAX_TEXT) throw new RuleError("An answer must be the words shown and the word picked.");
    const read = parseAnswer(given);
    if (!read) throw new RuleError(`"${given}" is not four words and a pick.`);
    const fault = faultOf(read.choices, level, skill, fact);
    if (fault) throw new RuleError(fault);
    if (!read.choices.includes(read.pick)) throw new RuleError(`"${read.pick}" is not one of the words shown.`);
    const ms = countedMs(input.ms);
    const correct = read.pick === fact;
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

export const sightWordRules: GameRules = {
  levels: LEVELS.map(({ id, title, blurb }) => ({ id, title, blurb })),
  modes: MODES,
  skills: SKILLS,
  settle,
  pay,
};
