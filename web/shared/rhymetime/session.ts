// A round as it is played, one event at a time: a question comes up, a
// picture is chosen (and heard), another is chosen instead, the lever is
// pulled. The screen (web/src/games/rhymetime/Round.tsx) sends events and
// draws the Session; scoring is rules.ts and is not repeated here.
//
// Pure: time and randomness arrive inside the events. Run by Node as is.

import { seeded, type FactStat } from "../deal.ts";
import type { AnswerInput } from "../play.ts";
import { questionFor, roundPlan, type Planned } from "./pick.ts";
import { answerText, countedMs, pointsFor, rightOf, startRound, stepRound, type Mode, type Question, type Round, type Skill } from "./rules.ts";
import type { RhymeLevel } from "./words.ts";

/** start: before the first question. ask: a question is waiting. right /
 *  wrong: its answer is being shown. done: the round is over. */
export type Phase = "start" | "ask" | "right" | "wrong" | "paused" | "done";

/**
 * How long an answer stays up before the next question may come, in ms,
 * and the pause before the results. None of it is question time. A right
 * answer moves on by itself after `right` (once its rhyme has been said); a
 * wrong one waits for the player, but not less than `wrong`. The session
 * itself refuses a next question sooner, and the server's clock check
 * (web/server/plays.ts) counts on that: each is longer than MIN_ANSWER_MS,
 * so a whole round always takes longer on the wall than its answers claim.
 * Sound Machine's, the same.
 */
export const PACE = { right: 1_700, wrong: 1_400, done: 900 } as const;

/**
 * After an answer, the longest the screen waits for the rhyme to be said
 * (ms from when the answer went up) before moving on as if it had been: a
 * clip on an audio context that was suspended or closed may never end, and
 * the round must not wait on it for good. Long enough for the slowest
 * reveal there is (two or three words with a gap after each).
 */
export const REVEAL_WAIT_MS = 6_000;

/** Whether what follows an answer may come now: its words have been said, or REVEAL_WAIT_MS has passed since it went up. */
export function revealDone(o: { said: boolean; shownAt: number; now: number }): boolean {
  return o.said || o.now - o.shownAt >= REVEAL_WAIT_MS;
}

/** A question is said this long after it is drawn (the screen settles first). */
export const READ_DELAY_MS = 200;
/** A picture pressed before the question is said is heard out first, but not waited on longer than this after the press. */
export const TAP_WAIT_MS = 2_500;

/**
 * Whether to say the question now, wait, or drop it. It is said once each
 * time it comes up (`askSeq`, the step of the round it was drawn at):
 * READ_DELAY_MS after it was drawn, and after a word the player pressed has
 * been said (`speaking`), or TAP_WAIT_MS after that press if the clip never
 * ends. Dropped once the round has moved on (a pause, the sound switched off,
 * the answer, the next question): it is never said over another step.
 */
export function readQuestion(o: { askSeq: number; seq: number; phase: Phase; askedAt: number; tappedAt: number | null; speaking: boolean; now: number }): "read" | "wait" | "drop" {
  if (o.seq !== o.askSeq || o.phase !== "ask") return "drop";
  if (o.now - o.askedAt < READ_DELAY_MS) return "wait";
  if (o.speaking && o.tappedAt !== null && o.now - o.tappedAt < TAP_WAIT_MS) return "wait";
  return "read";
}

/**
 * Whether a question sent to be said was stopped before any of it sounded:
 * a picture pressed since it was sent (`readAt`), while its first word had
 * yet to begin (the caller asks only until then). That press counts as an
 * early one: the pressed word is heard out and the question said after it,
 * as readQuestion has it. Without this the press would stop the whole
 * reading for good, in the few dozen ms between "read" and the first sound.
 */
export function cutUnheard(o: { readAt: number; tappedAt: number | null }): boolean {
  return o.tappedAt !== null && o.tappedAt >= o.readAt;
}

