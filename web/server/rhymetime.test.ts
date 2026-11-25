import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { seeded } from "../shared/deal.ts";
import type { AnswerInput } from "../shared/play.ts";
import { questionFor, roundPlan } from "../shared/rhymetime/pick.ts";
import { answerText, rightOf, type Mode, type Skill } from "../shared/rhymetime/rules.ts";
import { levelById } from "../shared/rhymetime/words.ts";
import type { BoardReply, CounterReply, ErrorReply, PlayReply, Player, ProgressReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { handleCounter } from "./counter.ts";
import { setDb } from "./db.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";
import { playedClock, request } from "./testhttp.ts";

// Rhyme Time through the real routes and a real (in-process) database: the
// server judges each question and its pick from the text posted, and the
// rest is the arcade's (tables, stars, tickets, badges, the round clock).

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const GAME = "rhyme-time";
const plays = wrap(handlePlays);
const players = wrap(handlePlayers);
const counter = wrap(handleCounter);

/** A whole round as a screen deals it, the first `right` answered right and the rest wrong. */
function round(level: string, mode: Mode, skill: Skill = "easy", right = 8, seed = 1): AnswerInput[] {
  const l = levelById(level)!;
  return roundPlan(l, mode, {}, seeded(seed)).map((planned, i) => {
    const q = questionFor(mode, skill, l, planned, seeded(seed * 100 + i));
    const good = rightOf(q)!;
    return { fact: planned.anchor.id, given: answerText(q, i < right ? good : q.choices.find((c) => c !== good)!), ms: 3000 };
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
    return request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId, gameId: GAME, roundId, clock: await playedClock(playerId, roundId, answers, GAME), level: "a-i", mode: "find", skill: "easy", ...config, answers }, APP);
  };
  const progress = async (playerId: string) => (await request<ProgressReply>(plays, "GET", `/progress?player=${playerId}&game=${GAME}`, undefined, APP)).body;
  return { ...fresh, join, play, progress };
}

test("a Find it round and an Odd one out round are judged by the server from the questions posted; each answer is stored as text with its question", async (t) => {
  const { join, play, query } = await arcade(t);
  const tess = await join("Tess");
  const found = await play(tess, {}, [
    { fact: "cat", given: "cat>hat|pig|ship=hat", ms: 3000 },
    { fact: "pin", given: "pin>chin|cat|map=cat", ms: 4000 },
    { fact: "chip", given: "chip>ship|pan|bat=ship", ms: 200 },
  ]);
  assert.equal(found.status, 201, found.body.error);
  assert.deepEqual([found.body.score, found.body.right, found.body.wrong, found.body.bestCombo, found.body.finished], [200, 2, 1, 1, false]);
  const odd = await play(tess, { mode: "odd" }, [{ fact: "pig", given: "pig|wig|cat=cat", ms: 2000 }, { fact: "van", given: "van|fan|ship=van", ms: 2000 }]);
  assert.deepEqual([odd.status, odd.body.score, odd.body.right, odd.body.wrong], [201, 100, 1, 1]);
  assert.deepEqual(await query("select game_id, fact, given, given_text, correct, ms from answers order by id"), [
    { game_id: GAME, fact: "cat", given: null, given_text: "cat>hat|pig|ship=hat", correct: true, ms: 3000 },
    { game_id: GAME, fact: "pin", given: null, given_text: "pin>chin|cat|map=cat", correct: false, ms: 4000 },
    { game_id: GAME, fact: "chip", given: null, given_text: "chip>ship|pan|bat=ship", correct: true, ms: 1000 },
    { game_id: GAME, fact: "pig", given: null, given_text: "pig|wig|cat=cat", correct: true, ms: 2000 },
    { game_id: GAME, fact: "van", given: null, given_text: "van|fan|ship=van", correct: false, ms: 2000 },
  ]);
});

test("a question that could not have been put, or a pick that is not one of its pictures, is a 400 with the rule's sentence, and nothing is stored", async (t) => {
  const { join, play, query } = await arcade(t);
  const pip = await join("Pip");
  const cases: [{ mode?: string; skill?: string }, AnswerInput[], RegExp][] = [
    [{}, [{ fact: "cat", given: "cat>hat|bat|pig=hat", ms: 2000 }], /only one, rhymes/],
    [{}, [{ fact: "cat", given: "cat>van|pig|ship=van", ms: 2000 }], /only one, rhymes/],
    [{}, [{ fact: "cat", given: "cat>hat|van|ship=hat", ms: 2000 }], /sound nothing like/],
    [{}, [{ fact: "cat", given: "cat>hat|pig|ship|chin=hat", ms: 2000 }], /how many pictures/],
    [{}, [{ fact: "cat", given: "cat>hat|pig|ship=dog", ms: 2000 }], /not one of the pictures/],
    [{}, [{ fact: "dog", given: "dog>log|cat|pin=log", ms: 2000 }], /not a word a i asks about/],
    [{}, [{ fact: "cat", given: "hat", ms: 2000 }], /not a question and a pick/],
    [{ mode: "odd" }, [{ fact: "cat", given: "cat|hat|cap=cap", ms: 2000 }], /look too alike/],
    [{ mode: "odd" }, [{ fact: "cat", given: "cat|hat|pig=pig", ms: 2000 }, { fact: "hat", given: "hat|cat|chip=chip", ms: 2000 }], /pair comes up once/],
    [{ skill: "arcade" }, [{ fact: "cat", given: "cat>hat|pig|ship=hat", ms: 2000 }], /how many pictures Arcade/],
  ];
  for (const [config, answers, why] of cases) {
    const sent = await play(pip, config, answers);
    assert.equal(sent.status, 400, JSON.stringify(answers));
    assert.match(sent.body.error, why);
  }
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
});

