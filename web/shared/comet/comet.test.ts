import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleError, openLevels, type AnswerInput } from "../play.ts";
import { GAMES } from "../games.ts";
import { RULES } from "../rules.ts";
import { NO_REPEAT, RETURN_AFTER, choicesFor, deal, factStats, missed, newDeck, seeded, weightOf } from "./deck.ts";
import { LEVELS, answerOf, factsOf, levelById, parseFact } from "./facts.ts";
import { BLITZ_MS, cardLimit, cometRules, multiplier, settle, startRound, starsFor, stepRound } from "./rules.ts";

const level = (id: string) => levelById(id)!;
const right = (fact: string, ms = 2500): AnswerInput => ({ fact, given: answerOf(parseFact(fact)!), ms });
const wrong = (fact: string, ms = 2500): AnswerInput => ({ fact, given: answerOf(parseFact(fact)!) + 1, ms });
const many = (n: number, make: (i: number) => AnswerInput): AnswerInput[] => Array.from({ length: n }, (_, i) => make(i));

// ---------- facts ----------

test("a fact parses only in the one form a card is written in", () => {
  assert.deepEqual(parseFact("7+5"), { a: 7, op: "+", b: 5 });
  assert.deepEqual(parseFact("10-2"), { a: 10, op: "-", b: 2 });
  for (const bad of ["", "7 + 5", "07+5", "7*5", "7+", "+5", "7+5+1", "123+1", "-1+2", "7+5\n"]) assert.equal(parseFact(bad), null, JSON.stringify(bad));
});

test("the levels hold the facts the PRD says, and no answer is ever below zero or above 20", () => {
  assert.deepEqual(LEVELS.map((l) => [l.id, factsOf(l).length]), [["add-5", 21], ["add-10", 66], ["sub-10", 66], ["mix-10", 132], ["big-20", 242]]);
  for (const l of LEVELS) {
    for (const key of factsOf(l)) {
      const f = parseFact(key)!;
      const n = answerOf(f);
      assert.ok(n >= 0 && n <= 20, `${l.id} ${key} = ${n}`);
      assert.ok(l.id === "big-20" ? Math.min(f.a, f.b) <= 10 : f.a <= 10 && f.b <= 10, `${l.id} ${key}`);
    }
  }
  assert.ok(factsOf(level("add-5")).includes("0+0") && factsOf(level("add-5")).includes("2+3") && !factsOf(level("add-5")).includes("3+3"));
  assert.ok(factsOf(level("sub-10")).includes("10-2") && !factsOf(level("sub-10")).includes("2-10"));
  assert.ok(factsOf(level("big-20")).includes("10+10") && factsOf(level("big-20")).includes("20-10") && !factsOf(level("big-20")).includes("20-9"));
  assert.equal(new Set(factsOf(level("mix-10"))).size, 132);
});

// ---------- scoring ----------

