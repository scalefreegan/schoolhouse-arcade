// Badges earned: the only code that reads or writes that table.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { asc, eq } from "drizzle-orm";
import type { Db } from "./players.ts";
import { badgesEarned } from "./schema.ts";

export interface EarnedBadge {
  badgeId: string;
  earnedAt: Date;
}

/** The badges a player holds, oldest first. */
export async function badgesOf(db: Db, playerId: string): Promise<EarnedBadge[]> {
  return db.select({ badgeId: badgesEarned.badgeId, earnedAt: badgesEarned.earnedAt }).from(badgesEarned).where(eq(badgesEarned.playerId, playerId)).orderBy(asc(badgesEarned.earnedAt), asc(badgesEarned.badgeId));
}

/** Give a player badges. One already held is left alone; the ids actually given come back. */
export async function awardBadges(db: Db, playerId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const given = await db
    .insert(badgesEarned)
    .values(ids.map((badgeId) => ({ playerId, badgeId })))
    .onConflictDoNothing()
    .returning({ badgeId: badgesEarned.badgeId });
  return given.map((g) => g.badgeId);
}
