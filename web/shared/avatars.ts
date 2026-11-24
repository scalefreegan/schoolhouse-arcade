// The characters a player can be, and the colours each comes in. Shared so
// the server refuses a character or a colour the client cannot draw; the
// pixels themselves are in web/src/sprites/art.ts, keyed by the same
// drawing ids and colour ids. A player's row stores a character id
// (`avatar`) and a colour id (`colour`, null for the character's own look):
// never rename either once live (add a new one instead).

/** The drawings a character can be (sprite ids in art.ts). */
export type Drawing = "alien" | "dino" | "robot" | "monster" | "wizard" | "dragon" | "cat" | "owl" | "frog" | "ghost" | "rocketship" | "cupcake";

export interface Character {
  id: string;
  /** The character's own name, shown under it in the picker. */
  name: string;
  /** Which drawing it is. */
  sprite: Drawing;
  /** The colours it comes in: palette names of its drawing. The first is its own look. */
  colours: readonly string[];
}

/** The picker, in its rows of four. */
export const CHARACTERS: Character[] = [
  { id: "zib", name: "Zib", sprite: "alien", colours: ["green", "pink", "blue", "orange", "purple", "gold"] },
  { id: "rex", name: "Rex", sprite: "dino", colours: ["green", "orange", "blue", "purple", "pink", "teal"] },
  { id: "bolt", name: "Bolt", sprite: "robot", colours: ["silver", "gold", "red", "blue", "green", "pink"] },
  { id: "fuzz", name: "Fuzz", sprite: "monster", colours: ["purple", "blue", "gold", "orange", "pink", "red"] },
  { id: "fenn", name: "Fenn", sprite: "wizard", colours: ["blue", "purple", "red", "green", "teal", "pink"] },
  { id: "toast", name: "Toast", sprite: "dragon", colours: ["red", "green", "blue", "purple", "gold", "teal"] },
  { id: "peeka", name: "Peeka", sprite: "ghost", colours: ["white", "blue", "pink", "green", "purple", "gold"] },
  { id: "orbit", name: "Orbit", sprite: "rocketship", colours: ["red", "blue", "green", "purple", "orange", "pink"] },
  { id: "mitts", name: "Mitts", sprite: "cat", colours: ["orange", "grey", "white", "brown", "pink", "blue"] },
  { id: "tawny", name: "Tawny", sprite: "owl", colours: ["brown", "white", "grey", "blue", "purple", "pink"] },
  { id: "puddle", name: "Puddle", sprite: "frog", colours: ["green", "blue", "red", "gold", "purple", "orange"] },
  { id: "crumb", name: "Crumb", sprite: "cupcake", colours: ["pink", "white", "brown", "blue", "green", "purple"] },
];

/**
 * Ids from before colours: each was one character in one colour. Rows that
 * hold one still draw exactly as they did; the picker no longer offers them.
 */
export const LEGACY_AVATARS: { id: string; name: string; character: string; colour: string }[] = [
  { id: "nova", name: "Nova", character: "zib", colour: "pink" },
  { id: "dash", name: "Dash", character: "rex", colour: "orange" },
  { id: "gizmo", name: "Gizmo", character: "bolt", colour: "gold" },
  { id: "blip", name: "Blip", character: "fuzz", colour: "blue" },
];

/** Every id a player's row may hold. */
export const AVATAR_IDS: string[] = [...CHARACTERS, ...LEGACY_AVATARS].map((a) => a.id);

/** A colour's name, for a screen reader. */
export const COLOUR_NAMES: Record<string, string> = {
  green: "Green",
  pink: "Pink",
  blue: "Blue",
  orange: "Orange",
  purple: "Purple",
  gold: "Gold",
  teal: "Teal",
  red: "Red",
  silver: "Silver",
  white: "White",
  grey: "Grey",
  brown: "Brown",
};

export function characterById(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** What a player looks like: a character, in one of its colours. */
export interface Look {
  character: Character;
  colour: string;
}

/**
 * The look of a stored (avatar, colour). An old id is its character in its
 * colour; a colour the character lacks, or none, is its own look; an id this
 * version does not know draws the first character rather than nothing.
 */
export function lookOf(avatar: string, colour: string | null = null): Look {
  const legacy = LEGACY_AVATARS.find((a) => a.id === avatar);
  const character = characterById(legacy?.character ?? avatar) ?? CHARACTERS[0];
  const wanted = legacy?.colour ?? colour;
  return { character, colour: wanted && character.colours.includes(wanted) ? wanted : character.colours[0] };
}

/**
 * The colour a player may be stored with: null (its own look), or one of
 * that character's colours. An old id has its colour already and takes none.
 * Undefined when the colour is not one this character comes in.
 */
export function colourFor(avatar: string, colour: unknown): string | null | undefined {
  if (colour === undefined || colour === null) return null;
  const character = characterById(avatar);
  return typeof colour === "string" && character?.colours.includes(colour) ? colour : undefined;
}

/** A player's name as it is stored: trimmed, inner whitespace collapsed. */
export const PLAYER_NAME_MAX = 10;

export function cleanPlayerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || [...name].length > PLAYER_NAME_MAX) return null;
  return name;
}
