// A round as it is played, one event at a time: a word comes up, tiles go
// into boxes and come back out, the lever is pulled, a picture is picked.
// The screen (web/src/games/soundmachine/Round.tsx) sends events and draws
// the Session; scoring is rules.ts and is not repeated here.
//
// Pure: time and randomness arrive inside the events. Run by Node as is.

import { seeded, type FactStat } from "../deal.ts";
import type { AnswerInput } from "../play.ts";
import { picturesFor, roundWords, trayFor } from "./pick.ts";
import { answerOf, countedMs, pointsFor, startRound, stepRound, type Mode, type Round, type Skill } from "./rules.ts";
import { tilesKey, type SoundLevel, type Word } from "./words.ts";

/** start: before the first word. ask: a word is waiting. right / wrong: its
 *  answer is being shown. done: the round is over. */
export type Phase = "start" | "ask" | "right" | "wrong" | "paused" | "done";

/**
 * How long an answer stays up before the next word may come, in ms, and the
 * pause before the results. None of it is word time. A right answer moves
 * on by itself after `right`; a wrong one waits for the player, but not
 * less than `wrong`. The session itself refuses a next word sooner, and the
 * server's clock check (web/server/plays.ts) counts on that: each is longer
 * than MIN_ANSWER_MS, so a whole round always takes longer on the wall than
 * its words claim, even when every answer was quicker than the floor.
 */
export const PACE = { right: 1_700, wrong: 1_400, done: 900 } as const;

export interface Session {
  level: SoundLevel;
  mode: Mode;
  skill: Skill;
  /** The round's words, in the order they come up. */
  words: Word[];
  round: Round;
  /** Every answer so far, as it will be sent to the server. */
  answers: AnswerInput[];
  /** The word on the machine (null before the first). */
  word: Word | null;
  /** Build: the tiles offered for it. */
  tray: string[];
  /** Build: which tray tile sits in each box (an index into `tray`), or null for an empty box. */
  boxes: (number | null)[];
  /** Read: the words whose pictures are offered. */
  pictures: string[];
  phase: Phase;
  /** When the word on the machine started waiting, on the events' clock (ms). */
  wordStart: number;
  /** Word time banked: before a pause, or the word's final time once answered. */
  held: number;
  /** When the answer on show went up. */
  shownAt: number;
  /** The answer just given, while it is shown. */
  last: { given: string; correct: boolean; gained: number } | null;
  /** The pause box is open: the next word waits behind it. */
  wantPause: boolean;
  /** Goes up on every change of phase, so the screen can time what follows. */
  seq: number;
}

export type SessionEvent =
  /** Bring up the next word (or end the round, if it is over). Ignored while
   *  an answer has not been up for its PACE. */
  | { type: "next"; now: number; seed: number }
  /** Build: put this tray tile (by its place in the tray) in the first empty box. */
  | { type: "place"; tile: number }
  /** Build: take the tile back out of this box. */
  | { type: "take"; box: number }
  /** Build: pull the lever. Nothing happens until every box is full. */
  | { type: "go"; now: number }
  /** Read: this picture (a word id) is the answer. */
  | { type: "pick"; word: string; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "toggle"; now: number };

/** A new round: its eight words are chosen here, from `seed`. */
export function startSession(level: SoundLevel, mode: Mode, skill: Skill, stats: Record<string, FactStat>, seed: number): Session {
  return {
    level,
    mode,
    skill,
    words: roundWords(level, stats, seeded(seed)),
    round: startRound(),
    answers: [],
    word: null,
    tray: [],
    boxes: [],
    pictures: [],
    phase: "start",
    wordStart: 0,
    held: 0,
    shownAt: 0,
    last: null,
    wantPause: false,
    seq: 0,
  };
}

/** How long the word on the machine has waited at `now`, in ms. */
export function waited(s: Session, now: number): number {
  return s.phase === "ask" ? s.held + Math.max(0, now - s.wordStart) : s.held;
}

/** The tiles in the boxes, in order; "" for an empty box. */
export function built(s: Session): string[] {
  return s.boxes.map((i) => (i === null ? "" : s.tray[i]));
}

/** Every box has a tile: the lever will work. */
export function full(s: Session): boolean {
  return s.boxes.length > 0 && s.boxes.every((i) => i !== null);
}

function answer(s: Session, given: string, now: number): Session {
  if (s.phase !== "ask" || !s.word) return s;
  const ms = countedMs(waited(s, now));
  const correct = given === answerOf(s.mode, s.word);
  return {
    ...s,
    answers: [...s.answers, { fact: s.word.id, given, ms }],
    round: stepRound(s.round, { correct, ms }),
    last: { given, correct, gained: correct ? pointsFor(s.round) : 0 },
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
      if (s.round.over) return { ...s, phase: "done", last: null, seq: s.seq + 1 };
      const word = s.words[s.answers.length];
      const rng = seeded(ev.seed);
      return {
        ...s,
        word,
        tray: s.mode === "build" ? trayFor(word, s.skill, s.level, rng) : [],
        boxes: s.mode === "build" ? word.tiles.map(() => null) : [],
        pictures: s.mode === "read" ? picturesFor(word, s.skill, s.level, rng) : [],
        last: null,
        held: 0,
        wordStart: ev.now,
        phase: "ask",
        seq: s.seq + 1,
      };
    }

    case "place": {
      if (s.phase !== "ask" || s.mode !== "build") return s;
      const box = s.boxes.indexOf(null);
      if (box < 0 || !Number.isInteger(ev.tile) || ev.tile < 0 || ev.tile >= s.tray.length || s.boxes.includes(ev.tile)) return s;
      return { ...s, boxes: s.boxes.map((b, i) => (i === box ? ev.tile : b)) };
    }

    case "take":
      if (s.phase !== "ask" || s.mode !== "build" || s.boxes[ev.box] == null) return s;
      return { ...s, boxes: s.boxes.map((b, i) => (i === ev.box ? null : b)) };

    case "go":
      return s.mode === "build" && full(s) ? answer(s, tilesKey(built(s)), ev.now) : s;

    case "pick":
      return s.mode === "read" && s.pictures.includes(ev.word) ? answer(s, ev.word, ev.now) : s;

    case "pause":
      return pause(s, ev.now);
    case "resume":
      return resume(s, ev.now);
    case "toggle":
      return s.wantPause ? resume(s, ev.now) : pause(s, ev.now);
  }
}
