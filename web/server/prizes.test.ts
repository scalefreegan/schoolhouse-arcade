import assert from "node:assert/strict";
import { test } from "node:test";
import { answerOf, parseFact } from "../shared/comet/facts.ts";
import type { AnswerInput } from "../shared/play.ts";
import type { CounterReply, ErrorReply, GrownupReply, PinState, PlayReply, Player, PlayersReply, Prize, ProgressReply, RedeemReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { handleCounter } from "./counter.ts";
import { rawDb, setDb } from "./db.ts";
import { handleGrownup } from "./grownup.ts";
import type { IncomingMessage } from "node:http";
import { LOCK_MS, MAX_TRIES, requirePin, resetPinGuard } from "./pin.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";
import { request } from "./testhttp.ts";

// Tickets, badges, prizes and the grown-up PIN: the real routes on an
// in-process PGlite. These are the rows that stand for real ice creams.

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const PIN = "4821";
const withPin = (pin = PIN) => ({ ...APP, "x-grownup-pin": pin });
const plays = wrap(handlePlays);
const players = wrap(handlePlayers);
const counter = wrap(handleCounter);
const grownup = wrap(handleGrownup);

const right = (fact: string, ms = 2500): AnswerInput => ({ fact, given: answerOf(parseFact(fact)!), ms });
const wrong = (fact: string, ms = 2500): AnswerInput => ({ fact, given: 99, ms });
const many = (n: number, make: () => AnswerInput) => Array.from({ length: n }, make);
type Reply<T> = T & ErrorReply;

async function arcade(t: { after: (fn: () => unknown) => void }, opts: { pin?: boolean } = {}) {
  const fresh = await freshDb();
  setDb(fresh.db);
  resetPinGuard();
  t.after(async () => {
    setDb(null);
    await fresh.close();
  });
  if (opts.pin !== false) await request(grownup, "POST", "/pin", { pin: PIN }, APP);
  const join = async (name: string) => (await request<Player>(players, "POST", "/", { name, avatar: "rex" }, APP)).body.id;
  const play = (playerId: string, config: { level?: string; mode?: string; skill?: string }, answers: AnswerInput[]) =>
    request<Reply<PlayReply>>(plays, "POST", "/", { playerId, gameId: "comet-cards", level: "add-5", mode: "blitz", skill: "easy", ...config, answers }, APP);
  const at = async (playerId: string) => (await request<CounterReply>(counter, "GET", `/?player=${playerId}`, undefined, APP)).body;
  const give = (playerId: string, delta: number, note?: string) => request<Reply<{ tickets: number }>>(grownup, "POST", "/tickets", { playerId, delta, note }, withPin());
  const prize = async (playerId: string, name: string) => (await at(playerId)).prizes.find((p) => p.name === name)!;
  const redeem = (playerId: string, prizeId: string, headers: Record<string, string> = withPin()) => request<Reply<RedeemReply>>(grownup, "POST", "/redeem", { playerId, prizeId }, headers);
  const ledger = (playerId: string) => fresh.query("select delta, reason, note, play_id is not null as play, redemption_id is not null as redemption from ticket_events where player_id = $1 order by id", [playerId]);
  return { ...fresh, join, play, at, give, prize, redeem, ledger };
}

test("a play pays its right answers, its star and its badges, every line goes in the ledger, and the balance is their sum", async (t) => {
  const { join, play, at, ledger } = await arcade(t);
  const em = await join("Em");
  // Easy Blitz: 16 right, 1 missed. A first game, a first star, a run of 10.
  const sent = await play(em, {}, [...many(12, () => right("2+3")), wrong("1+1"), ...many(4, () => right("2+2"))]);
  assert.equal(sent.status, 201);
  assert.deepEqual(sent.body.tickets.lines, [
    { reason: "play", amount: 16 },
    { reason: "star", amount: 20 },
    { reason: "badge", amount: 10, badge: "first-game" },
    { reason: "badge", amount: 25, badge: "comet-add-5" },
    { reason: "badge", amount: 20, badge: "combo-10" },
  ]);
  assert.deepEqual(sent.body.badges, ["first-game", "comet-add-5", "combo-10"]);
  assert.deepEqual([sent.body.tickets.total, sent.body.tickets.balance], [91, 91]);
  assert.deepEqual(await ledger(em), [
    { delta: 16, reason: "play", note: null, play: true, redemption: false },
    { delta: 20, reason: "star", note: null, play: true, redemption: false },
    { delta: 10, reason: "badge", note: "first-game", play: true, redemption: false },
    { delta: 25, reason: "badge", note: "comet-add-5", play: true, redemption: false },
    { delta: 20, reason: "badge", note: "combo-10", play: true, redemption: false },
  ]);
  const seen = await at(em);
  assert.equal(seen.tickets, 91);
  assert.deepEqual(seen.badges.map((b) => b.id).sort(), ["combo-10", "comet-add-5", "first-game"]);
});

test("a badge and a star pay once: the same round again pays only its answers, and beating it pays the best bonus", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const round = [...many(12, () => right("2+3")), wrong("1+1"), ...many(4, () => right("2+2"))];
  await play(em, {}, round);
  const again = await play(em, {}, round);
  assert.deepEqual([again.body.tickets.lines, again.body.badges, again.body.tickets.balance], [[{ reason: "play", amount: 16 }], [], 107]);
  const better = await play(em, {}, [...round, right("0+1")]);
  assert.deepEqual(better.body.tickets.lines, [{ reason: "play", amount: 17 }, { reason: "best", amount: 10 }]);
  assert.deepEqual(await query("select count(*)::int as n from badges_earned"), [{ n: 3 }]);
});

