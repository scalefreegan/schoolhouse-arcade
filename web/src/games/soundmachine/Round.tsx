import { useEffect, useEffectEvent, useReducer, useState } from "react";
import type { FactStat } from "../../../shared/deal.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import type { Mode, Skill } from "../../../shared/soundmachine/rules.ts";
import { PACE, advance, built, full, startSession } from "../../../shared/soundmachine/session.ts";
import { ROUND_WORDS, clipUrl, tileClip, wordById, wordClip, type SoundLevel, type Word } from "../../../shared/soundmachine/words.ts";
import { sfx } from "../../sound.ts";
import { hush, say } from "../../speech.ts";
import { Picture, Sprite } from "../../sprites/Sprite.tsx";
import { fmtScore } from "../format.ts";

// One round on the machine, from the first word to the eighth. What happens
// is decided by the session (shared/soundmachine/session.ts): this file
// sends it events (a tile, the lever, a picture), says the sounds, times
// what follows each answer, and draws. It hands back the answers; the
// server judges them again and its numbers are the ones kept. Nothing here
// is on a clock the player can see.

const seed = () => Math.floor(Math.random() * 2 ** 32);
const soundsOf = (word: Word) => word.tiles.map((t) => clipUrl(tileClip(t)));
const wholeOf = (word: Word) => clipUrl(wordClip(word.id));
/** Between sounds when a word is sounded out slowly, and when it is run together (seconds). */
const SLOW = 0.32;
const QUICK = 0.04;

