import { useEffect } from "react";
import { answerOf, levelById, parseFact } from "../../../shared/comet/facts.ts";
import { MODES } from "../../../shared/comet/rules.ts";
import type { AnswerInput, PlayConfig } from "../../../shared/play.ts";
import type { PlayReply } from "../../../shared/wire.ts";
import { Hud } from "../../arcade/Hud.tsx";
import { Stars } from "../../arcade/Stars.tsx";
import { TicketsWon } from "../../arcade/TicketsWon.tsx";
import { sfx } from "../../sound.ts";
import { useArcade } from "../../state.tsx";
import { fmtScore, fmtStopwatch } from "./format.ts";
import { ScoreTable } from "./Scores.tsx";

/** The cards missed in a round, each once, written out with its answer. */
function missedCards(answers: AnswerInput[]): string[] {
  const seen = new Set<string>();
  for (const a of answers) {
    const fact = parseFact(a.fact);
    if (fact && a.given !== answerOf(fact)) seen.add(`${fact.a} ${fact.op} ${fact.b} = ${answerOf(fact)}`);
  }
  return [...seen];
}

/**
 * After a round, in the server's numbers: the score or time, what was right
 * and missed, any star or level it won, the tickets and badges it paid, and
 * where it landed on the table.
 */
export function Results({ config, reply, answers, onAgain, onSetup, onExit }: { config: PlayConfig; reply: PlayReply; answers: AnswerInput[]; onAgain: () => void; onSetup: () => void; onExit: () => void }) {
  const mode = MODES.find((m) => m.id === config.mode)!;
  const level = levelById(config.level)!;
  const newStar = reply.starsAfter > reply.starsBefore;
  const opened = reply.opened ? levelById(reply.opened) : null;
  const cheer = newStar || reply.personalBest || reply.rank === 1 || reply.badges.length > 0;
  const { setTickets } = useArcade();
  const missed = missedCards(answers);

  useEffect(() => {
    if (cheer) sfx.fanfare();
  }, [cheer]);
  // The strip along the top shows the tickets as they now stand.
  useEffect(() => setTickets(reply.tickets.balance), [setTickets, reply.tickets.balance]);

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
              Best combo
              <b className="text-yellow">{reply.bestCombo}</b>
            </p>
          </div>

          <div className="mt-5 flex flex-col items-center gap-2">
            {/* Practice earns no stars: showing three empty ones would read as a failure. */}
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

          {missed.length > 0 && (
            <div className="panel mx-auto mt-5 max-w-md">
              <p className="font-display m-0 text-xs text-dim">Cards to try again</p>
              <ul className="mt-2 mb-0 flex list-none flex-wrap justify-center gap-x-6 gap-y-1 p-0">
                {missed.slice(0, 8).map((m) => (
                  <li key={m} className="font-display text-sm">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-quiet" onClick={onSetup}>
              Change game
            </button>
            <button type="button" className="btn btn-lg" onClick={onAgain} autoFocus>
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
