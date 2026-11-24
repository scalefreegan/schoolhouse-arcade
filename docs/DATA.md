# What is stored where

Schoolhouse Arcade keeps who plays and what they have earned in a local
Postgres 17 database, `schoolhouse_arcade`. Game ids, level ids, avatar
ids and colour ids come from `web/shared/` and are the keys the database
uses, which is why an id never changes once live. Mirrors Lean Into It's `docs/DATA.md`.

| What | Where | Tracked by git |
|---|---|---|
| The games' rules, the avatars, the sprites | `web/shared/`, `web/src/sprites/` | yes |
| Players; every play and every answer in it; stars per level; tickets, badges, prizes and hand-overs; the grown-up PIN's hash | Postgres `schoolhouse_arcade` | no |
| `DATABASE_URL`, local overrides | `.env.local` | no |
| Which player this device is, whether sound is off, the set-up each player used last | the browser's localStorage (`arcade.player`, `arcade.muted`, `arcade.comet.setup.<player>`) | no, and not in the database |
| `npm run db:backup`'s dumps of the database, the newest 14, readable only by you | `backups/` (`SCHOOLHOUSE_ARCADE_BACKUPS_DIR` moves it) | no (`backups/` is ignored) |
| The Mac app's server log, and the daily backup's | `~/Library/Logs/SchoolhouseArcade.log` (`.old`: the run before), `SchoolhouseArcadeBackup.log` | no |

## The tables

| Table | One row is | Written by |
|---|---|---|
| `players` | someone on the "Who is playing?" screen: a name, a character (`avatar`) and its `colour` (null: its own look) | `scripts/db/players.ts` |
| `plays` | one finished round, scored by the server; `round_id` is the round's own id | `scripts/db/plays.ts` |
| `answers` | one card of a play: the fact, what was answered, how long it took | `scripts/db/plays.ts` |
| `level_stars` | the most stars a player has on one level | `scripts/db/plays.ts` |
| `level_opens` | a level a grown-up opened early for a player | `scripts/db/plays.ts` |
| `ticket_events` | one change to a player's tickets: earned, spent, or adjusted by hand | `scripts/db/tickets.ts` |
| `badges_earned` | a badge a player holds | `scripts/db/badges.ts` |
| `prizes` | a prize on the shelf (a removed one is retired, not deleted) | `scripts/db/prizes.ts` |
| `redemptions` | a prize handed over, with its name and price on the day | `scripts/db/prizes.ts` |
| `settings` | one of the arcade's own settings: the PIN's hash, and the key round clocks are signed with | `scripts/db/settings.ts` |

The high score tables are queries over `plays`. Which card comes next is
worked out from a player's latest `answers`.

**Tickets are a ledger.** A balance is the sum of a player's
`ticket_events`; rows are added and never changed or deleted, so every
ticket can be traced to the round, badge, prize or grown-up that moved it. A
mistake is put right with another row (Grown-ups → Tickets). A row for a
round points at its play (`play_id`); a row for a prize points at its
hand-over (`redemption_id`).

**A round is stored once.** The browser makes a round id when a round starts
(`web/shared/roundid.ts`) and sends it with every try at saving that round.
It is kept in `plays.round_id`, unique per player. A round id the server
already has is answered with the play it was stored as; nothing is recorded
or paid again. A play must carry one; plays from before migration
`0003_round_ids` have none.

**A round has the server's clock.** Before the countdown the browser asks
`POST /api/plays/start`, and the server answers with a clock: the time on
the Mac, and the player's latest play id, signed with a key kept in
`settings` (`round_clock_key`, made once; `web/server/clock.ts`). Nothing
else is stored, so a server restarted mid-round still knows its clocks. A
new play is saved only with its round's clock, when no other play of that
player was stored since the clock was given, and when its answers claim no
more card time than has passed on the Mac since then. A round already
stored is answered as before, whatever clock comes with it.
`npm run pin:reset` leaves the key alone; deleting it only refuses the
rounds being played at that moment.

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

## Backup and restore

