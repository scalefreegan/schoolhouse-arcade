#!/bin/zsh
# The real work of "Schoolhouse Arcade Server.app" (LSUIElement, faceless).
# Runs the dev server with this process as its parent. This script is NOT the
# bundle's executable: a compiled shim (server-shim.c) execs it, because
# tccd does not attribute TCC to script-executable bundles (the process is
# /bin/zsh, a platform binary: silently denied, no prompt, and Full Disk
# Access rows never match). The shim carries the bundle identity; this script
# keeps the TCC-safe cwd and the blocking-child behaviour.
# Ported from Lean Into It.
set -uo pipefail
# cd / first AND stay there through login-shell init: a TCC-guarded cwd makes
# every getcwd (shell init, brew shellenv, npm) explode before the real work
# starts. The cd into the repo happens INSIDE the login shell, after init.
cd /
# build-app.sh substitutes the checkout it was built from. If the placeholder
# is still here, this copy is being run in place from the repo (debugging),
# so derive the repo from this script's own location (macos/..).
REPO="__ARCADE_REPO__"
case "$REPO" in __ARCADE_*) REPO="${0:A:h:h}";; esac
LOG="$HOME/Library/Logs/SchoolhouseArcade.log"
# rotate, don't truncate: the previous run's crash evidence is exactly what
# the failure dialog tells the user to go read, and a reflexive relaunch must
# not destroy it
if [ -f "$LOG" ]; then mv -f "$LOG" "$LOG.old"; fi
{
  echo "[schoolhouse-arcade] server starting $(date) (repo $REPO)"
  # a real readdir, not test -r: TCC denial intercepts open/readdir but can
  # let access(2) succeed, and this guard exists precisely for that denial
  if ! ls "$REPO/web" >/dev/null 2>&1; then
    echo "[schoolhouse-arcade] cannot read $REPO: grant Schoolhouse Arcade Server access in System Settings > Privacy & Security > Files and Folders, then relaunch"
    exit 1
  fi
  # `npm --prefix web run dev` from the repo root (the root package.json's
  # `dev` script is the same command): vite's cwd is web/, where
  # vite.config.ts pins port 38900 and listens on the home network so the
  # tablet can play.
  # A Dock-launched process does not get the terminal's PATH, and the login
  # shell only has what ~/.zprofile adds. Homebrew's directories go at the
  # END, as a fallback for node and npm that never outranks a node the
  # profile chose (nvm, volta).
  exec /bin/zsh -lc "export PATH=\"\$PATH:/opt/homebrew/bin:/usr/local/bin\"; cd ${(q)REPO} && exec npm --prefix web run dev"
} >> "$LOG" 2>&1 < /dev/null
