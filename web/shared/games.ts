// The cabinets on the arcade floor. A game is added here first; its screen
// is registered in web/src/games/index.ts under the same id. An id is
// stored on every play: never rename one once live.

export interface GameInfo {
  id: string;
  title: string;
  /** One line under the title on the cabinet: what you do in it. */
  pitch: string;
  /** What it practises, for the grown-up reading over a shoulder. */
  teaches: string;
  /** `soon` cabinets are shown dark and cannot be started. */
  status: "live" | "soon";
}

export const GAMES: GameInfo[] = [
  {
    id: "comet-cards",
    title: "Comet Cards",
    pitch: "Answer the card before the comet burns out",
    teaches: "Adding and taking away, 0 to 10",
    status: "soon",
  },
];

export function gameById(id: string): GameInfo | undefined {
  return GAMES.find((g) => g.id === id);
}
