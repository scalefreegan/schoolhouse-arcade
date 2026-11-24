import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { answerOf, parseFact } from "../shared/comet/facts.ts";
import type { AnswerInput } from "../shared/play.ts";
import type { BoardReply, ErrorReply, PlayReply, Player, ProgressReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { startClock } from "./clock.ts";
import { rawDb, setDb } from "./db.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";
import { playedClock, request } from "./testhttp.ts";

// The real routes on an in-process PGlite: what the browser sends, what the
// server stores, what comes back.

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const plays = wrap(handlePlays);
const players = wrap(handlePlayers);

const right = (fact: string, ms = 2500): AnswerInput => ({ fact, given: answerOf(parseFact(fact)!), ms });
const wrong = (fact: string, ms = 2500): AnswerInput => ({ fact, given: 99, ms });
const many = (n: number, make: () => AnswerInput) => Array.from({ length: n }, make);

async function arcade(t: { after: (fn: () => unknown) => void }) {
  const fresh = await freshDb();
  setDb(fresh.db);
  t.after(async () => {
    setDb(null);
    await fresh.close();
  });
  const join = async (name: string) => (await request<Player>(players, "POST", "/", { name, avatar: "rex" }, APP)).body.id;
  const play = async (playerId: string, config: { level?: string; mode?: string; skill?: string }, answers: AnswerInput[]) => {
    const roundId = randomUUID();
    return request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId, gameId: "comet-cards", roundId, clock: await playedClock(playerId, roundId, answers), level: "add-5", mode: "blitz", skill: "arcade", ...config, answers }, APP);
  };
  const progress = async (playerId: string) => (await request<ProgressReply>(plays, "GET", `/progress?player=${playerId}&game=comet-cards`, undefined, APP)).body;
  return { ...fresh, join, play, progress };
}

test("the server scores a play from its answers and stores every one", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const sent = await play(em, { mode: "practice" }, [right("1+1"), right("2+2", 1000), wrong("2+3"), right("0+1")]);
  assert.equal(sent.status, 201);
  // 100 + (100 + 50) + 0 + 100
  assert.deepEqual([sent.body.score, sent.body.right, sent.body.wrong, sent.body.bestCombo], [350, 3, 1, 2]);
  const [row] = await query("select score, right_count, wrong_count, finished, stars from plays");
  assert.deepEqual(row, { score: 350, right_count: 3, wrong_count: 1, finished: false, stars: 0 });
  const stored = await query("select fact, given, correct, ms from answers order by id");
  assert.deepEqual(stored.map((a) => [a.fact, a.given, a.correct]), [["1+1", 2, true], ["2+2", 4, true], ["2+3", 99, false], ["0+1", 1, true]]);
});

test("a score the browser sends is ignored", async (t) => {
  const { join, query } = await arcade(t);
  const em = await join("Em");
  const roundId = randomUUID();
  const sent = await request<PlayReply>(plays, "POST", "/", { playerId: em, gameId: "comet-cards", roundId, clock: await playedClock(em, roundId, [right("1+1")]), level: "add-5", mode: "blitz", skill: "arcade", score: 999999, stars: 3, answers: [right("1+1")] }, APP);
  assert.equal(sent.body.score, 100);
  assert.deepEqual(await query("select score, stars from plays"), [{ score: 100, stars: 0 }]);
});

test("a round that earns a star raises the level's stars, opens the next level, and never lowers them", async (t) => {
  const { join, play, progress } = await arcade(t);
  const em = await join("Em");
  assert.deepEqual((await progress(em)).open, ["add-5"]);
  const easy = await play(em, { skill: "easy" }, many(16, () => right("2+3", 3000)));
  assert.deepEqual([easy.body.starsBefore, easy.body.starsAfter, easy.body.opened], [0, 1, "add-10"]);
  const arcadeSkill = await play(em, {}, many(16, () => right("2+3", 3000)));
  assert.deepEqual([arcadeSkill.body.starsBefore, arcadeSkill.body.starsAfter, arcadeSkill.body.opened], [1, 2, null]);
  const worse = await play(em, { skill: "easy" }, many(16, () => right("2+3", 3000)));
  assert.deepEqual([worse.body.starsBefore, worse.body.starsAfter], [2, 2]);
  const p = await progress(em);
  assert.deepEqual(p.stars, { "add-5": 2 });
  assert.deepEqual(p.open, ["add-5", "add-10"]);
});

