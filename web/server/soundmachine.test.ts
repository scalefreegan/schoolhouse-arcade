import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AnswerInput } from "../shared/play.ts";
import { answerOf, type Mode } from "../shared/soundmachine/rules.ts";
import { LEVELS, wordById } from "../shared/soundmachine/words.ts";
import type { BoardReply, CounterReply, ErrorReply, PlayReply, Player, ProgressReply } from "../shared/wire.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { wrap } from "./api.ts";
import { handleCounter } from "./counter.ts";
import { setDb } from "./db.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";
import { playedClock, request } from "./testhttp.ts";

// Sound Machine through the real routes on an in-process PGlite: answers
// that are words and tiles, beside Comet Cards' numbers.

const APP = { host: "localhost:38900", "x-schoolhouse-arcade": "1" };
const GAME = "sound-machine";
const plays = wrap(handlePlays);
const players = wrap(handlePlayers);
const counter = wrap(handleCounter);

const ok = (mode: Mode, id: string, ms = 3000): AnswerInput => ({ fact: id, given: answerOf(mode, wordById(id)!), ms });
const round = (level: string, mode: Mode, right = 8): AnswerInput[] =>
  LEVELS.find((l) => l.id === level)!.focus.slice(0, 8).map((w, i) => (i < right ? ok(mode, w.id) : { fact: w.id, given: wrongOf(mode, w.id), ms: 3000 }));
/** A wrong answer of the right shape: another picture, the tiles backwards, or the word cut after its first letter only. */
const wrongOf = (mode: Mode, id: string): string => (mode === "read" ? (id === "cat" ? "hat" : "cat") : mode === "gems" ? `${id[0]}|${id.slice(1)}` : [...wordById(id)!.tiles].reverse().join("-"));

async function arcade(t: { after: (fn: () => unknown) => void }) {
  const fresh = await freshDb();
  setDb(fresh.db);
  t.after(async () => {
    setDb(null);
    await fresh.close();
  });
  const join = async (name: string) => (await request<Player>(players, "POST", "/", { name, avatar: "rex" }, APP)).body.id;
  const send = async (gameId: string, playerId: string, config: { level: string; mode: string; skill: string }, answers: AnswerInput[], clock?: string) => {
    const roundId = randomUUID();
    return request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId, gameId, roundId, clock: clock ?? (await playedClock(playerId, roundId, answers, gameId)), ...config, answers }, APP);
  };
  const play = (playerId: string, config: { level?: string; mode?: string; skill?: string }, answers: AnswerInput[]) => send(GAME, playerId, { level: "cvc", mode: "build", skill: "easy", ...config }, answers);
  const progress = async (playerId: string) => (await request<ProgressReply>(plays, "GET", `/progress?player=${playerId}&game=${GAME}`, undefined, APP)).body;
  return { ...fresh, join, send, play, progress };
}

test("a Build round is scored from its tiles and a Read round from its words, and every answer is stored as text", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const built = await play(em, {}, [ok("build", "cat"), { fact: "hat", given: "h-a-d", ms: 4000 }, ok("build", "bed", 200)]);
  assert.equal(built.status, 201, built.body.error);
  assert.deepEqual([built.body.score, built.body.right, built.body.wrong, built.body.bestCombo, built.body.finished, built.body.rank], [200, 2, 1, 1, false, null]);
  const read = await play(em, { mode: "read" }, [ok("read", "pig"), { fact: "dog", given: "log", ms: 2000 }]);
  assert.deepEqual([read.body.score, read.body.right, read.body.wrong], [100, 1, 1]);
  const stored = await query("select fact, given, given_text, correct, ms from answers order by id");
  assert.deepEqual(stored, [
    { fact: "cat", given: null, given_text: "c-a-t", correct: true, ms: 3000 },
    { fact: "hat", given: null, given_text: "h-a-d", correct: false, ms: 4000 },
    { fact: "bed", given: null, given_text: "b-e-d", correct: true, ms: 1000 },
    { fact: "pig", given: null, given_text: "pig", correct: true, ms: 2000 + 1000 },
    { fact: "dog", given: null, given_text: "log", correct: false, ms: 2000 },
  ]);
  assert.deepEqual(await query("select game_id, level, mode, skill, score from plays order by id"), [
    { game_id: GAME, level: "cvc", mode: "build", skill: "easy", score: 200 },
    { game_id: GAME, level: "cvc", mode: "read", skill: "easy", score: 100 },
  ]);
});

