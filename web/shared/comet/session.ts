// A round as it is played, one event at a time: the countdown, a card
// dealt, a key pressed, the clock running out, a pause. The screen
// (web/src/games/comet/Round.tsx) sends events and draws the Session; the
// rules of scoring are rules.ts and are not repeated here.
//
// Pure: time and randomness arrive inside the events. Run by Node as is.

import type { AnswerInput } from "../play.ts";
import { choicesFor, deal, missed, newDeck, seeded, type Deck, type FactStat } from "./deck.ts";
import { answerOf, factsOf, parseFact, type Level } from "./facts.ts";
import { BLITZ_MS, cardLimit, countedMs, pointsFor, startRound, stepRound, type Mode, type Round, type Skill } from "./rules.ts";

export type Phase = "countdown" | "ask" | "right" | "wrong" | "paused" | "done";

/** The countdown starts here: "3, 2, 1", then "Go!" at 0. */
export const COUNT_FROM = 3;

/**
 * How the screen paces a round, in ms: each step of the countdown, "Go!",
 * a right answer shown, a missed card's answer shown, and the pause before
 * the results. None of it is card time. The server's clock check
 * (web/server/plays.ts) counts on that: a whole round always takes longer
 * than its cards say, so a play that claims more card time than has passed
 * was not played. A right answer is shown for longer than MIN_ANSWER_MS, so
 * that holds even for answers quicker than the floor.
 */
export const PACE = { countStep: 650, go: 350, right: 380, wrong: 1900, done: 1100 } as const;

export interface Session {
  mode: Mode;
  skill: Skill;
  round: Round;
  deck: Deck;
  /** Every answer so far, as it will be sent to the server. */
  answers: AnswerInput[];
  /** The card on screen ("" before the first). */
  fact: string;
  /** Easy skill's four answers for it. */
  choices: number[];
  /** Arcade skill: the digits typed so far. */
  typed: string;
  phase: Phase;
  /** When the card on screen started waiting, on the events' clock (ms). */
  cardStart: number;
  /** Card time banked: before a pause, or the card's final time once answered. */
  held: number;
  /** The answer just given, while it is shown. */
  last: { given: number | null; correct: boolean; gained: number } | null;
  count: number;
  /** The pause box is open: the next card waits behind it. */
  wantPause: boolean;
  /** Goes up on every change of phase or count, so the screen can time what follows. */
  seq: number;
}

export type SessionEvent =
  /** The countdown's next number. */
  | { type: "beat" }
  /** Show the next card (or end the round, if it is over). */
  | { type: "deal"; now: number; seed: number }
  /** A pad key: "0"-"9", "back" or "ok". Arcade skill only. */
  | { type: "key"; key: string; now: number }
  /** One of the four answers was picked. Easy skill only. */
  | { type: "choose"; n: number; now: number }
  /** A frame went by: has the card, or the round, run out of time? */
  | { type: "clock"; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  /** Escape: pause, or resume if paused. */
  | { type: "toggle"; now: number };

export function startSession(level: Level, mode: Mode, skill: Skill, stats: Record<string, FactStat> = {}): Session {
  return {
    mode,
    skill,
    round: startRound(mode),
    deck: newDeck(factsOf(level), stats),
    answers: [],
    fact: "",
    choices: [],
    typed: "",
    phase: "countdown",
    cardStart: 0,
    held: 0,
    last: null,
    count: COUNT_FROM,
    wantPause: false,
    seq: 0,
  };
}

/** How long the card on screen has waited at `now`, in ms. */
export function waited(s: Session, now: number): number {
  return s.phase === "ask" ? s.held + Math.max(0, now - s.cardStart) : s.held;
}

/** The answer to the card on screen. */
export function cardAnswer(s: Session): number {
  const fact = parseFact(s.fact);
  return fact ? answerOf(fact) : 0;
}

/** Take an answer to the card on screen; null is a card that timed out. */
function answer(s: Session, given: number | null, now: number): Session {
  if (s.phase !== "ask") return s;
  const limit = cardLimit(s.mode, s.round);
  const ms = countedMs(limit === null ? waited(s, now) : Math.min(waited(s, now), limit));
  const correct = given !== null && given === cardAnswer(s);
  return {
    ...s,
    answers: [...s.answers, { fact: s.fact, given, ms }],
    round: stepRound(s.mode, s.round, { correct, ms }),
    deck: correct ? s.deck : missed(s.deck, s.fact),
    last: { given, correct, gained: correct ? pointsFor(s.round, ms) : 0 },
    held: ms,
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
  if (s.phase === "paused") return { ...s, wantPause: false, cardStart: now, phase: "ask", seq: s.seq + 1 };
  return s.wantPause ? { ...s, wantPause: false } : s;
}

/** The session after one event. Returns the same object when nothing changed. */
export function advance(s: Session, ev: SessionEvent): Session {
  switch (ev.type) {
    case "beat":
      return s.phase === "countdown" && s.count > 0 ? { ...s, count: s.count - 1, seq: s.seq + 1 } : s;

    case "deal": {
      // Only after the countdown or an answer: a stray timer must not swap a waiting card.
      if (s.phase !== "countdown" && s.phase !== "right" && s.phase !== "wrong") return s;
      if (s.round.over) return { ...s, phase: "done", last: null, seq: s.seq + 1 };
      const rng = seeded(ev.seed);
      const dealt = deal(s.deck, rng);
      return {
        ...s,
        deck: dealt.deck,
        fact: dealt.fact,
        choices: s.skill === "easy" ? choicesFor(dealt.fact, rng) : [],
        typed: "",
        last: null,
        held: 0,
        cardStart: ev.now,
        phase: s.wantPause ? "paused" : "ask",
        seq: s.seq + 1,
      };
    }

    case "key": {
      if (s.phase !== "ask" || s.skill !== "arcade") return s;
      if (ev.key === "back") return s.typed ? { ...s, typed: s.typed.slice(0, -1) } : s;
      if (ev.key === "ok") return s.typed ? answer(s, Number(s.typed), ev.now) : s;
      if (!/^[0-9]$/.test(ev.key) || s.typed.length >= 2) return s;
      const typed = s.typed + ev.key;
      // As many digits as the answer has: that is the answer, no OK needed.
      return typed.length >= String(cardAnswer(s)).length ? answer({ ...s, typed }, Number(typed), ev.now) : { ...s, typed };
    }

    case "choose":
      return s.skill === "easy" && s.choices.includes(ev.n) ? answer(s, ev.n, ev.now) : s;

    case "clock": {
      if (s.phase !== "ask") return s;
      const limit = cardLimit(s.mode, s.round);
      if (limit === null || waited(s, ev.now) < limit) return s;
      // Survival: the card timed out, a wrong answer. Blitz: the clock ran
      // out with this card unanswered, and the card does not count.
      if (s.mode !== "blitz") return answer(s, null, ev.now);
      return { ...s, round: { ...s.round, cardMs: BLITZ_MS, over: true }, held: 0, last: null, phase: "done", seq: s.seq + 1 };
    }

    case "pause":
      return pause(s, ev.now);
    case "resume":
      return resume(s, ev.now);
    case "toggle":
      return s.wantPause ? resume(s, ev.now) : pause(s, ev.now);
  }
}
