import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import type { FactStat } from "../../../shared/deal.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import { rightOf, type Mode, type Skill } from "../../../shared/rhymetime/rules.ts";
import { PACE, advance, cutUnheard, readQuestion, ready, revealDone, startSession } from "../../../shared/rhymetime/session.ts";
import { ROUND_QUESTIONS, rhymes, sayUrl, wordById, type RhymeLevel, type RhymeWord } from "../../../shared/rhymetime/words.ts";
import { sfx } from "../../sound.ts";
import { hush, say, speaking } from "../../speech.ts";
import { Picture, Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { fmtScore } from "../format.ts";
import { SoundOff } from "../NeedsSound.tsx";

// One round of Rhyme Time, from the first question to the eighth. What
// happens is decided by the session (shared/rhymetime/session.ts): this file
// sends it events (a picture chosen, the lever), says the words, times what
// follows each answer, and draws. It hands back the answers; the server
// judges them again and its numbers are the ones kept. There is no clock the
// player sees.
//
// Before an answer it is pictures and voices only: a word written would let
// the letters find the rhyme, and rhyme is heard. Once answered, the words
// of the rhyme are written with the ending they share lit, and said.

const seed = () => Math.floor(Math.random() * 2 ** 32);
/** Between words when a question or its rhyme is said (seconds). */
const GAP = 0.35;
/** Find it: the breath between the word and the pictures to pick from. */
const BREATH = 0.6;

const wordOf = (id: string): RhymeWord => wordById(id)!;

/** A word as it is read, lower case, its ending (the vowel and what follows) lit when `lit`: c·at. */
export function Written({ word, lit = false, className = "" }: { word: RhymeWord; lit?: boolean; className?: string }) {
  const at = word.id.search(/[aeiou]/);
  return (
    <span className={`sm-letter rt-word ${className}`} aria-label={word.id}>
      <span aria-hidden>{word.id.slice(0, at)}</span>
      <span aria-hidden className={lit ? "rt-rime" : ""}>
        {word.id.slice(at)}
      </span>
    </span>
  );
}

export function RoundScreen({ level, mode, skill, stats, onDone, onQuit }: { level: RhymeLevel; mode: Mode; skill: Skill; stats: Record<string, FactStat>; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, mode, skill, stats, seed()));
  const { muted } = useArcade();
  // Remembered with the step of the round they belong to (s.seq), so neither outlives its question.
  /** The word being said now: its picture glows. */
  const [litAt, setLitAt] = useState<{ seq: number; id: string | null }>({ seq: -1, id: null });
  const lit = litAt.seq === s.seq ? litAt.id : null;
  /** A missed question has been up long enough, and said, to move on from. */
  const [goAt, setGoAt] = useState(-1);
  const mayGo = goAt === s.seq;

  /** When the player last pressed a picture (or the word) to hear it, and in which step of the round (s.seq). */
  const tapped = useRef<{ seq: number; at: number }>({ seq: -1, at: 0 });
  const next = () => send({ type: "next", now: performance.now(), seed: seed() });

  /** Say these words in order, each picture glowing as its word is said
   *  (`onSound`: the first of them to be said has begun to sound). The glow goes out when
   *  this stops being said, by its end or by being cut short, and so never
   *  puts out the glow of what cut it. */
  const sayAll = (ids: string[], gap: number | ((i: number) => number) = GAP, onSound?: () => void) => {
    const seq = s.seq;
    let silent = true;
    return say(
      ids.map((id) => sayUrl(wordOf(id))),
      {
        gap,
        onEach: (i) => {
          // The first clip there is: a word whose clip could not be had is left out.
          if (silent) onSound?.();
          silent = false;
          setLitAt({ seq, id: ids[i] });
        },
        onStop: () => setLitAt((l) => (l.seq === seq ? { seq, id: null } : l)),
      },
    );
  };

  const q = s.question;
  const right = q ? rightOf(q) : null;
  /** The rhyme, as it is said after an answer: the call and its rhyme, or the pair and then the odd one. */
  const reveal = (): string[] => {
    if (!q || !right) return [];
    if (q.mode === "find") return [q.call!, right];
    return [...q.choices.filter((c) => c !== right), right];
  };

  /** The step the round is at now, for a timer set in an earlier one. */
  const stepNow = useEffectEvent(() => ({ seq: s.seq, phase: s.phase }));

  // What follows each change of phase: a sound now, the next thing later.
  const follow = useEffectEvent(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    switch (s.phase) {
      case "start":
        later(next, 250);
        break;
      case "ask":
        // A new question (or the same one after a pause): whatever was being
        // said stops (a press before now included: it is forgotten with it),
        // then the question is said once: the word, a breath, and each picture
        // in turn; or the three pictures. A picture pressed before then is
        // heard out first (readQuestion has the limits), and "before then"
        // is before any of it has sounded: a press in the moment between
        // the reading being sent and its first word stops it unheard, so it
        // is read again after the pressed word (cutUnheard). Nothing pending
        // outlives this step: the timer goes when the step does, and the
        // session is asked again before speaking.
        hush();
        tapped.current = { seq: -1, at: 0 };
        if (q) {
          const ids = q.mode === "find" ? [q.call!, ...q.choices] : q.choices;
          const askSeq = s.seq;
          const askedAt = performance.now();
          /** When the reading was last sent to be said (null: not yet, or to be sent again). */
          let readAt: number | null = null;
          /** The reading is over with: some of it sounded, or it ended with nothing to say. */
          let heard = false;
          /** When a picture was last pressed in this step, if one was. */
          const tapNow = () => (tapped.current.seq === askSeq ? tapped.current.at : null);
          const tick = window.setInterval(() => {
            const tappedAt = tapNow();
            const now = performance.now();
            if (!heard && readAt !== null && cutUnheard({ readAt, tappedAt })) readAt = null;
            if (heard) return window.clearInterval(tick);
            // Sent, and not cut: wait for its first word (or its end).
            if (readAt !== null) {
              if (stepNow().seq !== askSeq) window.clearInterval(tick);
              return;
            }
            const what = readQuestion({ askSeq, ...stepNow(), askedAt, tappedAt, speaking: speaking(), now });
            if (what === "wait") return;
            if (what === "drop") return window.clearInterval(tick);
            const mine = (readAt = now);
            const sounded = () => {
              if (readAt === mine) heard = true;
            };
            // Ended with nothing sounded: there was nothing to say (that is the
            // reading over with), unless a press stopped it first, which may
            // be seen here before the next tick sees it (a clip still loading).
            const ended = () => {
              if (readAt !== mine || heard) return;
              if (cutUnheard({ readAt: mine, tappedAt: tapNow() })) readAt = null;
              else heard = true;
            };
            void sayAll(ids, (i) => (q.mode === "find" && i === 0 ? BREATH : GAP), sounded).then(ended, ended);
          }, 50);
          timers.push(tick);
        }
        break;
      case "right":
      case "wrong": {
        if (s.phase === "right") sfx.right(Math.min(4, s.round.streak - 1));
        else sfx.wrong();
        // The rhyme, said once it is written. The next question comes by
        // itself after a right answer, and the arrow lights after a wrong
        // one, when it has been said and the session will take it; but never
        // later than REVEAL_WAIT_MS (a clip that never ends must not hold the round).
        const seq = s.seq;
        const shownAt = s.shownAt;
        const phase = s.phase;
        let said = false;
        later(() => void sayAll(reveal()).then(() => (said = true)), 360);
        later(
          () =>
            timers.push(
              window.setInterval(() => {
                if (!revealDone({ said, shownAt, now: performance.now() })) return;
                if (phase === "right") next();
                else setGoAt(seq);
              }, 100),
            ),
          PACE[phase] + 30,
        );
        break;
      }
      case "paused":
        hush();
        break;
      case "done":
        hush();
        sfx.over();
        later(() => onDone(s.answers), PACE.done);
        break;
    }
    return () => {
      for (const t of timers) {
        window.clearTimeout(t);
        window.clearInterval(t);
      }
    };
  });
  useEffect(() => follow(), [s.seq]);
  // The sound switched off in the middle of a round: the round waits.
  useEffect(() => {
    if (muted) send({ type: "pause", now: performance.now() });
  }, [muted]);
  // Leaving the cabinet stops it talking.
  useEffect(() => hush, []);

  /** Press a picture (or the word) to hear it. */
  const hear = (id: string) => {
    tapped.current = { seq: s.seq, at: performance.now() };
    void sayAll([id]);
  };
  /** Tap a picture: hear it, and (while asking) choose it. */
  const choose = (id: string) => {
    hear(id);
    if (s.phase === "ask") send({ type: "choose", word: id });
  };
  const go = () => send({ type: "go", now: performance.now() });

  /** The player is moving by keyboard: a Tab since the last tap or click. */
  const byKeys = useRef(false);
  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    // A held key repeating is not a new press (holding Enter on the box's button must not pull the lever underneath).
    // Nor is it a press of whatever has focus: Enter held would press a button last tapped or clicked
    // again on every repeat. Only a button reached by Tab
    // keeps its own repeats, as a button does anywhere.
    if (ev.repeat) {
      if (ev.key === "Enter" && !(byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled)) ev.preventDefault();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // While the sound-off box is up the round is not there to play: its keys are the box's own.
    if (muted) return;
    if (ev.key === "Tab") byKeys.current = true;
    // Moving by keyboard, Enter on a button is that button's own press.
    // Otherwise Enter is the lever (or the next question), and 1 to 4 choose a picture.
    if (ev.key === "Enter" && byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled) return;
    const n = Number(ev.key);
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (ev.key === "Enter" && s.phase === "wrong" && mayGo && !s.wantPause) next();
    else if (ev.key === "Enter" && s.phase === "ask") go();
    else if (s.phase === "ask" && q && Number.isInteger(n) && n >= 1 && n <= q.choices.length) choose(q.choices[n - 1]);
    else return;
    ev.preventDefault();
  });
  useEffect(() => {
    const key = (ev: KeyboardEvent) => onKey(ev);
    const point = () => (byKeys.current = false);
    const hide = () => {
      if (document.hidden) send({ type: "pause", now: performance.now() });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", point, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", point, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  // ---------- drawing ----------

  const judged = s.phase === "right" || s.phase === "wrong";
  const state = s.phase === "right" ? "right" : s.phase === "wrong" ? "wrong" : "ask";
  const anchor = q ? s.plan[s.asked.length - 1].anchor : null;
  /** How a picture looks: the player's choice before the answer; after it, right, the try, the rhyme, or out of it. */
  const tone = (id: string): string => {
    if (!judged) return id === s.chosen ? "chosen" : "";
    if (id === right) return "right";
    if (id === s.last?.pick) return "wrong";
    if (q?.mode === "odd") return "pair";
    return "out";
  };
  /** Which words are written once it is answered, and whether their ending is lit (the rhyme's is). */
  const written = (id: string): { lit: boolean } | null => {
    if (!judged || !q || !anchor) return null;
    const w = wordOf(id);
    if (q.mode === "find") return id === right ? { lit: true } : id === s.last?.pick ? { lit: false } : null;
    return { lit: rhymes(w, anchor) || (id === anchor.id) };
  };

  return (
    <main className="screen sm-round">
      <header className="flex items-center justify-between gap-3">
        <p className="readout m-0 text-left">
          Score
          <b className="glow text-magenta">{fmtScore(s.round.score)}</b>
        </p>
        <ol className="m-0 flex list-none gap-1 p-0 sm:gap-2" aria-label={`Question ${Math.min(s.answers.length + (judged ? 0 : 1), ROUND_QUESTIONS)} of ${ROUND_QUESTIONS}`}>
          {Array.from({ length: ROUND_QUESTIONS }, (_, i) => {
            const done = i < s.answers.length;
            const good = done && (i < s.answers.length - 1 || !s.last ? s.asked[i] && answerRight(s.answers[i], s.asked[i]) : s.last.correct);
            return <li key={i} className="lamp" data-state={done ? (good ? "right" : "wrong") : i === s.answers.length && !judged && s.phase !== "done" ? "now" : "off"} aria-label={done ? `${i + 1}: ${good ? "right" : "missed"}` : undefined} />;
          })}
        </ol>
        <button type="button" className="btn btn-quiet" onClick={() => send({ type: "pause", now: performance.now() })} aria-label="Pause">
          II
        </button>
      </header>

      <section className="machine mt-3 flex-1" data-state={state} data-mode={mode} aria-live="polite">
        {s.phase === "done" ? (
          <p className="font-display glow m-auto text-center text-2xl text-yellow">Done!</p>
        ) : !q || s.phase === "paused" || s.phase === "start" ? (
          <p className="font-display m-auto text-center text-base text-dim">{s.phase === "paused" ? "Paused" : " "}</p>
        ) : (
          <div className="rt-board" data-mode={q.mode} data-n={q.choices.length}>
            {q.mode === "find" && (
              <div className="rt-call-side">
                <button type="button" className="rt-call" data-lit={lit === q.call} aria-label={judged ? `Hear ${q.call}` : "Hear the word"} onClick={() => hear(q.call!)}>
                  <Picture id={wordOf(q.call!).picture} size={176} className="rt-pic" />
                  <span className="rt-written">{judged ? <Written word={wordOf(q.call!)} lit /> : <Sprite id="speaker" size={32} />}</span>
                </button>
              </div>
            )}

            <div className="rt-works">
              <div className="rt-choices" data-n={q.choices.length} role="group" aria-label={q.mode === "find" ? "Which one rhymes?" : "Which one does not rhyme?"}>
                {q.choices.map((id, i) => {
                  const w = wordOf(id);
                  const show = written(id);
                  return (
                    <button
                      key={`${s.asked.length}-${id}`}
                      type="button"
                      className="rt-choice"
                      data-state={tone(id)}
                      data-lit={lit === id}
                      aria-pressed={!judged ? s.chosen === id : undefined}
                      aria-label={judged ? id : `Picture ${i + 1}: hear it and pick it`}
                      onClick={() => choose(id)}
                    >
                      <Picture id={w.picture} size={128} className={`rt-pic ${s.phase === "right" && id === right ? "hop" : ""}`} />
                      <span className="rt-written">{show ? <Written word={w} lit={show.lit} /> : " "}</span>
                    </button>
                  );
                })}
              </div>

              <div className="sm-after">
                {s.phase === "ask" && (
                  <button type="button" className="btn btn-lg sm-go" disabled={!ready(s)} aria-label="Go: this one" onClick={go}>
                    <Sprite id="arrow" size={40} />
                  </button>
                )}
                {s.phase === "right" && s.last && (
                  <p key={s.seq} className="font-display glow m-0 text-xl text-yellow">
                    +{s.last.gained}
                  </p>
                )}
                {s.phase === "wrong" && (
                  <button type="button" className="btn btn-lg sm-next" disabled={!mayGo} aria-label="Next" onClick={next} autoFocus>
                    <Sprite id="arrow" size={40} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {muted ? (
        <SoundOff onQuit={onQuit} onResume={() => send({ type: "resume", now: performance.now() })} />
      ) : (
        s.wantPause && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-tube/90 p-4" role="dialog" aria-modal="true" aria-label="Paused">
            <div className="panel panel-cyan max-w-md text-center">
              <p className="font-display glow m-0 text-base text-cyan">Paused</p>
              <p className="mt-4">Stop now and this round will not count.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-quiet" onClick={onQuit}>
                  Stop the round
                </button>
                <button type="button" className="btn" onClick={() => send({ type: "resume", now: performance.now() })} autoFocus>
                  Keep playing
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </main>
  );
}

/** Whether an answer already given was right, from its question: what the lamp shows. */
function answerRight(a: AnswerInput, q: { mode: Mode; call: string | null; choices: string[] }): boolean {
  return typeof a.given === "string" && a.given.endsWith(`=${rightOf(q)}`);
}
