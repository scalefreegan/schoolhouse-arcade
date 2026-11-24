// The whole database schema, shared by the dev server (web/server/db.ts),
// the setup CLI and the tests. drizzle-kit diffs this file against the last
// snapshot to write the SQL under ./migrations, which is what actually
// reaches a database; this file is never executed against one.
//
// Erasable TypeScript only (no enums, namespaces or parameter properties):
// Node runs it by stripping types, so `node --test` imports it directly.
//
// There are no logins. A player is a row picked on the "Who is playing?"
// screen, and every personal row hangs off it. Game ids, level ids and
// avatar ids are the ones in web/shared/, which is why they must never
// change once live.

import { bigint, bigserial, boolean, index, integer, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Who plays. `avatar` is an id from web/shared/avatars.ts. A retired
 *  player keeps their rows (and their place on the high score tables) but
 *  leaves the picker. */
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  retiredAt: tz("retired_at"),
});

/**
 * One finished round of a game. Every number here was worked out by the
 * server from the play's answers with the game's rules (web/shared/rules.ts);
 * none came from the browser. `level`, `mode` and `skill` are the game's own
 * ids. The high score tables are queries over this table.
 */
export const plays = pgTable(
  "plays",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    level: text("level").notNull(),
    mode: text("mode").notNull(),
    skill: text("skill").notNull(),
    score: integer("score").notNull(),
    rightCount: integer("right_count").notNull(),
    wrongCount: integer("wrong_count").notNull(),
    bestCombo: integer("best_combo").notNull(),
    /** The round's time as its mode counts it, in ms. */
    timeMs: integer("time_ms").notNull(),
    /** The round ran to its end; only a finished play is ranked. */
    finished: boolean("finished").notNull(),
    /** Stars this play earned for its level (0-3). */
    stars: smallint("stars").notNull().default(0),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("plays_board").on(t.gameId, t.level, t.mode, t.skill, t.score), index("plays_player").on(t.playerId, t.gameId, t.createdAt)],
);

/**
 * Every answer of every play: what was asked, what was answered and how
 * long it took. The raw material for which card comes next (a fact missed
 * lately is dealt more often) and for anything a grown-up wants to see.
 */
export const answers = pgTable(
  "answers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    playId: bigint("play_id", { mode: "number" })
      .notNull()
      .references(() => plays.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    /** In the game's notation: "7+5". */
    fact: text("fact").notNull(),
    /** Null when the card timed out. */
    given: integer("given"),
    correct: boolean("correct").notNull(),
    ms: integer("ms").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("answers_player_fact").on(t.playerId, t.gameId, t.fact, t.id)],
);

/** The most stars a player has earned on each level. Only ever goes up. */
export const levelStars = pgTable(
  "level_stars",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    level: text("level").notNull(),
    stars: smallint("stars").notNull(),
    earnedAt: tz("earned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.gameId, t.level] })],
);