test("the combo multiplier steps up at 3, 6, 10 and 15 in a row", () => {
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 14, 15, 40].map(multiplier), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("a right answer scores 100 x the multiplier, plus 50 when fast; a wrong one scores nothing and resets the combo", () => {
  const s = settle({ level: "add-5", mode: "practice", skill: "easy" }, [right("1+1"), right("1+2"), right("2+2", 1999), wrong("2+3"), right("0+1", 2000)]);
  // 100 + 100 + (200 + 50) + 0 + 100
  assert.equal(s.score, 550);
  assert.deepEqual([s.right, s.wrong, s.bestCombo], [4, 1, 3]);
  assert.deepEqual(s.answers.map((a) => a.correct), [true, true, true, false, true]);
});

test("a timed-out card (given: null) is wrong", () => {
  const s = settle({ level: "add-5", mode: "practice", skill: "arcade" }, [{ fact: "2+3", given: null, ms: 9000 }]);
  assert.deepEqual([s.right, s.wrong, s.score], [0, 1, 0]);
});

// ---------- modes ----------

test("Blitz ends when 60 seconds of card time are used; an answer after that is left out", () => {
  const answers = many(30, () => right("1+1", 2500)); // 24 fit in 60 s
  const s = settle({ level: "add-5", mode: "blitz", skill: "arcade" }, answers);
  assert.equal(s.answers.length, 24);
  assert.equal(s.timeMs, BLITZ_MS);
  assert.equal(s.finished, true);
  assert.equal(s.board, "score");
});

test("Blitz: an answer that started in time but came after the clock ran out does not count", () => {
  const s = settle({ level: "add-5", mode: "blitz", skill: "arcade" }, [...many(23, () => right("1+1", 2500)), right("1+1", 4000)]);
  assert.equal(s.right, 23, "57.5 s used; the last card needed 4 s and only 2.5 were left");
  const within = settle({ level: "add-5", mode: "blitz", skill: "arcade" }, [...many(23, () => right("1+1", 2500)), right("1+1", 2700)]);
  assert.equal(within.right, 24, "200 ms over is a slow timer, not a late answer");
});

test("Sprint is finished at 20 right; a miss adds three seconds and the play is ranked by time", () => {
  const cfg = { level: "add-10", mode: "sprint", skill: "easy" };
  const s = settle(cfg, [...many(10, () => right("4+4", 3000)), wrong("5+4", 3000), ...many(10, () => right("4+4", 3000)), right("1+1")]);
  assert.deepEqual([s.right, s.wrong, s.finished, s.board], [20, 1, true, "time"]);
  assert.equal(s.timeMs, 21 * 3000 + 3000);
  assert.equal(s.answers.length, 21, "the answer after the deck was cleared is left out");
  const short = settle(cfg, many(19, () => right("4+4")));
  assert.deepEqual([short.finished, short.stars], [false, 0], "an abandoned Sprint is not ranked or starred");
});

test("Survival ends on the third miss; its countdown shrinks to a floor, and a late answer is a timeout", () => {
  let r = startRound("survival");
  assert.equal(cardLimit("survival", r), 10_000);
  for (let i = 0; i < 10; i++) r = stepRound("survival", r, { correct: true, ms: 1000 });
  assert.equal(cardLimit("survival", r), 7_000);
  for (let i = 0; i < 40; i++) r = stepRound("survival", r, { correct: true, ms: 1000 });
  assert.equal(cardLimit("survival", r), 2_500);

  const cfg = { level: "add-5", mode: "survival", skill: "arcade" };
  const s = settle(cfg, [right("1+1"), wrong("1+2"), { fact: "2+2", given: null, ms: 9700 }, right("1+1"), wrong("2+3"), right("1+1")]);
  assert.deepEqual([s.right, s.wrong, s.answers.length], [2, 3, 5], "the answer after the last life is left out");
  const late = settle(cfg, [{ fact: "1+1", given: 2, ms: 10_600 }]);
  assert.deepEqual([late.right, late.wrong, late.answers[0].given], [0, 1, null], "right, but after the countdown");
  const inGrace = settle(cfg, [{ fact: "1+1", given: 2, ms: 10_200 }]);
  assert.equal(inGrace.right, 1);
});

test("Practice is 15 cards, unranked and never starred", () => {
  const s = settle({ level: "add-5", mode: "practice", skill: "arcade" }, many(20, () => right("1+1", 500)));
  assert.deepEqual([s.answers.length, s.finished, s.board, s.stars], [15, true, null, 0]);
});

// ---------- stars ----------

test("stars: 15 right at 85% is one, on Arcade two, and a 25-right 95% Arcade Blitz is three", () => {
  const round = (r: number, w: number) => ({ ...startRound("blitz"), right: r, wrong: w });
  assert.equal(starsFor("blitz", "easy", round(14, 0)), 0);
  assert.equal(starsFor("blitz", "easy", round(15, 2)), 1);
  assert.equal(starsFor("blitz", "easy", round(15, 3)), 0, "83%");
  assert.equal(starsFor("blitz", "easy", round(30, 0)), 1, "Easy never earns more than one");
  assert.equal(starsFor("blitz", "arcade", round(15, 2)), 2);
  assert.equal(starsFor("blitz", "arcade", round(25, 1)), 3);
  assert.equal(starsFor("blitz", "arcade", round(25, 2)), 2, "92.6%");
  assert.equal(starsFor("sprint", "arcade", round(20, 0)), 2, "three stars are a Blitz's");
  assert.equal(starsFor("survival", "arcade", round(17, 3)), 2);
  assert.equal(starsFor("practice", "arcade", round(15, 0)), 0);
});

test("levels open in order: the first, then each one after a level with a star, plus any opened by hand", () => {
  assert.deepEqual(openLevels(cometRules.levels, {}), ["add-5"]);
  assert.deepEqual(openLevels(cometRules.levels, { "add-5": 1 }), ["add-5", "add-10"]);
  assert.deepEqual(openLevels(cometRules.levels, { "add-5": 2, "add-10": 1, "sub-10": 0 }), ["add-5", "add-10", "sub-10"]);
  assert.deepEqual(openLevels(cometRules.levels, {}, ["mix-10"]), ["add-5", "mix-10"]);
});

// ---------- refusals ----------

test("a play that cannot be is refused: an unknown set-up, a card from another level, a time or an answer that is not a number", () => {
  const cfg = { level: "add-5", mode: "blitz", skill: "easy" };
  const refused = (fn: () => unknown, what: string) => assert.throws(fn, RuleError, what);
  refused(() => settle({ ...cfg, level: "times-tables" }, []), "level");
  refused(() => settle({ ...cfg, mode: "zen" }, []), "mode");
  refused(() => settle({ ...cfg, skill: "godlike" }, []), "skill");
  refused(() => settle(cfg, [right("6+4")]), "a card from add-10");
  refused(() => settle(cfg, [{ fact: "1+1", given: 2, ms: -1 }]), "negative time");
  refused(() => settle(cfg, [{ fact: "1+1", given: 2, ms: Number.NaN }]), "NaN time");
  refused(() => settle(cfg, [{ fact: "1+1", given: 2.5, ms: 100 }]), "half an answer");
  refused(() => settle(cfg, [{ fact: 7 as unknown as string, given: 2, ms: 100 }]), "a fact that is not text");
  refused(() => settle(cfg, "nope" as unknown as AnswerInput[]), "answers that are not a list");
  assert.deepEqual(settle(cfg, []).score, 0, "an empty round is a round");
});

test("every live game has rules, and every game with rules is listed", () => {
  for (const g of GAMES) if (g.status === "live") assert.ok(RULES[g.id], `${g.id} has no rules`);
  for (const id of Object.keys(RULES)) assert.ok(GAMES.some((g) => g.id === id), `${id} is not in GAMES`);
});

// ---------- the deck ----------

test("a missed fact is five times as likely as a mastered one, an unseen one three, a slow one two", () => {
  assert.equal(weightOf(undefined), 3);
  assert.equal(weightOf({ seen: 0, missed: 0, ms: null }), 3);
  assert.equal(weightOf({ seen: 5, missed: 1, ms: 1500 }), 5);
  assert.equal(weightOf({ seen: 5, missed: 0, ms: 4500 }), 2);
  assert.equal(weightOf({ seen: 5, missed: 0, ms: 1500 }), 1);
});

test("a fact's stats come from its latest five answers only, with the median time of the right ones", () => {
  const a = (fact: string, correct: boolean, ms: number) => ({ fact, correct, ms });
  // Newest first. 2+3: five recent rights, an old miss beyond the window.
  const stats = factStats([a("2+3", true, 900), a("1+1", false, 5000), a("2+3", true, 1500), a("2+3", true, 1100), a("2+3", true, 3000), a("2+3", true, 1000), a("2+3", false, 8000), a("1+1", true, 2000)]);
  assert.deepEqual(stats["2+3"], { seen: 5, missed: 0, ms: 1100 });
  assert.deepEqual(stats["1+1"], { seen: 2, missed: 1, ms: 2000 });
  assert.deepEqual(factStats([a("4+4", false, 100)])["4+4"], { seen: 1, missed: 1, ms: null });
  assert.deepEqual(factStats([]), {});
});

test("the deck never repeats a fact within three cards, and deals what the player misses more often", () => {
  const facts = factsOf(level("add-5"));
  const mastered = { seen: 5, missed: 0, ms: 1200 };
  const stats = Object.fromEntries(facts.map((f) => [f, f === "2+3" ? { seen: 5, missed: 2, ms: 3000 } : mastered]));
  const rng = seeded(7);
  let deck = newDeck(facts, stats);
  const dealt: string[] = [];
  for (let i = 0; i < 4000; i++) {
    const next = deal(deck, rng);
    deck = next.deck;
    dealt.push(next.fact);
  }
  for (let i = 0; i < dealt.length; i++) assert.ok(!dealt.slice(Math.max(0, i - NO_REPEAT), i).includes(dealt[i]), `repeat at ${i}`);
  const count = (f: string) => dealt.filter((d) => d === f).length;
  const ratio = count("2+3") / count("1+1");
  assert.ok(ratio > 3 && ratio < 7, `the missed fact came up ${ratio.toFixed(1)}x as often`);
  for (const f of facts) assert.ok(count(f) > 0, `${f} never came up`);
});

test("a card missed in a round comes back four cards later, once", () => {
  const rng = seeded(3);
  let deck = newDeck(factsOf(level("add-10")));
  const first = deal(deck, rng);
  deck = missed(first.deck, first.fact);
  deck = missed(deck, first.fact);
  const after: string[] = [];
  for (let i = 0; i < 12; i++) {
    const next = deal(deck, rng);
    deck = next.deck;
    after.push(next.fact);
  }
  assert.equal(after.indexOf(first.fact), RETURN_AFTER - 1, "three other cards, then it returns");
  assert.equal(deck.returns.length, 0);
});

test("a deck of one or two facts still deals", () => {
  const rng = seeded(1);
  let deck = newDeck(["1+1"]);
  for (let i = 0; i < 5; i++) deck = deal(deck, rng).deck;
  let two = newDeck(["1+1", "1+2"]);
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const next = deal(two, rng);
    two = next.deck;
    seen.add(next.fact);
  }
  assert.equal(seen.size, 2);
});

test("Easy's four choices hold the answer once, never go below zero or past 20, and never repeat", () => {
  const rng = seeded(11);
  for (const l of LEVELS) {
    for (const key of factsOf(l)) {
      for (let i = 0; i < 3; i++) {
        const choices = choicesFor(key, rng);
        const answer = answerOf(parseFact(key)!);
        assert.equal(choices.length, 4, key);
        assert.equal(new Set(choices).size, 4, `${key}: ${choices}`);
        assert.equal(choices.filter((c) => c === answer).length, 1, key);
        assert.ok(choices.every((c) => Number.isInteger(c) && c >= 0 && c <= 20), `${key}: ${choices}`);
      }
    }
  }
});

test("the answer is not always in the same place", () => {
  const rng = seeded(5);
  const places = new Set<number>();
  for (let i = 0; i < 60; i++) places.add(choicesFor("6+4", rng).indexOf(10));
  assert.equal(places.size, 4);
});
