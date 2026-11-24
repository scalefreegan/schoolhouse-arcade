// What every cabinet has in common: a play is a player's answers under a
// set-up, and the arcade (not the game) scores it, ranks it and pays for it.
// Each game supplies a GameRules; shared/rules.ts lists them by game id.
//
// Pure, and run by Node as is: explicit .ts imports, erasable syntax only.

/** How a round was set up. The ids are the game's own (never renamed once live). */
export interface PlayConfig {
  level: string;
  mode: string;
  skill: string;
}

/** One answer as the browser reports it. */
export interface AnswerInput {
  /** What was asked, in the game's own notation ("7+5"). */
  fact: string;
  /** What the player answered; null when the card timed out. */
  given: number | null;
  /** How long the card waited for it, in ms. */
  ms: number;
}

/** An answer after the rules have judged it. */
export interface JudgedAnswer extends AnswerInput {
  correct: boolean;
}

/** A play as the rules score it. Nothing here comes from the browser except
 *  the answers themselves. */
export interface Settled {
  /** The answers that counted, judged. One given after the round was over is not among them. */
  answers: JudgedAnswer[];
  score: number;
  right: number;
  wrong: number;
  bestCombo: number;
  /** The round's time as the mode counts it, in ms. */
  timeMs: number;
  /** The round ran to its end (a Sprint cleared its deck). Only a finished play is ranked or starred. */
  finished: boolean;
  /** Stars this play earns for its level, 0-3. */
  stars: number;
  /** Which high score table it belongs on, if any. */
  board: BoardKind | null;
}

/** `score`: high first. `time`: low first. */
export type BoardKind = "score" | "time";

/** A play the rules refuse: not a bug, a request that makes no sense. */
export class RuleError extends Error {}

export interface Choice {
  id: string;
  title: string;
  /** One short line a six-year-old can read. */
  blurb: string;
}

export interface GameRules {
  /** In unlock order: the first is open, each next one opens when the one before has a star. */
  levels: Choice[];
  modes: (Choice & { board: BoardKind | null })[];
  skills: Choice[];
  /** Judge and score a play. Throws RuleError for a set-up or an answer that cannot be. */
  settle(config: PlayConfig, answers: AnswerInput[]): Settled;
  /** The tickets a settled play is worth on its own, before the arcade's bonuses (shared/tickets.ts). */
  pay(config: PlayConfig, settled: Settled): number;
}

/** The most stars a level can hold. */
export const MAX_STARS = 3;

/**
 * Which levels a player may start: the first, any level after one that has a
 * star, and any a grown-up opened by hand. Pure.
 */
export function openLevels(levels: Choice[], stars: Record<string, number>, opened: string[] = []): string[] {
  return levels.filter((l, i) => i === 0 || (stars[levels[i - 1].id] ?? 0) > 0 || opened.includes(l.id)).map((l) => l.id);
}
