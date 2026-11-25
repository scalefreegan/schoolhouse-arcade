import type { AnswerInput, PlayConfig } from "../../../shared/play.ts";
import { answerOf, poolOf, soundMachineRules, type Mode, type Skill } from "../../../shared/soundmachine/rules.ts";
import { LEVELS, SOUNDS, clipUrl, levelById, slowClip, soundClip, wordById, wordClip, type Word } from "../../../shared/soundmachine/words.ts";
import { sfx } from "../../sound.ts";
import { preload, say } from "../../speech.ts";
import { Picture, Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { Cabinet, type CabinetGame } from "../Cabinet.tsx";
import type { GameProps } from "../index.ts";
import { RoundScreen } from "./Round.tsx";

const GAME: CabinetGame = {
  id: "sound-machine",
  title: "Sound Machine",
  rules: soundMachineRules,
  first: { level: LEVELS[0].id, mode: "build", skill: "easy" },
  remember: "sound-machine",
  streak: "Best run",
};

/** Every clip a round on this level can play: each sound (any tile may be
 *  in a tray), and each word the round may ask for, plain and slow. Fetched before the
 *  round starts, so nothing waits on the network once it has. */
function clipsFor(config: PlayConfig): string[] {
  const level = levelById(config.level);
  return [...SOUNDS.map((s) => clipUrl(soundClip(s.id))), ...(level ? poolOf(level) : []).flatMap((w) => [clipUrl(wordClip(w.id)), clipUrl(slowClip(w.id))])];
}

/** A Build round cannot be played without its words said (the word is the
 *  question); everything else is fetched too, but a round starts without a
 *  clip that will not come: that tile, or the snail, is silent. If nothing
 *  comes at all the Mac is not there, and starting the round says so. */
const prepare = (config: PlayConfig) => {
  const level = levelById(config.level);
  const words = config.mode === "build" && level ? poolOf(level).map((w) => clipUrl(wordClip(w.id))) : [];
  return preload(words, clipsFor(config));
};

/** The words missed in a round, to look at and hear again. */
function Missed({ answers, mode }: { answers: AnswerInput[]; mode: Mode }) {
  const missed = answers.map((a) => ({ word: wordById(a.fact), a })).filter((x): x is { word: Word; a: AnswerInput } => !!x.word && x.a.given !== answerOf(mode, x.word));
  if (!missed.length) return null;
  return (
    <div className="panel mx-auto mt-5 max-w-md">
      <p className="font-display m-0 text-xs text-dim">Words to try again</p>
      <ul className="mt-2 mb-0 flex list-none flex-wrap justify-center gap-2 p-0">
        {missed.map(({ word }) => (
          <li key={word.id}>
            <button type="button" className="sm-again" aria-label={`Hear ${word.id}`} onClick={() => void say([clipUrl(wordClip(word.id))])}>
              <Picture id={word.picture} size={48} />
              <span className="sm-letter">{word.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** This game is its sounds: with the sound off it says so, and offers to turn it on. */
function NeedsSound() {
  const { setMuted } = useArcade();
  return (
    <div role="alert" className="panel panel-cyan mt-4 flex flex-wrap items-center justify-center gap-4 text-center">
      <p className="m-0">
        <span className="font-display text-sm text-cyan">This game needs sound.</span>
        <br />
        The sound is off.
      </p>
      <button
        type="button"
        className="btn btn-cyan"
        onClick={() => {
          setMuted(false);
          sfx.coin();
        }}
      >
        <Sprite id="speaker" palette="ink" size={30} />
        Turn sound on
      </button>
    </div>
  );
}

/**
 * The Sound Machine cabinet. The arcade's Cabinet runs it (set up, the
 * server's clock, saving, results); this supplies the round, fetches its
 * sounds before it starts, and will not start one in silence.
 */
export function SoundMachine(props: GameProps) {
  const { muted } = useArcade();
  return (
    <Cabinet
      {...props}
      game={GAME}
      prepare={prepare}
      blocked={muted}
      setup={{ levelFace: (l) => <span className="sm-letter text-base">{l.blurb}</span>, ...(muted ? { notice: <NeedsSound /> } : {}) }}
      round={({ key, config, stats, onDone, onQuit }) => <RoundScreen key={key} level={levelById(config.level)!} mode={config.mode as Mode} skill={config.skill as Skill} stats={stats} onDone={onDone} onQuit={onQuit} />}
      missed={(answers, config) => <Missed answers={answers} mode={config.mode as Mode} />}
    />
  );
}