test("Arcade pays double, Practice pays a flat 5 for finishing, and one player's tickets are not another's", async (t) => {
  const { join, play, at } = await arcade(t);
  const [em, al] = [await join("Em"), await join("Al")];
  const arcadeRound = await play(em, { skill: "arcade" }, [right("1+1"), right("1+2"), wrong("2+2")]);
  assert.deepEqual(arcadeRound.body.tickets.lines.find((l) => l.reason === "play"), { reason: "play", amount: 4 });
  const practice = await play(al, { mode: "practice" }, many(15, () => right("2+3")));
  assert.deepEqual(practice.body.tickets.lines, [{ reason: "play", amount: 5 }, { reason: "badge", amount: 10, badge: "first-game" }, { reason: "badge", amount: 20, badge: "combo-10" }]);
  const quit = await play(al, { mode: "practice" }, many(3, () => right("2+3")));
  assert.deepEqual([quit.body.tickets.total, quit.body.tickets.balance], [0, 35]);
  assert.equal((await at(em)).tickets, 4 + 10);
  assert.equal((await at(al)).tickets, 35);
});

test("a Sprint with no misses wins Clean Sweep; one miss does not", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const missed = await play(em, { mode: "sprint" }, [wrong("1+1"), ...many(20, () => right("2+3"))]);
  assert.ok(!missed.body.badges.includes("clean-sprint"));
  const clean = await play(em, { mode: "sprint" }, many(20, () => right("2+3")));
  assert.ok(clean.body.badges.includes("clean-sprint"), JSON.stringify(clean.body.badges));
});

test("the shelf starts with the three examples, cheapest first, and the counter is read-only", async (t) => {
  const { join, at } = await arcade(t);
  const em = await join("Em");
  const seen = await at(em);
  assert.deepEqual(seen.prizes.map((p) => [p.name, p.icon, p.cost, p.badge]), [["A candy", "candy", 100, null], ["An ice cream", "icecream", 300, null], ["A new video game", "gamepad", 2500, "arcade-ace"]]);
  assert.deepEqual([seen.tickets, seen.badges, seen.won], [0, [], []]);
  assert.equal((await request(counter, "POST", `/?player=${em}`, {}, APP)).status, 405);
  assert.equal((await request(counter, "GET", "/?player=nobody", undefined, APP)).status, 404);
});

