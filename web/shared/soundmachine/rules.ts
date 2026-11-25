// Sound Machine's rules: what a round is and what it is worth. The browser
// steps through them to draw the round as it happens; the server replays the
// same answers through the same functions and stores what it gets.
// docs/PRD.md has them in words.
//
// Pure, and run by Node as is.

import { MAX_STARS, RuleError, type AnswerInput, type GameRules, type JudgedAnswer, type PlayConfig, type Settled } from "../play.ts";
import { LEVELS, ROUND_WORDS, levelById, reviewOf, reviewRoom, soundOf, tilesKey, wordById, type SoundLevel, type Word } from "./words.ts";

/** build: hear the word, put its sounds in the boxes. read: sound the word out, pick its picture. */
export type Mode = "build" | "read";
export type Skill = "easy" | "arcade";

/** Ids are stored on plays: never rename one. */
export const MODES: GameRules["modes"] = [
  { id: "build", title: "Build it", blurb: "Make the word", board: "score" },
  { id: "read", title: "Read it", blurb: "Find the picture", board: "score" },
];

export const SKILLS: GameRules["skills"] = [
  { id: "easy", title: "Easy", blurb: "Fewer to pick from" },
  { id: "arcade", title: "Arcade", blurb: "More to pick from" },
];

export const POINTS = 100;
/** Each right answer in a row after the first adds this much more. */
export const STREAK_BONUS = 20;

/** Stars for a finished round, by how many of its words were right first try. */
export const STAR_RIGHT = [5, 7, ROUND_WORDS] as const;

/**
 * The least time a word is counted as taking. Nothing in this game is
 * timed and no score depends on a time; the time a word waited is kept only
 * to be looked at. But the server's clock for a round (web/server/clock.ts)
 * refuses a play that claims more time than has passed, and that check only
 * means something if a play must claim some: so a hand-made round of eight
 * words has to wait eight of these, as a real one does (nobody hears a word
 * and builds it, or reads one and finds its picture, faster). A shorter time
 * is counted as this, not refused.
 */
export const MIN_ANSWER_MS = 1_000;
/** No real answer takes longer than this; a larger number is a bug or a lie. */
export const MAX_ANSWER_MS = 10 * 60_000;

/** A word's time as a round counts it: whole ms, at least MIN_ANSWER_MS and
 *  at most MAX_ANSWER_MS (a word left on the machine over lunch is counted
 *  as the longest a word can take, so the round it is in can still be
 *  saved). The session and settle() both use it, so they cannot disagree. */
export function countedMs(ms: number): number {
  return Math.min(MAX_ANSWER_MS, Math.max(MIN_ANSWER_MS, Math.round(ms)));
}

/** A round as it stands after some words. */
export interface Round {
  right: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  score: number;
  /** Time words spent waiting, in ms. */
  ms: number;
  over: boolean;
}

export function startRound(): Round {
  return { right: 0, wrong: 0, streak: 0, bestStreak: 0, score: 0, ms: 0, over: false };
}

/** What the next right answer is worth. */
export function pointsFor(r: Round): number {
  return POINTS + STREAK_BONUS * r.streak;
}

/** The round after one more word. `correct` is already judged. */
export function stepRound(r: Round, a: { correct: boolean; ms: number }): Round {
  if (r.over) return r;
  const next: Round = { ...r, ms: r.ms + a.ms };
  if (a.correct) {
    next.score = r.score + pointsFor(r);
    next.right = r.right + 1;
    next.streak = r.streak + 1;
    next.bestStreak = Math.max(r.bestStreak, next.streak);
  } else {
    next.wrong = r.wrong + 1;
    next.streak = 0;
  }
  next.over = next.right + next.wrong >= ROUND_WORDS;
  return next;
}

/** Stars a finished round earns. One try per word, so "right" is "right first try". */
export function starsFor(r: Round): number {
  if (!r.over) return 0;
  return Math.min(MAX_STARS, STAR_RIGHT.filter((n) => r.right >= n).length);
}

/** The right answer to a word, as an answer is written: the word itself
 *  (read), or its tiles in order (build). */
export function answerOf(mode: Mode, word: Word): string {
  return mode === "build" ? tilesKey(word.tiles) : word.id;
}

/** The words a round on this level may ask for: its own, and the ones it may review. */
export function poolOf(level: SoundLevel): Word[] {
  return [...level.focus, ...reviewOf(level)];
}

function configOf(config: PlayConfig): { level: SoundLevel; mode: Mode } {
  const level = levelById(config.level);
  if (!level) throw new RuleError(`Sound Machine has no level "${config.level}".`);
  if (!MODES.some((m) => m.id === config.mode)) throw new RuleError(`Sound Machine has no mode "${config.mode}".`);
  if (!SKILLS.some((s) => s.id === config.skill)) throw new RuleError(`Sound Machine has no skill "${config.skill}".`);
  return { level, mode: config.mode as Mode };
}

/** A Build answer is tiles the machine has, as many as the word has boxes. */
function builtFrom(given: string, word: Word): boolean {
  const tiles = given.split("-");
  return tiles.length === word.tiles.length && tiles.every((t) => soundOf(t) !== undefined);
}

/**
 * Judge and score a whole play from its answers alone. For Read the answer
 * is the word picked; for Build it is the tiles placed, in order. Refused:
 * a word the level does not hold; a word twice (a round never repeats one);
 * more words than a round has; more review words than the level leaves room
 * for; an answer that is not a word (read) or not a box-full of tiles
 * (build); a time that cannot be. A time under MIN_ANSWER_MS is counted as
 * MIN_ANSWER_MS.
 */
export function settle(config: PlayConfig, inputs: AnswerInput[]): Settled {
  const { level, mode } = configOf(config);
  if (!Array.isArray(inputs) || inputs.length > ROUND_WORDS) throw new RuleError("That is not a round of Sound Machine.");
  const own = new Set(level.focus.map((w) => w.id));
  const review = new Set(reviewOf(level).map((w) => w.id));
  const asked = new Set<string>();
  let reviewed = 0;
  let round = startRound();
  const answers: JudgedAnswer[] = [];
  for (const input of inputs) {
    const word = typeof input?.fact === "string" ? wordById(input.fact) : undefined;
    if (!word || (!own.has(word.id) && !review.has(word.id))) throw new RuleError(`"${String(input?.fact)}" is not a word in ${level.title}.`);
    if (asked.has(word.id)) throw new RuleError(`"${word.id}" comes up once in a round.`);
    asked.add(word.id);
    if (!own.has(word.id) && ++reviewed > reviewRoom(level)) throw new RuleError(`A round of ${level.title} does not hold that many old words.`);
    if (!Number.isFinite(input.ms) || input.ms < 0 || input.ms > MAX_ANSWER_MS) throw new RuleError("An answer's time is out of range.");
    const given = input.given;
    if (typeof given !== "string" || given.length > 40) throw new RuleError("An answer must be a word or its tiles.");
    if (mode === "read" ? !wordById(given) : !builtFrom(given, word)) throw new RuleError(mode === "read" ? `"${given}" is not a picture the machine has.` : `"${given}" does not fit the boxes of "${word.id}".`);
    const ms = countedMs(input.ms);
    const correct = given === answerOf(mode, word);
    answers.push({ fact: word.id, given, ms, correct });
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

export const soundMachineRules: GameRules = {
  levels: LEVELS.map(({ id, title, blurb }) => ({ id, title, blurb })),
  modes: MODES,
  skills: SKILLS,
  settle,
  pay,
};
