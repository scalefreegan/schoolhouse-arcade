// A round as it is played, one event at a time: a word is said, one of four
// written words is tapped, and that is the answer. The screen
// (web/src/games/sightwords/Round.tsx) sends events and draws the Session;
// scoring is rules.ts and is not repeated here.
//
// Pure: time and randomness arrive inside the events. Run by Node as is.

import { seeded, type FactStat } from "../deal.ts";
import type { AnswerInput } from "../play.ts";
import { choicesFor, roundWords } from "./pick.ts";
import { answerText, countedMs, pointsFor, startRound, stepRound, type Round, type Skill } from "./rules.ts";
import type { SightLevel, SightWord } from "./words.ts";

/** start: before the first word. ask: a word is waiting. right / wrong: its
 *  answer is being shown. done: the round is over. */
export type Phase = "start" | "ask" | "right" | "wrong" | "paused" | "done";

/**
 * How long an answer stays up before the next word may come, in ms, and the
 * pause before the results. None of it is word time. A right answer moves
 * on by itself after `right` (this is a sprint: shorter than the other
 * games'); a wrong one waits for the player, but not less than `wrong`. The
 * session itself refuses a next word sooner, and the server's clock check
 * (web/server/plays.ts) counts on that: each is longer than MIN_ANSWER_MS,
 * so a whole round always takes longer on the wall than its answers claim,
 * even when every answer was quicker than the floor.
 */
export const PACE = { right: 1_200, wrong: 1_400, done: 900 } as const;

/** A word is said this long after its question is drawn (the screen settles first). */
export const SAY_DELAY_MS = 250;

/**
 * After a miss, the longest the screen waits for the right word to be said
 * (ms from when the answer went up) before the arrow lights as if it had
 * been: the round must not wait for good on a clip that will not come.
 */
export const REVEAL_WAIT_MS = 4_000;

/** Whether the arrow may light after a miss: the word has been said, or REVEAL_WAIT_MS has passed since the answer went up. */
export function revealDone(o: { said: boolean; shownAt: number; now: number }): boolean {
  return o.said || o.now - o.shownAt >= REVEAL_WAIT_MS;
}

export interface Session {
  level: SightLevel;
  skill: Skill;
  /** The round's words, in the order they come up. */
  words: SightWord[];
  round: Round;
  /** Every answer so far, as it will be sent to the server. */
  answers: AnswerInput[];
  /** The word being asked (null before the first). */
  word: SightWord | null;
  /** The words to pick from, as word ids in the order shown. */
  choices: string[];
  phase: Phase;
  /** When the word up now started waiting, on the events' clock (ms). */
  wordStart: number;
  /** Word time banked: before a pause, or the word's final time once answered. */
  held: number;
  /** When the answer on show went up. */
  shownAt: number;
  /** The answer just given, while it is shown. */
  last: { pick: string; correct: boolean; gained: number } | null;
  /** The pause box is open: the next word waits behind it. */
  wantPause: boolean;
  /** Goes up on every change of phase, so the screen can time what follows. */
  seq: number;
}

export type SessionEvent =
  /** Bring up the next word (or end the round, if it is over). Ignored while
   *  an answer has not been up for its PACE. */
  | { type: "next"; now: number; seed: number }
  /** This word (a word id, one of the four shown) is the answer. One try. */
  | { type: "pick"; word: string; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "toggle"; now: number };

/** A new round: its eight words are chosen here, from `seed`. */
export function startSession(level: SightLevel, skill: Skill, stats: Record<string, FactStat>, seed: number): Session {
  return {
    level,
    skill,
    words: roundWords(level, stats, seeded(seed)),
    round: startRound(),
    answers: [],
    word: null,
    choices: [],
    phase: "start",
    wordStart: 0,
    held: 0,
    shownAt: 0,
    last: null,
    wantPause: false,
    seq: 0,
  };
}

/** How long the word up now has waited at `now`, in ms. */
export function waited(s: Session, now: number): number {
  return s.phase === "ask" ? s.held + Math.max(0, now - s.wordStart) : s.held;
}

function answer(s: Session, pick: string, now: number): Session {
  if (s.phase !== "ask" || !s.word || !s.choices.includes(pick)) return s;
  const ms = countedMs(waited(s, now));
  const correct = pick === s.word.id;
  return {
    ...s,
    answers: [...s.answers, { fact: s.word.id, given: answerText(s.choices, pick), ms }],
    round: stepRound(s.round, { correct, ms }),
    last: { pick, correct, gained: correct ? pointsFor(s.round) : 0 },
    held: ms,
    shownAt: now,
    phase: correct ? "right" : "wrong",
    seq: s.seq + 1,
  };
}

function pause(s: Session, now: number): Session {
  if (s.phase === "done") return s;
  if (s.phase === "ask") return { ...s, wantPause: true, held: waited(s, now), phase: "paused", seq: s.seq + 1 };
  return s.wantPause ? s : { ...s, wantPause: true };
}

function resume(s: Session, now: number): Session {
  if (s.phase === "paused") return { ...s, wantPause: false, wordStart: now, phase: "ask", seq: s.seq + 1 };
  if (!s.wantPause) return s;
  // Paused before the first word: the "next" that would have brought it was
  // refused, and nothing else would send another. The step goes up, so the
  // screen starts the round again from here.
  return s.phase === "start" ? { ...s, wantPause: false, seq: s.seq + 1 } : { ...s, wantPause: false };
}

/** The session after one event. Returns the same object when nothing changed. */
export function advance(s: Session, ev: SessionEvent): Session {
  switch (ev.type) {
    case "next": {
      // Only at the start or after an answer has had its time on show.
      if (s.phase !== "start" && s.phase !== "right" && s.phase !== "wrong") return s;
      if (s.phase !== "start" && ev.now - s.shownAt < PACE[s.phase]) return s;
      if (s.wantPause) return s;
      if (s.round.over || s.answers.length >= s.words.length) return { ...s, phase: "done", last: null, seq: s.seq + 1 };
      const word = s.words[s.answers.length];
      return { ...s, word, choices: choicesFor(word, s.skill, s.level, seeded(ev.seed)), last: null, held: 0, wordStart: ev.now, phase: "ask", seq: s.seq + 1 };
    }

    case "pick":
      return answer(s, ev.word, ev.now);

    case "pause":
      return pause(s, ev.now);
    case "resume":
      return resume(s, ev.now);
    case "toggle":
      return s.wantPause ? resume(s, ev.now) : pause(s, ev.now);
  }
}
