// backup.mjs's pure parts: names, pruning, where pg_dump is, versions.
// Ported from Lean Into It.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  backupFileName,
  backupsDir,
  backupsToPrune,
  dumpToolIsNewEnough,
  isBackupFile,
  newestBackup,
  parseMajor,
  partialName,
  pgDumpCandidates,
  serverMajor,
  stableNodePath,
} from "../db/backup.mjs";

test("file name carries the database and a sortable UTC stamp", () => {
  const n = backupFileName("schoolhouse_arcade", new Date("2026-11-15T03:15:09.123Z"));
  assert.equal(n, "schoolhouse_arcade-20261115T031509Z.dump");
  assert.ok(isBackupFile(n, "schoolhouse_arcade"));
  assert.ok(!isBackupFile(n, "other"));
  assert.ok(!isBackupFile(partialName(n), "schoolhouse_arcade"));
});

test("pruning keeps the newest N of this database's own files and nothing else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-backup-"));
  const names = [];
  for (let d = 1; d <= 20; d++) names.push(backupFileName("db", new Date(Date.UTC(2026, 10, d))));
  const others = ["db_other-20260101T000000Z.dump", "notes.txt", "db-latest.dump", ".db-20260101T000000Z.dump.partial"];
  for (const n of [...names, ...others]) fs.writeFileSync(path.join(dir, n), "x");
  const drop = backupsToPrune(fs.readdirSync(dir), "db", 14);
  assert.deepEqual(drop, names.slice(0, 6));
  for (const n of drop) fs.rmSync(path.join(dir, n));
  assert.equal(fs.readdirSync(dir).length, 14 + others.length);
  assert.deepEqual(backupsToPrune(fs.readdirSync(dir), "db", 14), []);
  fs.rmSync(dir, { recursive: true });
});

test("backups dir honours SCHOOLHOUSE_ARCADE_BACKUPS_DIR", () => {
  assert.equal(backupsDir({ SCHOOLHOUSE_ARCADE_BACKUPS_DIR: "/x/y" }, "/r"), "/x/y");
  assert.equal(backupsDir({}, "/r"), path.join("/r", "backups"));
});

test("pg_dump lookup: PATH first, then Homebrew, only existing files", () => {
  const exists = (p) => p === "/p/bin/pg_dump" || p === "/opt/homebrew/opt/postgresql@17/bin/pg_dump";
  const found = pgDumpCandidates({ PATH: "/p/bin:/q/bin:/p/bin" }, exists);
  assert.deepEqual(found, ["/p/bin/pg_dump", "/opt/homebrew/opt/postgresql@17/bin/pg_dump"]);
  assert.deepEqual(pgDumpCandidates({ PATH: "" }, () => false), []);
});

test("version parsing and the no-older rule", () => {
  assert.equal(parseMajor("pg_dump (PostgreSQL) 17.10 (Homebrew)"), 17);
  assert.equal(parseMajor("nonsense"), null);
  assert.equal(serverMajor("170010"), 17);
  assert.equal(serverMajor("garbage"), null);
  assert.ok(dumpToolIsNewEnough(17, 17));
  assert.ok(dumpToolIsNewEnough(18, 17));
  assert.ok(!dumpToolIsNewEnough(16, 17));
  assert.ok(!dumpToolIsNewEnough(null, 17));
});

test("newest backup: the latest stamp of this database, with its age", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const names = [
    backupFileName("db", new Date("2026-11-18T03:30:00Z")),
    backupFileName("db", new Date("2026-11-19T03:30:00Z")),
    backupFileName("other", new Date("2026-11-20T03:30:00Z")),
    ".db-20261120T030000Z.dump.1.partial",
  ];
  const n = newestBackup(names, "db", now);
  assert.equal(n.name, "db-20261119T033000Z.dump");
  assert.equal(n.ageMs, 32.5 * 3600 * 1000);
  assert.equal(newestBackup([], "db", now), null);
  assert.equal(newestBackup(["notes.txt"], "db", now), null);
});

test("stable node path: the first stable symlink to the running node", () => {
  const cellar = "/opt/homebrew/Cellar/node/26.4.0/bin/node";
  const real = { "/opt/homebrew/bin/node": cellar, "/usr/local/bin/node": "/elsewhere/node", [cellar]: cellar };
  const opts = { execPath: cellar, exists: (p) => p in real, realpath: (p) => real[p] };
  assert.deepEqual(stableNodePath(opts), { node: "/opt/homebrew/bin/node", stable: true });
  // A stable path that is some other node is skipped.
  const other = { ...real, "/opt/homebrew/bin/node": "/other/node" };
  assert.deepEqual(stableNodePath({ ...opts, exists: (p) => p in other, realpath: (p) => other[p] }), { node: cellar, stable: false });
  // No stable path exists: fall back.
  assert.deepEqual(stableNodePath({ ...opts, exists: () => false }), { node: cellar, stable: false });
  // A stable path that cannot be resolved is skipped, not trusted.
  const boom = (p) => {
    if (p === "/opt/homebrew/bin/node") throw new Error("ELOOP");
    return real[p];
  };
  assert.deepEqual(stableNodePath({ ...opts, realpath: boom }), { node: cellar, stable: false });
});
