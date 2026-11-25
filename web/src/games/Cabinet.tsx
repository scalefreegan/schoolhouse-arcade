import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { FactStat } from "../../shared/deal.ts";
import { playable, type AnswerInput, type GameRules, type PlayConfig } from "../../shared/play.ts";
import { newRoundId } from "../../shared/roundid.ts";
import type { PlayReply, ProgressReply } from "../../shared/wire.ts";
import { ApiError, getProgress, postPlay, startRound } from "../api/client.ts";
import type { GameProps } from "./index.ts";
import { Results } from "./Results.tsx";
import { Setup, type SetupExtras } from "./Setup.tsx";

/** What the arcade needs to know of a game to run its cabinet. */
export interface CabinetGame {
  /** Its id in shared/games.ts. */
  id: string;
  title: string;
  rules: Pick<GameRules, "levels" | "modes" | "skills">;
  /** The set-up a new player starts on. */
  first: PlayConfig;
  /** Where this device remembers each player's last set-up: arcade.<remember>.setup.<player>. */
  remember: string;
  /** What the results call the longest run of right answers ("Best combo" unless said). */
  streak?: string;
}

/** What a game is handed to play one round. */
export interface RoundProps {
  config: PlayConfig;
  /** How the player has done on each fact lately. */
  stats: Record<string, FactStat>;
  onDone: (answers: AnswerInput[]) => void;
  onQuit: () => void;
}

/** The set-up this player used last on this device, if it still makes sense. */
function remembered(game: CabinetGame, playerId: string): PlayConfig {
  try {
    const c = JSON.parse(localStorage.getItem(`arcade.${game.remember}.setup.${playerId}`) ?? "null") as Partial<PlayConfig> | null;
    if (c && game.rules.levels.some((l) => l.id === c.level) && game.rules.modes.some((m) => m.id === c.mode) && game.rules.skills.some((s) => s.id === c.skill)) return c as PlayConfig;
  } catch {
    /* nothing remembered */
  }
  return game.first;
}

/** A round the server has started: the set-up it is played on (so what is
 *  sent, and shown, is what was played), its id, and the server's clock. */
interface Begun {
  config: PlayConfig;
  roundId: string;
  clock: string;
}

type Stage =
  | { at: "setup" }
  | { at: "starting"; config: PlayConfig; roundId: string; error: string | null }
  | ({ at: "round"; round: number } & Begun)
  | ({ at: "saving"; answers: AnswerInput[]; error: string | null } & Begun)
  | { at: "results"; config: PlayConfig; answers: AnswerInput[]; reply: PlayReply };

/**
 * A cabinet, whatever the game: set up, play, see how it went. The server
 * starts a round's clock, the round is played in the browser, and when it
 * ends its answers (and the clock) go to the server, and what the results
 * screen shows is the server's reckoning. The game supplies the round
 * itself (`round`), anything it must fetch before one (`prepare`: its
 * sounds), and its own word on what was missed (`missed`).
 */