test("a locked level cannot be played, and nothing is stored", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const sent = await play(em, { level: "big-20" }, [right("9+9")]);
  assert.equal(sent.status, 403);
  assert.match(sent.body.error, /locked/);
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
});

test("a play the rules refuse is a 400 with the rule's sentence; an unknown game or player is a 404", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const foreign = await play(em, {}, [right("6+4")]);
  assert.equal(foreign.status, 400);
  assert.match(foreign.body.error, /not a card in Add to 5/);
  assert.equal((await play(em, { mode: "zen" }, [])).status, 400);
  assert.equal((await play("00000000-0000-4000-8000-000000000000", {}, [])).status, 404);
  assert.equal((await play("nope", {}, [])).status, 404);
  assert.equal((await request(plays, "POST", "/", { playerId: em, gameId: "pinball", roundId: randomUUID(), level: "add-5", mode: "blitz", skill: "easy", answers: [] }, APP)).status, 404);
  assert.equal((await request(plays, "POST", "/", { playerId: em, gameId: "constructor", roundId: randomUUID(), level: "add-5", mode: "blitz", skill: "easy", answers: [] }, APP)).status, 404);
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
});

test("a retired player cannot play", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  await query("update players set retired_at = now() where id = $1", [em]);
  assert.equal((await play(em, {}, [right("1+1")])).status, 404);
});

test("the Blitz table ranks by score, high first; a tie goes to whoever got there first; each set-up has its own table", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const dad = await join("Dad");
  const a = await play(em, {}, many(3, () => right("1+1")));
  assert.deepEqual([a.body.rank, a.body.personalBest], [1, false], "a first play is not a 'new best'");
  const b = await play(dad, {}, many(5, () => right("1+1")));
  assert.equal(b.body.rank, 1);
  const c = await play(em, {}, many(3, () => right("1+1")));
  assert.deepEqual([c.body.rank, c.body.personalBest], [3, false], "the same score, later");
  const d = await play(em, {}, many(8, () => right("1+1")));
  assert.deepEqual([d.body.rank, d.body.personalBest], [1, true]);
  assert.deepEqual(d.body.board.rows.map((r) => [r.name, r.right]), [["Em", 8], ["Dad", 5], ["Em", 3], ["Em", 3]]);
  assert.equal(d.body.board.kind, "score");
  const other = await request<BoardReply>(plays, "GET", "/board?game=comet-cards&level=add-5&mode=blitz&skill=easy", undefined, APP);
  assert.deepEqual(other.body, { kind: "score", rows: [] });
});

test("the Sprint table ranks by time, low first, and an unfinished Sprint is not on it", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const slow = await play(em, { mode: "sprint" }, many(20, () => right("1+1", 4000)));
  assert.deepEqual([slow.body.rank, slow.body.timeMs], [1, 80_000]);
  const quit = await play(em, { mode: "sprint" }, many(5, () => right("1+1", 100)));
  assert.deepEqual([quit.body.finished, quit.body.rank], [false, null]);
  const fast = await play(em, { mode: "sprint" }, many(20, () => right("1+1", 2000)));
  assert.deepEqual([fast.body.rank, fast.body.personalBest], [1, true]);
  assert.deepEqual(fast.body.board.rows.map((r) => r.timeMs), [40_000, 80_000]);
  assert.equal(fast.body.board.kind, "time");
});

test("Practice keeps no table", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const sent = await play(em, { mode: "practice" }, many(15, () => right("1+1")));
  assert.deepEqual([sent.body.finished, sent.body.rank, sent.body.board], [true, null, { kind: null, rows: [] }]);
});

test("the table holds ten", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  for (let i = 1; i <= 12; i++) await play(em, {}, many(i, () => right("1+1")));
  const last = await play(em, {}, [right("1+1")]);
  assert.equal(last.body.board.rows.length, 10);
  assert.equal(last.body.rank, 13);
});

