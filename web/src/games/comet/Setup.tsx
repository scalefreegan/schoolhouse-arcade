import { useEffect, useState } from "react";
import { LEVELS } from "../../../shared/comet/facts.ts";
import { MODES, SKILLS } from "../../../shared/comet/rules.ts";
import type { PlayConfig } from "../../../shared/play.ts";
import type { BoardReply, ProgressReply } from "../../../shared/wire.ts";
import { getBoard } from "../../api/client.ts";
import { Hud } from "../../arcade/Hud.tsx";
import { Stars } from "../../arcade/Stars.tsx";
import { sfx } from "../../sound.ts";
import { Sprite } from "../../sprites/Sprite.tsx";
import { fmtScore, fmtStopwatch } from "./format.ts";
import { ScoreTable } from "./Scores.tsx";

const GAME = "comet-cards";

/**
 * Before a round: which level, how it is timed, how answers are given. A
 * locked level is shown dark with what opens it. The table for the chosen
 * set-up sits beside the choices, so there is always a score to beat.
 */
export function Setup({ progress, config, onChange, onStart, onExit }: { progress: ProgressReply; config: PlayConfig; onChange: (c: PlayConfig) => void; onStart: () => void; onExit: () => void }) {
  const [board, setBoard] = useState<BoardReply | null>(null);
  const mode = MODES.find((m) => m.id === config.mode)!;
  const best = progress.bests.find((b) => b.level === config.level && b.mode === config.mode && b.skill === config.skill);

  useEffect(() => {
    let live = true;
    getBoard(GAME, config).then(
      (b) => live && setBoard(b),
      () => live && setBoard(null),
    );
    return () => {
      live = false;
    };
  }, [config]);

  const pick = (patch: Partial<PlayConfig>) => {
    sfx.tap();
    onChange({ ...config, ...patch });
  };

  return (
    <main className="screen">
      <Hud>
        <button type="button" className="btn btn-quiet" onClick={onExit}>
          Games
        </button>
      </Hud>
      <h1 className="marquee mt-4 mb-0 text-center text-cyan text-[clamp(1.25rem,4.2vw,2.25rem)]" style={{ "--marquee-depth": "var(--cyan-depth)" } as React.CSSProperties}>
        Comet Cards
      </h1>

      <h2 className="font-display mt-5 mb-0 text-xs text-dim">Level</h2>
      <div className="mt-1 grid grid-cols-2 sm:grid-cols-5" role="group" aria-label="Level">
        {LEVELS.map((l, i) => {
          const open = progress.open.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              className="panel pick flex flex-col items-center gap-2"
              aria-pressed={config.level === l.id}
              disabled={!open}
              {...(open ? {} : { "aria-label": `${l.title}: locked. Get a star on ${LEVELS[i - 1].title} to open it.` })}
              onClick={() => pick({ level: l.id })}
            >
              <span className={`font-display text-xs ${open ? "text-cyan" : "text-dim"}`}>{l.title}</span>
              {open ? (
                <>
                  <span className="font-display text-sm">{l.blurb}</span>
                  <Stars count={progress.stars[l.id] ?? 0} size={20} />
                </>
              ) : (
                <Sprite id="lock" size={36} className="my-1" />
              )}
            </button>
          );
        })}
      </div>
      {progress.open.length < LEVELS.length && <p className="mt-1 mb-0 text-center text-dim">A star on a level opens the next one.</p>}

      <div className="mt-4 grid gap-x-6 gap-y-4 lg:grid-cols-[3fr_2fr]">
        <div>
          <h2 className="font-display m-0 text-xs text-dim">Game</h2>
          <div className="mt-1 grid grid-cols-2 sm:grid-cols-4" role="group" aria-label="Game">
            {MODES.map((m) => (
              <button key={m.id} type="button" className="panel pick flex flex-col items-center gap-1" aria-pressed={config.mode === m.id} onClick={() => pick({ mode: m.id })}>
                <span className="font-display text-xs text-cyan">{m.title}</span>
                <span className="text-dim">{m.blurb}</span>
              </button>
            ))}
          </div>

          <h2 className="font-display mt-4 mb-0 text-xs text-dim">Skill</h2>
          <div className="mt-1 grid grid-cols-2" role="group" aria-label="Skill">
            {SKILLS.map((s) => (
              <button key={s.id} type="button" className="panel pick flex flex-col items-center gap-1" aria-pressed={config.skill === s.id} onClick={() => pick({ skill: s.id })}>
                <span className="font-display text-xs text-cyan">{s.title}</span>
                <span className="text-dim">{s.blurb}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-6">
            {best && mode.board && (
              <p className="m-0">
                Your best <span className="font-display text-sm text-yellow">{mode.board === "score" ? fmtScore(best.score) : fmtStopwatch(best.timeMs)}</span>
              </p>
            )}
            <button
              type="button"
              className="btn btn-lg"
              onClick={() => {
                sfx.coin();
                onStart();
              }}
            >
              Start
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <h2 className="font-display m-0 text-xs text-dim">{mode.board ? "High scores" : "Practice"}</h2>
          <div className="panel mt-1 flex-1">
            {mode.board ? board ? <ScoreTable board={board} /> : <p className="m-0 text-center text-dim">…</p> : <p className="m-0 text-center text-dim">No clock and no scores. Fifteen cards to warm up.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
