import { LEVELS, answerOf, levelById, parseFact } from "../../../shared/comet/facts.ts";
import { cometRules, type Mode, type Skill } from "../../../shared/comet/rules.ts";
import type { AnswerInput } from "../../../shared/play.ts";
import { Cabinet, type CabinetGame } from "../Cabinet.tsx";
import type { GameProps } from "../index.ts";
import { RoundScreen } from "./Round.tsx";

const GAME: CabinetGame = {
  id: "comet-cards",
  title: "Comet Cards",
  rules: cometRules,
  first: { level: LEVELS[0].id, mode: "blitz", skill: "easy" },
  remember: "comet",
};

/** The cards missed in a round, each once, written out with its answer. */
function missedCards(answers: AnswerInput[]): string[] {
  const seen = new Set<string>();
  for (const a of answers) {
    const fact = parseFact(a.fact);
    if (fact && a.given !== answerOf(fact)) seen.add(`${fact.a} ${fact.op} ${fact.b} = ${answerOf(fact)}`);
  }
  return [...seen];
}

function Missed({ answers }: { answers: AnswerInput[] }) {
  const missed = missedCards(answers);
  if (!missed.length) return null;
  return (
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
  );
}

/**
 * The Comet Cards cabinet. The arcade's Cabinet runs it (set up, the
 * server's clock, saving, results); this supplies the round and the cards
 * to try again.
 */
export function CometCards(props: GameProps) {
  return (
    <Cabinet
      {...props}
      game={GAME}
      setup={{ unranked: "No clock and no scores. Fifteen cards to warm up." }}
      round={({ key, config, stats, onDone, onQuit }) => <RoundScreen key={key} level={levelById(config.level)!} mode={config.mode as Mode} skill={config.skill as Skill} stats={stats} onDone={onDone} onQuit={onQuit} />}
      missed={(answers) => <Missed answers={answers} />}
    />
  );
}
