# Schoolhouse Arcade.app

A Dock app that wraps the Schoolhouse Arcade dev server. Click the icon and
the arcade opens in Chrome at http://localhost:38900; quit the Dock icon and
the server stops, if the app started it. Ported from Lean Into It, which
shares the pattern with its sibling apps.

```sh
./macos/build-app.sh                 # builds and installs /Applications/Schoolhouse Arcade.app
open -a "Schoolhouse Arcade"
./macos/build-app.sh --out /tmp/x    # builds /tmp/x/Schoolhouse Arcade.app only, installs nothing
```

The launcher starts the server; it does not install anything. Before the
first launch, run once in the repo: `npm install`, `npm --prefix web install`
and `npm run db:setup` (Postgres 17 running).

## The tablet

The server listens on the home network on purpose (`web/vite.config.ts`):
the tablet plays, the Mac keeps score. The Mac app still opens
`localhost`. When it starts the server, its notification also shows the
Mac's Wi-Fi address (`http://<address>:38900`, from `ipconfig getifaddr`)
to type into the tablet; the log has Vite's *Network* lines too. If
`ARCADE_LOCAL_ONLY` is set in your shell profile, the Dock app's server
honours it and the tablet cannot reach it.

## What is in here

- **`Schoolhouse Arcade.applescript`** is the Dock face, a stay-open applet.
  - `run` and `reopen` start the server if it is down, then focus the Chrome
    tab already on http://localhost:38900, or open one (see Chrome tab reuse).
  - The health check fetches `/` and requires the page's own
    `<title>Schoolhouse Arcade</title>`, so another process on the port is
    never taken for the app.
  - `idle` quits the Dock icon after three failed health checks in a row.
    One miss is normal: editing a server file restarts Vite, and the port is
    unbound for a moment.
  - `quit` stops Vite only if this app started it. A server it found already
    running (your own `npm run dev`) is left alone.
- **`server-shim.c`** is compiled by `build-app.sh` into the executable of
  the nested, faceless **Schoolhouse Arcade Server.app**
  (`Contents/Helpers/`). All it does is `exec` the runner script. Building
  needs a working `clang`.
- **`server-runner.sh`** runs `npm --prefix web run dev` from the repo root
  as its blocking child, in a login shell. A process started from the Dock
  does not get the terminal's `PATH`, only what `~/.zprofile` sets. The
  runner puts Homebrew's directories (`/opt/homebrew/bin`, `/usr/local/bin`)
  after it, so node is found and a node chosen in the profile is not
  overridden.
- **`icon.svg`** is the icon's source: the favicon's pixel comet (a yellow
  head with a white rim, a cyan tail) on a black tile, on the same 16-cell
  grid. `render-icon.sh` turns it into `icon-1024.png` with `sips`;
  `build-app.sh` makes the `.icns` from the PNG. Flat fills only, because
  `sips` draws SVG without filters or text.
- **`com.schoolhousearcade.db-backup.plist.template`** is the optional daily
  `npm run db:backup` job; `docs/DATA.md` "Backup and restore" says how to
  fill it in and load it. Nothing loads it for you.

The app itself is a build product and is not committed. Rebuild after
changing the AppleScript, the shim, the runner or the icon.

### Why a helper app runs the server

Two facts about macOS privacy control (TCC) force this shape. The repo lives
under `~/Documents`, which is protected.

1. A Documents grant does not survive being orphaned. A `nohup`'d server is
   handed to launchd, loses its launcher's grant, and dies with a silent
   EPERM. So the server stays the blocking child of a helper app that lives
   as long as it does.
2. The helper's executable must be a real compiled binary. Since macOS
   26.6.2, a bundle whose executable is a script runs as `/bin/zsh`, which
   macOS will not prompt for and will not match a Full Disk Access row
   against: it is denied with no prompt. Before that update the opposite was
   true. If you read this after another macOS release, measure again before
   trusting either direction.

## First launch, and after every rebuild

macOS asks twice, once each:

- **Documents access for "Schoolhouse Arcade Server".** Approve it, or the
  server cannot read the repo. The runner writes what to do into the log.
- **Automation access to Google Chrome for "Schoolhouse Arcade".** This is
  what lets a second click return to the open tab.

Every rebuild signs the bundles again (ad hoc), which changes their code
identity. The old grant no longer applies, and macOS may deny without
asking again. `build-app.sh` prints a note when the helper's identity
changed. To recover, in order:

1. `tccutil reset SystemPolicyDocumentsFolder com.schoolhousearcade.app.server`,
   then relaunch, so a fresh prompt can appear.
2. If there is still no prompt: System Settings, Privacy & Security,
   Full Disk Access, "+", add
   `/Applications/Schoolhouse Arcade.app/Contents/Helpers/Schoolhouse Arcade Server.app`,
   then relaunch.

The server's log is `~/Library/Logs/SchoolhouseArcade.log`; the run before
it is kept as `SchoolhouseArcade.log.old`. The launcher's own lines in it
start with `[schoolhouse-arcade]`.

## Chrome tab reuse

Clicking the icon while the app is open brings back the Chrome tab you were
using: any tab whose URL starts with http://localhost:38900, so a game page
counts. With no such tab it opens one. If clicks keep opening new tabs,
look in the log for a `Chrome tab focus failed` line. `-1743` means
Automation access was refused: allow it under System Settings, Privacy &
Security, Automation, or run
`tccutil reset AppleEvents com.schoolhousearcade.app` and click again.
If Chrome cannot be reached at all, the app falls back to `open`, which uses
the default browser.

While a test or automation Chrome is running (the Playwright MCP's, whose
profile is under `~/Library/Caches/ms-playwright*`, or any Chrome started
with `--remote-debugging-pipe` or `--remote-debugging-port`), the launcher
doesn't script Chrome at all: AppleScript can't tell that instance from
yours. It hands the URL to your own Chrome with
`open -n -a 'Google Chrome' --args <url>` instead, which always makes a new
tab. Close the test browser and clicks reuse the tab again.

## Port

`web/vite.config.ts` pins the server to **38900** (`strictPort`), so the
health check and the URL never change. `npm run dev` by hand uses the same
port:

- If the Dock app is running, a manual server fails loudly, by design.
- **A fresh launch of the app restarts the server:** if this checkout's vite
  is already on the port (a manual `npm run dev`, or a server an earlier
  launch left running), it is stopped (TERM, then KILL after 10 s) and the
  app starts its own, so quitting and reopening the app always runs the
  current code. A worktree's server or any other process on the port is
  never stopped. A click while the app is already running only focuses the
  tab, and Quit still stops only a server this app started.
- If the server takes longer than 30 seconds to answer, the app gives up
  ownership so that it cannot kill a server that is still starting. Later
  clicks adopt it, and Quit leaves it; stop it by hand with
  `pkill -f 'schoolhouse-arcade/web/node_modules/.bin/vite'` (with the
  checkout's own directory name, if it is not `schoolhouse-arcade`).

## Repo path

Nothing is tied to this machine. `build-app.sh` takes the checkout it lives
in and bakes that path into the applet's kill pattern and the runner's `cd`.
Move or clone the repo, rebuild, and the launcher follows. Running
`macos/server-runner.sh` by hand works too: it falls back to its own
location.

## Caveats

The bundle id is personal (`com.schoolhousearcade.app`) and the signing is
ad hoc. This is a personal launcher, not an app to distribute.
