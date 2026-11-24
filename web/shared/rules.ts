import { cometRules } from "./comet/rules.ts";
import type { GameRules } from "./play.ts";

// Every live game's rules, by the game's id in shared/games.ts. The server
// scores a play with these; a game with no entry cannot be played for keeps.

export const RULES: Record<string, GameRules> = {
  "comet-cards": cometRules,
};
