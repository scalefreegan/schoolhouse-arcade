import assert from "node:assert/strict";
import { test } from "node:test";
import { BADGES, newBadges, type BadgeFacts } from "./badges.ts";
import { LEVELS } from "./comet/facts.ts";
import { pay } from "./comet/rules.ts";
import type { Settled } from "./play.ts";
import { PIN_RE, cleanPrize } from "./prizes.ts";
import { BEST_BONUS, STAR_BONUS, ticketLines, totalOf } from "./tickets.ts";

// What a play pays and which badges it wins: pure rules, no database.

const nothing: BadgeFacts = { plays: 0, right: 0, bestCombo: 0, cleanSprints: 0, stars: {} };
const ids = (f: Partial<BadgeFacts>, held: string[] = []) => newBadges({ ...nothing, ...f }, held).map((b) => b.id);
const settled = (over: Partial<Settled>): Settled => ({ answers: [], score: 0, right: 0, wrong: 0, bestCombo: 0, timeMs: 0, finished: true, stars: 0, board: "score", ...over });
const stars = (n: number, levels = LEVELS.map((l) => l.id)) => ({ "comet-cards": Object.fromEntries(levels.map((l) => [l, n])) });

test("a right answer pays 1 ticket on Easy and 2 on Arcade; Practice pays 5 for finishing and nothing for giving up", () => {
  assert.equal(pay({ level: "add-5", mode: "blitz", skill: "easy" }, settled({ right: 17, wrong: 3 })), 17);
  assert.equal(pay({ level: "add-5", mode: "survival", skill: "arcade" }, settled({ right: 17 })), 34);
  assert.equal(pay({ level: "add-5", mode: "sprint", skill: "arcade" }, settled({ right: 4, finished: false })), 8, "right answers are paid even if the round was not finished");
  assert.equal(pay({ level: "add-5", mode: "practice", skill: "arcade" }, settled({ right: 15 })), 5);
  assert.equal(pay({ level: "add-5", mode: "practice", skill: "easy" }, settled({ right: 9, finished: false })), 0);
});

test("a play's ticket lines: the round, a best, each new star, each badge; a line worth nothing is left out", () => {
  assert.deepEqual(ticketLines({ base: 0, personalBest: false, newStars: 0, badges: [] }), []);
  const lines = ticketLines({ base: 30, personalBest: true, newStars: 2, badges: [{ id: "combo-10", tickets: 20 }] });
  assert.deepEqual(lines, [
    { reason: "play", amount: 30 },
    { reason: "best", amount: BEST_BONUS },
    { reason: "star", amount: 2 * STAR_BONUS },
    { reason: "badge", amount: 20, badge: "combo-10" },
  ]);
  assert.equal(totalOf(lines), 30 + 10 + 40 + 20);
  assert.deepEqual(ticketLines({ base: 5, personalBest: false, newStars: -1, badges: [] }), [{ reason: "play", amount: 5 }], "stars never go down, and would not cost tickets if they did");
});

test("badge ids are unique, every badge pays something, and none is earned by doing nothing", () => {
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  for (const b of BADGES) assert.ok(Number.isInteger(b.tickets) && b.tickets > 0, b.id);
  assert.deepEqual(ids({}), []);
});

test("each badge is won exactly at its threshold, and one already held is not won again", () => {
  assert.deepEqual(ids({ plays: 1 }), ["first-game"]);
  assert.deepEqual(ids({ plays: 1 }, ["first-game"]), []);
  assert.deepEqual(ids({ bestCombo: 9 }), []);
  assert.deepEqual(ids({ bestCombo: 10 }), ["combo-10"]);
  assert.deepEqual(ids({ bestCombo: 25 }), ["combo-10", "combo-25"]);
  assert.deepEqual(ids({ right: 99 }), []);
  assert.deepEqual(ids({ right: 100 }), ["right-100"]);
  assert.deepEqual(ids({ right: 1000 }), ["right-100", "right-1000"]);
  assert.deepEqual(ids({ cleanSprints: 1 }), ["clean-sprint"]);
  assert.deepEqual(ids({ stars: stars(1, ["sub-10"]) }), ["comet-sub-10"]);
  assert.deepEqual(ids({ stars: { "another-game": { "add-5": 3 } } }), [], "another game's stars are not Comet Cards'");
});

test("Arcade Ace needs two stars on every level, Comet Champion three; one level short is not enough", () => {
  const levelBadges = LEVELS.map((l) => `comet-${l.id}`);
  assert.deepEqual(ids({ stars: stars(1) }), levelBadges);
  assert.deepEqual(ids({ stars: stars(2) }), [...levelBadges, "arcade-ace"]);
  assert.deepEqual(ids({ stars: stars(3) }), [...levelBadges, "arcade-ace", "comet-champion"]);
  const allButOne = stars(3);
  allButOne["comet-cards"]["big-20"] = 1;
  assert.deepEqual(ids({ stars: allButOne }), levelBadges);
});

test("a prize needs a name, one of the pictures, a whole price above nothing, and a badge that exists if it names one", () => {
  assert.deepEqual(cleanPrize({ name: "  Movie   night ", icon: "popcorn", cost: 400 }), { name: "Movie night", icon: "popcorn", cost: 400, badge: null });
  assert.deepEqual(cleanPrize({ name: "Bike", icon: "gift", cost: 5000, badge: "arcade-ace" }), { name: "Bike", icon: "gift", cost: 5000, badge: "arcade-ace" });
  assert.equal((cleanPrize({ name: "Bike", icon: "gift", cost: 5000, badge: "" }) as { badge: unknown }).badge, null);
  for (const bad of [{ name: "", icon: "gift", cost: 1 }, { name: "x".repeat(25), icon: "gift", cost: 1 }, { name: "A", icon: "dino", cost: 1 }, { name: "A", icon: "gift", cost: 0 }, { name: "A", icon: "gift", cost: 1.5 }, { name: "A", icon: "gift", cost: "10" }, { name: "A", icon: "gift", cost: 100_001 }, { name: "A", icon: "gift", cost: 1, badge: "nope" }]) {
    assert.equal(typeof cleanPrize(bad), "string", JSON.stringify(bad));
  }
});

test("a PIN is exactly four digits", () => {
  for (const ok of ["0000", "1234", "9999"]) assert.ok(PIN_RE.test(ok), ok);
  for (const bad of ["123", "12345", "12a4", " 1234", "１２３４", ""]) assert.ok(!PIN_RE.test(bad), JSON.stringify(bad));
});