test("nothing behind the PIN happens without it: no PIN, a wrong PIN and a malformed one are all refused, and nothing is written", async (t) => {
  const { join, give, prize, query } = await arcade(t);
  const em = await join("Em");
  await give(em, 500);
  const candy = await prize(em, "A candy");
  const before = JSON.stringify(await query("select (select count(*) from ticket_events) as t, (select count(*) from redemptions) as r, (select count(*) from prizes where retired_at is null) as p, (select count(*) from players where retired_at is null) as pl, (select count(*) from level_opens) as o"));
  const calls: [string, string, unknown?][] = [
    ["GET", "/"],
    ["POST", "/redeem", { playerId: em, prizeId: candy.id }],
    ["POST", "/prizes", { name: "Bike", icon: "gift", cost: 1 }],
    ["PATCH", `/prizes/${candy.id}`, { name: "Free candy", icon: "candy", cost: 1 }],
    ["DELETE", `/prizes/${candy.id}`],
    ["POST", "/tickets", { playerId: em, delta: 9999 }],
    ["POST", "/levels", { playerId: em, gameId: "comet-cards", level: "big-20" }],
    ["DELETE", `/players/${em}`],
    ["POST", "/pin", { pin: "0000" }],
    ["GET", "/no-such-thing"],
  ];
  for (const headers of [APP, withPin("0000"), withPin("48211"), withPin("")]) {
    for (const [method, url, body] of calls) {
      resetPinGuard(); // this test is about the wall, not the lock
      const sent = await request<ErrorReply>(grownup, method, url, body, headers);
      assert.deepEqual([sent.status, sent.body.code], [401, "pin_wrong"], `${method} ${url} with ${JSON.stringify(headers["x-grownup-pin" as keyof typeof headers])}`);
    }
  }
  assert.equal(JSON.stringify(await query("select (select count(*) from ticket_events) as t, (select count(*) from redemptions) as r, (select count(*) from prizes where retired_at is null) as p, (select count(*) from players where retired_at is null) as pl, (select count(*) from level_opens) as o")), before);
  assert.equal((await request(grownup, "GET", "/", undefined, withPin())).status, 200, "and the right PIN still works");
});

test("the first PIN is chosen without one; after that changing it needs the old one; the hash is stored, never the PIN", async (t) => {
  const { query } = await arcade(t, { pin: false });
  assert.deepEqual((await request<PinState>(grownup, "GET", "/pin", undefined, APP)).body, { set: false });
  const early = await request<ErrorReply>(grownup, "GET", "/", undefined, withPin());
  assert.deepEqual([early.status, early.body.code], [401, "pin_unset"]);
  for (const bad of ["123", "12345", "abcd", 1234, null]) assert.equal((await request(grownup, "POST", "/pin", { pin: bad }, APP)).status, 400, String(bad));
  assert.deepEqual((await request<PinState>(grownup, "GET", "/pin", undefined, APP)).body, { set: false });
  assert.equal((await request(grownup, "POST", "/pin", { pin: PIN }, APP)).status, 200);
  assert.deepEqual((await request<PinState>(grownup, "GET", "/pin", undefined, APP)).body, { set: true });
  const [{ value }] = (await query("select value from settings where key = 'grownup_pin'")) as { value: string }[];
  assert.match(value, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(!value.includes(PIN));
  // A second "first PIN" is a takeover attempt.
  assert.equal((await request(grownup, "POST", "/pin", { pin: "1111" }, APP)).status, 401);
  assert.equal((await request(grownup, "GET", "/", undefined, withPin("1111"))).status, 401);
  assert.equal((await request(grownup, "POST", "/pin", { pin: "1111" }, withPin())).status, 200);
  assert.equal((await request(grownup, "GET", "/", undefined, withPin("1111"))).status, 200);
  assert.equal((await request(grownup, "GET", "/", undefined, withPin())).status, 401, "the old PIN is dead");
});

test("five wrong PINs in a row lock the door for a minute, even to the right PIN; a request with no PIN is not a guess", async (t) => {
  await arcade(t);
  const db = rawDb();
  const req = (pin?: string) => ({ headers: pin === undefined ? {} : { "x-grownup-pin": pin } }) as unknown as IncomingMessage;
  const tryPin = (pin: string | undefined, now: number) => requirePin(db, req(pin), now).then(() => "in", (e: { code?: string }) => e.code);
  for (let i = 0; i < 20; i++) assert.equal(await tryPin(undefined, 1000), "pin_wrong");
  for (let i = 0; i < MAX_TRIES - 1; i++) assert.equal(await tryPin("0000", 1000), "pin_wrong");
  assert.equal(await tryPin(PIN, 1000), "in", "a right PIN in time clears the count");
  for (let i = 0; i < MAX_TRIES - 1; i++) assert.equal(await tryPin("0000", 2000), "pin_wrong");
  assert.equal(await tryPin("0000", 2000), "pin_locked", "the fifth");
  assert.equal(await tryPin(PIN, 2000 + LOCK_MS - 1), "pin_locked");
  assert.equal(await tryPin(PIN, 2000 + LOCK_MS), "in");
});

test("handing over a prize takes its tickets and writes it down; too few tickets hands over nothing", async (t) => {
  const { join, give, prize, redeem, at, ledger, query } = await arcade(t);
  const em = await join("Em");
  const candy = await prize(em, "A candy");
  await give(em, 99, "chores");
  const short = await redeem(em, candy.id);
  assert.equal(short.status, 409);
  assert.match(short.body.error, /costs 100 tickets\. Em has 99\./);
  assert.deepEqual(await query("select count(*)::int as n from redemptions"), [{ n: 0 }]);
  await give(em, 151);
  const handed = await redeem(em, candy.id);
  assert.equal(handed.status, 201);
  assert.deepEqual([handed.body.tickets, handed.body.won.name, handed.body.won.icon, handed.body.won.cost], [150, "A candy", "candy", 100]);
  assert.deepEqual(await ledger(em), [
    { delta: 99, reason: "adjust", note: "chores", play: false, redemption: false },
    { delta: 151, reason: "adjust", note: null, play: false, redemption: false },
    { delta: -100, reason: "prize", note: "A candy", play: false, redemption: true },
  ]);
  const seen = await at(em);
  assert.deepEqual([seen.tickets, seen.won.map((w) => w.name)], [150, ["A candy"]]);
  // A prize can be won again, while the tickets last.
  assert.equal((await redeem(em, candy.id)).body.tickets, 50);
  assert.equal((await redeem(em, candy.id)).status, 409);
  assert.equal((await at(em)).tickets, 50);
});

test("two hand-overs at once cannot both spend the same tickets", async (t) => {
  const { join, give, prize, redeem, at, query } = await arcade(t);
  const em = await join("Em");
  await give(em, 100);
  const candy = await prize(em, "A candy");
  const both = await Promise.all([redeem(em, candy.id), redeem(em, candy.id)]);
  assert.deepEqual(both.map((b) => b.status).sort(), [201, 409]);
  assert.equal((await at(em)).tickets, 0);
  assert.deepEqual(await query("select count(*)::int as n from redemptions"), [{ n: 1 }]);
});

test("a prize that needs a badge is refused without it, whatever the tickets; a prize off the shelf cannot be handed over", async (t) => {
  const { join, give, prize, redeem, at } = await arcade(t);
  const em = await join("Em");
  await give(em, 9000);
  const game = await prize(em, "A new video game");
  const refused = await redeem(em, game.id);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /needs a badge/);
  assert.equal((await at(em)).tickets, 9000);
  const candy = await prize(em, "A candy");
  assert.equal((await request(grownup, "DELETE", `/prizes/${candy.id}`, undefined, withPin())).status, 200);
  assert.equal((await redeem(em, candy.id)).status, 404);
  assert.equal((await redeem(em, "not-a-prize")).status, 404);
  assert.equal((await redeem("not-a-player", game.id)).status, 404);
});

