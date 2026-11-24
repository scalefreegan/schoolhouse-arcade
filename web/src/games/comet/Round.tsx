import { useEffect, useEffectEvent, useReducer, useState } from "react";
import type { FactStat } from "../../../shared/comet/deck.ts";
import { parseFact, type Level } from "../../../shared/comet/facts.ts";
import { BLITZ_MS, PRACTICE_CARDS, SPRINT_CARDS, SURVIVAL_LIVES, cardLimit, multiplier, roundTime, type Mode, type Skill } from "../../../shared/comet/rules.ts";
import { advance, cardAnswer, startSession, waited } from "../../../shared/comet/session.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import { sfx } from "../../sound.ts";
import { Sprite } from "../../sprites/Sprite.tsx";
import { fmtClock, fmtScore, fmtStopwatch } from "./format.ts";

// One round on screen, from "3, 2, 1" to the last card. What happens is
// decided by the session (shared/comet/session.ts): this file sends it
// events (a key, a tap, a frame of the clock), times what follows each
// change, and draws it. It hands back the answers; the server scores them
// again and its numbers are the ones kept.

/** How long a right answer stays up before the next card, and a missed one's answer. */
const RIGHT_MS = 380;
const WRONG_MS = 1900;
const COUNT_STEP_MS = 650;
const GO_MS = 350;
const DONE_MS = 1100;

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "ok"];

