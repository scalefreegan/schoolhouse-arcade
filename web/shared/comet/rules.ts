// Comet Cards' rules: how a round runs and what it is worth. The browser
// steps through them to draw the round as it happens; the server replays the
// same answers through the same functions and stores what it gets. docs/PRD.md
// has them in words.
//
// Pure, and run by Node as is.

import { MAX_STARS, RuleError, type AnswerInput, type GameRules, type JudgedAnswer, type PlayConfig, type Settled } from "../play.ts";
import { LEVELS, answerOf, levelById, parseFact } from "./facts.ts";

export type Mode = "blitz" | "sprint" | "survival" | "practice";
export type Skill = "easy" | "arcade";

export const MODES: GameRules["modes"] = [
  { id: "blitz", title: "Blitz", blurb: "60 seconds", board: "score" },
  { id: "sprint", title: "Sprint", blurb: "20 cards", board: "time" },
  { id: "survival", title: "Survival", blurb: "3 lives", board: "score" },
  { id: "practice", title: "Practice", blurb: "No clock", board: null },
];

export const SKILLS: GameRules["skills"] = [
  { id: "easy", title: "Easy", blurb: "Pick from 4" },
  { id: "arcade", title: "Arcade", blurb: "Type it" },
];

/** Blitz: card time on the clock. */
export const BLITZ_MS = 60_000;
/** Sprint: cards to get right, and what a miss adds to the time. */
export const SPRINT_CARDS = 20;
export const SPRINT_MISS_MS = 3_000;
/** Survival: lives, and the countdown per card (it shrinks with every right answer). */
export const SURVIVAL_LIVES = 3;
export const SURVIVAL_START_MS = 10_000;
export const SURVIVAL_STEP_MS = 300;
export const SURVIVAL_FLOOR_MS = 2_500;
/** Practice: cards in the deck. */
export const PRACTICE_CARDS = 15;

export const POINTS = 100;
/** An answer under this is "fast" and earns the bonus. */
export const FAST_MS = 2_000;
export const FAST_BONUS = 50;

/** Timers in a browser are not exact: an answer this far past a limit still counts as in time. */
const GRACE_MS = 250;
/** No real answer takes longer than this; a larger number is a bug or a lie. */
const MAX_ANSWER_MS = 10 * 60_000;
/** Survival has no end but the player's; this is far past any real round. */
const MAX_ANSWERS = 2_000;

/** Points multiplier for the n-th right answer in a row (n ≥ 1). */
export function multiplier(combo: number): number {
  return combo >= 15 ? 5 : combo >= 10 ? 4 : combo >= 6 ? 3 : combo >= 3 ? 2 : 1;
}

/** A round as it stands after some answers. */
export interface Round {
  right: number;
  wrong: number;
  combo: number;
  bestCombo: number;
  score: number;
  /** Time cards spent waiting, in ms (a missed card's reveal is not in it). */
  cardMs: number;
  /** Survival only; null in the other modes. */
  lives: number | null;
  over: boolean;
}

export function startRound(mode: Mode): Round {
  return { right: 0, wrong: 0, combo: 0, bestCombo: 0, score: 0, cardMs: 0, lives: mode === "survival" ? SURVIVAL_LIVES : null, over: false };
}

/** How long the next card may wait, in ms: Survival's countdown, or what is
 *  left of Blitz's clock. null when the mode puts no limit on a card. */
export function cardLimit(mode: Mode, r: Round): number | null {
  if (mode === "survival") return Math.max(SURVIVAL_FLOOR_MS, SURVIVAL_START_MS - SURVIVAL_STEP_MS * r.right);
  if (mode === "blitz") return Math.max(0, BLITZ_MS - r.cardMs);
  return null;
}

/** What one right answer is worth at this point of the round. */
export function pointsFor(r: Round, ms: number): number {
  return POINTS * multiplier(r.combo + 1) + (ms < FAST_MS ? FAST_BONUS : 0);
}

/** The round after one more answer. `correct` is already judged. */
export function stepRound(mode: Mode, r: Round, a: { correct: boolean; ms: number }): Round {
  if (r.over) return r;
  const next: Round = { ...r, cardMs: r.cardMs + a.ms };
  if (a.correct) {
    next.score = r.score + pointsFor(r, a.ms);
    next.right = r.right + 1;
    next.combo = r.combo + 1;
    next.bestCombo = Math.max(r.bestCombo, next.combo);
  } else {
    next.wrong = r.wrong + 1;
    next.combo = 0;
    if (next.lives !== null) next.lives -= 1;
  }
  next.over =
    mode === "blitz" ? next.cardMs >= BLITZ_MS
    : mode === "sprint" ? next.right >= SPRINT_CARDS
    : mode === "survival" ? next.lives === 0
    : next.right + next.wrong >= PRACTICE_CARDS;
  return next;
}