test("progress: bests per set-up, and how each fact has gone lately; one player's rows are not another's", async (t) => {
  const { join, play, progress } = await arcade(t);
  const em = await join("Em");
  const dad = await join("Dad");
  await play(em, {}, [right("2+3", 1200), wrong("1+4"), right("2+3", 1800)]);
  await play(em, {}, [right("2+3", 1500)]);
  await play(dad, {}, many(9, () => right("0+0", 300)));
  const p = await progress(em);
  assert.deepEqual(p.facts, { "2+3": { seen: 3, missed: 0, ms: 1500 }, "1+4": { seen: 1, missed: 1, ms: null } });
  assert.deepEqual(p.bests, [{ level: "add-5", mode: "blitz", skill: "arcade", score: 300, timeMs: 1500, plays: 2 }], "150 + 0 + 150; the single-card play scored 150");
  assert.deepEqual(Object.keys((await progress(dad)).facts), ["0+0"]);
});

test("the read routes refuse what does not exist", async (t) => {
  const { join } = await arcade(t);
  const em = await join("Em");
  const get = (url: string) => request(plays, "GET", url, undefined, APP).then((s) => s.status);
  assert.equal(await get("/board?game=comet-cards&level=add-5&mode=blitz&skill=godlike"), 404);
  assert.equal(await get("/board?game=pinball&level=add-5&mode=blitz&skill=easy"), 404);
  assert.equal(await get(`/progress?player=${em}&game=pinball`), 404);
  assert.equal(await get("/progress?player=nope&game=comet-cards"), 404);
  assert.equal(await get("/nothing"), 404);
  assert.equal((await request(plays, "GET", "/", undefined, APP)).status, 405);
});

// ---------- the server's clock for a round (clock.ts) ----------

const COUNT = "select (select count(*)::int from plays) as plays, (select count(*)::int from ticket_events) as lines";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function clockArcade(t: { after: (fn: () => unknown) => void }) {
  const a = await arcade(t);
  const start = (playerId: string, roundId: string, gameId = "comet-cards") => request<{ clock: string } & ErrorReply>(plays, "POST", "/start", { playerId, gameId, roundId }, APP);
  const send = (playerId: string, roundId: string, clock: unknown, answers: AnswerInput[], config: { mode?: string } = {}) =>
    request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId, gameId: "comet-cards", roundId, clock, level: "add-5", mode: "practice", skill: "easy", ...config, answers }, APP);
  return { ...a, start, send };
}

test("a round started on the server and played honestly is saved", async (t) => {
  const { join, start, send } = await clockArcade(t);
  const em = await join("Em");
  const id = randomUUID();
  const begun = await start(em, id);
  assert.equal(begun.status, 201);
  assert.match(begun.body.clock, /^c1\.\d+\.0\./);
  await pause(600);
  const sent = await send(em, id, begun.body.clock, [right("1+1", 250), right("2+2", 300)]);
  assert.equal(sent.status, 201, sent.body.error);
  assert.equal(sent.body.right, 2);
  // The next round's clock names that play as the latest; time spent paused, or asleep, only adds wall time.
  const next = randomUUID();
  const again = await start(em, next);
  assert.match(again.body.clock, new RegExp(`^c1\\.\\d+\\.${sent.body.playId}\\.`));
  await pause(400);
  assert.equal((await send(em, next, again.body.clock, [right("1+1", 300)])).status, 201);
});

test("a play claiming more card time than has passed since its start is refused, and nothing is stored", async (t) => {
  const { join, start, send, query } = await clockArcade(t);
  const em = await join("Em");
  const id = randomUUID();
  const { clock } = (await start(em, id)).body;
  // Sixteen cards of 2.5 seconds each, sent the moment the round began.
  const sent = await send(em, id, clock, many(16, () => right("2+3")), { mode: "blitz" });
  assert.equal(sent.status, 400);
  assert.match(sent.body.error, /quicker than the clock/);
  // Answers under the floor count as the floor: 4 × 250 ms is still more than has passed.
  const instant = await send(em, id, clock, many(4, () => right("2+3", 0)));
  assert.equal(instant.status, 400);
  assert.deepEqual(await query(COUNT), [{ plays: 0, lines: 0 }]);
  // The same play, once the time it claims has passed, is saved.
  const earlier = await startClock(rawDb(), { playerId: em, gameId: "comet-cards", roundId: id }, Date.now() - 41_000);
  assert.equal((await send(em, id, earlier, many(16, () => right("2+3")), { mode: "blitz" })).status, 201);
});

