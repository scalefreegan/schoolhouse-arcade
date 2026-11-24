import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lastPlayOf } from "../../scripts/db/plays.ts";
import { addSetting, getSetting } from "../../scripts/db/settings.ts";
import type { Db } from "./db.ts";

// A round's clock: the server's own note of when a round started. The
// browser times each card, and its times are what a round is scored on; the
// server cannot time a card from here. What it can do is time the whole
// round, start to save, on its own clock, and refuse a play whose cards claim
// more time than had passed (POST /api/plays, settlePlay's `admit`). So a
// hand-made play has to wait out the time it claims, as a real one does.
//
// The note is a signed string the browser holds for the round and sends back
// with it, not a row: nothing to clean up, and a server restarted mid-round
// (the Dock app relaunched) still knows its own notes. The key it is signed
// with is made once and kept in the settings table, beside the PIN's hash.
//
// It also names the player's latest stored play when the round started. A
// play is refused if another was stored since: rounds are played one after
// another, so one clock cannot be fetched many times over and spent at once.

const KEY = "round_clock_key";
const VERSION = "c1";

/** Whose round, in which game, under which round id (web/shared/roundid.ts). */
export interface RoundOf {
  playerId: string;
  gameId: string;
  roundId: string;
}

/** What a clock says: when the round started (ms, this server's clock) and
 *  the player's latest play then (0 for none). */
export interface Started {
  at: number;
  after: number;
}

async function signingKey(db: Db): Promise<Buffer> {
  let hex = await getSetting(db, KEY);
  if (hex === null) {
    // Of two first rounds at once, one key is kept; both then read it.
    await addSetting(db, KEY, randomBytes(32).toString("hex"));
    hex = await getSetting(db, KEY);
  }
  return Buffer.from(hex!, "hex");
}

function sign(key: Buffer, r: RoundOf, s: Started): Buffer {
  return createHmac("sha256", key).update([VERSION, r.playerId, r.gameId, r.roundId, s.at, s.after].join("|")).digest();
}

/** A clock for a round starting now. */
export async function startClock(db: Db, round: RoundOf, now = Date.now()): Promise<string> {
  const started: Started = { at: now, after: await lastPlayOf(db, round.playerId) };
  return [VERSION, started.at, started.after, sign(await signingKey(db), round, started).toString("base64url")].join(".");
}

/** What a clock says, or null when it is not one this arcade gave for this
 *  player's round (another player's, another round's, made up, or mangled). */
export async function readClock(db: Db, clock: unknown, round: RoundOf): Promise<Started | null> {
  if (typeof clock !== "string" || clock.length > 200) return null;
  const parts = clock.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION || !/^\d{1,16}$/.test(parts[1]) || !/^\d{1,16}$/.test(parts[2])) return null;
  const started: Started = { at: Number(parts[1]), after: Number(parts[2]) };
  const given = Buffer.from(parts[3], "base64url");
  const want = sign(await signingKey(db), round, started);
  return given.length === want.length && timingSafeEqual(given, want) ? started : null;
}