The database is the one thing that cannot be made again: it holds the
tickets a child has earned. `npm run db:backup`
(`scripts/db/backup-cli.mjs`; the logic is in `scripts/db/backup.mjs`,
ported from Lean Into It) runs `pg_dump -Fc` on the database
`DATABASE_URL` names (resolved like the other db scripts, so a linked
worktree without one refuses) into `backups/` at the checkout's root
(gitignored; `SCHOOLHOUSE_ARCADE_BACKUPS_DIR` puts them elsewhere). Files
are `<database>-<UTC stamp>.dump`, mode 0600; a `backups/` it creates is
0700. `backups/` is inside the checkout, so `git clean -fdx` or deleting the
checkout deletes every backup; `SCHOOLHOUSE_ARCADE_BACKUPS_DIR` moves them
elsewhere. It is read from the environment only, not from `.env.local`: set
it in your shell and, for the daily job, add it to the plist's
`EnvironmentVariables` too, or the job and `db:backup:status` will look in
different places.
`npm run db:backup:status` (no connection to the database, only its name
from `DATABASE_URL`, so a worktree without one refuses) prints the newest
backup's name, size and age, and exits 1 when there is none or the newest is
over 2 days old.

- The dump goes to a private `.partial` file and gets its real name only
  when `pg_dump` exits 0, so a failed dump never looks like a good one;
  partials over a day old (crashed runs) are removed.
- The newest 14 are kept. Pruning touches only that database's own
  `<database>-<stamp>.dump` files, never the one just written; a backup
  stamped in the future (a clock ahead) is warned about.
- A password in the URL travels in `PGPASSWORD`, never in `pg_dump`'s
  arguments, and the printed URL is redacted.
- `pg_dump` is looked for on `PATH`, then in the Homebrew PostgreSQL
  directories (a launchd job's `PATH` is minimal); it uses one whose major
  version matches the server's, else the lowest newer one, never an older.

There is no restore script on purpose: a restore that picks its own target
is how a real database gets overwritten. Restore into a database you name,
and look before using it:

```sh
createdb schoolhouse_arcade_restored
pg_restore --no-owner --exit-on-error -d schoolhouse_arcade_restored backups/<file>.dump
psql -d schoolhouse_arcade_restored -c "select count(*) from players"
```

Then stop the app, and either point `DATABASE_URL` at it (in `.env.local`)
or swap names (`alter database schoolhouse_arcade rename to
schoolhouse_arcade_old;` and the restored one to `schoolhouse_arcade`, from
`psql -d postgres`), and start it again. The dump carries the migration
record, so the restored database is exactly as current as the one it came
from; the boot check says whether this checkout has migrations it lacks,
and `npm run db:migrate` (with that `DATABASE_URL`) adds them. With
`--no-owner` the tables belong to whoever ran `pg_restore`, so restore as
the role the app connects as.

### Daily backup (optional, not installed by default)

`macos/com.schoolhousearcade.db-backup.plist.template` runs the backup at
03:30 daily (a run missed while the Mac slept happens on wake), logging to
`~/Library/Logs/SchoolhouseArcadeBackup.log`.
`npm run db:backup:plist -- <path>` fills in node, this checkout and your
home, and writes the result to the path you give (replacing what is there),
nothing else; loading it is your step. It prefers a stable node path
(`/opt/homebrew/bin/node`, `/usr/local/bin/node`) over the versioned Cellar
one, and prints the one it used.

```sh
npm run db:backup:plist -- ~/Library/LaunchAgents/com.schoolhousearcade.db-backup.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.schoolhousearcade.db-backup.plist
# to stop it: launchctl bootout "gui/$(id -u)/com.schoolhousearcade.db-backup"
```

Two things can make this job fail without a sign:

- **Node path.** If `db:backup:plist` warned that the node path is
  version-specific, a Node upgrade can delete it and launchd then silently
  fails to start the job every night. Regenerate the plist and reload it
  after an upgrade.
- **Documents access.** launchd starts the job, and macOS can deny a process
  launched that way the repo under `~/Documents` (the same silent EPERM
  `macos/README.md` describes for the server). Measured on this machine on
  2026-11-24 (macOS 26, Homebrew node at `/opt/homebrew/bin/node`): the job
  was allowed, with no prompt; it read the checkout and wrote the dump into
  `backups/`. That is one machine on one day, and a macOS or Node update can
  change it, so check after installing and after either update: run it once
  with `launchctl kickstart "gui/$(id -u)/com.schoolhousearcade.db-backup"`,
  read `~/Library/Logs/SchoolhouseArcadeBackup.log`, then run
  `npm run db:backup:status`. Run `db:backup:status` now and then after that
  too; it is the only thing that notices a job that never ran.

## Tests

`npm test` needs no Postgres server. `freshDb()` (`scripts/tests/testdb.mjs`)
gives each test its own in-process PGlite with the real migrations applied.
