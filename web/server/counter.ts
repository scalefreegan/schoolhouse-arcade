import type { IncomingMessage, ServerResponse } from "node:http";
import type { CounterReply, Prize, WonPrize } from "../shared/wire.ts";
import { badgesOf } from "../../scripts/db/badges.ts";
import { findPlayer } from "../../scripts/db/players.ts";
import { listPrizes, wonBy, type HandOver, type PrizeRow } from "../../scripts/db/prizes.ts";
import { balanceOf } from "../../scripts/db/tickets.ts";
import { rawDb } from "./db.ts";
import { HttpError, isUuid, methodNotAllowed, pathSegments, queryParams, sendJson } from "./http.ts";

// /api/counter: the Prize Counter as a player sees it. Read-only: taking a
// prize off the shelf costs real money and lives behind the PIN, in
// /api/grownup.
//   GET /api/counter?player=   tickets, the shelf, badges held, prizes won

export const toPrize = (p: PrizeRow): Prize => ({ id: p.id, name: p.name, icon: p.icon, cost: p.cost, badge: p.badge });
export const toWon = (h: HandOver): WonPrize => ({ id: h.id, name: h.name, icon: h.icon, cost: h.cost, at: h.at.toISOString() });

export async function handleCounter(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (pathSegments(req).length) throw new HttpError(404, "no such route");
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  const db = rawDb();
  const playerId = queryParams(req).get("player");
  if (!isUuid(playerId) || !(await findPlayer(db, playerId))) throw new HttpError(404, "no such player");
  sendJson(res, 200, {
    tickets: await balanceOf(db, playerId),
    prizes: (await listPrizes(db)).map(toPrize),
    badges: (await badgesOf(db, playerId)).map((b) => ({ id: b.badgeId, at: b.earnedAt.toISOString() })),
    won: (await wonBy(db, playerId)).map(toWon),
  } satisfies CounterReply);
}
