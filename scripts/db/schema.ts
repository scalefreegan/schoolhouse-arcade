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

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
