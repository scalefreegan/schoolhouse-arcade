import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import type { FactStat } from "../../../shared/deal.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import type { Skill } from "../../../shared/wordfamilies/rules.ts";
import { PACE, SAY_DELAY_MS, advance, revealDone, startSession } from "../../../shared/wordfamilies/session.ts";
import { FAMILY_WORDS, ROUND_WORDS, familyById, onsetUrl, rimeUrl, sayUrl, type FamilyLevel, type FamilyWord } from "../../../shared/wordfamilies/words.ts";
import { sfx } from "../../sound.ts";
import { hush, say } from "../../speech.ts";
import { Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { fmtScore } from "../format.ts";
import { SoundOff } from "../NeedsSound.tsx";

// One round: two families, four words of each. What happens is decided by
// the session (shared/wordfamilies/session.ts): this file sends it events
// (a tile tapped), says the word, sounds out each answer (the first sound,
// the ending, the word), times what follows, and draws. It hands back the
// answers; the server judges them again and its numbers are the ones kept.
// There is no clock the player sees.

const seed = () => Math.floor(Math.random() * 2 ** 32);

/** The quiet between the first sound, the ending and the word, as an answer is sounded out (ms). */
const SOUND_GAP_MS = 260;
/** An answer is sounded out this long after it goes up: the right or wrong beep first. */
const REVEAL_DELAY_MS = 380;

/** What is lit as an answer is sounded out: the first tile, the ending, then the whole word. */
type Lit = "onset" | "rime" | "word" | "hear" | null;

export function RoundScreen({ level, skill, stats, onDone, onQuit }: { level: FamilyLevel; skill: Skill; stats: Record<string, FactStat>; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, skill, stats, seed()));
  const { muted } = useArcade();
  // Remembered with the step of the round they belong to (s.seq), so neither outlives its word.
  /** What is being said now, and so lit. */
  const [litAt, setLitAt] = useState<{ seq: number; what: Lit }>({ seq: -1, what: null });
  const lit = litAt.seq === s.seq ? litAt.what : null;
  /** A missed word has been up long enough, and sounded out, to move on from. */
  const [goAt, setGoAt] = useState(-1);
  const mayGo = goAt === s.seq;

  const next = () => send({ type: "next", now: performance.now(), seed: seed() });

  const light = (seq: number, what: Lit) => setLitAt({ seq, what });
  const dark = (seq: number) => setLitAt((at) => (at.seq === seq ? { seq: -1, what: null } : at));

  /** Say the word, the hear button glowing while it is said. */
  const sayWord = (word: FamilyWord) => {
    const seq = s.seq;
    return say([sayUrl(word)], { onEach: () => light(seq, "hear"), onStop: () => dark(seq) });
  };

  /** Sound an answered word out: its first sound, its ending, then the word, each lit as it is said. */
  const soundOut = (word: FamilyWord) => {
    const seq = s.seq;
    const family = familyById(word.family)!;
    return say([onsetUrl(word.onset), rimeUrl(family), sayUrl(word)], { gap: SOUND_GAP_MS, onEach: (i) => light(seq, i === 0 ? "onset" : i === 1 ? "rime" : "word"), onStop: () => dark(seq) });
  };

  // The pause box (and the sound-off box, which pauses) stops the voice at
  // once, whatever is up: an answer on show keeps its phase, so nothing else
  // would hush it. `boxUp` is for what a reveal does later: it says nothing
  // new while the box is open.
  const boxUp = useRef(false);
  useEffect(() => {
    boxUp.current = s.wantPause;
    if (s.wantPause) hush();
  }, [s.wantPause]);

  // What follows each change of phase: a sound now, the next thing later.
  const follow = useEffectEvent(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const word = s.word;
    switch (s.phase) {
      case "start":
        later(next, 250);
        break;
      case "ask":
        // A new word (or the same one after a pause): whatever was being said
        // stops, then the word is said, once the screen has settled.
        hush();
        if (word) later(() => void sayWord(word), SAY_DELAY_MS);
        break;
      case "right":
      case "wrong": {
        const right = s.phase === "right";
        if (right) sfx.right(Math.min(4, s.round.streak - 1));
        else sfx.wrong();
        // The word is built in its boxes and sounded out: the first sound,
        // the ending, the word. A right answer then moves on by itself; a
        // wrong one lights the arrow. Neither waits past REVEAL_WAIT_MS for
        // a clip that will not come, nor moves sooner than the session lets.
        const seq = s.seq;
        const shownAt = s.shownAt;
        let said = !word;
        const done = () => (said = true);
        later(() => {
          if (!word || boxUp.current) done();
          else void soundOut(word).then(done, done);
        }, REVEAL_DELAY_MS);
        later(
          () =>
            timers.push(
              window.setInterval(() => {
                if (!revealDone({ said, shownAt, now: performance.now() })) return;
                if (right) next();
                else setGoAt(seq);
              }, 100),
            ),
          PACE[s.phase] + 30,
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
  // The sound switched off in the middle of a round: the round waits (the
  // word is asked by voice alone) and the screen says so.
  useEffect(() => {
    if (muted) send({ type: "pause", now: performance.now() });
  }, [muted]);
  // Leaving the cabinet stops it talking.
  useEffect(() => hush, []);

  const judged = s.phase === "right" || s.phase === "wrong";
  const word = s.word;
  const pick = (tile: string) => {
    if (s.phase !== "ask") return;
    hush();
    send({ type: "pick", tile, now: performance.now() });
  };

  /** The player is moving by keyboard: a Tab since the last tap or click. */
  const byKeys = useRef(false);
  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    // A held key repeating is not a new press, nor a press of whatever has
    // focus: Enter held would press a button last tapped or clicked again on
    // every repeat. Only a button reached by Tab keeps its own repeats.
    if (ev.repeat) {
      if (ev.key === "Enter" && !(byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled)) ev.preventDefault();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // While the sound-off box is up the round is not there to play: its keys are the box's own.
    if (muted) return;
    if (ev.key === "Tab") byKeys.current = true;
    // Moving by keyboard, Enter on a button is that button's own press.
    // Otherwise Enter is the next word after a miss, and 1 to 6 pick a tile.
    if (ev.key === "Enter" && byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled) return;
    const n = Number(ev.key);
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (ev.key === "Enter" && s.phase === "wrong" && mayGo && !s.wantPause) next();
    else if (s.phase === "ask" && Number.isInteger(n) && n >= 1 && n <= s.tray.length) pick(s.tray[n - 1]);
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

  const state = s.phase === "right" ? "right" : s.phase === "wrong" ? "wrong" : "ask";
  /** How a tile looks once the word is answered: the right one, the one tried, or out of it. */
  const tone = (tile: string): string => (!judged ? "" : tile === word?.onset ? "right" : tile === s.last?.pick ? "wrong" : "out");
  const rightAt = (i: number) => typeof s.answers[i]?.given === "string" && s.answers[i].given === `${String(s.answers[i].given).split("=")[0]}=${s.words[i].onset}`;

  // The house: the words of this family answered so far, in the order they came.
  const at = judged ? s.answers.length - 1 : s.answers.length;
  const first = Math.floor(Math.min(at, ROUND_WORDS - 1) / FAMILY_WORDS) * FAMILY_WORDS;
  const family = word ? familyById(word.family)! : null;

  return (
    <main className="screen sm-round">
      <header className="flex items-center justify-between gap-3">
        <p className="readout m-0 text-left">
          Score
          <b className="glow text-magenta">{fmtScore(s.round.score)}</b>
        </p>
        <ol className="m-0 flex list-none gap-1 p-0 sm:gap-2" aria-label={`Word ${Math.min(s.answers.length + (judged ? 0 : 1), ROUND_WORDS)} of ${ROUND_WORDS}`}>
          {Array.from({ length: ROUND_WORDS }, (_, i) => {
            const done = i < s.answers.length;
            const good = done && rightAt(i);
            return <li key={i} className="lamp" data-state={done ? (good ? "right" : "wrong") : i === s.answers.length && !judged && s.phase !== "done" ? "now" : "off"} aria-label={done ? `${i + 1}: ${good ? "right" : "missed"}` : undefined} />;
          })}
        </ol>
        <button type="button" className="btn btn-quiet" onClick={() => send({ type: "pause", now: performance.now() })} aria-label="Pause">
          II
        </button>
      </header>

      <section className="machine mt-3 flex-1" data-state={state} aria-live="polite">
        {s.phase === "done" ? (
          <p className="font-display glow m-auto text-center text-2xl text-yellow">Done!</p>
        ) : !word || !family || s.phase === "paused" || s.phase === "start" ? (
          <p className="font-display m-auto text-center text-base text-dim">{s.phase === "paused" ? "Paused" : " "}</p>
        ) : (
          <div className="wf-board" data-word={word.id}>
            <div className="wf-house" aria-label={`The ${family.id} family`}>
              <Sprite id="house" size={48} />
              <ol className="wf-rooms">
                {Array.from({ length: FAMILY_WORDS }, (_, i) => {
                  const w = first + i < s.answers.length ? s.words[first + i] : null;
                  return (
                    <li key={`${family.id}-${i}`} data-state={w ? (rightAt(first + i) ? "built" : "shown") : "empty"} aria-label={w ? w.id : undefined}>
                      {w && (
                        <span className="sm-letter">
                          {w.onset}
                          <span className="text-cyan">{family.id}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="wf-row">
              <button type="button" className="btn btn-cyan sw-hear" data-lit={lit === "hear"} aria-label="Hear the word" onClick={() => void sayWord(word)}>
                <Sprite id="speaker" palette="ink" size={48} />
              </button>
              <div className="wf-word" aria-label={judged ? word.id : `Something, then ${family.id}`}>
                <span className="sm-box" data-state={judged ? "right" : "empty"} data-lit={lit === "onset" || lit === "word"}>
                  {judged ? word.onset : ""}
                </span>
                <span className="wf-rime sm-letter" data-lit={lit === "rime" || lit === "word"}>
                  {family.id}
                </span>
              </div>
            </div>

            <div className="sm-tray wf-tray" role="group" aria-label="Which sound does the word start with?">
              {s.tray.map((tile) => (
                <button key={`${s.answers.length}-${tile}`} type="button" className="sm-tile" data-state={tone(tile)} aria-label={`The tile ${tile}`} onClick={() => pick(tile)}>
                  {tile}
                </button>
              ))}
            </div>

            <div className="sm-after">
              {s.phase === "right" && s.last && (
                <p key={s.seq} className="font-display glow m-0 text-xl text-yellow">
                  +{s.last.gained}
                </p>
              )}
              {s.phase === "wrong" && (
                <button type="button" className="btn btn-lg sm-next" disabled={!mayGo} aria-label="Next word" onClick={next} autoFocus>
                  <Sprite id="arrow" size={40} />
                </button>
              )}
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
