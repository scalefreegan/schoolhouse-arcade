import type { ComponentType } from "react";
import type { Player } from "../../shared/wire.ts";
import { CometCards } from "./comet/CometCards.tsx";

// The screen for each live cabinet, keyed by the game's id in
// shared/games.ts. A game gets the player and a way back to the floor;
// everything else (levels, modes, its own menus) is the game's business.

export interface GameProps {
  player: Player;
  /** Leave the cabinet for the arcade floor. */
  onExit: () => void;
}

export const GAME_SCREENS: Record<string, ComponentType<GameProps>> = {
  "comet-cards": CometCards,
};
