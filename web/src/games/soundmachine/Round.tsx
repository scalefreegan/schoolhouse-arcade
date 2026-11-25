import { Fragment, useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import type { FactStat } from "../../../shared/deal.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import { answerOf, gemsOf, type Mode, type Skill } from "../../../shared/soundmachine/rules.ts";
import { PACE, advance, built, cutEnough, full, gemsMayFly, startSession } from "../../../shared/soundmachine/session.ts";
import { ROUND_WORDS, clipUrl, slowClip, tileClip, wordById, wordClip, type SoundLevel, type Word } from "../../../shared/soundmachine/words.ts";
import { sfx } from "../../sound.ts";
import { hush, say, speaking } from "../../speech.ts";
import { Picture, Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { fmtScore } from "../format.ts";
import { GemTray, Jewel } from "./Gems.tsx";

// One round on the machine, from the first word to the eighth. What happens
// is decided by the session (shared/soundmachine/session.ts): this file
// sends it events (a tile, the lever, a picture, a cut), says the sounds, times
// what follows each answer, and draws. It hands back the answers; the
// server judges them again and its numbers are the ones kept. Nothing here
// is on a clock the player can see.

const seed = () => Math.floor(Math.random() * 2 ** 32);
const soundsOf = (word: Word) => word.tiles.map((t) => clipUrl(tileClip(t)));
const wholeOf = (word: Word) => clipUrl(wordClip(word.id));
const slowOf = (word: Word) => clipUrl(slowClip(word.id));
/** Between sounds when a word is sounded out, unhurried, and when it is run together (seconds). */
const SLOW = 0.36;
const QUICK = 0.02;
/** Blend: the breath between sounding it out and running it together. */
const BREATH = 0.5;
/** Split: how long a right word's gems take to fly to the tray once it has been said (ms). */
const FLY_MS = 500;

export function RoundScreen({ level, mode, skill, stats, onDone, onQuit }: { level: SoundLevel; mode: Mode; skill: Skill; stats: Record<string, FactStat>; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, mode, skill, stats, seed()));
  const { muted, setMuted } = useArcade();
  // Both are remembered with the step of the round they belong to (s.seq),
  // so neither outlives its word and nothing has to reset them.
  /** The sound being said now: which of the word's tiles is lit. */
  const [litAt, setLitAt] = useState<{ seq: number; tile: number | null }>({ seq: -1, tile: null });
  const lit = litAt.seq === s.seq ? litAt.tile : null;
  const setLit = (tile: number | null) => setLitAt({ seq: s.seq, tile });
  /** A missed word has been up long enough to move on from. */
  const [goAt, setGoAt] = useState(-1);
  const mayGo = goAt === s.seq;
  /** Split, a right word: how many of its pieces have a gem on them, and whether they have flown to the tray. */
  const [gemAt, setGemAt] = useState<{ seq: number; dropped: number; flown: boolean }>({ seq: -1, dropped: 0, flown: false });
  const dropped = gemAt.seq === s.seq ? gemAt.dropped : 0;
  const flown = gemAt.seq === s.seq && gemAt.flown;

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
        // A new word (or the same one after a pause): whatever was being said
        // of the last one stops, in every game. Its sounds heard over this
        // word's pictures, tiles or letters would be a wrong answer said aloud.
        hush();
        // Build begins by saying the word, and so does Split (where the
        // question is where its sounds part, not what it is: its picture is
        // up anyway). Read never says it: reading it is the game.
        if (mode !== "read" && s.word) void say([wholeOf(s.word)]);
        break;
      case "right": {
        sfx.right(Math.min(4, s.round.streak - 1));
        if (mode === "gems") {
          // A gem drops on each piece as its sound is said, then the word is
          // said whole, then the gems fly to the tray with their ping. They
          // fly once the reveal has begun and nothing at all is being said:
          // not when the reveal's own say() settles, which, if a hear button
          // cut it short, is long after (silence) or in the middle of what
          // the button said (pings over the slow word). But never later than
          // GEM_WAIT_MS after that settles: a stopped audio context never
          // ends a clip, and the round must not wait on it for good. The next
          // word comes once they have landed and the session will take it.
          const word = s.word;
          const seq = s.seq;
          const n = word?.tiles.length ?? 0;
          let begun = !word;
          let settledAt: number | null = word ? null : performance.now();
          let landed = 0;
          later(() => {
            if (!word) return;
            // Settled with no clip said (the sound off, or none would come): begun all the same.
            const settle = () => {
              begun = true;
              settledAt = performance.now();
            };
            void say([...soundsOf(word), wholeOf(word)], {
              gap: SLOW,
              onEach: (i) => {
                begun = true;
                setLitAt({ seq, tile: i < n ? i : null });
                if (i < n) setGemAt({ seq, dropped: i + 1, flown: false });
              },
            }).then(settle, settle);
          }, 320);
          later(
            () =>
              timers.push(
                window.setInterval(() => {
                  // Speech heard is the reveal begun, even if a hear button cut it
                  // short before its first clip's onEach came.
                  const talking = speaking();
                  if (talking) begun = true;
                  if (!landed && gemsMayFly({ begun, speaking: talking, settledAt, now: performance.now() })) {
                    // A clip that would not come is left out: its gem lands all the same.
                    setLitAt({ seq, tile: null });
                    setGemAt({ seq, dropped: n, flown: true });
                    sfx.gems(n);
                    landed = performance.now() + FLY_MS;
                  } else if (landed && performance.now() >= landed) next();
                }, 100),
              ),
            320,
          );
          break;
        }
        // The word again, sound by sound and then whole, at its own pace.
        const word = s.word;
        let said = !word;
        later(() => word && void soundOut(word, SLOW, true).then(() => (said = true)), 320);
        // The session lets the next word come once this one has had its time,
        // and the machine waits until it has finished saying it; ask until both.
        later(() => timers.push(window.setInterval(() => said && next(), 100)), PACE.right);
        break;
      }
      case "wrong": {
        sfx.wrong();
        // The right answer, sound by sound, then whole. Next comes on when it
        // has been said (and not before the session would take it).
        const word = s.word;
        const seq = s.seq;
        let said = !word;
        later(() => word && void soundOut(word, SLOW, true).then(() => (said = true)), 380);
        later(
          () =>
            timers.push(
              window.setInterval(() => {
                if (said) setGoAt(seq);
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
  // The sound switched off in the middle of a round: the round waits (this
  // game cannot be played in silence) and the screen says so.
  useEffect(() => {
    if (muted) send({ type: "pause", now: performance.now() });
  }, [muted]);
  // Leaving the machine stops it talking.
  useEffect(() => hush, []);

  /** The player is moving by keyboard: a Tab since the last tap or click. */
  const byKeys = useRef(false);
  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Tab") byKeys.current = true;
    // Moving by keyboard (focus came by Tab), Enter on a button is that
    // button's own press: a gap cuts, the pause button pauses, a tile goes in
    // a box. Otherwise Enter is the lever (or the next word), whatever was
    // last tapped or clicked; the handled key's preventDefault stops the
    // focused button from being pressed as well.
    if (ev.key === "Enter" && byKeys.current && ev.target instanceof HTMLButtonElement && !ev.target.disabled) return;
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (ev.key === "Enter" && s.phase === "wrong" && mayGo && !s.wantPause) next();
    else if (ev.key === "Enter" && s.phase === "ask" && mode !== "read") send({ type: "go", now: performance.now() });
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
            const good = done && (i < s.answers.length - 1 || !s.last ? s.answers[i].given === answerOf(mode, s.words[i]) : s.last.correct);
            return <li key={i} className="lamp" data-state={done ? (good ? "right" : "wrong") : i === s.answers.length && !judged && s.phase !== "done" ? "now" : "off"} aria-label={was ? `${was}: ${good ? "right" : "missed"}` : undefined} />;
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
        ) : mode === "gems" ? (
          <div className="sm-build sm-split" data-word={word.id}>
            <div className="sm-side">
              <div className="sm-glass" data-state={state}>
                <Picture id={word.picture} size={176} className={`sm-pic ${s.phase === "right" ? "hop" : ""}`} title={judged ? word.id : "What is it?"} />
              </div>
              <HearButtons word={word} />
            </div>

            <div className="sm-works">
              {/* The pieces it was cut into, when they were wrong: crossed out, above the right ones. */}
              <p className="sm-tried m-0" aria-hidden={s.phase !== "wrong"}>
                {s.phase === "wrong" && s.last ? <s className="text-bad">{s.last.given.split("|").join(" ")}</s> : " "}
              </p>
              {judged ? (
                // The right pieces: green when they were the player's, cyan
                // (the game showing) when not. A gem on each, if it was right.
                <div className="gm-word" data-judged="true" role="group" aria-label={`${word.id}: ${word.tiles.join(", ")}`}>
                  {word.tiles.map((tile, i) => (
                    <div key={i} className="gm-piece-col">
                      <span className="gm-gem-spot" aria-hidden>
                        {s.phase === "right" && i < dropped && <Jewel i={i} size={48} className={flown ? "gm-fly" : "gm-drop"} />}
                      </span>
                      <button type="button" className="gm-piece" data-state={s.phase === "right" ? "right" : "show"} data-lit={lit === i} aria-label={`Hear ${tile}`} onClick={() => tileSound(tile)}>
                        {tile}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <SplitWord
                  letters={word.id}
                  cuts={s.cuts}
                  onCut={(at) => {
                    sfx.tap();
                    send({ type: "cut", at });
                  }}
                />
              )}
              {skill === "easy" && !judged && (
                <div className="gm-slots" role="img" aria-label={`${word.tiles.length} sounds`}>
                  {word.tiles.map((_, i) => (
                    <span key={i} className="gm-slot" />
                  ))}
                </div>
              )}
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
                <button type="button" className="btn btn-lg sm-go" disabled={!cutEnough(s)} aria-label="Go: these are the sounds" onClick={() => send({ type: "go", now: performance.now() })}>
                  <Sprite id="arrow" size={40} />
                </button>
              )}
              <GemTray gems={gemsOf(mode, s.phase === "right" && !flown ? s.answers.slice(0, -1) : s.answers)} />
            </div>
          </div>
        ) : mode === "build" ? (
          <div className="sm-build" data-word={word.id}>
            <div className="sm-side">
              <div className="sm-glass" data-state={state}>
                <Picture id={word.picture} size={176} className={`sm-pic ${s.phase === "right" ? "hop" : ""}`} title={judged ? word.id : "What is it?"} />
              </div>
              <HearButtons word={word} />
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
                  // Before an answer: the sounds one at a time, a breath, then the
                  // same sounds run together. Never the word itself, plain or
                  // slow: that is the answer.
                  const n = word.tiles.length;
                  if (judged) void soundOut(word, SLOW, true);
                  else void say([...soundsOf(word), ...soundsOf(word)], { gap: (i) => (i < n - 1 ? SLOW : i === n - 1 ? BREATH : QUICK), onEach: (i) => setLit(i % n) }).then(() => setLit(null));
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
              {/* The word itself, plain and slow: only once it has been answered. */}
              {judged && <HearButtons word={word} />}
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

      {muted ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-tube/90 p-4" role="dialog" aria-modal="true" aria-label="The sound is off">
          <div className="panel panel-cyan max-w-md text-center">
            <p className="font-display glow m-0 text-base text-cyan">This game needs sound.</p>
            <p className="mt-4">The sound is off.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-quiet" onClick={onQuit}>
                Stop the round
              </button>
              <button
                type="button"
                className="btn btn-cyan"
                autoFocus
                onClick={() => {
                  setMuted(false);
                  sfx.coin();
                  send({ type: "resume", now: performance.now() });
                }}
              >
                <Sprite id="speaker" palette="ink" size={30} />
                Turn sound on
              </button>
            </div>
          </div>
        </div>
      ) : s.wantPause && (
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

/**
 * Split: the word as one block of letters, with a gap between each two that
 * the player taps to cut it there, or taps again to join it. The letters
 * themselves cannot be pressed: a tap on a letter's left or right half goes
 * to the gap on that side, if there is one (each gap reaches half a letter
 * either way; the outer half of the first and last letter does nothing), so
 * a five-letter word on a phone still has gaps a finger can hit.
 */
function SplitWord({ letters, cuts, onCut }: { letters: string; cuts: boolean[]; onCut: (at: number) => void }) {
  const n = letters.length;
  return (
    <div className="gm-word" role="group" aria-label={`${letters}: tap between the letters to split it into its sounds`}>
      {[...letters].map((ch, i) => (
        <Fragment key={i}>
          <span className="gm-letter" data-open-left={i === 0 || cuts[i - 1]} data-open-right={i === n - 1 || cuts[i]} aria-hidden>
            {ch}
          </span>
          {i < n - 1 && (
            <button type="button" className="gm-cut" data-cut={cuts[i]} aria-pressed={cuts[i]} aria-label={cuts[i] ? `Join ${ch} and ${letters[i + 1]}` : `Split between ${ch} and ${letters[i + 1]}`} onClick={() => onCut(i)}>
              <span className="gm-cut-mark" />
            </button>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** Hear the word, and hear it slowly (the snail). */
function HearButtons({ word }: { word: Word }) {
  return (
    <div className="sm-hears">
      <button type="button" className="btn btn-cyan sm-hear" aria-label="Hear the word" onClick={() => void say([wholeOf(word)])}>
        <Sprite id="speaker" palette="ink" size={40} />
      </button>
      <button type="button" className="btn btn-cyan sm-hear" aria-label="Hear the word slowly" onClick={() => void say([slowOf(word)])}>
        <Sprite id="snail" size={40} />
      </button>
    </div>
  );
}

/** After a miss: on to the next word, when the player is ready. */
function NextButton({ ready, onNext }: { ready: boolean; onNext: () => void }) {
  return (
    <button type="button" className="btn btn-lg sm-next" disabled={!ready} aria-label="Next word" onClick={onNext} autoFocus>
      <Sprite id="arrow" size={40} />
    </button>
  );
}