export function RoundScreen({ level, mode, skill, stats, onDone, onQuit }: { level: Level; mode: Mode; skill: Skill; stats: Record<string, FactStat>; onDone: (answers: AnswerInput[]) => void; onQuit: () => void }) {
  const [s, send] = useReducer(advance, null, () => startSession(level, mode, skill, stats));
  // The clock the screen draws from, moved once a frame.
  const [now, setNow] = useState(0);

  // What follows each change of phase: a sound now, the next thing later.
  const follow = useEffectEvent(() => {
    const deal = () => send({ type: "deal", now: performance.now(), seed: Math.floor(Math.random() * 2 ** 32) });
    switch (s.phase) {
      case "countdown":
        if (s.count > 0) sfx.tick();
        return window.setTimeout(s.count > 0 ? () => send({ type: "beat" }) : deal, s.count > 0 ? COUNT_STEP_MS : GO_MS);
      case "right":
        sfx.right(multiplier(s.round.combo) - 1);
        return window.setTimeout(deal, RIGHT_MS);
      case "wrong":
        sfx.wrong();
        return window.setTimeout(deal, WRONG_MS);
      case "done":
        sfx.over();
        return window.setTimeout(() => onDone(s.answers), DONE_MS);
      default:
        return undefined;
    }
  });
  useEffect(() => {
    const timer = follow();
    return () => window.clearTimeout(timer);
  }, [s.seq]);

  // A frame: move the drawn clock, and let the session call time.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = performance.now();
      send({ type: "clock", now: t });
      setNow(t);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const press = (key: string) => {
    if (s.phase === "ask" && /^[0-9]$/.test(key)) sfx.tap();
    send({ type: "key", key, now: performance.now() });
  };

  // Keys: digits, Backspace, Enter; Escape opens and closes the pause box.
  // A tablet that goes to sleep pauses the round.
  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape") send({ type: "toggle", now: performance.now() });
    else if (/^[0-9]$/.test(ev.key)) press(ev.key);
    else if (ev.key === "Backspace") press("back");
    else if (ev.key === "Enter" && !s.wantPause && skill === "arcade") press("ok");
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

  const fact = parseFact(s.fact);
  const answer = cardAnswer(s);
  const t = waited(s, now);
  const limit = cardLimit(mode, s.round);
  // After an answer round.cardMs already holds the card's time.
  const live = s.phase === "ask" || s.phase === "paused" ? t : 0;
  let bar = 1;
  let clock = "";
  if (mode === "blitz") {
    const left = Math.max(0, BLITZ_MS - s.round.cardMs - live);
    bar = left / BLITZ_MS;
    clock = fmtClock(left);
  } else if (mode === "survival") {
    // After an answer the bar holds where the card stopped it.
    bar = limit && s.phase !== "countdown" && s.phase !== "done" ? Math.max(0, 1 - t / limit) : s.phase === "done" ? 0 : 1;
  } else if (mode === "sprint") {
    bar = s.round.right / SPRINT_CARDS;
    clock = fmtStopwatch(roundTime(mode, s.round) + live);
  } else {
    bar = (s.round.right + s.round.wrong) / PRACTICE_CARDS;
  }
  const secondsLeft = mode === "blitz" && s.phase === "ask" ? Math.ceil((BLITZ_MS - s.round.cardMs - live) / 1000) : null;
  const lastSeconds = secondsLeft !== null && secondsLeft <= 5;
  useEffect(() => {
    if (lastSeconds) sfx.tick();
  }, [lastSeconds, secondsLeft]);

  const cardState = s.phase === "right" ? "right" : s.phase === "wrong" ? "wrong" : "ask";
  const showCard = fact && (s.phase === "ask" || s.phase === "right" || s.phase === "wrong");

  return (
    <main className="screen">
      <header className="flex items-start justify-between gap-2">
        <p className="readout m-0 text-left">
          Score
          <b className="glow text-magenta">{fmtScore(s.round.score)}</b>
        </p>
        <p className="readout m-0 text-center">
          {mode === "survival" ? (
            <>
              Lives
              <b role="img" aria-label={`${s.round.lives} lives left`}>
                <span className="flex justify-center gap-1 pt-1">
                  {Array.from({ length: SURVIVAL_LIVES }, (_, i) => (
                    <Sprite key={i} id="heart" palette={i < (s.round.lives ?? 0) ? "on" : "off"} size={26} />
                  ))}
                </span>
              </b>
            </>
          ) : mode === "practice" ? (
            <>
              Cards
              <b className="text-fg">
                {s.round.right + s.round.wrong}/{PRACTICE_CARDS}
              </b>
            </>
          ) : (
            <>
              {mode === "sprint" ? `Cards ${s.round.right}/${SPRINT_CARDS}` : "Time"}
              <b className={`text-fg ${lastSeconds ? "blink" : ""}`}>{clock}</b>
            </>
          )}
        </p>
        <p className="readout m-0 text-right">
          Combo
          <b className={s.round.combo >= 3 ? "glow text-yellow" : "text-dim"}>
            {s.round.combo} <span className="text-[0.75em]">x{multiplier(Math.max(1, s.round.combo))}</span>
          </b>
        </p>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <div className="track flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar * 100)} aria-label={mode === "sprint" || mode === "practice" ? "Cards done" : "Time left"}>
          <div className="track-fill" style={{ width: `${bar * 100}%` }} />
        </div>
        <button type="button" className="btn btn-quiet" style={{ minHeight: 0, marginBottom: "var(--px)" }} onClick={() => send({ type: "pause", now: performance.now() })} aria-label="Pause">
          II
        </button>
      </div>

      <div className="mt-4 grid flex-1 content-center gap-4 md:grid-cols-2 md:items-center">
        <div className="relative">
          <div className="card" data-state={cardState} data-phase={s.phase} aria-live="polite">
            {s.phase === "countdown" ? (
              <p className="card-line glow m-0 text-yellow">{s.count > 0 ? s.count : "Go!"}</p>
            ) : s.phase === "done" ? (
              <p className="card-line glow m-0 text-yellow" style={{ fontSize: "min(9cqw, 3rem)" }}>
                {mode === "blitz" ? "Time!" : mode === "survival" ? "Game over" : "Done!"}
              </p>
            ) : !showCard ? (
              <p className="card-line m-0 text-dim" style={{ fontSize: "min(9cqw, 3rem)" }}>
                Paused
              </p>
            ) : (
              <>
                <p className="card-line m-0" data-fact={s.fact}>
                  <span>{fact.a}</span>
                  <span className="text-cyan">{fact.op}</span>
                  <span>{fact.b}</span>
                </p>
                <p className="card-line m-0">
                  <span className="text-cyan">=</span>
                  {s.last ? (
                    <>
                      {!s.last.correct && s.last.given !== null && <s className="text-bad">{s.last.given}</s>}
                      <span className="glow text-good">{answer}</span>
                    </>
                  ) : skill === "arcade" ? (
                    <span className="inline-flex gap-[0.2em] text-magenta">
                      {Array.from({ length: String(answer).length }, (_, i) => (
                        <span key={i} className="slot">
                          {s.typed[i] ?? " "}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="blink text-magenta">?</span>
                  )}
                </p>
              </>
            )}
          </div>
          {s.phase === "right" && s.last && (
            <p key={s.seq} className="pop font-display glow pointer-events-none absolute inset-x-0 top-0 m-0 text-center text-base text-yellow">
              +{s.last.gained}
            </p>
          )}
          {s.phase === "wrong" && <p className="font-display mt-3 mb-0 text-center text-xs text-dim">{s.last?.given === null ? "Out of time" : "Look! It comes back soon"}</p>}
        </div>

        {skill === "arcade" ? (
          <div className="mx-auto grid w-full max-w-sm grid-cols-3" role="group" aria-label="Number pad">
            {PAD.map((k) => (
              <button
                key={k}
                type="button"
                className={`btn key ${k === "ok" ? "" : "btn-quiet"}`}
                aria-label={k === "back" ? "Rub out" : k === "ok" ? "OK" : k}
                onPointerDown={(ev) => {
                  // On the press, not the release: a quick finger is already gone.
                  ev.preventDefault();
                  press(k);
                }}
                onClick={(ev) => {
                  // A press from the keyboard (Space on a focused key); a pointer's was taken above.
                  if (ev.detail === 0) press(k);
                }}
              >
                {k === "back" ? "<" : k === "ok" ? "OK" : k}
              </button>
            ))}
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-md grid-cols-2" role="group" aria-label="Answers">
            {(showCard ? s.choices : [0, 1, 2, 3]).map((n, i) => {
              const judged = showCard && s.last !== null;
              // Once judged: the right answer turns green, a wrong pick red. Not
              // `disabled` (that would grey them all); the session ignores a late tap.
              const tone = judged && n === answer ? "btn-good" : judged && n === s.last?.given ? "btn-bad" : "";
              return (
                <button key={showCard ? `${s.answers.length}-${n}` : i} type="button" className={`btn choice ${tone}`} disabled={!showCard} data-pressed={judged && n === s.last?.given} onClick={() => send({ type: "choose", n, now: performance.now() })}>
                  {showCard ? n : " "}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
