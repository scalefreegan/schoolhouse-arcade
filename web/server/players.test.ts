import assert from "node:assert/strict";
import { test } from "node:test";
import type { ErrorReply, Player, PlayersReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { setDb } from "./db.ts";
import { MAX_PLAYERS, handlePlayers } from "./players.ts";
import { request } from "./testhttp.ts";

// The real route on an in-process PGlite. wrap() is in the path so a thrown
// HttpError arrives as the status and sentence a browser would get.

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const players = wrap(handlePlayers);

async function withDb(t: { after: (fn: () => unknown) => void }) {
  const fresh = await freshDb();
  setDb(fresh.db);
  t.after(async () => {
    setDb(null);
    await fresh.close();
  });
  return fresh;
}

test("a new player joins and is on the picker, oldest first", async (t) => {
  await withDb(t);
  assert.deepEqual((await request<PlayersReply>(players, "GET", "/", undefined, APP)).body, { players: [] });
  const made = await request<Player>(players, "POST", "/", { name: "  Em ", avatar: "rex" }, APP);
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.name, made.body.avatar, made.body.colour], ["Em", "rex", null]);
  await request(players, "POST", "/", { name: "Dad", avatar: "bolt" }, APP);
  const list = (await request<PlayersReply>(players, "GET", "/", undefined, APP)).body.players;
  assert.deepEqual(list.map((p) => p.name), ["Em", "Dad"]);
});

test("a player with no name, a long name or an unknown character is refused, and nothing is stored", async (t) => {
  const { query } = await withDb(t);
  for (const body of [{ avatar: "rex" }, { name: "   ", avatar: "rex" }, { name: "x".repeat(11), avatar: "rex" }, { name: "Em" }, { name: "Em", avatar: "smaug" }, { name: 7, avatar: "rex" }, { name: "Em", avatar: "rex", colour: "silver" }, { name: "Em", avatar: "rex", colour: 7 }, { name: "Em", avatar: "nova", colour: "pink" }]) {
    const sent = await request<ErrorReply>(players, "POST", "/", body, APP);
    assert.equal(sent.status, 400, JSON.stringify(body));
    assert.ok(sent.body.error);
  }
  assert.equal((await query("select count(*)::int as n from players"))[0].n, 0);
});

test("a player can change name or character; the other is kept", async (t) => {
  await withDb(t);
  const { body: em } = await request<Player>(players, "POST", "/", { name: "Em", avatar: "rex" }, APP);
  const renamed = await request<Player>(players, "PATCH", `/${em.id}`, { name: "Emmy" }, APP);
  assert.deepEqual([renamed.status, renamed.body.name, renamed.body.avatar], [200, "Emmy", "rex"]);
  const redrawn = await request<Player>(players, "PATCH", `/${em.id}`, { avatar: "fuzz" }, APP);
  assert.deepEqual([redrawn.body.name, redrawn.body.avatar], ["Emmy", "fuzz"]);
  assert.equal((await request(players, "PATCH", `/${em.id}`, { avatar: "smaug" }, APP)).status, 400);
});

test("a character comes in a colour: stored, listed, and checked against that character", async (t) => {
  const { query } = await withDb(t);
  const made = await request<Player>(players, "POST", "/", { name: "Em", avatar: "toast", colour: "teal" }, APP);
  assert.deepEqual([made.status, made.body.avatar, made.body.colour], [201, "toast", "teal"]);
  assert.deepEqual((await request<PlayersReply>(players, "GET", "/", undefined, APP)).body.players.map((p) => [p.avatar, p.colour]), [["toast", "teal"]]);
  // Silver is a robot's colour, not a dragon's: refused, and nothing changes.
  const wrong = await request<ErrorReply>(players, "PATCH", `/${made.body.id}`, { avatar: "toast", colour: "silver" }, APP);
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /colour/);
  // A colour on its own is refused: it belongs to a character.
  assert.equal((await request(players, "PATCH", `/${made.body.id}`, { colour: "red" }, APP)).status, 400);
  assert.deepEqual(await query("select avatar, colour from players"), [{ avatar: "toast", colour: "teal" }]);
  const recoloured = await request<Player>(players, "PATCH", `/${made.body.id}`, { avatar: "mitts", colour: "grey" }, APP);
  assert.deepEqual([recoloured.status, recoloured.body.avatar, recoloured.body.colour], [200, "mitts", "grey"]);
  // A rename keeps the colour; a new character without one is that character's own look.
  assert.equal((await request<Player>(players, "PATCH", `/${made.body.id}`, { name: "Emmy" }, APP)).body.colour, "grey");
  assert.equal((await request<Player>(players, "PATCH", `/${made.body.id}`, { avatar: "crumb" }, APP)).body.colour, null);
  assert.deepEqual(await query("select avatar, colour from players"), [{ avatar: "crumb", colour: null }]);
});

test("a player with an id from before colours keeps it through a rename, and can become any character", async (t) => {
  const { query } = await withDb(t);
  const [{ id }] = await query("insert into players (name, avatar) values ('Old', 'gizmo') returning id");
  assert.deepEqual((await request<PlayersReply>(players, "GET", "/", undefined, APP)).body.players.map((p) => [p.avatar, p.colour]), [["gizmo", null]]);
  assert.equal((await request<Player>(players, "PATCH", `/${id}`, { name: "Older" }, APP)).body.avatar, "gizmo");
  const moved = await request<Player>(players, "PATCH", `/${id}`, { avatar: "bolt", colour: "gold" }, APP);
  assert.deepEqual([moved.status, moved.body.avatar, moved.body.colour], [200, "bolt", "gold"]);
});

test("an unknown, malformed or retired player id is a 404, not a crash", async (t) => {
  const { query } = await withDb(t);
  assert.equal((await request(players, "PATCH", "/00000000-0000-4000-8000-000000000000", { name: "X" }, APP)).status, 404);
  assert.equal((await request(players, "PATCH", "/not-a-uuid", { name: "X" }, APP)).status, 404);
  const { body: em } = await request<Player>(players, "POST", "/", { name: "Em", avatar: "rex" }, APP);
  await query("update players set retired_at = now() where id = $1", [em.id]);
  assert.equal((await request(players, "PATCH", `/${em.id}`, { name: "X" }, APP)).status, 404);
  assert.deepEqual((await request<PlayersReply>(players, "GET", "/", undefined, APP)).body.players, []);
});

test("the picker is capped, and says so", async (t) => {
  await withDb(t);
  for (let i = 0; i < MAX_PLAYERS; i++) assert.equal((await request(players, "POST", "/", { name: `P${i}`, avatar: "zib" }, APP)).status, 201);
  const sent = await request<ErrorReply>(players, "POST", "/", { name: "Extra", avatar: "zib" }, APP);
  assert.equal(sent.status, 409);
  assert.match(sent.body.error, /12 players/);
});

test("a body that is not JSON, or not an object, is a 400", async (t) => {
  await withDb(t);
  assert.equal((await request(players, "POST", "/", [1, 2], APP)).status, 400);
  assert.equal((await request(players, "DELETE", "/", undefined, APP)).status, 405);
});
