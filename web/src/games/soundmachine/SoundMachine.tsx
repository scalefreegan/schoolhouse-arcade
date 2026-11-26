import type { AnswerInput, PlayConfig } from "../../../shared/play.ts";
import { answerOf, gemsOf, poolOf, soundMachineRules, type Mode, type Skill } from "../../../shared/soundmachine/rules.ts";
import { LEVELS, SOUNDS, clipUrl, levelById, slowClip, soundClip, wordById, wordClip, type Word } from "../../../shared/soundmachine/words.ts";
import { preload, say } from "../../speech.ts";
import { Picture } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { Cabinet, type CabinetGame } from "../Cabinet.tsx";
import type { GameProps } from "../index.ts";
import { NeedsSound } from "../NeedsSound.tsx";
import { GemTally } from "./Gems.tsx";
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
 *  question; in Split and Read the word is written, so its clip is wanted,
 *  not needed); everything else is fetched too, but a round starts without a
 *  clip that will not come: that tile, or the snail, is silent. If nothing
 *  comes at all the Mac is not there, and starting the round says so. */
const prepare = (config: PlayConfig) => {
  const level = levelById(config.level);
  const words = config.mode === "build" && level ? poolOf(level).map((w) => clipUrl(wordClip(w.id))) : [];
  return preload(words, clipsFor(config));
};

/** Split: the round's gems, counted, out of all its words' sounds. Judged by
 *  the same rule the server used for its score; never stored. */
function Gems({ answers }: { answers: AnswerInput[] }) {
  const of = answers.reduce((n, a) => n + (wordById(a.fact)?.tiles.length ?? 0), 0);
  return <GemTally gems={gemsOf("gems", answers)} of={of} />;
}

/** The words missed in a round, to look at and hear again. In Split, cut into their sounds. */
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
              {mode === "gems" ? (
                <span className="sm-letter flex gap-3" aria-label={word.tiles.join(" ")}>
                  {word.tiles.map((t, i) => (
                    <span key={i}>{t}</span>
                  ))}
                </span>
              ) : (
                <span className="sm-letter">{word.id}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
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
      missed={(answers, config) => (
        <>
          {config.mode === "gems" && <Gems answers={answers} />}
          <Missed answers={answers} mode={config.mode as Mode} />
        </>
      )}
    />
  );
}
