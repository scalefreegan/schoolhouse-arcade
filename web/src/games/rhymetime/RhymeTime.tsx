import type { AnswerInput, PlayConfig } from "../../../shared/play.ts";
import { parseAnswer, rhymeTimeRules, rightOf, type Mode, type Skill } from "../../../shared/rhymetime/rules.ts";
import { LEVELS, levelById, rhymes, sayUrl, wordById, type RhymeWord } from "../../../shared/rhymetime/words.ts";
import { preload, say } from "../../speech.ts";
import { Picture } from "../../sprites/Sprite.tsx";
import { useArcade } from "../../state.tsx";
import { Cabinet, type CabinetGame } from "../Cabinet.tsx";
import type { GameProps } from "../index.ts";
import { NeedsSound } from "../NeedsSound.tsx";
import { RoundScreen, Written } from "./Round.tsx";

const GAME: CabinetGame = {
  id: "rhyme-time",
  title: "Rhyme Time",
  rules: rhymeTimeRules,
  first: { level: LEVELS[0].id, mode: "find", skill: "easy" },
  remember: "rhyme-time",
  streak: "Best run",
};

/**
 * Every word a round on this level can show is a clip, and the pictures are
 * nothing without them: a picture is named only by being heard. So a round
 * does not start without its level's words (the screen says so, with a way
 * back and a way to try again), and nothing is waited on for more than the
 * clip limit (speech.ts).
 */
const prepare = (config: PlayConfig) => {
  const level = levelById(config.level);
  return preload((level?.words ?? []).map(sayUrl));
};

/** A missed question on the results: the rhyme it was about, written, to hear again. */
function Missed({ answers, mode }: { answers: AnswerInput[]; mode: Mode }) {
  const missed = answers.flatMap((a) => {
    const read = typeof a.given === "string" ? parseAnswer(mode, a.given) : null;
    const right = read && rightOf(read.question);
    if (!read || !right || read.pick === right) return [];
    const anchor = wordById(a.fact);
    // The rhyme: the call and its rhyme (Find it), or the pair (Odd one out).
    const other = mode === "find" ? wordById(right) : read.question.choices.map((id) => wordById(id)).find((w) => w && anchor && rhymes(w, anchor));
    return anchor && other ? [[anchor, other] as [RhymeWord, RhymeWord]] : [];
  });
  if (!missed.length) return null;
  return (
    <div className="panel mx-auto mt-5 max-w-md">
      <p className="font-display m-0 text-xs text-dim">Rhymes to hear again</p>
      <ul className="mt-2 mb-0 flex list-none flex-wrap justify-center gap-2 p-0">
        {missed.map(([a, b]) => (
          <li key={a.id}>
            <button type="button" className="sm-again rt-again" aria-label={`Hear ${a.id} and ${b.id}`} onClick={() => void say([sayUrl(a), sayUrl(b)], { gap: 0.35 })}>
              <span className="flex gap-2">
                <Picture id={a.picture} size={48} />
                <Picture id={b.picture} size={48} />
              </span>
              <span className="flex gap-3">
                <Written word={a} lit />
                <Written word={b} lit />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Rhyme Time cabinet. The arcade's Cabinet runs it (set up, the server's
 * clock, saving, results); this supplies the round, fetches its words
 * before it starts, and will not start one in silence: rhyme is heard.
 */
export function RhymeTime(props: GameProps) {
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
