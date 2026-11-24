// Tickets: the only code that reads or writes the ticket ledger. A balance
// is the sum of a player's rows; rows are only ever added.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { desc, eq, sql } from "drizzle-orm";
import type { TicketReason } from "../../web/shared/tickets.ts";
import type { Db } from "./players.ts";
import { players, ticketEvents } from "./schema.ts";

export interface TicketEntry {
  /** Positive is earned, negative is spent or taken away. */
  delta: number;
  reason: TicketReason;
  playId?: number;
  redemptionId?: number;
  note?: string;
}

/** How many tickets a player has. */
export async function balanceOf(db: Db, playerId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`coalesce(sum(${ticketEvents.delta}), 0)::int` }).from(ticketEvents).where(eq(ticketEvents.playerId, playerId));
  return n;
}

/** Everyone's balance, by player id (a player with no rows is absent). */
export async function balances(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ playerId: ticketEvents.playerId, n: sql<number>`sum(${ticketEvents.delta})::int` }).from(ticketEvents).groupBy(ticketEvents.playerId);
  return Object.fromEntries(rows.map((r) => [r.playerId, r.n]));
}

/** Write rows to a player's ledger. A row worth nothing is not written. */
export async function addTickets(db: Db, playerId: string, entries: TicketEntry[]): Promise<void> {
  const rows = entries.filter((e) => e.delta !== 0).map((e) => ({ playerId, delta: e.delta, reason: e.reason, playId: e.playId ?? null, redemptionId: e.redemptionId ?? null, note: e.note ?? null }));
  if (rows.length) await db.insert(ticketEvents).values(rows);
}

export interface LedgerRow {
  id: number;
  playerId: string;
  name: string;
  delta: number;
  reason: string;
  note: string | null;
  at: Date;
}

/** The latest ledger rows across every player, newest first: what a grown-up reads. */
export async function recentLedger(db: Db, limit = 40): Promise<LedgerRow[]> {
  return db
    .select({ id: ticketEvents.id, playerId: ticketEvents.playerId, name: players.name, delta: ticketEvents.delta, reason: ticketEvents.reason, note: ticketEvents.note, at: ticketEvents.createdAt })
    .from(ticketEvents)
    .innerJoin(players, eq(players.id, ticketEvents.playerId))
    .orderBy(desc(ticketEvents.id))
    .limit(limit);
}
