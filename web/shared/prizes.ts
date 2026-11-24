// What a prize on the Prize Counter's shelf may be. Shared so the server
// refuses what the browser cannot draw. Pure, and run by Node as is.

import { badgeById } from "./badges.ts";

/** The pictures a prize can have: sprite ids in web/src/sprites/art.ts.
 *  One is stored on every prize: never rename one. */
export const PRIZE_ICONS: string[] = ["candy", "icecream", "gamepad", "gift", "pizza", "book", "ball", "popcorn"];

export const PRIZE_NAME_MAX = 24;
export const PRIZE_COST_MAX = 100_000;
/** More prizes than this is a stuck button, not a shelf. */
export const MAX_PRIZES = 12;
/** The most tickets a grown-up can add or take away in one go. */
export const ADJUST_MAX = 10_000;
export const NOTE_MAX = 60;

export interface PrizeFields {
  name: string;
  icon: string;
  /** Tickets. */
  cost: number;
  /** A badge that must be held as well, or null. */
  badge: string | null;
}

/** A prize as it would be stored, or a sentence saying what is wrong with it. */
export function cleanPrize(raw: Partial<Record<keyof PrizeFields, unknown>>): PrizeFields | string {
  const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim() : "";
  if (!name || [...name].length > PRIZE_NAME_MAX) return `A prize needs a name of 1 to ${PRIZE_NAME_MAX} letters.`;
  if (typeof raw.icon !== "string" || !PRIZE_ICONS.includes(raw.icon)) return "Pick one of the pictures.";
  if (typeof raw.cost !== "number" || !Number.isInteger(raw.cost) || raw.cost < 1 || raw.cost > PRIZE_COST_MAX) return `A prize costs 1 to ${PRIZE_COST_MAX} tickets.`;
  const badge = raw.badge === undefined || raw.badge === null || raw.badge === "" ? null : raw.badge;
  if (badge !== null && (typeof badge !== "string" || !badgeById(badge))) return "There is no such badge.";
  return { name, icon: raw.icon, cost: raw.cost, badge };
}

/** A grown-up PIN: exactly four digits. */
export const PIN_RE = /^[0-9]{4}$/;
