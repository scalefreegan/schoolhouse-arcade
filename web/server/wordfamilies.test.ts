import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { seeded } from "../shared/deal.ts";
import type { AnswerInput } from "../shared/play.ts";
import { roundWords, trayFor } from "../shared/wordfamilies/pick.ts";
import { answerText, type Skill } from "../shared/wordfamilies/rules.ts";
import { levelById } from "../shared/wordfamilies/words.ts";
import type { BoardReply, CounterReply, ErrorReply, PlayReply, Player, ProgressReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { handleCounter } from "./counter.ts";
import { setDb } from "./db.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";
import { playedClock, request } from "./testhttp.ts";

// Word Families through the real routes and a real (in-process)
// database: the server judges each tray and its pick from the text
// posted, and the rest is the arcade's (tables, stars, tickets, badges, the
// round clock).

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const GAME = "word-families";
const plays = wrap(handlePlays);
const players = wrap(handlePlayers);
const counter = wrap(handleCounter);

/** A whole round as a screen deals it, the first `right` answered right and the rest wrong. */
function round(level: string, skill: Skill = "easy", right = 8, seed = 1): AnswerInput[] {
  const l = levelById(level)!;
  return roundWords(l, {}, seeded(seed)).map((w, i) => {
    const tray = trayFor(w, skill, l, seeded(seed * 100 + i));
    return { fact: w.id, given: answerText(tray, i < right ? w.onset : tray.find((t) => t !== w.onset)!), ms: 3000 };
  });
}

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
    return request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId, gameId: GAME, roundId, clock: await playedClock(playerId, roundId, answers, GAME), level: "a", mode: "build", skill: "easy", ...config, answers }, APP);
  };
  const progress = async (playerId: string) => (await request<ProgressReply>(plays, "GET", `/progress?player=${playerId}&game=${GAME}`, undefined, APP)).body;
  return { ...fresh, join, play, progress };
}

test("a round is judged by the server from the trays posted; each answer is stored as text with its tray", async (t) => {
  const { join, play, query } = await arcade(t);
  const tess = await join("Tess");
  const sent = await play(tess, {}, [
    { fact: "bat", given: "b|c|h|m=b", ms: 3000 },
    { fact: "cat", given: "f|c|r|t=f", ms: 4000 },
    { fact: "hat", given: "s|c|h|m=h", ms: 200 },
  ]);
  assert.equal(sent.status, 201, sent.body.error);
  assert.deepEqual([sent.body.score, sent.body.right, sent.body.wrong, sent.body.bestCombo, sent.body.finished], [200, 2, 1, 1, false]);
  assert.deepEqual(await query("select game_id, fact, given, given_text, correct, ms from answers order by id"), [
    { game_id: GAME, fact: "bat", given: null, given_text: "b|c|h|m=b", correct: true, ms: 3000 },
    { game_id: GAME, fact: "cat", given: null, given_text: "f|c|r|t=f", correct: false, ms: 4000 },
    { game_id: GAME, fact: "hat", given: null, given_text: "s|c|h|m=h", correct: true, ms: 1000 },
  ]);
});

test("a tray that could not have been shown, or a pick that is not one of its tiles, is a 400 with the rule's sentence, and nothing is stored", async (t) => {
  const { join, play, query } = await arcade(t);
  const pip = await join("Pip");
  const cases: [{ mode?: string; skill?: string }, AnswerInput[], RegExp][] = [
    [{}, [{ fact: "bat", given: "b|p|h|m=b", ms: 2000 }], /no other tile sounds like/],
    [{}, [{ fact: "bat", given: "b|c|h=b", ms: 2000 }], /holds 4 tiles/],
    [{}, [{ fact: "bat", given: "s|c|h|m=s", ms: 2000 }], /first tile is not in the tray/],
    [{}, [{ fact: "bat", given: "b|c|h|m=s", ms: 2000 }], /not one of the tiles shown/],
    [{}, [{ fact: "pig", given: "p|c|h|m=p", ms: 2000 }], /not a word a asks/],
    [{}, [{ fact: "bat", given: "b|k|h|m=b", ms: 2000 }], /not a tile shown with -at/],
    [{}, [{ fact: "bat", given: "bat", ms: 2000 }], /not a tray of tiles and a pick/],
    [{}, [{ fact: "bat", given: 3, ms: 2000 }], /tiles shown and the tile picked/],
    [{ mode: "hear" }, [{ fact: "bat", given: "b|c|h|m=b", ms: 2000 }], /no game/],
    // An Easy round sent as Arcade's (double tickets, the Arcade table).
    [{ skill: "arcade" }, round("a", "easy"), /holds 6 tiles/],
  ];
  for (const [config, answers, why] of cases) {
    const sent = await play(pip, config, answers);
    assert.equal(sent.status, 400, JSON.stringify(answers));
    assert.match(sent.body.error, why);
  }
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
});

