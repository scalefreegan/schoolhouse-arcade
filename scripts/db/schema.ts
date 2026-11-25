// The whole database schema, shared by the dev server (web/server/db.ts),
// the setup CLI and the tests. drizzle-kit diffs this file against the last
// snapshot to write the SQL under ./migrations, which is what actually
// reaches a database; this file is never executed against one.
//
// Erasable TypeScript only (no enums, namespaces or parameter properties):
// Node runs it by stripping types, so `node --test` imports it directly.
//
// There are no logins. A player is a row picked on the "Who is playing?"
// screen, and every personal row hangs off it. Game ids, level ids, avatar
// ids and colour ids are the ones in web/shared/, which is why they must
// never change once live.

import { bigint, bigserial, boolean, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Who plays. `avatar` is a character id from web/shared/avatars.ts and
 *  `colour` one of its colours (null: the character's own look; always null
 *  for the ids from before colours, which have their own). A retired
 *  player keeps their rows (and their place on the high score tables) but
 *  leaves the picker. */
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  colour: text("colour"),
  createdAt: tz("created_at").notNull().defaultNow(),
  retiredAt: tz("retired_at"),
});

/**
 * One finished round of a game. Every number here was worked out by the
 * server from the play's answers with the game's rules (web/shared/rules.ts);
 * none came from the browser. `level`, `mode` and `skill` are the game's own
 * ids. The high score tables are queries over this table.
 * `round_id` is the id the browser gave the round, the same on every try at
 * saving it: unique per player, so a round sent twice is stored and paid
 * once. Null only on plays from before there was one.
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
    roundId: uuid("round_id"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("plays_board").on(t.gameId, t.level, t.mode, t.skill, t.score), index("plays_player").on(t.playerId, t.gameId, t.createdAt), uniqueIndex("plays_round").on(t.playerId, t.roundId)],
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
    /** A number answered (Comet Cards). Null when the card timed out, and
     *  for a game whose answers are not numbers. */
    given: integer("given"),
    /** An answer that is text: the word picked, or the tiles placed
     *  ("ch-i-ck"), in Sound Machine. Null for a game that answers in numbers. */
    givenText: text("given_text"),
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

/**
 * Every change to a player's tickets, as a ledger: a balance is the sum of
 * `delta`. Tickets are worth real prizes, so nothing here is ever updated or
 * deleted; a mistake is corrected with another row.
 * `reason` is a TicketReason (web/shared/tickets.ts):
 *   play    earned by a round (`play_id`)
 *   best    that round beat the player's own best
 *   star    that round won a star
 *   badge   a badge's bonus (`note` is the badge id; `play_id` the round that won it)
 *   prize   spent on a prize (`redemption_id`), negative
 *   adjust  a grown-up added or removed them by hand (`note` says why)
 */
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    playId: bigint("play_id", { mode: "number" }).references(() => plays.id, { onDelete: "set null" }),
    redemptionId: bigint("redemption_id", { mode: "number" }).references(() => redemptions.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("ticket_events_player").on(t.playerId, t.id)],
);

/** The badges a player holds (ids in web/shared/badges.ts). Earned once, never taken away. */
export const badgesEarned = pgTable(
  "badges_earned",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    badgeId: text("badge_id").notNull(),
    earnedAt: tz("earned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.badgeId] })],
);

/**
 * What is on the Prize Counter's shelf: a real-world reward a grown-up has
 * promised. `icon` is a sprite id. `badge`, when set, must be held as well
 * as the tickets. A removed prize is retired, not deleted: the hand-overs
 * that point at it stay readable.
 */
export const prizes = pgTable("prizes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  cost: integer("cost").notNull(),
  badge: text("badge"),
  createdAt: tz("created_at").notNull().defaultNow(),
  retiredAt: tz("retired_at"),
});

/** A prize handed over: who, what, and what it cost on the day (the prize
 *  may be repriced or renamed later). */
export const redemptions = pgTable(
  "redemptions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    prizeId: uuid("prize_id")
      .notNull()
      .references(() => prizes.id),
    prizeName: text("prize_name").notNull(),
    prizeIcon: text("prize_icon").notNull(),
    cost: integer("cost").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("redemptions_player").on(t.playerId, t.id)],
);

/** A level a grown-up opened by hand, ahead of the star that would open it. */
export const levelOpens = pgTable(
  "level_opens",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    level: text("level").notNull(),
    openedAt: tz("opened_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.gameId, t.level] })],
);

/** The arcade's own few settings. Today one: the grown-up PIN's hash (`grownup_pin`). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});
