import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, migrationsOnDisk } from "../db/migrations.mjs";

// Migration 0003 on a database that already holds plays, tickets and a
// hand-over: the real one does.

test("0003 applies over existing rows, keeps every one, and from then on a round and a hand-over id must make sense", async (t) => {
  const pg = await PGlite.create();
  t.after(() => pg.close());
  const query = async (text, params) => (await pg.query(text, params)).rows;
  const disk = migrationsOnDisk();
  await applyMigrations(query, disk.slice(0, 3));

  const [{ id: em }] = await query("insert into players (name, avatar) values ('Em', 'rex') returning id");
  const play = "insert into plays (player_id, game_id, level, mode, skill, score, right_count, wrong_count, best_combo, time_ms, finished) values ($1, 'comet-cards', 'add-5', 'blitz', 'easy', 100, 1, 0, 1, 2500, true) returning id";
  const [{ id: first }] = await query(play, [em]);
  await query(play, [em]);
  const [{ id: prize }] = await query("select id from prizes where name = 'A candy'");
  const [{ id: handed }] = await query("insert into redemptions (player_id, prize_id, prize_name, prize_icon, cost) values ($1, $2, 'A candy', 'candy', 100) returning id", [em, prize]);
  await query("insert into ticket_events (player_id, delta, reason, play_id) values ($1, 150, 'play', $2)", [em, first]);
  await query("insert into ticket_events (player_id, delta, reason, note) values ($1, 50, 'adjust', 'chores')", [em]);
  await query("insert into ticket_events (player_id, delta, reason, redemption_id) values ($1, -100, 'prize', $2)", [em, handed]);
  const ledger = () => query("select id, player_id, delta, reason, play_id, redemption_id, note, created_at from ticket_events order by id");
  const before = await ledger();

  await applyMigrations(query, disk);
  assert.deepEqual(await ledger(), before);
  assert.deepEqual(await query("select round_id from plays order by id"), [{ round_id: null }, { round_id: null }], "old plays keep no round id, and two of them do not clash");

  // One round, one play, for each player.
  const round = "11111111-2222-4333-8444-555555555555";
  const withRound = play.replace("finished)", "finished, round_id)").replace("true)", "true, $2)");
  await query(withRound, [em, round]);
  await assert.rejects(query(withRound, [em, round]), /plays_round/);
  const [{ id: al }] = await query("insert into players (name, avatar) values ('Al', 'rex') returning id");
  await query(withRound, [al, round]);

  // A ledger row names a hand-over that happened.
  await assert.rejects(query("insert into ticket_events (player_id, delta, reason, redemption_id) values ($1, -1, 'prize', 999)", [em]), /ticket_events_redemption_id_redemptions_id_fk/);
  // Removing a player by hand still takes their plays, hand-overs and ledger with them.
  await query("delete from players where id = $1", [em]);
  assert.deepEqual(await query("select (select count(*)::int from ticket_events) as t, (select count(*)::int from redemptions) as r, (select count(*)::int from plays) as p"), [{ t: 0, r: 0, p: 1 }]);
});
