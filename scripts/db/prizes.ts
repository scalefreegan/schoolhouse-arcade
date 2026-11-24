// Prizes and hand-overs: the only code that reads or writes those tables.
// Handing a prize over spends tickets, so it goes through the ledger
// (tickets.ts) in the same transaction.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { PrizeFields } from "../../web/shared/prizes.ts";
import { badgesOf } from "./badges.ts";
import { lockPlayer, type Db } from "./players.ts";
import { players, prizes, redemptions } from "./schema.ts";
import { addTickets, balanceOf } from "./tickets.ts";

export interface PrizeRow extends PrizeFields {
  id: string;
}

const columns = { id: prizes.id, name: prizes.name, icon: prizes.icon, cost: prizes.cost, badge: prizes.badge };
const onShelf = isNull(prizes.retiredAt);

/** The shelf, cheapest first. */
export async function listPrizes(db: Db): Promise<PrizeRow[]> {
  return db.select(columns).from(prizes).where(onShelf).orderBy(asc(prizes.cost), asc(prizes.createdAt), asc(prizes.id));
}

export async function createPrize(db: Db, input: PrizeFields): Promise<PrizeRow> {
  const [row] = await db.insert(prizes).values(input).returning(columns);
  return row;
}

/** Change a prize on the shelf. Null when there is none with that id. */
export async function updatePrize(db: Db, id: string, input: PrizeFields): Promise<PrizeRow | null> {
  const [row] = await db.update(prizes).set(input).where(and(eq(prizes.id, id), onShelf)).returning(columns);
  return row ?? null;
}

/** Take a prize off the shelf. Its hand-overs stay. False when there was none. */
export async function retirePrize(db: Db, id: string): Promise<boolean> {
  const rows = await db.update(prizes).set({ retiredAt: sql`now()` }).where(and(eq(prizes.id, id), onShelf)).returning({ id: prizes.id });
  return rows.length > 0;
}

export interface HandOver {
  id: number;
  playerId: string;
  /** The player's name. */
  player: string;
  name: string;
  icon: string;
  cost: number;
  at: Date;
}

const handOver = { id: redemptions.id, playerId: redemptions.playerId, player: players.name, name: redemptions.prizeName, icon: redemptions.prizeIcon, cost: redemptions.cost, at: redemptions.createdAt };

/** The prizes one player has been handed, newest first. */
export async function wonBy(db: Db, playerId: string, limit = 30): Promise<HandOver[]> {
  return db.select(handOver).from(redemptions).innerJoin(players, eq(players.id, redemptions.playerId)).where(eq(redemptions.playerId, playerId)).orderBy(desc(redemptions.id)).limit(limit);
}

/** The latest hand-overs to anyone, newest first. */
export async function recentHandOvers(db: Db, limit = 30): Promise<HandOver[]> {
  return db.select(handOver).from(redemptions).innerJoin(players, eq(players.id, redemptions.playerId)).orderBy(desc(redemptions.id)).limit(limit);
}

/** Why a prize cannot be handed over. `message` is for the screen. */
export class PrizeRefused extends Error {
  why: "gone" | "short" | "badge";
  constructor(why: PrizeRefused["why"], message: string) {
    super(message);
    this.why = why;
  }
}

/**
 * Hand a prize to a player: check they can have it, write the hand-over and
 * take the tickets, all or nothing. The player's row is locked first, so two
 * hand-overs at once cannot both spend the same tickets.
 */
export async function handOverPrize(db: Db, playerId: string, prizeId: string): Promise<{ won: HandOver; tickets: number }> {
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, playerId);
    const [prize] = await tx.select(columns).from(prizes).where(and(eq(prizes.id, prizeId), onShelf));
    if (!player || !prize) throw new PrizeRefused("gone", "That prize is not on the shelf any more.");
    const have = await balanceOf(tx, playerId);
    if (have < prize.cost) throw new PrizeRefused("short", `${prize.name} costs ${prize.cost} tickets. ${player.name} has ${have}.`);
    if (prize.badge && !(await badgesOf(tx, playerId)).some((b) => b.badgeId === prize.badge)) throw new PrizeRefused("badge", `${prize.name} needs a badge ${player.name} has not earned yet.`);
    const [row] = await tx.insert(redemptions).values({ playerId, prizeId, prizeName: prize.name, prizeIcon: prize.icon, cost: prize.cost }).returning({ id: redemptions.id, at: redemptions.createdAt });
    await addTickets(tx, playerId, [{ delta: -prize.cost, reason: "prize", redemptionId: row.id, note: prize.name }]);
    return { won: { id: row.id, playerId, player: player.name, name: prize.name, icon: prize.icon, cost: prize.cost, at: row.at }, tickets: have - prize.cost };
  });
}