/** The round's time as its mode counts it: a Sprint adds a penalty per miss. */
export function roundTime(mode: Mode, r: Round): number {
  return mode === "sprint" ? r.cardMs + SPRINT_MISS_MS * r.wrong : r.cardMs;
}

/** Stars a finished round earns (docs/PRD.md, Stars). */
export function starsFor(mode: Mode, skill: Skill, r: Round): number {
  if (mode === "practice") return 0;
  const answered = r.right + r.wrong;
  const accuracy = answered ? r.right / answered : 0;
  if (r.right < 15 || accuracy < 0.85) return 0;
  if (skill !== "arcade") return 1;
  return mode === "blitz" && r.right >= 25 && accuracy >= 0.95 ? MAX_STARS : 2;
}

function configOf(config: PlayConfig): { mode: Mode; skill: Skill } {
  if (!levelById(config.level)) throw new RuleError(`Comet Cards has no level "${config.level}".`);
  if (!MODES.some((m) => m.id === config.mode)) throw new RuleError(`Comet Cards has no mode "${config.mode}".`);
  if (!SKILLS.some((s) => s.id === config.skill)) throw new RuleError(`Comet Cards has no skill "${config.skill}".`);
  return { mode: config.mode as Mode, skill: config.skill as Skill };
}

/**
 * Judge and score a whole play from its answers. An answer that arrives
 * after the round is over (the clock had run out, the lives were gone) is
 * left out rather than refused: a slow tablet can send one. An answer to a
 * card the level does not hold, or with a time that cannot be, is refused.
 */
export function settle(config: PlayConfig, inputs: AnswerInput[]): Settled {
  const { mode, skill } = configOf(config);
  const level = levelById(config.level)!;
  if (!Array.isArray(inputs) || inputs.length > MAX_ANSWERS) throw new RuleError("That is not a round of Comet Cards.");
  let round = startRound(mode);
  const answers: JudgedAnswer[] = [];
  for (const input of inputs) {
    if (round.over) break;
    const fact = typeof input?.fact === "string" ? parseFact(input.fact) : null;
    if (!fact || !level.has(fact)) throw new RuleError(`"${String(input?.fact)}" is not a card in ${level.title}.`);
    if (!Number.isFinite(input.ms) || input.ms < 0 || input.ms > MAX_ANSWER_MS) throw new RuleError("An answer's time is out of range.");
    if (input.given !== null && !Number.isInteger(input.given)) throw new RuleError("An answer must be a whole number.");
    const ms = Math.round(input.ms);
    const limit = cardLimit(mode, round);
    // Blitz: the clock ran out while this card was up. It was never answered in time.
    if (mode === "blitz" && limit !== null && ms > limit + GRACE_MS) break;
    // Survival: past the card's countdown is a timeout, whatever was pressed.
    const late = mode === "survival" && limit !== null && ms > limit + GRACE_MS;
    const given = late ? null : input.given;
    const correct = given !== null && given === answerOf(fact);
    answers.push({ fact: input.fact, given, ms, correct });
    round = stepRound(mode, round, { correct, ms });
  }
  const finished = mode === "sprint" || mode === "practice" ? round.over : true;
  return {
    answers,
    score: round.score,
    right: round.right,
    wrong: round.wrong,
    bestCombo: round.bestCombo,
    timeMs: roundTime(mode, round),
    finished,
    stars: finished ? starsFor(mode, skill, round) : 0,
    board: MODES.find((m) => m.id === mode)!.board,
  };
}

/** Tickets for a right answer, by skill; and for finishing a Practice. */
export const TICKETS_EASY = 1;
export const TICKETS_ARCADE = 2;
export const TICKETS_PRACTICE = 5;

/** What a play is worth in tickets: every right answer pays, typing pays
 *  double, and Practice pays a flat amount for seeing it through. */
export function pay(config: PlayConfig, settled: Settled): number {
  if (config.mode === "practice") return settled.finished ? TICKETS_PRACTICE : 0;
  return settled.right * (config.skill === "arcade" ? TICKETS_ARCADE : TICKETS_EASY);
}

export const cometRules: GameRules = {
  levels: LEVELS.map(({ id, title, blurb }) => ({ id, title, blurb })),
  modes: MODES,
  skills: SKILLS,
  settle,
  pay,
};
