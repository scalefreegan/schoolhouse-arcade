# Schoolhouse Arcade — agent instructions

A retro coin-op arcade of small learning games for a first-grader, played on
a tablet over home Wi-Fi and served from this Mac. No logins: a player is a
name and a pixel character. Playing earns tickets and badges that a grown-up
trades for real prizes. Who plays and what they have earned is in a local
Postgres 17 database (`schoolhouse_arcade`). Read `docs/PRD.md` first (what
was decided, and the rules of each game), `docs/DATA.md` (what is stored
where) and `docs/ART.md` (how the sprites are written) before touching a
game, the schema or the artwork.

## Layout
```
web/shared/games.ts      the cabinets on the floor (id, title, status)
web/shared/avatars.ts    the characters a player can be, their colours, the old ids, and what a legal name is
web/shared/wire.ts       request and reply types shared by server and client
web/shared/play.ts       what every game shares: a play, an answer (a number or text), GameRules, Settled, openLevels()
web/shared/deal.ts       what every game's dealing shares: a seeded Rng, FactStat, a draw weighted by misses
web/shared/roundid.ts    newRoundId(): the id a round keeps through every try at saving it
web/shared/rules.ts      each live game's rules, by game id (the server scores with these)
web/shared/tickets.ts    what a play pays: the arcade's bonuses, the reasons on a ledger row
web/shared/badges.ts     every badge and the pure test for whether it is earned
web/shared/prizes.ts     what a prize may be (pictures, limits), what a PIN is
web/shared/comet/facts.ts    Comet Cards: a fact ("7+5"), the five levels and what each holds
web/shared/comet/rules.ts    modes, scoring, stars, and settle(): a play scored from its answers
web/shared/comet/deck.ts     which card comes next (weighted by the player's misses), Easy's four choices
web/shared/comet/session.ts  a round as events: countdown, deal, key, clock, pause (the screen's reducer); PACE
web/shared/soundmachine/words.ts    Sound Machine: the sounds, the tiles, every word and its level, the clip names
web/shared/soundmachine/rules.ts    its two games (build, read), scoring, stars, and settle()
web/shared/soundmachine/pick.ts     a round's eight words, Build's tray of tiles, Read's pictures
web/shared/soundmachine/session.ts  a round as events: next, place, take, go, pick, pause (the screen's reducer)
web/server/api.ts        wrap() and the route table (ROUTES)
web/server/origin.ts     who may call the API: this Mac or the home network, from the app
web/server/tailnet.ts    ARCADE_TAILNET_HOST: the Mac's Tailscale name, the one name beyond those
web/server/http.ts       JSON bodies and replies, HttpError
web/server/db.ts         the pg pool, the boot check, setDb() for tests
web/server/players.ts    /api/players
web/server/plays.ts      /api/plays: start a round, post a round, a high score table, a player's progress
web/server/counter.ts    /api/counter: the Prize Counter as a player sees it (read-only)
web/server/grownup.ts    /api/grownup: everything behind the PIN
web/server/pin.ts        the PIN: its hash, the check, the lock after wrong tries
web/server/clock.ts      a round's clock: the signed start the server checks a play against
web/server/testhttp.ts   call a route handler without a socket (tests)
web/src/App.tsx          the routes: title, players, the floor, a game
web/src/state.tsx        ArcadeProvider: the players, who is playing, the sound switch
web/src/arcade/          the shell: Attract (title), Players, Lobby (the floor), Hud,
                         PrizeCounter, Grownups, PinPad, TicketsWon, SoundCheck
web/src/games/index.ts   each live cabinet's screen, by game id
web/src/games/Cabinet.tsx  any cabinet's flow: set up, the server's clock, the round, saving, results
web/src/games/           Setup, Results, Scores, format: the screens every cabinet shares
web/src/games/comet/     Comet Cards: CometCards (what it hands Cabinet), Round
web/src/games/soundmachine/  Sound Machine: SoundMachine (what it hands Cabinet), Round
web/src/sprites/art.ts   every drawing, as rows of characters and palettes
web/src/sprites/Sprite.tsx  <Sprite> and <AvatarSprite>
web/src/sound.ts         every beep, synthesised, and the one audio context (woken on a tap, remade if it will not wake)
web/src/speech.ts        spoken clips: preload(), say(), hush(); plays through sound.ts's context
web/public/speech/       Sound Machine's clips and manifest (generated, committed)
scripts/speech/          npm run speech:build: makes the clips (Azure text-to-speech; needs a key in the environment)
web/src/index.css        the tokens and the pixel-box classes (.panel, .btn, .pick, .field)
scripts/db/schema.ts     the whole schema (Drizzle)
scripts/db/players.ts    the only code that touches the players table
scripts/db/plays.ts      plays, answers and stars: record a play, a board, a rank, bests
scripts/db/tickets.ts    the ticket ledger: a balance, add rows (never change one)
scripts/db/badges.ts     badges earned
scripts/db/prizes.ts     the shelf and hand-overs; handOverPrize() spends tickets
scripts/db/settings.ts   the arcade's own settings (the PIN's hash)
scripts/db/migrations/   the SQL that reaches a database (generated, committed)
scripts/tests/testdb.mjs freshDb(): an in-process PGlite with the real migrations
scripts/db/backup*.mjs   npm run db:backup: pg_dump into backups/, newest 14 kept
macos/                   the Dock app (build-app.sh, the launcher, the server helper, the icon) and the backup launchd template
```

