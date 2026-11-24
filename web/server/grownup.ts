import type { IncomingMessage, ServerResponse } from "node:http";
import { gameById } from "../shared/games.ts";
import { openLevels } from "../shared/play.ts";
import { ADJUST_MAX, MAX_PRIZES, NOTE_MAX, cleanPrize, type PrizeFields } from "../shared/prizes.ts";
import { RULES } from "../shared/rules.ts";
import type { AdjustRequest, GrownupPlayer, GrownupReply, LevelState, OpenLevelRequest, PinState, RedeemReply, RedeemRequest } from "../shared/wire.ts";
import { findPlayer, listPlayers, lockPlayer, retirePlayer } from "../../scripts/db/players.ts";
import { openLevel, opensOf, starsOf } from "../../scripts/db/plays.ts";
import { PrizeRefused, createPrize, handOverPrize, listPrizes, recentHandOvers, retirePrize, updatePrize } from "../../scripts/db/prizes.ts";
import { addTickets, balanceOf, balances, recentLedger } from "../../scripts/db/tickets.ts";
import { toPrize, toWon } from "./counter.ts";
import { rawDb, type Db } from "./db.ts";
import { HttpError, isUuid, methodNotAllowed, pathSegments, readJsonBody, sendJson } from "./http.ts";
import { pinIsSet, requirePin, setPin } from "./pin.ts";
import { toPlayer } from "./players.ts";

// /api/grownup: everything that costs real money or overrides the game.
// Every route here needs the grown-up PIN on the request (web/server/pin.ts),
// with two exceptions that could not: asking whether a PIN exists, and
// choosing the first one.
//   GET    /api/grownup/pin            is a PIN set?            (no PIN)
//   POST   /api/grownup/pin            choose it; change it     (no PIN the first time)
//   GET    /api/grownup                players, prizes, hand-overs, the ledger
//   POST   /api/grownup/redeem         hand a prize over and take the tickets
//   POST   /api/grownup/prizes         a new prize
//   PATCH  /api/grownup/prizes/<id>    change one
//   DELETE /api/grownup/prizes/<id>    take one off the shelf
//   POST   /api/grownup/tickets        add or take away tickets, with a note
//   POST   /api/grownup/levels         open a level early
//   DELETE /api/grownup/players/<id>   retire a player

function prizeFrom(body: Partial<PrizeFields>): PrizeFields {
  const prize = cleanPrize(body);
  if (typeof prize === "string") throw new HttpError(400, prize);
  return prize;
}

async function playerIn(db: Db, id: unknown): Promise<string> {
  if (!isUuid(id) || !(await findPlayer(db, id))) throw new HttpError(404, "no such player");
  return id;
}

async function levelsOf(db: Db, playerId: string): Promise<LevelState[]> {
  const out: LevelState[] = [];
  for (const [gameId, rules] of Object.entries(RULES)) {
    const stars = await starsOf(db, playerId, gameId);
    const open = openLevels(rules.levels, stars, await opensOf(db, playerId, gameId));
    for (const l of rules.levels) out.push({ gameId, game: gameById(gameId)?.title ?? gameId, level: l.id, title: l.title, stars: stars[l.id] ?? 0, open: open.includes(l.id) });
  }
  return out;
}

async function everything(db: Db): Promise<GrownupReply> {
  const tickets = await balances(db);
  const players: GrownupPlayer[] = [];
  for (const p of await listPlayers(db)) players.push({ ...toPlayer(p), tickets: tickets[p.id] ?? 0, levels: await levelsOf(db, p.id) });
  return {
    players,
    prizes: (await listPrizes(db)).map(toPrize),
    handed: (await recentHandOvers(db)).map((h) => ({ ...toWon(h), playerId: h.playerId, player: h.player })),
    ledger: (await recentLedger(db)).map((l) => ({ id: l.id, playerId: l.playerId, name: l.name, delta: l.delta, reason: l.reason, note: l.note, at: l.at.toISOString() })),
  };
}