test("a hand-over keeps the name and price of the day, even after the prize is repriced or removed", async (t) => {
  const { join, give, prize, redeem, at } = await arcade(t);
  const em = await join("Em");
  await give(em, 500);
  const candy = await prize(em, "A candy");
  await redeem(em, candy.id);
  const changed = await request<Reply<Prize>>(grownup, "PATCH", `/prizes/${candy.id}`, { name: "Two candies", icon: "candy", cost: 150 }, withPin());
  assert.deepEqual([changed.status, changed.body.name, changed.body.cost], [200, "Two candies", 150]);
  await request(grownup, "DELETE", `/prizes/${candy.id}`, undefined, withPin());
  const seen = await at(em);
  assert.deepEqual(seen.won.map((w) => [w.name, w.cost]), [["A candy", 100]]);
  assert.ok(!seen.prizes.some((p) => p.id === candy.id));
});

test("a grown-up can add a prize and the shelf refuses a bad one or a thirteenth", async (t) => {
  const { join, at } = await arcade(t);
  const em = await join("Em");
  assert.equal((await request(grownup, "POST", "/prizes", { name: "Bike", icon: "bicycle", cost: 100 }, withPin())).status, 400);
  assert.equal((await request(grownup, "POST", "/prizes", { name: "Bike", icon: "gift", cost: -5 }, withPin())).status, 400);
  for (let i = 0; i < 9; i++) assert.equal((await request(grownup, "POST", "/prizes", { name: `Treat ${i}`, icon: "gift", cost: 10 + i }, withPin())).status, 201);
  assert.equal((await request(grownup, "POST", "/prizes", { name: "One more", icon: "gift", cost: 1 }, withPin())).status, 409);
  const shelf = (await at(em)).prizes;
  assert.equal(shelf.length, 12);
  assert.deepEqual(shelf.map((p) => p.cost), [...shelf.map((p) => p.cost)].sort((a, b) => a - b), "cheapest first");
});