## Rules that keep it working
- Port **38900**, `strictPort`, polling watcher (FSEvents is unreliable on
  this machine). Siblings: Lean Into It 38800, Fret Not 38600, jev-ants
  38500, Lingo Dojo 38400, Atlas 38300, Wine Guide 38200, Basecamp 38100.
- **This app is served to the home network on purpose** (`server.host: true`
  in `web/vite.config.ts`): the tablet plays, the Mac keeps score. That is
  the opposite of the sibling apps, so the wall matters more, not less.
  Every API route goes through `wrap()` in `web/server/api.ts`: the Host
  must be this machine, a private address, a `.local` name or the exact
  Tailscale name set in `ARCADE_TAILNET_HOST` (`web/server/tailnet.ts`:
  shell or `.env.local`, read at start; never a pattern); the Origin
  must match it; and the request must come from the app (the browser says
  same-origin, or it carries `X-Schoolhouse-Arcade: 1`, which `client.ts`
  sends). Add a route to `ROUTES`; a test proves every entry is wrapped.
- **The server keeps score.** A game posts its answers; the server works out
  the score, tickets and badges from them with the rules in `web/shared/`.
  Never store a number the browser computed.
- **A round is a pure reducer** (`web/shared/comet/session.ts`): time and
  randomness arrive inside its events, so a whole round can be played in a
  test. `Round.tsx` only sends events, times what follows and draws. A test
  proves that what the session plays is what `settle()` scores; keep it so.
- **Only the time a card waits is counted.** The clock stops while a missed
  card's answer is shown and while the pause box is open.
- **What costs real money is behind the grown-up PIN**, checked on the
  server on every such request: handing over a prize, editing prizes,
  changing tickets by hand, opening a level, retiring a player. All of it
  is under `/api/grownup`, whose handler calls `requirePin()` before
  anything but the two PIN routes; a test calls every route without the
  PIN. The browser never stores the PIN. The first PIN is taken only at this
  Mac (`atThisMac()` in `web/server/origin.ts`: Host and socket address both
  loopback) and never replaces one that exists.
- **Tickets are a ledger** (`ticket_events`): rows are added, never updated
  or deleted. Whatever reads a balance and then pays or spends against it
  does so in one transaction that takes `lockPlayer()` first.
- **A play is settled all or nothing** (`settlePlay()` in
  `web/server/plays.ts`): the play, its stars, its badges and its tickets.
  A game supplies only `pay()`; bonuses and badges are the arcade's. And
  once: a game makes one round id per round and sends it on every retry; a
  round id the player has already sent gets the stored play back and writes
  nothing. `recordPlay()` comes after `playOfRound()`, under the lock.
