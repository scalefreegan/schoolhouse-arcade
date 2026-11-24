import { useCallback, useEffect, useState } from "react";
import { LEVELS, levelById } from "../../../shared/comet/facts.ts";
import { MODES, SKILLS, type Mode, type Skill } from "../../../shared/comet/rules.ts";
import { playable, type AnswerInput, type PlayConfig } from "../../../shared/play.ts";
import { newRoundId } from "../../../shared/roundid.ts";
import type { PlayReply, ProgressReply } from "../../../shared/wire.ts";
import { ApiError, getProgress, postPlay } from "../../api/client.ts";
import type { GameProps } from "../index.ts";
import { Results } from "./Results.tsx";
import { RoundScreen } from "./Round.tsx";
import { Setup } from "./Setup.tsx";

const GAME = "comet-cards";
const DEFAULT: PlayConfig = { level: LEVELS[0].id, mode: "blitz", skill: "easy" };

/** The set-up this player used last on this device, if it still makes sense. */
function remembered(playerId: string): PlayConfig {
  try {
    const c = JSON.parse(localStorage.getItem(`arcade.comet.setup.${playerId}`) ?? "null") as Partial<PlayConfig> | null;
    if (c && levelById(c.level ?? "") && MODES.some((m) => m.id === c.mode) && SKILLS.some((s) => s.id === c.skill)) return c as PlayConfig;
  } catch {
    /* nothing remembered */
  }
  return DEFAULT;
}

type Stage =
  | { at: "setup" }
  // Each stage past set-up carries the set-up its round is played on, so
  // what is sent, and shown, is what was played.
  | { at: "round"; round: number; config: PlayConfig }
  | { at: "saving"; config: PlayConfig; answers: AnswerInput[]; roundId: string; error: string | null }
  | { at: "results"; config: PlayConfig; answers: AnswerInput[]; reply: PlayReply };

/**
 * The Comet Cards cabinet: set up, play, see how it went. The round is
 * played in the browser; when it ends its answers go to the server, and
 * what the results screen shows is the server's reckoning.
 */
export function CometCards({ player, onExit }: GameProps) {
  const [progress, setProgress] = useState<ProgressReply | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<PlayConfig>(() => remembered(player.id));
  const [stage, setStage] = useState<Stage>({ at: "setup" });

  const load = useCallback(async () => {
    try {
      setProgress(await getProgress(player.id, GAME));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : String(e));
    }
  }, [player.id]);

  useEffect(() => {
    // The first load. load() only sets state after the server answers.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  const choose = (c: PlayConfig) => {
    setConfig(c);
    try {
      localStorage.setItem(`arcade.comet.setup.${player.id}`, JSON.stringify(c));
    } catch {
      /* private browsing: remembered for this visit only */
    }
  };

  // Send a round with the set-up it was played on: not the remembered one,
  // which may name a level that is locked here. `roundId` is the round's
  // own, made once when it ended: a round sent again after a lost reply is
  // stored and paid only once.
  const save = useCallback(
    async (played: PlayConfig, answers: AnswerInput[], roundId: string) => {
      setStage({ at: "saving", config: played, answers, roundId, error: null });
      try {
        const reply = await postPlay({ playerId: player.id, gameId: GAME, roundId, ...played, answers });
        setStage({ at: "results", config: played, answers, reply });
        void load();
      } catch (e) {
        setStage({ at: "saving", config: played, answers, roundId, error: e instanceof ApiError ? e.message : String(e) });
      }
    },
    [player.id, load],
  );

  if (loadError && !progress) {
    return (
      <main className="screen">
        <div role="alert" className="panel panel-bad mx-auto mt-16 max-w-xl text-center">
          <p className="font-display m-0 text-sm text-bad">No signal</p>
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
  const play = () => setStage({ at: "round", round: Date.now(), config: live });

  if (stage.at === "round") {
    return (
      <RoundScreen
        key={stage.round}
        level={levelById(stage.config.level)!}
        mode={stage.config.mode as Mode}
        skill={stage.config.skill as Skill}
        stats={progress.facts}
        onDone={(answers) => void save(stage.config, answers, newRoundId())}
        onQuit={() => setStage({ at: "setup" })}
      />
    );
  }
  if (stage.at === "saving") {
    return (
      <main className="screen items-center justify-center text-center">
        {stage.error ? (
          <div role="alert" className="panel panel-bad max-w-xl">
            <p className="font-display m-0 text-sm text-bad">The score did not save</p>
            <p className="mt-4">{stage.error}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-quiet" onClick={() => setStage({ at: "setup" })}>
                Give up
              </button>
              <button type="button" className="btn btn-cyan" onClick={() => void save(stage.config, stage.answers, stage.roundId)}>
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
    return <Results config={stage.config} reply={stage.reply} answers={stage.answers} onAgain={play}onSetup={() => setStage({ at: "setup" })} onExit={onExit} />;
  }
  return <Setup progress={progress} config={live} onChange={choose} onStart={play} onExit={onExit} />;
}