test("a star on a level opens the next; a locked level cannot be played; each set-up has its own table; tickets and the badges are Word Families'", async (t) => {
  const { join, play, progress } = await arcade(t);
  const max = await join("Max");
  const juno = await join("Juno");
  assert.deepEqual((await progress(max)).open, ["a"]);
  assert.equal((await play(max, { level: "i" }, round("i"))).status, 403);
  const four = await play(max, {}, round("a", "easy", 4));
  assert.equal(four.status, 201, four.body.error);
  assert.deepEqual([four.body.finished, four.body.starsAfter, four.body.opened, four.body.rank], [true, 0, null, 1]);
  const five = await play(max, {}, round("a", "easy", 5, 2));
  assert.equal(five.status, 201, five.body.error);
  // 5 tickets, a best score on this table (10), a first star (20), and Open Door (25); First Game was the round before.
  assert.deepEqual([five.body.starsAfter, five.body.opened, five.body.badges, five.body.tickets.total], [1, "i", ["family-door"], 5 + 10 + 20 + 25]);
  const all = await play(max, { skill: "arcade" }, round("a", "arcade"));
  assert.equal(all.status, 201, all.body.error);
  assert.deepEqual([all.body.starsAfter, all.body.score, all.body.bestCombo, all.body.rank], [3, 1360, 8, 1]);
  // 16 for the answers, two more stars (40).
  assert.deepEqual(all.body.tickets.lines, [{ reason: "play", amount: 16 }, { reason: "star", amount: 40 }]);
  const p = await progress(max);
  assert.deepEqual([p.stars, p.open], [{ a: 3 }, ["a", "i"]]);
  const next = await play(max, { level: "i", skill: "arcade" }, round("i", "arcade", 7));
  assert.deepEqual([next.status, next.body.starsAfter, next.body.opened], [201, 2, "o"]);
  const other = await play(juno, {}, round("a", "easy", 8, 3));
  assert.deepEqual([other.status, other.body.rank, other.body.board.rows.map((r) => r.name)], [201, 1, ["Juno", "Max", "Max"]]); // Max played this table twice: a table is of plays
  const table = await request<BoardReply>(plays, "GET", `/board?game=${GAME}&level=i&mode=build&skill=easy`, undefined, APP);
  assert.deepEqual([table.status, table.body.kind, table.body.rows], [200, "score", []]);
  assert.equal((await request(plays, "GET", `/board?game=${GAME}&level=a&mode=hear&skill=easy`, undefined, APP)).status, 404);
  const held = (await request<CounterReply>(counter, "GET", `/?player=${max}`, undefined, APP)).body.badges.map((x) => x.id);
  assert.deepEqual(held.sort(), ["family-door", "first-game"]);
});

test("the round clock holds for Word Families: eight instant answers claim eight seconds, and are refused until they have passed", async (t) => {
  const { join, query, progress } = await arcade(t);
  const tess = await join("Tess");
  const config = { level: "a", mode: "build", skill: "easy" };
  const instant = round("a").map((a) => ({ ...a, ms: 0 }));
  const post = (roundId: string, clock: string) => request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId: tess, gameId: GAME, roundId, clock, ...config, answers: instant }, APP);
  const id = randomUUID();
  const { clock } = (await request<{ clock: string }>(plays, "POST", "/start", { playerId: tess, gameId: GAME, roundId: id }, APP)).body;
  const early = await post(id, clock);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /quicker than the clock/);
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
  assert.equal((await post(id, await playedClock(tess, id, instant, "rhyme-time"))).status, 400, "Rhyme Time's clock is not this game's");
  const late = await post(id, await playedClock(tess, id, instant, GAME));
  assert.deepEqual([late.status, late.body.timeMs, late.body.right], [201, 8000, 8]);
  const facts = (await progress(tess)).facts;
  assert.deepEqual(Object.keys(facts).sort(), instant.map((a) => a.fact).sort());
});
