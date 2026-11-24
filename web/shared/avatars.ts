// The characters a player can be. Shared so the server refuses an avatar the
// client cannot draw; the pixels themselves are in web/src/sprites/art.ts,
// keyed by the same ids. An id is stored on the player's row: never rename
// one once live (add a new one instead).

export interface Avatar {
  id: string;
  /** The character's own name, shown under it in the picker. */
  name: string;
  /** Which drawing it uses, and which colours (web/src/sprites/art.ts). */
  sprite: "alien" | "dino" | "robot" | "monster";
  palette: string;
}

export const AVATARS: Avatar[] = [
  { id: "zib", name: "Zib", sprite: "alien", palette: "lime" },
  { id: "rex", name: "Rex", sprite: "dino", palette: "moss" },
  { id: "bolt", name: "Bolt", sprite: "robot", palette: "steel" },
  { id: "fuzz", name: "Fuzz", sprite: "monster", palette: "grape" },
  { id: "nova", name: "Nova", sprite: "alien", palette: "rose" },
  { id: "dash", name: "Dash", sprite: "dino", palette: "ember" },
  { id: "gizmo", name: "Gizmo", sprite: "robot", palette: "brass" },
  { id: "blip", name: "Blip", sprite: "monster", palette: "tide" },
];

export const AVATAR_IDS: string[] = AVATARS.map((a) => a.id);

export function avatarById(id: string): Avatar {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** A player's name as it is stored: trimmed, inner whitespace collapsed. */
export const PLAYER_NAME_MAX = 10;

export function cleanPlayerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || [...name].length > PLAYER_NAME_MAX) return null;
  return name;
}