export interface Session {
  level: RhymeLevel;
  mode: Mode;
  skill: Skill;
  /** The round's questions before their pictures are dealt: the word each is about and the rhyme beside it, in the order they come up. */
  plan: Planned[];
  round: Round;
  /** Every answer so far, as it will be sent to the server. */
  answers: AnswerInput[];
  /** Every question put so far, the one up now last. */
  asked: Question[];
  /** The question up now (null before the first). */
  question: Question | null;
  /** The picture the player has chosen (and heard), not yet locked in by the lever. */
  chosen: string | null;
  phase: Phase;
  /** When the question up now started waiting, on the events' clock (ms). */
  wordStart: number;
  /** Question time banked: before a pause, or the question's final time once answered. */
  held: number;
  /** When the answer on show went up. */
  shownAt: number;
  /** The answer just given, while it is shown: the picture picked, and the right one. */
  last: { pick: string; right: string; correct: boolean; gained: number } | null;
  /** The pause box is open: the next question waits behind it. */
  wantPause: boolean;
  /** Goes up on every change of phase, so the screen can time what follows. */
  seq: number;
}

export type SessionEvent =
  /** Bring up the next question (or end the round, if it is over). Ignored
   *  while an answer has not been up for its PACE. */
  | { type: "next"; now: number; seed: number }
  /** Choose this picture (a word id): it is heard, and lit as the player's. Not yet the answer. */
  | { type: "choose"; word: string }
  /** Pull the lever: the chosen picture is the answer. Nothing happens until one is chosen. */
  | { type: "go"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "toggle"; now: number };

/** A new round: the words its questions are about are chosen here, from `seed`. */
export function startSession(level: RhymeLevel, mode: Mode, skill: Skill, stats: Record<string, FactStat>, seed: number): Session {
  return {
    level,
    mode,
    skill,
    plan: roundPlan(level, mode, stats, seeded(seed)),
    round: startRound(),
    answers: [],
    asked: [],
    question: null,
    chosen: null,
    phase: "start",
    wordStart: 0,
    held: 0,
    shownAt: 0,
    last: null,
    wantPause: false,
    seq: 0,
  };
}

/** How long the question up now has waited at `now`, in ms. */
export function waited(s: Session, now: number): number {
  return s.phase === "ask" ? s.held + Math.max(0, now - s.wordStart) : s.held;
}

/** The lever will work: a picture is chosen. */
export function ready(s: Session): boolean {
  return s.phase === "ask" && s.chosen !== null;
}

function answer(s: Session, now: number): Session {
  if (!ready(s) || !s.question) return s;
  const pick = s.chosen!;
  const right = rightOf(s.question)!;
  const ms = countedMs(waited(s, now));
  const correct = pick === right;
  return {
    ...s,
    answers: [...s.answers, { fact: s.plan[s.answers.length].anchor.id, given: answerText(s.question, pick), ms }],
    round: stepRound(s.round, { correct, ms }),
    last: { pick, right, correct, gained: correct ? pointsFor(s.round) : 0 },
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
  // Paused before the first question: the "next" that would have brought it
  // was refused, and nothing else would send another. The step goes up, so
  // the screen starts the round again from here.
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
      if (s.round.over || s.answers.length >= s.plan.length) return { ...s, phase: "done", last: null, seq: s.seq + 1 };
      const question = questionFor(s.mode, s.skill, s.level, s.plan[s.answers.length], seeded(ev.seed));
      return { ...s, question, asked: [...s.asked, question], chosen: null, last: null, held: 0, wordStart: ev.now, phase: "ask", seq: s.seq + 1 };
    }

    case "choose":
      if (s.phase !== "ask" || !s.question?.choices.includes(ev.word) || s.chosen === ev.word) return s;
      return { ...s, chosen: ev.word };

    case "go":
      return answer(s, ev.now);

    case "pause":
      return pause(s, ev.now);
    case "resume":
      return resume(s, ev.now);
    case "toggle":
      return s.wantPause ? resume(s, ev.now) : pause(s, ev.now);
  }
}