export function Cabinet({
  game,
  player,
  onExit,
  round,
  prepare,
  missed,
  setup,
}: GameProps & {
  game: CabinetGame;
  round: (props: RoundProps & { key: number }) => ReactNode;
  /** Runs before the server is asked to start a round; a round does not start if it fails. */
  prepare?: (config: PlayConfig) => Promise<void>;
  missed?: (answers: AnswerInput[], config: PlayConfig) => ReactNode;
  setup?: SetupExtras;
}) {
  const [progress, setProgress] = useState<ProgressReply | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<PlayConfig>(() => remembered(game, player.id));
  const [stage, setStage] = useState<Stage>({ at: "setup" });

  const load = useCallback(async () => {
    try {
      setProgress(await getProgress(player.id, game.id));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String(e));
    }
  }, [player.id, game.id]);

  useEffect(() => {
    // The first load. load() only sets state after the server answers.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  const choose = (c: PlayConfig) => {
    setConfig(c);
    try {
      localStorage.setItem(`arcade.${game.remember}.setup.${player.id}`, JSON.stringify(c));
    } catch {
      /* private browsing: remembered for this visit only */
    }
  };

  // Ask the server to start a round, and play it once it has: the server
  // times the round from here (web/server/clock.ts). The round waits for
  // the answer, so the server's start is always before the first card. With
  // no answer there is no round yet, and nothing played is lost.
  const begin = useCallback(
    async (played: PlayConfig, roundId: string) => {
      setStage({ at: "starting", config: played, roundId, error: null });
      let next: Stage;
      try {
        await prepare?.(played);
        const { clock } = await startRound({ playerId: player.id, gameId: game.id, roundId });
        next = { at: "round", round: Date.now(), config: played, roundId, clock };
      } catch (e) {
        next = { at: "starting", config: played, roundId, error: e instanceof Error ? e.message : String(e) };
      }
      // Only if this is still the round being started (not left for set-up).
      setStage((s) => (s.at === "starting" && s.roundId === roundId ? next : s));
    },
    [player.id, game.id, prepare],
  );

  // Send a round with the set-up it was played on: not the remembered one,
  // which may name a level that is locked here. `roundId` is the round's
  // own, made once when it started: a round sent again after a lost reply is
  // stored and paid only once.
  const save = useCallback(
    async (begun: Begun, answers: AnswerInput[]) => {
      setStage({ at: "saving", ...begun, answers, error: null });
      try {
        const reply = await postPlay({ playerId: player.id, gameId: game.id, roundId: begun.roundId, clock: begun.clock, ...begun.config, answers });
        setStage({ at: "results", config: begun.config, answers, reply });
        void load();
      } catch (e) {
        setStage({ at: "saving", ...begun, answers, error: e instanceof ApiError ? e.message : String(e) });
      }
    },
    [player.id, game.id, load],
  );

  if (loadError && !progress) {
    return (
      <main className="screen">
        <div role="alert" className="panel panel-cyan mx-auto mt-16 max-w-xl text-center">
          <p className="font-display m-0 text-sm text-cyan">No signal</p>
          <p className="mt-4">{loadError}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn btn-quiet" onClick={onExit}>
              Games
            </button>
            <button type="button" className="btn btn-cyan" onClick={() => void load()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (!progress) {
    return (
      <main className="screen items-center justify-center">
        <p className="font-display blink text-sm text-dim">Loading</p>
      </main>
    );
  }

  // A remembered level that is locked for this player (another device, a
  // fresh database) falls back to the hardest one that is open.
  const live = playable(config, progress.open);
  const play = () => void begin(live, newRoundId());

  if (stage.at === "starting") {
    return (
      <main className="screen items-center justify-center text-center">
        {stage.error ? (
          <div role="alert" className="panel panel-cyan max-w-xl">
            <p className="font-display m-0 text-sm text-cyan">No signal</p>
            <p className="mt-4">{stage.error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setStage({ at: "setup" })}>
                Back
              </button>
              <button type="button" className="btn btn-cyan" onClick={() => void begin(stage.config, stage.roundId)}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <p className="font-display blink text-sm text-dim">Ready</p>
        )}
      </main>
    );
  }
  if (stage.at === "round") {
    const { round: key, config: played, roundId, clock } = stage;
    return round({ key, config: played, stats: progress.facts, onDone: (answers) => void save({ config: played, roundId, clock }, answers), onQuit: () => setStage({ at: "setup" }) });
  }
  if (stage.at === "saving") {
    return (
      <main className="screen items-center justify-center text-center">
        {stage.error ? (
          <div role="alert" className="panel panel-cyan max-w-xl">
            <p className="font-display m-0 text-sm text-cyan">The score did not save</p>
            <p className="mt-4">{stage.error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setStage({ at: "setup" })}>
                Give up
              </button>
              <button type="button" className="btn btn-cyan" onClick={() => void save(stage, stage.answers)}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <p className="font-display blink text-sm text-dim">Adding it up</p>
        )}
      </main>
    );
  }
  if (stage.at === "results") {
    return (
      <Results game={game} config={stage.config} reply={stage.reply} onAgain={play} onSetup={() => setStage({ at: "setup" })} onExit={onExit}>
        {missed?.(stage.answers, stage.config)}
      </Results>
    );
  }
  return <Setup game={game} progress={progress} config={live} onChange={choose} onStart={play} onExit={onExit} {...setup} />;
}
