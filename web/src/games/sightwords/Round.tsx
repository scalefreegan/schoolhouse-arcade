import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { lookOf } from "../../../shared/avatars.ts";
import type { FactStat } from "../../../shared/deal.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import { TOP_SPEED, speedOf, trickOf, type Skill } from "../../../shared/sightwords/rules.ts";
import { PACE, SAY_DELAY_MS, advance, revealDone, startSession } from "../../../shared/sightwords/session.ts";
import { ROUND_WORDS, sayUrl, type SightLevel, type SightWord } from "../../../shared/sightwords/words.ts";
import type { Player } from "../../../shared/wire.ts";
import { sfx } from "../../sound.ts";
import { hush, say, speaking } from "../../speech.ts";
import { AvatarSprite, Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { fmtScore } from "../format.ts";
import { SoundOff } from "../NeedsSound.tsx";

// One run down the trail, from the first word to the eighth. What happens
// is decided by the session (shared/sightwords/session.ts): this file sends
// it events (a word tapped), says the word, times what follows each answer,
// and draws. It hands back the answers; the server judges them again and
// its numbers are the ones kept. There is no clock the player sees: the
// runner goes faster as right answers come in a row, and jumps or does a
// trick as each one lands, and that is all the speed there is.

const seed = () => Math.floor(Math.random() * 2 ** 32);

/** How fast the trail goes by at each speed (0, a jog, to TOP_SPEED), as a share of its drawn pace. */
const RATES = [1, 1.5, 2, 2.6, 3.2];
/** Trees in one screen's width of each row. Each row is drawn twice over, to slide by without a seam. */
const FAR_PINES = 6;
const NEAR_PINES = 3;
const DASHES = 12;
/** The characters drawn looking left: on the trail they are turned to face the way they run. */
const LOOKS_LEFT = ["dragon"];

export function RoundScreen({ level, skill, stats, player, onDone, onQuit }: { level: SightLevel; skill: Skill; stats: Record<string, FactStat>; player: Player; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, skill, stats, seed()));
  const { muted } = useArcade();
  // Remembered with the step of the round they belong to (s.seq), so neither outlives its word.
  /** The word is being said now: the hear button glows. */
  const [litAt, setLitAt] = useState(-1);
  const lit = litAt === s.seq;
  /** A missed word has been up long enough, and said, to move on from. */
  const [goAt, setGoAt] = useState(-1);
  const mayGo = goAt === s.seq;

  const next = () => send({ type: "next", now: performance.now(), seed: seed() });

  /** Say the word, the hear button glowing while it is said. */
  const sayWord = (word: SightWord) => {
    const seq = s.seq;
    return say([sayUrl(word)], { onEach: () => setLitAt(seq), onStop: () => setLitAt((at) => (at === seq ? -1 : at)) });
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
        // No word is said again: this is a sprint. The next one comes when
        // the session will take it, and when nothing is being said (the hear
        // button pressed in this moment is heard out; speaking() has the
        // limit, so a clip that never ends is not waited on).
        sfx.right(Math.min(4, s.round.streak - 1));
        later(
          () =>
            timers.push(
              window.setInterval(() => {
                if (!speaking()) next();
              }, 100),
            ),
          PACE.right,
        );
        break;
      case "wrong": {
        sfx.wrong();
        // The right word is lit, and said. The arrow lights when it has been
        // said and the session will take the next; but never later than
        // REVEAL_WAIT_MS (a clip that will not come must not hold the round).
        const seq = s.seq;
        const shownAt = s.shownAt;
        let said = !word;
        const done = () => (said = true);
        later(() => {
          if (!word || boxUp.current) done();
          else void sayWord(word).then(done, done);
        }, 380);
        later(
          () =>
            timers.push(
              window.setInterval(() => {
                if (revealDone({ said, shownAt, now: performance.now() })) setGoAt(seq);
              }, 100),
            ),
          PACE.wrong + 30,
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
  // Leaving the trail stops it talking.
  useEffect(() => hush, []);

  const judged = s.phase === "right" || s.phase === "wrong";
  const word = s.word;
  const pick = (id: string) => {
    if (s.phase !== "ask") return;
    hush();
    send({ type: "pick", word: id, now: performance.now() });
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
    // Otherwise Enter is the next word after a miss, and 1 to 4 pick a word.
    if (ev.key === "Enter" && byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled) return;
    const n = Number(ev.key);
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (ev.key === "Enter" && s.phase === "wrong" && mayGo && !s.wantPause) next();
    else if (s.phase === "ask" && Number.isInteger(n) && n >= 1 && n <= s.choices.length) pick(s.choices[n - 1]);
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

  // ---------- the trail ----------

  // The runner's speed is the run of right answers, nothing else. The trail
  // stands still while nothing is being asked (before the first word, behind
  // the pause box, at the end). The drawings slide at one drawn pace; a
  // faster run plays them faster, which changes speed without a jump.
  const speed = speedOf(s.round.streak);
  const running = (s.phase === "ask" || judged) && !s.wantPause;
  const rate = running ? RATES[speed] : 0;
  const trail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of trail.current?.querySelectorAll("[data-moves]") ?? []) for (const a of el.getAnimations?.() ?? []) if (a.playbackRate !== rate) a.playbackRate = rate;
  }); // after every draw: an animation made anew (reduced motion switched off) takes the speed at the next one

  // ---------- drawing ----------

  const state = s.phase === "right" ? "right" : s.phase === "wrong" ? "wrong" : "ask";
  /** How a word looks once it is answered: the right one, the one tried, or out of it. */
  const tone = (id: string): string => (!judged ? "" : id === word?.id ? "right" : id === s.last?.pick ? "wrong" : "out");

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
            const good = done && typeof s.answers[i].given === "string" && s.answers[i].given.endsWith(`=${s.answers[i].fact}`);
            return <li key={i} className="lamp" data-state={done ? (good ? "right" : "wrong") : i === s.answers.length && !judged && s.phase !== "done" ? "now" : "off"} aria-label={done ? `${i + 1}: ${good ? "right" : "missed"}` : undefined} />;
          })}
        </ol>
        <button type="button" className="btn btn-quiet" onClick={() => send({ type: "pause", now: performance.now() })} aria-label="Pause">
          II
        </button>
      </header>

      <section className="machine mt-3 flex-1" data-state={state} aria-live="polite">
        <div className="sw-trail" ref={trail} data-speed={speed} role="img" aria-label={`Running speed ${speed + 1} of ${TOP_SPEED + 1}`}>
          <div className="sw-strip sw-far" data-moves>
            {Array.from({ length: FAR_PINES * 2 }, (_, i) => (
              <span key={i}>
                <Sprite id="pine" palette="far" size={40} />
              </span>
            ))}
          </div>
          <div className="sw-strip sw-near" data-moves>
            {Array.from({ length: NEAR_PINES * 2 }, (_, i) => (
              <span key={i}>
                <Sprite id="pine" size={64} />
              </span>
            ))}
          </div>
          <div className="sw-strip sw-ground" data-moves>
            {Array.from({ length: DASHES * 2 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <span className="sw-runner" data-moves data-turn={LOOKS_LEFT.includes(lookOf(player.avatar, player.colour).character.sprite)}>
            {/* A right answer is a trick, bigger as the run grows: made anew for each (the key), so it plays once from its start. */}
            <span key={s.phase === "right" ? s.seq : "run"} className="sw-trick" data-trick={(s.phase === "right" && trickOf(s.round.streak)) || undefined}>
              <span className="sw-face">
                <AvatarSprite avatar={player.avatar} colour={player.colour} size={64} />
              </span>
            </span>
          </span>
          <ol className="sw-pace" aria-hidden>
            {Array.from({ length: TOP_SPEED + 1 }, (_, i) => (
              <li key={i} data-on={i <= speed} />
            ))}
          </ol>
        </div>

        {s.phase === "done" ? (
          <p className="font-display glow m-auto text-center text-2xl text-yellow">Done!</p>
        ) : !word || s.phase === "paused" || s.phase === "start" ? (
          <p className="font-display m-auto text-center text-base text-dim">{s.phase === "paused" ? "Paused" : " "}</p>
        ) : (
          <div className="sw-board" data-word={word.id}>
            <button type="button" className="btn btn-cyan sw-hear" data-lit={lit} aria-label="Hear the word" onClick={() => void sayWord(word)}>
              <Sprite id="speaker" palette="ink" size={48} />
            </button>

            <div className="sw-choices" role="group" aria-label="Which word did you hear?">
              {s.choices.map((id) => (
                <button key={`${s.answers.length}-${id}`} type="button" className="sw-choice" data-state={tone(id)} onClick={() => pick(id)}>
                  <span className="sm-letter">{id}</span>
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
