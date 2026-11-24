# What is stored where

Schoolhouse Arcade keeps who plays and what they have earned in a local
Postgres 17 database, `schoolhouse_arcade`. Game ids, level ids and avatar
ids come from `web/shared/` and are the keys the database uses, which is why
an id never changes once live. Mirrors Lean Into It's `docs/DATA.md`.

| What | Where | Tracked by git |
|---|---|---|
| The games' rules, the avatars, the sprites | `web/shared/`, `web/src/sprites/` | yes |
| Players | Postgres `schoolhouse_arcade` | no |
| `DATABASE_URL`, local overrides | `.env.local` | no |
| Which player this device is, whether sound is off | the browser's localStorage (`arcade.player`, `arcade.muted`) | no, and not in the database |
| `npm run db:backup`'s dumps of the database, the newest 14, readable only by you | `backups/` (`SCHOOLHOUSE_ARCADE_BACKUPS_DIR` moves it) | no (`backups/` is ignored) |
| The Mac app's server log, and the daily backup's | `~/Library/Logs/SchoolhouseArcade.log` (`.old`: the run before), `SchoolhouseArcadeBackup.log` | no |

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
- **Documents access.** launchd starts the job, and macOS may deny a process
  launched that way the repo under `~/Documents` (the same silent EPERM
  `macos/README.md` describes for the server). **This has not been measured
  on this machine.** After installing, check rather than assume: run it once
  with `launchctl kickstart "gui/$(id -u)/com.schoolhousearcade.db-backup"`,
  read `~/Library/Logs/SchoolhouseArcadeBackup.log`, then run
  `npm run db:backup:status`. Run `db:backup:status` now and then after that
  too; it is the only thing that notices a job that never ran.

## Tests

`npm test` needs no Postgres server. `freshDb()` (`scripts/tests/testdb.mjs`)
gives each test its own in-process PGlite with the real migrations applied.