test("a star on a level opens the next; a locked level cannot be played; each set-up has its own table; tickets and the badges are Rhyme Time's", async (t) => {
  const { join, play, progress } = await arcade(t);
  const max = await join("Max");
  const juno = await join("Juno");
  assert.deepEqual((await progress(max)).open, ["a-i"]);
  assert.equal((await play(max, { level: "o-e-u" }, round("o-e-u", "find"))).status, 403);
  const four = await play(max, {}, round("a-i", "find", "easy", 4));
  assert.equal(four.status, 201, four.body.error);
  assert.deepEqual([four.body.finished, four.body.starsAfter, four.body.opened, four.body.rank], [true, 0, null, 1]);
  const five = await play(max, { mode: "odd" }, round("a-i", "odd", "easy", 5));
  assert.equal(five.status, 201, five.body.error);
  // 5 tickets, a first star (20), First Game was the round before, and Good Ear (25).
  assert.deepEqual([five.body.starsAfter, five.body.opened, five.body.badges, five.body.tickets.total], [1, "o-e-u", ["rhyme-ear"], 5 + 20 + 25]);
  const all = await play(max, { skill: "arcade" }, round("a-i", "find", "arcade"));
  assert.equal(all.status, 201, all.body.error);
  assert.deepEqual([all.body.starsAfter, all.body.score, all.body.bestCombo, all.body.rank], [3, 1360, 8, 1]);
  // 16 for the answers, two more stars (40).
  assert.deepEqual(all.body.tickets.lines, [{ reason: "play", amount: 16 }, { reason: "star", amount: 40 }]);
  const p = await progress(max);
  assert.deepEqual([p.stars, p.open], [{ "a-i": 3 }, ["a-i", "o-e-u"]]);
  const next = await play(max, { level: "o-e-u", mode: "odd", skill: "arcade" }, round("o-e-u", "odd", "arcade", 7));
  assert.deepEqual([next.status, next.body.starsAfter, next.body.opened], [201, 2, "ck-sh-th"]);
  const other = await play(juno, {}, round("a-i", "find", "easy", 8, 2));
  assert.deepEqual([other.status, other.body.rank, other.body.board.rows.map((r) => r.name)], [201, 1, ["Juno", "Max"]]);
  const table = await request<BoardReply>(plays, "GET", `/board?game=${GAME}&level=a-i&mode=odd&skill=arcade`, undefined, APP);
  assert.deepEqual([table.status, table.body.kind, table.body.rows], [200, "score", []]);
  assert.equal((await request(plays, "GET", `/board?game=${GAME}&level=a-i&mode=read&skill=easy`, undefined, APP)).status, 404);
  const held = (await request<CounterReply>(counter, "GET", `/?player=${max}`, undefined, APP)).body.badges.map((x) => x.id);
  assert.deepEqual(held.sort(), ["first-game", "rhyme-ear"]);
});

test("the round clock holds for Rhyme Time: eight instant answers claim eight seconds, and are refused until they have passed", async (t) => {
  const { join, query, progress } = await arcade(t);
  const tess = await join("Tess");
  const config = { level: "a-i", mode: "odd", skill: "easy" };
  const instant = round("a-i", "odd").map((a) => ({ ...a, ms: 0 }));
  const post = (roundId: string, clock: string) => request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId: tess, gameId: GAME, roundId, clock, ...config, answers: instant }, APP);
  const id = randomUUID();
  const { clock } = (await request<{ clock: string }>(plays, "POST", "/start", { playerId: tess, gameId: GAME, roundId: id }, APP)).body;
  const early = await post(id, clock);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /quicker than the clock/);
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
  assert.equal((await post(id, await playedClock(tess, id, instant, "sound-machine"))).status, 400, "Sound Machine's clock is not Rhyme Time's");
  const late = await post(id, await playedClock(tess, id, instant, GAME));
  assert.deepEqual([late.status, late.body.timeMs, late.body.right], [201, 8000, 8]);
  // What it has seen is kept by the word each question was about.
  const facts = (await progress(tess)).facts;
  assert.deepEqual(Object.keys(facts).sort(), instant.map((a) => a.fact).sort());
});
