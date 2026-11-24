# What is stored where

Schoolhouse Arcade keeps who plays and what they have earned in a local
Postgres 17 database, `schoolhouse_arcade`. Game ids, level ids and avatar
ids come from `web/shared/` and are the keys the database uses, which is why
an id never changes once live. Mirrors Lean Into It's `docs/DATA.md`.

| What | Where | Tracked by git |
|---|---|---|
| The games' rules, the avatars, the sprites | `web/shared/`, `web/src/sprites/` | yes |
| Players; every play and every answer in it; stars per level; tickets, badges, prizes and hand-overs; the grown-up PIN's hash | Postgres `schoolhouse_arcade` | no |
| `DATABASE_URL`, local overrides | `.env.local` | no |
| Which player this device is, whether sound is off, the set-up each player used last | the browser's localStorage (`arcade.player`, `arcade.muted`, `arcade.comet.setup.<player>`) | no, and not in the database |

## The tables

| Table | One row is | Written by |
|---|---|---|
| `players` | someone on the "Who is playing?" screen | `scripts/db/players.ts` |
| `plays` | one finished round, scored by the server | `scripts/db/plays.ts` |
| `answers` | one card of a play: the fact, what was answered, how long it took | `scripts/db/plays.ts` |
| `level_stars` | the most stars a player has on one level | `scripts/db/plays.ts` |
| `level_opens` | a level a grown-up opened early for a player | `scripts/db/plays.ts` |
| `ticket_events` | one change to a player's tickets: earned, spent, or adjusted by hand | `scripts/db/tickets.ts` |
| `badges_earned` | a badge a player holds | `scripts/db/badges.ts` |
| `prizes` | a prize on the shelf (a removed one is retired, not deleted) | `scripts/db/prizes.ts` |
| `redemptions` | a prize handed over, with its name and price on the day | `scripts/db/prizes.ts` |
| `settings` | one of the arcade's own settings; today only the PIN's hash | `scripts/db/settings.ts` |

The high score tables are queries over `plays`. Which card comes next is
worked out from a player's latest `answers`.

**Tickets are a ledger.** A balance is the sum of a player's
`ticket_events`; rows are added and never changed or deleted, so every
ticket can be traced to the round, badge, prize or grown-up that moved it. A
mistake is put right with another row (Grown-ups → Tickets).

Migration `0002_prizes` also puts the three example prizes on the shelf.

`npm run pin:reset` forgets the grown-up PIN (and nothing else). The next
one is chosen on the Mac, like the first.

## Setup

Once per machine:

```sh
brew install postgresql@17 && brew services start postgresql@17
npm install && npm --prefix web install
npm run db:setup     # creates the database if missing, applies every migration
```

`npm run dev` checks the database before it starts and stops with what to
run if it is missing, down or behind.

## Changing the schema

1. Edit `scripts/db/schema.ts`.
2. `npm run db:generate -- --name <what_changed>` writes the next SQL file
   under `scripts/db/migrations/`. Read it, then commit it.
3. `npm run db:setup` applies it.

Migrations are applied by hash (`scripts/db/migrations.mjs`), not by
drizzle-kit's `migrate` or `push`, so two branches that each add a migration
can merge in either order without one being skipped.

## Branches and worktrees

A linked git worktree never uses the real database: with no `DATABASE_URL`
it refuses to start. Give it a scratch one:

```sh
echo 'DATABASE_URL=postgres://localhost/schoolhouse_arcade_scratch' > .env.local
npm run db:setup
```

The real database holds tickets a child has earned. Treat it accordingly:
never point a branch's migrations at it before the branch is merged.

## Tests

`npm test` needs no Postgres server. `freshDb()` (`scripts/tests/testdb.mjs`)
gives each test its own in-process PGlite with the real migrations applied.
