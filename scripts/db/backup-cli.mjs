#!/usr/bin/env node
// npm run db:backup   pg_dump -Fc of DATABASE_URL into backups/ (gitignored;
//                     SCHOOLHOUSE_ARCADE_BACKUPS_DIR overrides), keeping the newest 14.
// npm run db:backup:plist -- <out.plist>
//                     write the launchd template, filled in, to the path you
//                     give and nowhere else (installing is up to you;
//                     docs/DATA.md "Backup and restore").
// npm run db:backup:status
//                     print the newest backup's name, size and age; exit 1 when
//                     there is none or it is over 2 days old. No connection to
//                     the database, only its name from DATABASE_URL.
//
// The dump goes to a private .partial file and is linked into place only when
// pg_dump exits 0 (runBackup in backup.mjs), so a failed dump never looks like
// a good backup. Restore: docs/DATA.md "Backup and restore".
// DATABASE_URL is resolved like the other db scripts (scripts/db/config.mjs),
// so a linked worktree without one refuses. Ported from Lean Into It.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ROOT as REPO_ROOT } from "../env.mjs";
import { databaseName, databaseUrl, redact } from "./config.mjs";
import {
  STABLE_NODE_PATHS,
  STALE_BACKUP_DAYS,
  backupsDir,
  chooseDumpTool,
  newestBackup,
  parseMajor,
  pgDumpCandidates,
  renderPlist,
  runBackup,
  serverMajor,
  stableNodePath,
} from "./backup.mjs";

function fail(msg) {
  console.error(`db:backup: ${msg}`);
  process.exit(1);
}

function writePlist(out) {
  if (!out) fail("usage: npm run db:backup:plist -- <output path>  (it writes there and nowhere else)");
  const tpl = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../macos/com.schoolhousearcade.db-backup.plist.template");
  const { node, stable } = stableNodePath();
  const text = renderPlist(fs.readFileSync(tpl, "utf8"), { node, repo: REPO_ROOT, home: os.homedir() });
  fs.writeFileSync(out, text);
  console.log(`wrote ${path.resolve(out)}`);
  console.log(`node: ${node}`);
  if (!stable) {
    console.warn(
      `warning: ${node} is version-specific; no stable node path (${STABLE_NODE_PATHS.join(", ")}) points at it. ` +
        "After a Node upgrade it may be gone and the nightly job will silently fail to start: run db:backup:plist again and reload it.",
    );
  }
}

// Exit 1 when there is no backup or the newest is stale.
function status() {
  const name = databaseName(databaseUrl());
  const dir = backupsDir();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    /* no directory: no backups */
  }
  const newest = newestBackup(names, name);
  if (!newest) fail(`no backup of ${name} in ${dir}. Run npm run db:backup.`);
  const days = newest.ageMs / (24 * 3600 * 1000);
  const age = days >= 1 ? `${days.toFixed(1)} days` : `${(newest.ageMs / 3600000).toFixed(1)} hours`;
  console.log(`newest: ${newest.name} (${fs.statSync(path.join(dir, newest.name)).size} bytes, ${age} old)`);
  if (days > STALE_BACKUP_DAYS) {
    fail(`the newest backup is ${age} old (limit ${STALE_BACKUP_DAYS} days). Is the nightly job running? See docs/DATA.md "Daily backup".`);
  }
}

async function main() {
  if (process.argv[2] === "--status") return status();
  if (process.argv[2] === "--plist") return writePlist(process.argv[3]);
  const url = databaseUrl();
  const name = databaseName(url);
  console.log(`database: ${redact(url)}`);

  const client = new pg.Client({ connectionString: url });
  let serverMaj;
  try {
    await client.connect();
    serverMaj = serverMajor((await client.query("show server_version_num")).rows[0].server_version_num);
  } catch (e) {
    fail(`cannot reach the database: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }

  const candidates = pgDumpCandidates();
  if (!candidates.length) {
    fail("pg_dump not found on PATH or in the Homebrew PostgreSQL locations (brew install postgresql@17).");
  }
  const tools = candidates.map((p) => {
    const v = spawnSync(p, ["--version"], { encoding: "utf8" });
    return { path: p, major: v.status === 0 ? parseMajor(v.stdout) : null, text: (v.stdout ?? "").trim() };
  });
  const tool = chooseDumpTool(tools, serverMaj);
  if (!tool) {
    fail(`no pg_dump as new as the server (PostgreSQL ${serverMaj}). Found: ${tools.map((t) => `${t.path} (${t.major ?? "unusable"})`).join(", ")}.`);
  }
  console.log(`using ${tool.path}: ${tool.text} (server major ${serverMaj})`);

  try {
    const { dest, pruned, warnings } = runBackup({ url, database: name, dir: backupsDir(), tool: tool.path });
    console.log(`wrote ${dest} (${fs.statSync(dest).size} bytes)`);
    for (const w of warnings) console.warn(`warning: ${w}`);
    for (const p of pruned) console.log(`pruned ${p}`);
  } catch (e) {
    fail(e.message);
  }
}

main().catch((e) => fail(e.message));