test("a Split round is judged by the server from where each word was cut: the split is stored as text beside its verdict", async (t) => {
  const { join, play, query, progress } = await arcade(t);
  const em = await join("Em");
  const sh = { level: "sh", mode: "gems" };
  // sh is open once 3 sounds has a star: a star won in any of the three games opens it.
  assert.equal((await play(em, sh, [ok("gems", "ship")])).status, 403);
  const opener = await play(em, { mode: "gems" }, round("cvc", "gems", 5));
  assert.deepEqual([opener.status, opener.body.starsAfter, opener.body.opened], [201, 1, "ch"]);
  assert.equal((await play(em, { level: "ch", mode: "gems" }, [...round("ch", "gems"), ok("gems", "cat"), ok("gems", "sun"), ok("gems", "pig")])).body.opened, "ck");
  assert.equal((await play(em, { level: "ck", mode: "gems" }, round("ck", "gems"))).body.opened, "sh");
  assert.ok((await progress(em)).open.includes("sh"));
  const before = (await query("select count(*)::int as n from answers"))[0].n as number;
  const split = await play(em, sh, [
    ok("gems", "ship"),
    { fact: "fish", given: "f|i|s|h", ms: 4000 },
    { fact: "shed", given: "s|h|e|d", ms: 2500 },
    ok("gems", "dish", 200),
  ]);
  assert.equal(split.status, 201, split.body.error);
  assert.deepEqual([split.body.score, split.body.right, split.body.wrong, split.body.bestCombo], [200, 2, 2, 1]);
  const stored = await query("select fact, given, given_text, correct, ms from answers where id > (select max(id) - 4 from answers) order by id");
  assert.equal(before + 4, (await query("select count(*)::int as n from answers"))[0].n);
  assert.deepEqual(stored, [
    { fact: "ship", given: null, given_text: "sh|i|p", correct: true, ms: 3000 },
    { fact: "fish", given: null, given_text: "f|i|s|h", correct: false, ms: 4000 },
    { fact: "shed", given: null, given_text: "s|h|e|d", correct: false, ms: 2500 },
    { fact: "dish", given: null, given_text: "d|i|sh", correct: true, ms: 1000 },
  ]);
  // A verdict or a number from the browser is not looked at: only the split.
  const forged = await play(em, sh, [{ fact: "ship", given: "s|h|i|p", ms: 2000, correct: true, score: 9999 } as AnswerInput]);
  assert.deepEqual([forged.status, forged.body.right, forged.body.score], [201, 0, 0]);
  const bad = await play(em, sh, [{ fact: "ship", given: "sh|i|pp", ms: 2000 }]);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /not "ship" cut into pieces/);
});

test("Split keeps its own high score tables, beside Build's and Read's", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const built = await play(em, {}, round("cvc", "build", 8));
  const split = await play(em, { mode: "gems" }, round("cvc", "gems", 6));
  assert.deepEqual([split.body.rank, split.body.personalBest, split.body.board.rows.length, split.body.board.rows[0].score], [1, false, 1, split.body.score], "a Split round is not ranked against Build");
  assert.equal(built.body.board.rows.length, 1);
  const table = await request<BoardReply>(plays, "GET", `/board?game=${GAME}&level=cvc&mode=gems&skill=easy`, undefined, APP);
  assert.deepEqual([table.status, table.body.kind, table.body.rows.length], [200, "score", 1]);
  // 6 tickets for six right words: the gems are not paid on top.
  assert.equal(split.body.tickets.lines.find((l) => l.reason === "play")?.amount, 6);
});

