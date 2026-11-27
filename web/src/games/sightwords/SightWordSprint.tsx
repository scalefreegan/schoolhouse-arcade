import type { AnswerInput, PlayConfig } from "../../../shared/play.ts";
import { parseAnswer, sightWordRules, type Skill } from "../../../shared/sightwords/rules.ts";
import { LEVELS, levelById, sayUrl, wordById, type SightWord } from "../../../shared/sightwords/words.ts";
import { preload, say } from "../../speech.ts";
import { Sprite } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { Cabinet, type CabinetGame } from "../Cabinet.tsx";
import type { GameProps } from "../index.ts";
import { NeedsSound } from "../NeedsSound.tsx";
import { RoundScreen } from "./Round.tsx";

const GAME: CabinetGame = {
  id: "sight-word-sprint",
  title: "Sight Word Sprint",
  rules: sightWordRules,
  first: { level: LEVELS[0].id, mode: "hear", skill: "easy" },
  remember: "sight-word-sprint",
  streak: "Best run",
};

/**
 * The word is asked by voice alone, so a round does not start without the
 * clips of the words its level asks (the screen says so, with a way back
 * and a way to try again), and nothing is waited on for more than the clip
 * limit (speech.ts). The other words in a grid are only read, never said.
 */
const prepare = (config: PlayConfig) => preload((levelById(config.level)?.words ?? []).map(sayUrl));

/** The words missed, on the results: each written, to hear again. */
function Missed({ answers }: { answers: AnswerInput[] }) {
  const missed = answers.flatMap((a): SightWord[] => {
    const read = typeof a.given === "string" ? parseAnswer(a.given) : null;
    const word = wordById(a.fact);
    return read && word && read.pick !== a.fact ? [word] : [];
  });
  if (!missed.length) return null;
  return (
    <div className="panel mx-auto mt-5 max-w-md">
      <p className="font-display m-0 text-xs text-dim">Words to hear again</p>
      <ul className="mt-2 mb-0 flex list-none flex-wrap justify-center gap-2 p-0">
        {missed.map((w) => (
          <li key={w.id}>
            <button type="button" className="sm-again sw-again" aria-label={`Hear ${w.id}`} onClick={() => void say([sayUrl(w)])}>
              <span className="sm-letter">{w.id}</span>
              <Sprite id="speaker" size={24} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Sight Word Sprint cabinet. The arcade's Cabinet runs it (set up, the
 * server's clock, saving, results); this supplies the round, fetches its
 * words before it starts, and will not start one in silence: the word is
 * heard, not shown. The runner on the trail is the player's own character.
 */
export function SightWordSprint(props: GameProps) {
  const { muted } = useArcade();
  return (
    <Cabinet
      {...props}
      game={GAME}
      prepare={prepare}
      blocked={muted}
      setup={{ levelFace: (l) => <span className="sm-letter text-base">{l.blurb}</span>, ...(muted ? { notice: <NeedsSound /> } : {}) }}
      round={({ key, config, stats, onDone, onQuit }) => <RoundScreen key={key} level={levelById(config.level)!} skill={config.skill as Skill} stats={stats} player={props.player} onDone={onDone} onQuit={onQuit} />}
      missed={(answers) => <Missed answers={answers} />}
    />
  );
}
