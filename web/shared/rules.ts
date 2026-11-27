import { cometRules } from "./comet/rules.ts";
import type { GameRules } from "./play.ts";
import { rhymeTimeRules } from "./rhymetime/rules.ts";
import { sightWordRules } from "./sightwords/rules.ts";
import { soundMachineRules } from "./soundmachine/rules.ts";

// Every live game's rules, by the game's id in shared/games.ts. The server
// scores a play with these; a game with no entry cannot be played for keeps.

export const RULES: Record<string, GameRules> = {
  "comet-cards": cometRules,
  "sound-machine": soundMachineRules,
  "rhyme-time": rhymeTimeRules,
  "sight-word-sprint": sightWordRules,
};