test("Comet Cards' answers are stored as they always were, and the two games do not take each other's", async (t) => {
  const { join, send, query } = await arcade(t);
  const em = await join("Em");
  const comet = { level: "add-5", mode: "practice", skill: "easy" };
  assert.equal((await send("comet-cards", em, comet, [{ fact: "2+3", given: 5, ms: 2500 }, { fact: "1+1", given: 3, ms: 2500 }])).status, 201);
  assert.deepEqual(await query("select fact, given, given_text, correct from answers order by id"), [
    { fact: "2+3", given: 5, given_text: null, correct: true },
    { fact: "1+1", given: 3, given_text: null, correct: false },
  ]);
  const words = await send("comet-cards", em, comet, [{ fact: "2+3", given: "5", ms: 2500 }]);
  assert.equal(words.status, 400);
  assert.match(words.body.error, /whole number/);
  const numbers = await send(GAME, em, { level: "cvc", mode: "read", skill: "easy" }, [{ fact: "cat", given: 5, ms: 2500 }]);
  assert.equal(numbers.status, 400);
  assert.equal((await send(GAME, em, comet, [])).status, 400, "a Comet Cards set-up is not a Sound Machine one");
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 1);
});

test("a play the rules refuse is a 400 with the rule's sentence, and nothing is stored", async (t) => {
  const { join, play, query } = await arcade(t);
  const em = await join("Em");
  const cases: [AnswerInput[], RegExp][] = [
    [[{ fact: "zebra", given: "z-e-b", ms: 2000 }], /not a word in/],
    [[ok("build", "duck")], /not a word in/],
    [[ok("build", "cat"), ok("build", "cat")], /once in a round/],
    [LEVELS[0].focus.slice(0, 9).map((w) => ok("build", w.id)), /not a round/],
    [[{ fact: "cat", given: "c-a", ms: 2000 }], /does not fit/],
  ];
  for (const [answers, why] of cases) {
    const sent = await play(em, {}, answers);
    assert.equal(sent.status, 400);
    assert.match(sent.body.error, why);
  }
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
});

test("a star on a level opens the next; a locked level cannot be played; stars come from words right first try", async (t) => {
  const { join, play, progress } = await arcade(t);
  const em = await join("Em");
  assert.deepEqual((await progress(em)).open, ["cvc"]);
  assert.equal((await play(em, { level: "ch" }, [ok("build", "chip")])).status, 403);
  const four = await play(em, {}, round("cvc", "build", 4));
  assert.deepEqual([four.body.finished, four.body.starsAfter, four.body.opened, four.body.rank], [true, 0, null, 1]);
  const five = await play(em, { mode: "read" }, round("cvc", "read", 5));
  assert.deepEqual([five.body.starsBefore, five.body.starsAfter, five.body.opened], [0, 1, "ch"]);
  const all = await play(em, { skill: "arcade" }, round("cvc", "build"));
  assert.deepEqual([all.body.starsAfter, all.body.score, all.body.bestCombo], [3, 1360, 8]);
  const p = await progress(em);
  assert.deepEqual([p.stars, p.open], [{ cvc: 3 }, ["cvc", "ch"]]);
  assert.deepEqual([p.facts.cat.seen, p.facts.cat.missed], [3, 0]);
  assert.equal(p.facts.log.missed, 2, "log was the eighth word, missed in the first two rounds");
  // ch: its five words and three old ones.
  const ch = await play(em, { level: "ch" }, [...round("ch", "build"), ok("build", "cat"), ok("build", "sun"), ok("build", "pig")]);
  assert.deepEqual([ch.status, ch.body.starsAfter, ch.body.opened], [201, 3, "ck"]);
});