- **A round has the server's clock** (`web/server/clock.ts`). A game asks
  `POST /api/plays/start` with its round id before its countdown and plays
  only once it has the clock; it sends the clock back with the play. A new
  play is refused if the clock is not this server's for that player, game
  and round, if another play of the player was stored since, or if its
  answers claim more card time than has passed on the Mac since the start.
  No slack is added: the time a screen never counts (countdown, answers
  shown, `PACE` in `session.ts`) must stay longer than what `countedMs()`
  can add, and a test proves it. The check runs inside `settlePlay()`
  (`admit`), after `playOfRound()`, so a retry of a stored round is never
  refused.
- The real database holds tickets a child has earned. Tests never touch a
  Postgres server: `freshDb()`. A worktree never uses the real database
  (`scripts/db/config.mjs` refuses to start without a `DATABASE_URL`).
- Never change a game id, a level id, a mode or skill id, a badge id, an
  avatar id or a colour id once live: rows are keyed on them. In Sound
  Machine a word's id
  (its spelling) and a tile are stored on answers and never change either,
  and a sound's id names its clip.
- **An answer is a number or text**, never both: `answers.given` for Comet
  Cards, `answers.given_text` for Sound Machine (the word picked, or the
  tiles placed, `ch-i-ck`). A game's `settle()` refuses the other kind.
- **Sound Machine has no clock the player sees**, and nothing in it is
  scored on time. A word's time is still counted (at least `MIN_ANSWER_MS`)
  and each answer stays up for its `PACE` before the session lets the next
  word come, so the server's round clock holds as it does for Comet Cards;
  a test proves a round as fast as the screen allows still fits.
- **Speech clips are generated, never hand-edited**: `npm run speech:build`
  (`scripts/speech/`) makes them from the words and sounds in
  `web/shared/soundmachine/words.ts` and records each recipe in the
  manifest. The key lives only in the environment; the app at run time
  fetches static files and calls nowhere. Read never says the whole word
  before the answer, plain or slow. Sound Machine will not start with the
  sound off, by any way into a round. A new word hushes the last one's
  speech. No clip is waited on without a limit, and only a Build round's
  word clips can stop a round from starting.
- **Letters to be read are lower case in `--font-letters`** (`.sm-letter`):
  the display face has no true small letters.
- Each table is read and written by one module under `scripts/db/`, whose
  functions take the player id.
- Files under `web/shared/` and `scripts/db/*.ts` are run directly by Node
  (type stripping): explicit `.ts` import extensions, erasable syntax only.
- **Colours mean one thing each**: cyan is the game talking, magenta is the
  player, yellow is reward, green and red are right and wrong and appear
  nowhere else. Colours come from the tokens in `web/src/index.css`;
  components never write a raw hex (sprite palettes in `art.ts` are the one
  exception).
- **Edges and motion are stepped.** No `border-radius`, no eased
  transitions: boxes use the `.panel` / `.btn` shadows, motion uses
  `steps()`. Respect `prefers-reduced-motion`.
- **The player is six.** Words on a game screen are few and short; a number
  to read is large; a thing to press is at least 56 px tall. A wrong answer
  shows the right one and never takes away something already earned.
- All art, names and sounds are original. No characters, music or artwork
  from an existing game or show.

## Build & test
```sh
npm install && npm --prefix web install
npm run db:setup            # once per machine (Postgres 17 running); idempotent
npm run db:backup           # pg_dump into backups/, newest 14 kept (docs/DATA.md: restore, daily job)
npm run db:backup:status    # newest backup's age; exits 1 if none or over 2 days old
./macos/build-app.sh        # build and install the Dock app (macos/README.md); --out <dir> builds without installing
npm run dev                 # http://localhost:38900, and the Mac's address on the home network
npm test                    # node --test: shared rules, routes, database (PGlite)
npm run typecheck && npm run lint
npm run db:generate -- --name <what_changed>   # after editing scripts/db/schema.ts; commit the SQL
npm run pin:reset           # forget the grown-up PIN
npm run speech:build        # make Sound Machine's missing clips (AZURE_SPEECH_KEY and _REGION in the environment; ffmpeg)
npm run speech:check        # every clip is there (no key, no network)
```
`ARCADE_LOCAL_ONLY=1 npm run dev` keeps the server to this machine.

Verify UI in the real app (Playwright or Claude-in-Chrome) before claiming a
feature works, at a tablet size (1024 × 768) and a phone size (390 × 800).

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