export function RoundScreen({ level, mode, skill, stats, onDone, onQuit }: { level: SoundLevel; mode: Mode; skill: Skill; stats: Record<string, FactStat>; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, mode, skill, stats, seed()));
  // Both are remembered with the step of the round they belong to (s.seq),
  // so neither outlives its word and nothing has to reset them.
  /** The sound being said now: which of the word's tiles is lit. */
  const [litAt, setLitAt] = useState<{ seq: number; tile: number | null }>({ seq: -1, tile: null });
  const lit = litAt.seq === s.seq ? litAt.tile : null;
  const setLit = (tile: number | null) => setLitAt({ seq: s.seq, tile });
  /** A missed word has been up long enough to move on from. */
  const [goAt, setGoAt] = useState(-1);
  const mayGo = goAt === s.seq;

  const next = () => send({ type: "next", now: performance.now(), seed: seed() });

  /** Say the word's sounds in order, lighting each, then (if asked) the whole word. */
  const soundOut = (word: Word, gap: number, whole: boolean) => say([...soundsOf(word), ...(whole ? [wholeOf(word)] : [])], { gap, onEach: (i) => setLit(i < word.tiles.length ? i : null) }).then(() => setLit(null));

  // What follows each change of phase: a sound now, the next thing later.
  const follow = useEffectEvent(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    switch (s.phase) {
      case "start":
        later(next, 250);
        break;
      case "ask":
        // Build begins by saying the word. Read never says it: reading it is the game.
        if (mode === "build" && s.word) void say([wholeOf(s.word)]);
        break;
      case "right":
        sfx.right(Math.min(4, s.round.streak - 1));
        later(() => s.word && void say([wholeOf(s.word)]), 220);
        // The session lets the next word come once this one has had its time; ask until it does.
        later(() => timers.push(window.setInterval(next, 100)), PACE.right);
        break;
      case "wrong":
        sfx.wrong();
        // The right answer, sound by sound, then whole.
        later(() => s.word && void soundOut(s.word, SLOW, true), 380);
        later(() => setGoAt(s.seq), PACE.wrong + 30);
        break;
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
  // Leaving the machine stops it talking.
  useEffect(() => hush, []);

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (ev.key === "Enter" && s.phase === "wrong" && mayGo && !s.wantPause) next();
    else if (ev.key === "Enter" && s.phase === "ask" && mode === "build") send({ type: "go", now: performance.now() });
    else return;
    ev.preventDefault();
  });
  useEffect(() => {
    const key = (ev: KeyboardEvent) => onKey(ev);
    const hide = () => {
      if (document.hidden) send({ type: "pause", now: performance.now() });
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  // ---------- drawing ----------

  const word = s.word;
  const judged = s.phase === "right" || s.phase === "wrong";
  const asking = s.phase === "ask";
  const state = s.phase === "right" ? "right" : s.phase === "wrong" ? "wrong" : "ask";
  const tileSound = (tile: string) => void say([clipUrl(tileClip(tile))]);

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
            const was = done ? s.answers[i].fact : null;
            const good = done && (i < s.answers.length - 1 || !s.last ? lampOf(s.words[i], s.answers[i], mode) : s.last.correct);
            return <li key={i} className="lamp" data-state={done ? (good ? "right" : "wrong") : i === s.answers.length && s.phase !== "done" ? "now" : "off"} aria-label={was ? `${was}: ${good ? "right" : "missed"}` : undefined} />;
          })}
        </ol>
        <button type="button" className="btn btn-quiet" onClick={() => send({ type: "pause", now: performance.now() })} aria-label="Pause">
          II
        </button>
      </header>

      <section className="machine mt-3 flex-1" data-state={state} data-mode={mode} aria-live="polite">
        {s.phase === "done" ? (
          <p className="font-display glow m-auto text-center text-2xl text-yellow">Done!</p>
        ) : !word || s.phase === "paused" || s.phase === "start" ? (
          <p className="font-display m-auto text-center text-base text-dim">{s.phase === "paused" ? "Paused" : " "}</p>
        ) : mode === "build" ? (
          <div className="sm-build" data-word={word.id}>
            <div className="sm-side">
              <div className="sm-glass" data-state={state}>
                <Picture id={word.picture} size={176} className={`sm-pic ${s.phase === "right" ? "hop" : ""}`} title={judged ? word.id : "What is it?"} />
              </div>
              <button type="button" className="btn btn-cyan sm-hear" aria-label="Hear the word" onClick={() => void say([wholeOf(word)])}>
                <Sprite id="speaker" palette="ink" size={40} />
              </button>
            </div>

            <div className="sm-works">
              {/* What was built, when it was wrong: shown, crossed out, above the right one. */}
              <p className="sm-tried m-0" aria-hidden={s.phase !== "wrong"}>
                {s.phase === "wrong" && s.last ? <s className="text-bad">{s.last.given.split("-").join(" ")}</s> : " "}
              </p>
              <div className="sm-boxes" role="group" aria-label="Boxes">
                {word.tiles.map((right, i) => {
                  const tile = judged ? right : built(s)[i];
                  return (
                    <button
                      key={i}
                      type="button"
                      className="sm-box"
                      data-state={judged ? "right" : tile ? "full" : "empty"}
                      data-lit={lit === i}
                      aria-label={tile ? `Box ${i + 1}: ${tile}${judged ? "" : ". Take it out"}` : `Box ${i + 1}: empty`}
                      disabled={!tile}
                      onClick={() => {
                        tileSound(tile);
                        if (asking) send({ type: "take", box: i });
                      }}
                    >
                      {tile || " "}
                    </button>
                  );
                })}
              </div>
              <div className="sm-belt" data-run={judged} />

              {judged ? (
                <div className="sm-after">
                  {s.phase === "right" && s.last && (
                    <p key={s.seq} className="font-display glow m-0 text-xl text-yellow">
                      +{s.last.gained}
                    </p>
                  )}
                  {s.phase === "wrong" && <NextButton ready={mayGo} onNext={next} />}
                </div>
              ) : (
                <>
                  <div className="sm-tray" role="group" aria-label="Sound tiles">
                    {s.tray.map((tile, i) => {
                      const used = s.boxes.includes(i);
                      return (
                        <button
                          key={`${s.answers.length}-${i}`}
                          type="button"
                          className="sm-tile"
                          disabled={used}
                          aria-label={used ? `${tile}, in a box` : tile}
                          onClick={() => {
                            tileSound(tile);
                            send({ type: "place", tile: i });
                          }}
                        >
                          {tile}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" className="btn btn-lg sm-go" disabled={!full(s)} aria-label="Go: make the word" onClick={() => send({ type: "go", now: performance.now() })}>
                    <Sprite id="arrow" size={40} />
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="sm-read" data-word={word.id}>
            <div className="sm-word" role="group" aria-label="The word, one sound at a time">
              {word.tiles.map((tile, i) => (
                <button key={i} type="button" className="sm-sound" data-lit={lit === i} data-state={state} aria-label={`Hear the sound ${tile}`} onClick={() => void say([clipUrl(tileClip(tile))], { onEach: () => setLit(i) }).then(() => setLit(null))}>
                  <span className="sm-letter">{tile}</span>
                  <Sprite id="speaker" size={24} />
                </button>
              ))}
              <button
                type="button"
                className="btn btn-cyan sm-blend"
                aria-label={judged ? "Hear the word" : "Blend the sounds"}
                onClick={() => {
                  // Before an answer: the sounds, slowly then run together, never the word itself.
                  if (judged) void soundOut(word, SLOW, true);
                  else void say([...soundsOf(word), ...soundsOf(word)], { gap: QUICK, onEach: (i) => setLit(i % word.tiles.length) }).then(() => setLit(null));
                }}
              >
                <Sprite id="blend" size={40} />
              </button>
            </div>

            <div className="sm-pictures" data-n={s.pictures.length} role="group" aria-label="Which picture is it?">
              {s.pictures.map((id) => {
                const tone = !judged ? "" : id === word.id ? "right" : id === s.last?.given ? "wrong" : "out";
                return (
                  <button key={`${s.answers.length}-${id}`} type="button" className="sm-choice" data-state={tone} data-pic={id} aria-label={judged ? id : "This one"} onClick={() => send({ type: "pick", word: id, now: performance.now() })}>
                    <Picture id={wordById(id)?.picture ?? ""} size={128} className="sm-pic" />
                  </button>
                );
              })}
            </div>

            <div className="sm-after">
              {s.phase === "right" && s.last && (
                <p key={s.seq} className="font-display glow m-0 text-xl text-yellow">
                  +{s.last.gained}
                </p>
              )}
              {s.phase === "wrong" && <NextButton ready={mayGo} onNext={next} />}
            </div>
          </div>
        )}
      </section>

      {s.wantPause && (
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
      )}
    </main>
  );
}

/** Whether a word already answered was right, for its lamp. */
function lampOf(word: Word, answer: AnswerInput, mode: Mode): boolean {
  return answer.given === (mode === "build" ? word.tiles.join("-") : word.id);
}

/** After a miss: on to the next word, when the player is ready. */
function NextButton({ ready, onNext }: { ready: boolean; onNext: () => void }) {
  return (
    <button type="button" className="btn btn-lg sm-next" disabled={!ready} aria-label="Next word" onClick={onNext} autoFocus>
      <Sprite id="arrow" size={40} />
    </button>
  );
}
