// Players: the only code that reads or writes the players table.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";
import { players } from "./schema.ts";

/** The server's pool-backed handle and the tests' PGlite one both fit. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface PlayerRow {
  id: string;
  name: string;
  avatar: string;
  createdAt: Date;
}

const columns = { id: players.id, name: players.name, avatar: players.avatar, createdAt: players.createdAt };

/** Everyone on the picker, in the order they joined. */
export async function listPlayers(db: Db): Promise<PlayerRow[]> {
  return db.select(columns).from(players).where(isNull(players.retiredAt)).orderBy(asc(players.createdAt), asc(players.id));
}

/** One player on the picker, or null (unknown id, or retired). */
export async function findPlayer(db: Db, id: string): Promise<PlayerRow | null> {
  const [row] = await db.select(columns).from(players).where(and(eq(players.id, id), isNull(players.retiredAt)));
  return row ?? null;
}

export async function createPlayer(db: Db, input: { name: string; avatar: string }): Promise<PlayerRow> {
  const [row] = await db.insert(players).values(input).returning(columns);
  return row;
}

/** Change a player's name or character. Null when there is no such player. */
export async function updatePlayer(db: Db, id: string, patch: { name?: string; avatar?: string }): Promise<PlayerRow | null> {
  if (patch.name === undefined && patch.avatar === undefined) return findPlayer(db, id);
  const [row] = await db
    .update(players)
    .set({ ...(patch.name === undefined ? {} : { name: patch.name }), ...(patch.avatar === undefined ? {} : { avatar: patch.avatar }) })
    .where(and(eq(players.id, id), isNull(players.retiredAt)))
    .returning(columns);
  return row ?? null;
}

/**
 * Hold a player's row until the transaction ends, and return it (null for an
 * unknown or retired player). Whatever reads a balance and then spends or
 * pays against it takes this first, so two such changes to one player
 * happen one after the other.
 */
export async function lockPlayer(tx: Db, id: string): Promise<PlayerRow | null> {
  const [row] = await tx.select(columns).from(players).where(and(eq(players.id, id), isNull(players.retiredAt))).for("update");
  return row ?? null;
}

/** Take a player off the picker. Their plays, tickets and high scores stay. False when there was none. */
export async function retirePlayer(db: Db, id: string): Promise<boolean> {
  const rows = await db.update(players).set({ retiredAt: sql`now()` }).where(and(eq(players.id, id), isNull(players.retiredAt))).returning({ id: players.id });
  return rows.length > 0;
}
