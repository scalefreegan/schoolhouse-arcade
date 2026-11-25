import { useEffect, useRef, type ReactNode } from "react";
import type { PlayConfig } from "../../shared/play.ts";
import type { PlayReply } from "../../shared/wire.ts";
import { Hud } from "../arcade/Hud.tsx";
import { Stars } from "../arcade/Stars.tsx";
import { TicketsWon } from "../arcade/TicketsWon.tsx";
import { sfx } from "../sound.ts";
import { useArcade } from "../state.tsx";
import type { CabinetGame } from "./Cabinet.tsx";
import { fmtScore, fmtStopwatch } from "./format.ts";
import { ScoreTable } from "./Scores.tsx";

/**
 * After a round, on any cabinet, in the server's numbers: the score or
 * time, what was right and missed, any star or level it won, the tickets
 * and badges it paid, and where it landed on the table. `children` is the
 * game's own word on what was missed.
 */
export function Results({ game, config, reply, onAgain, onSetup, onExit, children }: { game: CabinetGame; config: PlayConfig; reply: PlayReply; onAgain: () => void; onSetup: () => void; onExit: () => void; children?: ReactNode }) {
  const mode = game.rules.modes.find((m) => m.id === config.mode)!;
  const level = game.rules.levels.find((l) => l.id === config.level)!;
  const newStar = reply.starsAfter > reply.starsBefore;
  const opened = reply.opened ? game.rules.levels.find((l) => l.id === reply.opened) : null;
  const cheer = newStar || reply.personalBest || reply.rank === 1 || reply.badges.length > 0;
  const { setTickets } = useArcade();

  useEffect(() => {
    if (cheer) sfx.fanfare();
  }, [cheer]);
  // The strip along the top shows the tickets as they now stand.
  useEffect(() => setTickets(reply.tickets.balance), [setTickets, reply.tickets.balance]);
  // Play again has the keyboard (Enter plays again), but the screen opens at
  // its top, on the score: autoFocus would scroll down to the button.
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => again.current?.focus({ preventScroll: true }), []);

  return (
    <main className="screen">
      <Hud>
        <button type="button" className="btn btn-quiet" onClick={onExit}>
          Games
        </button>
      </Hud>

      <div className={`mt-4 grid gap-6 ${reply.board.kind ? "lg:grid-cols-[3fr_2fr]" : ""}`}>
        <div className="text-center">
          <p className="font-display m-0 text-xs text-dim">
            {level.title}, {mode.title}
          </p>
          {mode.board === "time" && reply.finished ? (
            <p className="readout mt-3 mb-0">
              Time
              <b className="glow text-magenta" style={{ fontSize: "clamp(1.75rem, 6vw, 3rem)" }}>
                {fmtStopwatch(reply.timeMs)}
              </b>
            </p>
          ) : (
            <p className="readout mt-3 mb-0">
              Score
              <b className="glow text-magenta" style={{ fontSize: "clamp(1.75rem, 6vw, 3rem)" }}>
                {fmtScore(reply.score)}
              </b>
            </p>
          )}

          <div className="mt-4 flex justify-center gap-8">
            <p className="readout m-0">
              Right
              <b className="text-good">{reply.right}</b>
            </p>
            <p className="readout m-0">
              Missed
              <b className="text-fg">{reply.wrong}</b>
            </p>
            <p className="readout m-0">
              {game.streak ?? "Best combo"}
              <b className="text-yellow">{reply.bestCombo}</b>
            </p>
          </div>

          <div className="mt-5 flex flex-col items-center gap-2">
            {/* A mode that keeps no table earns no stars: showing three empty ones would read as a failure. */}
            {mode.board && <Stars count={reply.starsAfter} size={40} {...(newStar ? { fresh: reply.starsBefore } : {})} />}
            {newStar && <p className="font-display glow m-0 text-sm text-yellow">New star!</p>}
            {opened && <p className="font-display glow m-0 text-sm text-cyan">{opened.title} is open!</p>}
            {reply.personalBest && <p className="font-display glow m-0 text-sm text-yellow">Your best yet!</p>}
            {reply.rank !== null && (
              <p className="m-0">
                Number <span className="font-display text-sm text-yellow">{reply.rank}</span> on the high scores
              </p>
            )}
          </div>

          <TicketsWon tickets={reply.tickets} badges={reply.badges} />

          {children}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-quiet" onClick={onSetup}>
              Change game
            </button>
            <button type="button" className="btn btn-lg" onClick={onAgain} ref={again}>
              Play again
            </button>
          </div>
        </div>

        {reply.board.kind && (
          <div>
            <h2 className="font-display m-0 text-xs text-dim">High scores</h2>
            <div className="panel mt-1">
              <ScoreTable board={reply.board} mine={reply.playId} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