test("tickets by hand: added with a note, never below nothing, never by nothing", async (t) => {
  const { join, give, at } = await arcade(t);
  const em = await join("Em");
  assert.deepEqual((await give(em, 40, "Tidied  the  playroom")).body, { tickets: 40 });
  assert.deepEqual((await give(em, -15)).body, { tickets: 25 });
  const under = await give(em, -26);
  assert.equal(under.status, 409);
  assert.match(under.body.error, /Em only has 25 tickets/);
  for (const bad of [0, 1.5, 10_001, -10_001, "5"]) assert.equal((await give(em, bad as number)).status, 400, String(bad));
  assert.equal((await give(em, 5, "x".repeat(61))).status, 400);
  assert.equal((await at(em)).tickets, 25);
});

test("a grown-up can open a level early: it shows as open and a play on it is accepted and paid", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const progress = async () => (await request<ProgressReply>(plays, "GET", `/progress?player=${em}&game=comet-cards`, undefined, APP)).body.open;
  assert.deepEqual(await progress(), ["add-5"]);
  assert.equal((await play(em, { level: "sub-10" }, [right("5-2")])).status, 403);
  assert.equal((await request(grownup, "POST", "/levels", { playerId: em, gameId: "comet-cards", level: "nope" }, withPin())).status, 404);
  const opened = await request<{ levels: { level: string; open: boolean }[] }>(grownup, "POST", "/levels", { playerId: em, gameId: "comet-cards", level: "sub-10" }, withPin());
  assert.equal(opened.status, 201);
  assert.deepEqual(opened.body.levels.filter((l) => l.open).map((l) => l.level), ["add-5", "sub-10"]);
  assert.equal((await request(grownup, "POST", "/levels", { playerId: em, gameId: "comet-cards", level: "sub-10" }, withPin())).status, 201, "twice is harmless");
  assert.deepEqual(await progress(), ["add-5", "sub-10"]);
  const played = await play(em, { level: "sub-10" }, [right("5-2"), right("9-4")]);
  assert.deepEqual([played.status, played.body.tickets.lines[0]], [201, { reason: "play", amount: 2 }]);
});

test("a retired player leaves the picker but keeps their place on the high scores", async (t) => {
  const { join, play } = await arcade(t);
  const [em, al] = [await join("Em"), await join("Al")];
  await play(em, {}, many(16, () => right("2+3")));
  assert.equal((await request(grownup, "DELETE", `/players/${em}`, undefined, withPin())).status, 200);
  assert.equal((await request(grownup, "DELETE", `/players/${em}`, undefined, withPin())).status, 404);
  assert.deepEqual((await request<PlayersReply>(players, "GET", "/", undefined, APP)).body.players.map((p) => p.id), [al]);
  const board = await request<{ rows: { name: string }[] }>(plays, "GET", "/board?game=comet-cards&level=add-5&mode=blitz&skill=easy", undefined, APP);
  assert.deepEqual(board.body.rows.map((r) => r.name), ["Em"]);
  assert.equal((await play(em, {}, [right("2+3")])).status, 404, "and cannot play on");
});

test("the grown-up page shows every player's tickets and levels, the shelf, the hand-overs and the ledger", async (t) => {
  const { join, give, prize, redeem, play } = await arcade(t);
  const [em, al] = [await join("Em"), await join("Al")];
  await play(em, {}, many(16, () => right("2+3")));
  await give(al, 120, "birthday");
  await redeem(al, (await prize(al, "A candy")).id);
  const page = (await request<GrownupReply>(grownup, "GET", "/", undefined, withPin())).body;
  assert.deepEqual(page.players.map((p) => [p.name, p.tickets]), [["Em", 16 + 20 + 10 + 25 + 20], ["Al", 20]]);
  assert.deepEqual(page.players[0].levels.map((l) => [l.level, l.stars, l.open]), [["add-5", 1, true], ["add-10", 0, true], ["sub-10", 0, false], ["mix-10", 0, false], ["big-20", 0, false]]);
  assert.equal(page.players[0].levels[0].game, "Comet Cards");
  assert.equal(page.prizes.length, 3);
  assert.deepEqual(page.handed.map((h) => [h.player, h.name, h.cost]), [["Al", "A candy", 100]]);
  assert.deepEqual(page.ledger.slice(0, 2).map((l) => [l.name, l.delta, l.reason, l.note]), [["Al", -100, "prize", "A candy"], ["Al", 120, "adjust", "birthday"]]);
});