async function redeem(db: Db, body: Partial<RedeemRequest>): Promise<RedeemReply> {
  const playerId = await playerIn(db, body.playerId);
  if (!isUuid(body.prizeId)) throw new HttpError(404, "no such prize");
  try {
    const { won, tickets } = await handOverPrize(db, playerId, body.prizeId);
    return { tickets, won: toWon(won) };
  } catch (e) {
    if (e instanceof PrizeRefused) throw new HttpError(e.why === "gone" ? 404 : 409, e.message);
    throw e;
  }
}

/** Add or take away tickets by hand. A balance never goes below nothing. */
async function adjust(db: Db, body: Partial<AdjustRequest>): Promise<{ tickets: number }> {
  const playerId = await playerIn(db, body.playerId);
  const delta = body.delta;
  if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > ADJUST_MAX) throw new HttpError(400, `Add or take away 1 to ${ADJUST_MAX} tickets.`);
  const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim() : "";
  if ([...note].length > NOTE_MAX) throw new HttpError(400, `Keep the note to ${NOTE_MAX} letters.`);
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, playerId);
    if (!player) throw new HttpError(404, "no such player");
    const have = await balanceOf(tx, playerId);
    if (have + delta < 0) throw new HttpError(409, `${player.name} only has ${have} tickets.`);
    await addTickets(tx, playerId, [{ delta, reason: "adjust", ...(note ? { note } : {}) }]);
    return { tickets: have + delta };
  });
}

async function open(db: Db, body: Partial<OpenLevelRequest>): Promise<{ levels: LevelState[] }> {
  const playerId = await playerIn(db, body.playerId);
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const rules = Object.hasOwn(RULES, gameId) ? RULES[gameId] : undefined;
  if (!rules || !rules.levels.some((l) => l.id === body.level)) throw new HttpError(404, "no such level");
  await openLevel(db, playerId, gameId, body.level as string);
  return { levels: await levelsOf(db, playerId) };
}

export async function handleGrownup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = rawDb();
  const [what, id, ...rest] = pathSegments(req);
  if (rest.length) throw new HttpError(404, "no such route");

  if (what === "pin" && id === undefined) {
    if (req.method === "GET") return sendJson(res, 200, { set: await pinIsSet(db) } satisfies PinState);
    if (req.method !== "POST") return methodNotAllowed(res, "GET, POST");
    // Changing the PIN needs the PIN. Choosing the first one cannot.
    if (await pinIsSet(db)) await requirePin(db, req);
    await setPin(db, (await readJsonBody<{ pin?: unknown }>(req)).pin);
    return sendJson(res, 200, { set: true } satisfies PinState);
  }

  // Past here, nothing happens without the PIN.
  await requirePin(db, req);

  if (what === undefined) {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    return sendJson(res, 200, await everything(db));
  }
  if (what === "prizes" && id === undefined) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    const prize = prizeFrom(await readJsonBody(req));
    if ((await listPrizes(db)).length >= MAX_PRIZES) throw new HttpError(409, `The shelf holds ${MAX_PRIZES} prizes. Take one off to make room.`);
    return sendJson(res, 201, toPrize(await createPrize(db, prize)));
  }
  if (what === "prizes") {
    if (!isUuid(id)) throw new HttpError(404, "no such prize");
    if (req.method === "DELETE") {
      if (!(await retirePrize(db, id))) throw new HttpError(404, "no such prize");
      return sendJson(res, 200, { ok: true });
    }
    if (req.method !== "PATCH") return methodNotAllowed(res, "PATCH, DELETE");
    const row = await updatePrize(db, id, prizeFrom(await readJsonBody(req)));
    if (!row) throw new HttpError(404, "no such prize");
    return sendJson(res, 200, toPrize(row));
  }
  if (what === "players" && id !== undefined) {
    if (req.method !== "DELETE") return methodNotAllowed(res, "DELETE");
    if (!isUuid(id) || !(await retirePlayer(db, id))) throw new HttpError(404, "no such player");
    return sendJson(res, 200, { ok: true });
  }
  if (id !== undefined || (what !== "redeem" && what !== "tickets" && what !== "levels")) throw new HttpError(404, "no such route");
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const body = await readJsonBody<Record<string, unknown>>(req);
  if (what === "redeem") return sendJson(res, 201, await redeem(db, body));
  if (what === "tickets") return sendJson(res, 201, await adjust(db, body));
  return sendJson(res, 201, await open(db, body));
}
