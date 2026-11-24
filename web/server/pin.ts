import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { PIN_RE } from "../shared/prizes.ts";
import type { ErrorCode } from "../shared/wire.ts";
import { addSetting, getSetting, setSetting } from "../../scripts/db/settings.ts";
import type { Db } from "./db.ts";
import { HttpError } from "./http.ts";

// The grown-up PIN: four digits between a six-year-old and anything that
// costs real money. It is stored only as a salted scrypt hash, sent on every
// request that needs it (the X-Grownup-Pin header) and checked here every
// time; the browser is never told "you are a grown-up now".
//
// Four digits is ten thousand guesses, so the guard below matters more than
// the hash: after a few wrong tries in a row nobody can try at all for a
// minute. It keeps a child out; it is not a safe.

const KEY = "grownup_pin";
export const PIN_HEADER = "x-grownup-pin";

/** Wrong tries in a row before the lock, and how long it lasts. */
export const MAX_TRIES = 5;
export const LOCK_MS = 60_000;

const guard = { fails: 0, lockedUntil: 0 };

/** Forget the wrong tries (tests). */
export function resetPinGuard(): void {
  guard.fails = 0;
  guard.lockedUntil = 0;
}

/** The hash to store for a PIN someone typed. Anything but four digits is refused. */
function hashPin(pin: unknown): string {
  if (typeof pin !== "string" || !PIN_RE.test(pin)) throw new HttpError(400, "A PIN is four digits.");
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pin, salt, 32).toString("hex")}`;
}

function matches(pin: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  return timingSafeEqual(scryptSync(pin, Buffer.from(salt, "hex"), want.length), want);
}

export async function pinIsSet(db: Db): Promise<boolean> {
  return (await getSetting(db, KEY)) !== null;
}

const refuse = (status: number, message: string, code: ErrorCode) => new HttpError(status, message, code);

/**
 * Choose the first PIN. There is no old one to ask for, so where the request
 * was made stands in for it: `atMac` is origin.ts atThisMac. A PIN that
 * appeared in the meantime stays; it is never replaced from here.
 */
export async function setFirstPin(db: Db, atMac: boolean, pin: unknown): Promise<void> {
  if (!atMac) throw refuse(403, "A grown-up chooses the PIN on the Mac.", "pin_at_mac");
  if (!(await addSetting(db, KEY, hashPin(pin)))) throw refuse(409, "There is a PIN already.", "pin_taken");
  resetPinGuard();
}

/** Change the PIN. The caller has already checked the old one. */
export async function changePin(db: Db, pin: unknown): Promise<void> {
  await setSetting(db, KEY, hashPin(pin));
  resetPinGuard();
}

/**
 * Let the request through only if it carries the grown-up PIN. Throws 401
 * (no PIN chosen yet, or the wrong one) or 429 (locked after too many wrong
 * tries). `now` is the clock, for the tests.
 */
export async function requirePin(db: Db, req: IncomingMessage, now: number = Date.now()): Promise<void> {
  const stored = await getSetting(db, KEY);
  if (stored === null) throw refuse(401, "There is no grown-up PIN yet.", "pin_unset");
  if (now < guard.lockedUntil) throw refuse(429, `Too many wrong tries. Wait ${Math.ceil((guard.lockedUntil - now) / 1000)} seconds.`, "pin_locked");
  const sent = req.headers[PIN_HEADER];
  if (typeof sent === "string" && PIN_RE.test(sent) && matches(sent, stored)) {
    guard.fails = 0;
    return;
  }
  // A request with no PIN at all is a question ("is one needed?"), not a guess.
  if (sent !== undefined && ++guard.fails >= MAX_TRIES) {
    guard.fails = 0;
    guard.lockedUntil = now + LOCK_MS;
    throw refuse(429, `Too many wrong tries. Wait ${LOCK_MS / 1000} seconds.`, "pin_locked");
  }
  throw refuse(401, "That is not the grown-up PIN.", "pin_wrong");
}
