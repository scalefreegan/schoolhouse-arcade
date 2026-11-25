import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, migrationsOnDisk } from "../db/migrations.mjs";

// Migration 0005 on a database that already holds Comet Cards answers: the
// real one does. It adds a column and touches no row.

test("0005 adds answers.given_text and leaves every answer already stored as it was", async (t) => {
  const pg = await PGlite.create();
  t.after(() => pg.close());
  const query = async (text, params) => (await pg.query(text, params)).rows;
  const disk = migrationsOnDisk();
  const at = disk.findIndex((m) => m.sql.join("").includes("given_text"));
  assert.ok(at > 0, "0005_answers_given_text is on disk");
  await applyMigrations(query, disk.slice(0, at));

  const [{ id: em }] = await query("insert into players (name, avatar) values ('Em', 'rex') returning id");
  const [{ id: play }] = await query("insert into plays (player_id, game_id, level, mode, skill, score, right_count, wrong_count, best_combo, time_ms, finished) values ($1, 'comet-cards', 'add-5', 'blitz', 'easy', 100, 1, 2, 1, 7500, true) returning id", [em]);
  await query("insert into answers (play_id, player_id, game_id, fact, given, correct, ms) values ($1, $2, 'comet-cards', '2+3', 5, true, 2500), ($1, $2, 'comet-cards', '1+1', 3, false, 2500), ($1, $2, 'comet-cards', '4+1', null, false, 2500)", [play, em]);
  const rows = () => query("select id, play_id, player_id, game_id, fact, given, correct, ms, created_at from answers order by id");
  const before = await rows();

  await applyMigrations(query, disk);
  assert.deepEqual(await rows(), before);
  assert.deepEqual(await query("select given, given_text from answers order by id"), [
    { given: 5, given_text: null },
    { given: 3, given_text: null },
    { given: null, given_text: null },
  ]);
  await query("insert into answers (play_id, player_id, game_id, fact, given_text, correct, ms) values ($1, $2, 'sound-machine', 'chick', 'ch-i-ck', true, 3000)", [play, em]);
  assert.deepEqual(await query("select given, given_text from answers where fact = 'chick'"), [{ given: null, given_text: "ch-i-ck" }]);
});
