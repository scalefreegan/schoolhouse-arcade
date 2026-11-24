// Plays, answers and stars: the only code that reads or writes those tables.
// Every function says whose rows it means.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import type { BoardKind, PlayConfig, Settled } from "../../web/shared/play.ts";
import type { Db } from "./players.ts";
import { answers, levelStars, players, plays } from "./schema.ts";

/** Which high score table: a game, and one set-up of it. */
export interface BoardKey extends PlayConfig {
  gameId: string;
}

export interface BoardRow {
  playId: number;
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  timeMs: number;
  right: number;
  at: Date;
}

export interface RecordedPlay {
  playId: number;
  /** The level's stars before and after this play. */
  starsBefore: number;
  starsAfter: number;
}

/**
 * Store one settled play: the play, its answers, and the level's stars if
 * this play raised them. One transaction, so a play is never half there.
 */
export async function recordPlay(db: Db, playerId: string, key: BoardKey, s: Settled): Promise<RecordedPlay> {
  return db.transaction(async (tx) => {
    const [{ id: playId }] = await tx
      .insert(plays)
      .values({ playerId, gameId: key.gameId, level: key.level, mode: key.mode, skill: key.skill, score: s.score, rightCount: s.right, wrongCount: s.wrong, bestCombo: s.bestCombo, timeMs: s.timeMs, finished: s.finished, stars: s.stars })
      .returning({ id: plays.id });
    if (s.answers.length) {
      await tx.insert(answers).values(s.answers.map((a) => ({ playId, playerId, gameId: key.gameId, fact: a.fact, given: a.given, correct: a.correct, ms: a.ms })));
    }
    const mine = and(eq(levelStars.playerId, playerId), eq(levelStars.gameId, key.gameId), eq(levelStars.level, key.level));
    const [had] = await tx.select({ stars: levelStars.stars }).from(levelStars).where(mine);
    const starsBefore = had?.stars ?? 0;
    if (s.stars > starsBefore) {
      await tx
        .insert(levelStars)
        .values({ playerId, gameId: key.gameId, level: key.level, stars: s.stars })
        .onConflictDoUpdate({ target: [levelStars.playerId, levelStars.gameId, levelStars.level], set: { stars: sql`greatest(${levelStars.stars}, excluded.stars)`, earnedAt: sql`now()` } });
    }
    return { playId, starsBefore, starsAfter: Math.max(starsBefore, s.stars) };
  });
}

const onBoard = (key: BoardKey) => and(eq(plays.gameId, key.gameId), eq(plays.level, key.level), eq(plays.mode, key.mode), eq(plays.skill, key.skill), eq(plays.finished, true));

/** Best first. Ties go to whoever got there first. */
const boardOrder = (kind: BoardKind) => (kind === "score" ? [desc(plays.score), asc(plays.id)] : [asc(plays.timeMs), asc(plays.id)]);

/** The top of a high score table. A player can hold several places, as on a
 *  real cabinet; a retired player keeps theirs. */
export async function board(db: Db, key: BoardKey, kind: BoardKind, limit = 10): Promise<BoardRow[]> {
  return db
    .select({ playId: plays.id, playerId: plays.playerId, name: players.name, avatar: players.avatar, score: plays.score, timeMs: plays.timeMs, right: plays.rightCount, at: plays.createdAt })
    .from(plays)
    .innerJoin(players, eq(players.id, plays.playerId))
    .where(onBoard(key))
    .orderBy(...boardOrder(kind))
    .limit(limit);
}

/** Where a finished play stands on its table (1 is the top). */
export async function rankOf(db: Db, key: BoardKey, kind: BoardKind, play: { playId: number; score: number; timeMs: number }): Promise<number> {
  const better =
    kind === "score"
      ? or(gt(plays.score, play.score), and(eq(plays.score, play.score), lt(plays.id, play.playId)))
      : or(lt(plays.timeMs, play.timeMs), and(eq(plays.timeMs, play.timeMs), lt(plays.id, play.playId)));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(plays).where(and(onBoard(key), better));
  return n + 1;
}

export interface Best extends PlayConfig {
  /** The player's highest score with this set-up. */
  score: number;
  /** Their fastest time with it, in ms. */
  timeMs: number;
  plays: number;
}

/** A player's best finished play for every set-up of a game they have tried. */
export async function bestsOf(db: Db, playerId: string, gameId: string): Promise<Best[]> {
  return db
    .select({ level: plays.level, mode: plays.mode, skill: plays.skill, score: sql<number>`max(${plays.score})::int`, timeMs: sql<number>`min(${plays.timeMs})::int`, plays: sql<number>`count(*)::int` })
    .from(plays)
    .where(and(eq(plays.playerId, playerId), eq(plays.gameId, gameId), eq(plays.finished, true)))
    .groupBy(plays.level, plays.mode, plays.skill);
}

/** A player's stars per level of a game. */
export async function starsOf(db: Db, playerId: string, gameId: string): Promise<Record<string, number>> {
  const rows = await db.select({ level: levelStars.level, stars: levelStars.stars }).from(levelStars).where(and(eq(levelStars.playerId, playerId), eq(levelStars.gameId, gameId)));
  return Object.fromEntries(rows.map((r) => [r.level, r.stars]));
}

export interface RecentAnswer {
  fact: string;
  correct: boolean;
  ms: number;
}

/** A player's latest answers in a game, newest first. */
export async function recentAnswers(db: Db, playerId: string, gameId: string, limit = 1500): Promise<RecentAnswer[]> {
  return db
    .select({ fact: answers.fact, correct: answers.correct, ms: answers.ms })
    .from(answers)
    .where(and(eq(answers.playerId, playerId), eq(answers.gameId, gameId)))
    .orderBy(desc(answers.id))
    .limit(limit);
}