test("a round already saved is answered with its play whatever clock comes with it, and nothing is written", async (t) => {
  const { join, start, send, query } = await clockArcade(t);
  const em = await join("Em");
  const id = randomUUID();
  const { clock } = (await start(em, id)).body;
  await pause(400);
  const first = await send(em, id, clock, [right("1+1", 300)]);
  assert.equal(first.status, 201);
  // Another round is played and saved after it: this round's clock is now behind.
  const other = randomUUID();
  const later = (await start(em, other)).body.clock;
  await pause(400);
  assert.equal((await send(em, other, later, [right("1+1", 300)])).status, 201);
  const written = await query(COUNT);
  for (const sentAgain of [clock, later, "nonsense", undefined]) {
    const retry = await send(em, id, sentAgain, [right("1+1", 300)]);
    assert.deepEqual([retry.status, retry.body.playId, retry.body.tickets.total], [201, first.body.playId, first.body.tickets.total], String(sentAgain));
  }
  assert.deepEqual(await query(COUNT), written);
});

test("a clock is good only for the player, game and round it was given for, as it was given", async (t) => {
  const { join, send, query } = await clockArcade(t);
  const [em, al] = [await join("Em"), await join("Al")];
  const id = randomUUID();
  const old = Date.now() - 60_000;
  const clock = await startClock(rawDb(), { playerId: em, gameId: "comet-cards", roundId: id }, old);
  const [v, at, after, sig] = clock.split(".");
  const refused = async (playerId: string, roundId: string, c: unknown) => {
    const sent = await send(playerId, roundId, c, [right("1+1")]);
    assert.equal(sent.status, 400, `${String(c)}: ${sent.body.error}`);
    return sent.body.error;
  };
  assert.match(await refused(al, id, clock), /not started here/, "another player's");
  assert.match(await refused(em, randomUUID(), clock), /not started here/, "another round's");
  assert.match(await refused(em, id, await startClock(rawDb(), { playerId: em, gameId: "pinball", roundId: id }, old)), /not started here/, "another game's");
  assert.match(await refused(em, id, [v, Number(at) - 600_000, after, sig].join(".")), /not started here/, "started earlier than it was");
  for (const mangled of ["", "c1", `${clock}x`, `c2.${at}.${after}.${sig}`, 7, null]) await refused(em, id, mangled);
  assert.match(await refused(em, id, undefined), /too old/, "a page from before clocks");
  assert.deepEqual(await query(COUNT), [{ plays: 0, lines: 0 }]);
  // The round id's case does not matter (a uuid is stored lower case).
  assert.equal((await send(em, id.toUpperCase(), clock, [right("1+1")])).status, 201);
  // And the key it is signed with is made once and kept: a restarted server still knows its clocks.
  assert.equal((await query("select count(*)::int as n from settings where key = 'round_clock_key'"))[0].n, 1);
});

test("clocks fetched ahead cannot be spent together: a play is refused when another was saved since its start", async (t) => {
  const { join, send, query } = await clockArcade(t);
  const em = await join("Em");
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const ago = Date.now() - 60_000;
  const clocks = await Promise.all(ids.map((roundId) => startClock(rawDb(), { playerId: em, gameId: "comet-cards", roundId }, ago)));
  assert.equal((await send(em, ids[0], clocks[0], [right("1+1")])).status, 201);
  for (const i of [1, 2]) {
    const sent = await send(em, ids[i], clocks[i], [right("1+1")]);
    assert.equal(sent.status, 409);
    assert.match(sent.body.error, /Another round was saved/);
  }
  assert.equal((await query(COUNT))[0].plays, 1);
});

test("the start route: a known player and game, a round id, POST only, and the wall in front of it", async (t) => {
  const { join, start } = await clockArcade(t);
  const em = await join("Em");
  assert.equal((await start("00000000-0000-4000-8000-000000000000", randomUUID())).status, 404);
  assert.equal((await start(em, randomUUID(), "pinball")).status, 404);
  const noId = await start(em, "nope");
  assert.equal(noId.status, 400);
  assert.match(noId.body.error, /Reload/);
  assert.equal((await request(plays, "GET", "/start", undefined, APP)).status, 405);
  assert.equal((await request(plays, "POST", "/start/more", { playerId: em }, APP)).status, 404);
  const foreign = await request(plays, "POST", "/start", { playerId: em, gameId: "comet-cards", roundId: randomUUID() }, { host: "localhost:38900", origin: "http://evil.example" });
  assert.equal(foreign.status, 403);
});
