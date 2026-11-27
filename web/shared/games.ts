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
  /** The drawing on its screen on the floor (web/src/sprites/art.ts). */
  sprite: string;
  /** `soon` cabinets are shown dark and cannot be started. */
  status: "live" | "soon";
}

export const GAMES: GameInfo[] = [
  {
    id: "comet-cards",
    title: "Comet Cards",
    pitch: "Answer the card before the comet burns out",
    teaches: "Adding and taking away, 0 to 10",
    sprite: "comet",
    status: "live",
  },
  {
    id: "sound-machine",
    title: "Sound Machine",
    pitch: "Put the sounds in and make the word",
    teaches: "Letter sounds, ch ck sh th, and sounding out",
    sprite: "machine",
    status: "live",
  },
  {
    id: "rhyme-time",
    title: "Rhyme Time",
    pitch: "Listen, and find the word that rhymes",
    teaches: "Hearing rhyme: cat, hat, bat",
    sprite: "jukebox",
    status: "live",
  },
  {
    id: "sight-word-sprint",
    title: "Sight Word Sprint",
    pitch: "Hear the word, tap it, and run faster",
    teaches: "Words to know on sight: the, said, where",
    sprite: "trail",
    status: "live",
  },
  {
    id: "word-families",
    title: "Word Families",
    pitch: "Keep the ending, change the first sound",
    teaches: "Word families: cat, bat, hat",
    sprite: "house",
    status: "live",
  },
];

export function gameById(id: string): GameInfo | undefined {
  return GAMES.find((g) => g.id === id);
}