test("each set-up has its own table, ranked by score; tickets are 1 a word on Easy and 2 on Arcade, and the badges are its own", async (t) => {
  const { join, play } = await arcade(t);
  const em = await join("Em");
  const dad = await join("Dad");
  const a = await play(em, {}, round("cvc", "build", 6));
  // 6 tickets, a first star (20), First Game (10) and the 3 Sounds Star (25).
  assert.deepEqual([a.body.rank, a.body.badges, a.body.tickets.total], [1, ["first-game", "sound-cvc"], 6 + 20 + 10 + 25]);
  const b = await play(dad, {}, round("cvc", "build", 8));
  assert.deepEqual([b.body.rank, b.body.board.rows.map((r) => r.name)], [1, ["Dad", "Em"]]);
  const c = await play(em, { skill: "arcade" }, round("cvc", "build", 8));
  assert.deepEqual([c.body.rank, c.body.personalBest, c.body.board.rows.length], [1, false, 1], "Arcade's table is its own");
  // 16 for the words, two more stars (40); nothing for a best on a first try at this set-up.
  assert.deepEqual(c.body.tickets.lines, [{ reason: "play", amount: 16 }, { reason: "star", amount: 40 }]);
  const table = await request<BoardReply>(plays, "GET", `/board?game=${GAME}&level=cvc&mode=read&skill=easy`, undefined, APP);
  assert.deepEqual([table.status, table.body.kind, table.body.rows], [200, "score", []]);
  assert.equal((await request(plays, "GET", `/board?game=${GAME}&level=cvc&mode=blitz&skill=easy`, undefined, APP)).status, 404);
  const held = (await request<CounterReply>(counter, "GET", `/?player=${em}`, undefined, APP)).body.badges.map((x) => x.id);
  assert.deepEqual(held.sort(), ["first-game", "sound-cvc"]);
});

test("the round clock holds for Sound Machine: eight instant words claim eight seconds, and are refused until they have passed", async (t) => {
  const { join, query } = await arcade(t);
  const em = await join("Em");
  const config = { level: "cvc", mode: "read", skill: "easy" };
  const instant = round("cvc", "read").map((a) => ({ ...a, ms: 0 }));
  const start = (roundId: string) => request<{ clock: string }>(plays, "POST", "/start", { playerId: em, gameId: GAME, roundId }, APP);
  const post = (roundId: string, clock: string, answers: AnswerInput[]) => request<PlayReply & ErrorReply>(plays, "POST", "/", { playerId: em, gameId: GAME, roundId, clock, ...config, answers }, APP);
  const id = randomUUID();
  const { clock } = (await start(id)).body;
  const early = await post(id, clock, instant);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /quicker than the clock/);
  assert.equal((await query("select count(*)::int as n from plays"))[0].n, 0);
  // A Comet Cards clock is not a Sound Machine one.
  const other = await playedClock(em, id, instant, "comet-cards");
  assert.equal((await post(id, other, instant)).status, 400);
  const waited = await playedClock(em, id, instant, GAME);
  const late = await post(id, waited, instant);
  assert.deepEqual([late.status, late.body.timeMs, late.body.right], [201, 8000, 8]);
});

test("what a player has seen is kept per game: Comet Cards' sums are not Sound Machine's words, nor the other way", async (t) => {
  const { join, send, play, progress } = await arcade(t);
  const em = await join("Em");
  assert.equal((await send("comet-cards", em, { level: "add-5", mode: "practice", skill: "easy" }, [{ fact: "2+3", given: 5, ms: 2500 }, { fact: "1+1", given: 3, ms: 2500 }])).status, 201);
  assert.equal((await play(em, { mode: "read" }, [ok("read", "cat"), { fact: "hat", given: "cat", ms: 3000 }])).status, 201);
  const sound = (await progress(em)).facts;
  assert.deepEqual(Object.keys(sound).sort(), ["cat", "hat"]);
  assert.deepEqual([sound.cat.missed, sound.hat.missed], [0, 1]);
  const comet = (await request<ProgressReply>(plays, "GET", `/progress?player=${em}&game=comet-cards`, undefined, APP)).body.facts;
  assert.deepEqual(Object.keys(comet).sort(), ["1+1", "2+3"]);
});
