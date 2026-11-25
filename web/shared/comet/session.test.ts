import assert from "node:assert/strict";
import { test } from "node:test";
import { levelById } from "./facts.ts";
import { MAX_ANSWER_MS, MIN_ANSWER_MS, cardLimit, settle, type Mode, type Skill } from "./rules.ts";
import { COUNT_FROM, PACE, advance, cardAnswer, startSession, waited, type Session, type SessionEvent } from "./session.ts";

// A round played by hand, event by event, with a clock the test owns.

const level = levelById("add-10")!;

/** Run the countdown and deal the first card at t = 0. */
function begin(mode: Mode, skill: Skill): Session {
  let s = startSession(level, mode, skill);
  for (let i = 0; i < COUNT_FROM; i++) s = advance(s, { type: "beat" });
  return advance(s, { type: "deal", now: 0, seed: 1 });
}

/** Type the right answer on the pad at `now`. */
function typeRight(s: Session, now: number): Session {
  for (const key of String(cardAnswer(s))) s = advance(s, { type: "key", key, now });
  return s;
}

const each = (s: Session, events: SessionEvent[]) => events.reduce(advance, s);

test("the countdown beats 3, 2, 1, 0 and only then deals; nothing can be answered before", () => {
  let s = startSession(level, "blitz", "arcade");
  assert.deepEqual([s.phase, s.count], ["countdown", 3]);
  assert.equal(advance(s, { type: "key", key: "5", now: 10 }), s, "no card yet");
  s = each(s, [{ type: "beat" }, { type: "beat" }, { type: "beat" }]);
  assert.equal(s.count, 0);
  assert.equal(advance(s, { type: "beat" }), s, "it stops at 0");
  s = advance(s, { type: "deal", now: 1000, seed: 9 });
  assert.equal(s.phase, "ask");
  assert.ok(level.has({ a: Number(s.fact.split(/[+-]/)[0]), op: "+", b: Number(s.fact.split(/[+-]/)[1]) }), s.fact);
  assert.deepEqual(s.choices, [], "Arcade skill has no answer buttons");
});

test("Arcade: the answer goes in when it has as many digits as the right one; a wrong digit count waits for OK", () => {
  let s = begin("practice", "arcade");
  s = { ...s, fact: "6+4" }; // answer 10: two digits
  s = advance(s, { type: "key", key: "1", now: 500 });
  assert.deepEqual([s.phase, s.typed], ["ask", "1"], "one digit of two: still typing");
  s = advance(s, { type: "key", key: "back", now: 600 });
  assert.equal(s.typed, "");
  s = each(s, [{ type: "key", key: "1", now: 700 }, { type: "key", key: "0", now: 900 }]);
  assert.deepEqual([s.phase, s.last, s.answers], ["right", { given: 10, correct: true, gained: 150 }, [{ fact: "6+4", given: 10, ms: 900 }]]);

  let one = { ...begin("practice", "arcade"), fact: "2+3" };
  one = advance(one, { type: "key", key: "4", now: 300 });
  assert.deepEqual([one.phase, one.last?.correct, one.last?.gained], ["wrong", false, 0], "one digit is the whole answer");

  let short = { ...begin("practice", "arcade"), fact: "6+4" };
  short = advance(short, { type: "key", key: "9", now: 300 });
  assert.equal(short.phase, "ask", "9 could be the start of something");
  assert.equal(advance({ ...short, typed: "" }, { type: "key", key: "ok", now: 350 }).phase, "ask", "OK on nothing does nothing");
  short = advance(short, { type: "key", key: "ok", now: 400 });
  assert.deepEqual([short.phase, short.answers[0].given], ["wrong", 9]);
});

test("two keys in the same instant are both taken, in order", () => {
  let s = { ...begin("practice", "arcade"), fact: "6+6" };
  s = each(s, [{ type: "key", key: "1", now: 800 }, { type: "key", key: "2", now: 800 }, { type: "key", key: "7", now: 800 }]);
  assert.deepEqual([s.phase, s.answers.length, s.answers[0].given], ["right", 1, 12], "the third key lands on a card already answered");
});

test("Easy: a tap on one of the four answers is the answer; anything else is ignored; the pad does nothing", () => {
  let s = begin("blitz", "easy");
  assert.equal(s.choices.length, 4);
  assert.ok(s.choices.includes(cardAnswer(s)));
  assert.equal(advance(s, { type: "choose", n: 77, now: 100 }), s);
  assert.equal(advance(s, { type: "key", key: "3", now: 100 }), s);
  const wrongPick = s.choices.find((n) => n !== cardAnswer(s))!;
  const missedIt = advance(s, { type: "choose", n: wrongPick, now: 1500 });
  assert.deepEqual([missedIt.phase, missedIt.round.wrong, missedIt.deck.returns.map((r) => r.fact)], ["wrong", 1, [s.fact]], "a missed card is queued to return");
  s = advance(s, { type: "choose", n: cardAnswer(s), now: 1500 });
  assert.deepEqual([s.phase, s.round.right, s.round.score], ["right", 1, 150]);
  assert.equal(advance(s, { type: "choose", n: s.choices[0], now: 1600 }), s, "a second tap on an answered card");
});

test("a deal while a card is waiting is ignored", () => {
  const s = begin("blitz", "arcade");
  assert.equal(advance(s, { type: "deal", now: 50, seed: 2 }), s);
});

test("only the time a card waits is counted: the pause between cards and a pause box are not", () => {
  let s = begin("sprint", "arcade"); // card up at 0
  s = typeRight(s, 2000);
  assert.equal(s.round.cardMs, 2000);
  s = advance(s, { type: "deal", now: 2400, seed: 3 }); // 400 ms of feedback: free
  s = advance(s, { type: "pause", now: 3400 }); // 1000 ms on the card so far
  assert.deepEqual([s.phase, s.wantPause, waited(s, 99_999)], ["paused", true, 1000]);
  assert.equal(advance(s, { type: "key", key: "1", now: 4000 }), s, "no answering while paused");
  s = advance(s, { type: "resume", now: 60_000 });
  assert.equal(waited(s, 60_500), 1500);
  s = typeRight(s, 60_500);
  assert.equal(s.round.cardMs, 3500);
});

test("pausing during an answer's feedback holds the next card behind the box until resumed", () => {
  let s = typeRight(begin("blitz", "arcade"), 1000);
  s = advance(s, { type: "toggle", now: 1100 });
  assert.deepEqual([s.phase, s.wantPause], ["right", true]);
  s = advance(s, { type: "deal", now: 1400, seed: 4 });
  assert.equal(s.phase, "paused");
  s = advance(s, { type: "toggle", now: 9000 });
  assert.deepEqual([s.phase, s.wantPause, waited(s, 9500)], ["ask", false, 500]);
});

test("Blitz: when the clock runs out the round is over and the card on screen does not count", () => {
  let s = begin("blitz", "arcade");
  let now = 0;
  for (let i = 0; i < 5; i++) {
    now += 10_000;
    s = typeRight(s, now); // 10 s a card: 50 s used after five
    s = advance(s, { type: "deal", now, seed: i + 10 });
  }
  assert.equal(advance(s, { type: "clock", now: now + 9_999 }), s, "one ms left");
  s = advance(s, { type: "clock", now: now + 10_000 });
  assert.deepEqual([s.phase, s.round.over, s.answers.length], ["done", true, 5]);
  assert.equal(advance(s, { type: "pause", now: now + 10_001 }), s, "nothing to pause");
});

test("Survival: a card that times out is a miss with no answer, and the third miss ends the round after its feedback", () => {
  let s = begin("survival", "arcade");
  assert.equal(advance(s, { type: "clock", now: 9_999 }), s);
  s = advance(s, { type: "clock", now: 10_000 });
  assert.deepEqual([s.phase, s.round.lives, s.answers[0]], ["wrong", 2, { fact: s.fact, given: null, ms: 10_000 }]);
  for (const t of [20_000, 40_000]) {
    s = advance(s, { type: "deal", now: t, seed: t });
    s = advance(s, { type: "clock", now: t + 10_000 });
  }
  assert.deepEqual([s.phase, s.round.lives, s.round.over], ["wrong", 0, true], "the last answer is still shown");
  s = advance(s, { type: "deal", now: 60_000, seed: 5 });
  assert.equal(s.phase, "done");
});

test("an answer after the countdown is clamped to it", () => {
  let s = begin("survival", "arcade");
  s = typeRight(s, 10_400); // the frame that would have called time has not run yet
  assert.equal(s.answers[0].ms, 10_000);
});

test("what the screen plays is what the server scores: a whole round's answers settle to the same numbers", () => {
  for (const [mode, skill] of [["blitz", "easy"], ["sprint", "arcade"], ["survival", "arcade"], ["practice", "easy"]] as [Mode, Skill][]) {
    let s = begin(mode, skill);
    let now = 0;
    for (let i = 0; i < 400 && s.phase !== "done"; i++) {
      now += 1700 + (i % 5) * 400;
      // Every seventh card is missed, every eleventh left to time out.
      if (i % 11 === 10) s = advance(s, { type: "clock", now: now + 20_000 });
      else if (skill === "easy") s = advance(s, { type: "choose", n: i % 7 === 6 ? s.choices.find((n) => n !== cardAnswer(s))! : cardAnswer(s), now });
      else if (i % 7 === 6) s = each(s, [{ type: "key", key: "9", now }, { type: "key", key: "9", now }, { type: "key", key: "ok", now }]);
      else s = typeRight(s, now);
      if (s.phase === "ask") continue; // a clock event with nothing to call
      now += 20_000;
      s = advance(s, { type: "deal", now, seed: i });
      s = advance(s, { type: "clock", now });
    }
    assert.equal(s.phase, "done", mode);
    const settled = settle({ level: level.id, mode, skill }, s.answers);
    assert.deepEqual([settled.score, settled.right, settled.wrong, settled.bestCombo, settled.answers.length], [s.round.score, s.round.right, s.round.wrong, s.round.bestCombo, s.answers.length], mode);
    assert.equal(settled.finished, true, mode);
  }
});

test("an instant key press counts as the floor in the session and in settle()", () => {
  let s = begin("sprint", "arcade");
  s = typeRight(s, 0); // answered the moment the card came up
  assert.equal(s.answers[0].ms, MIN_ANSWER_MS);
  assert.equal(s.round.cardMs, MIN_ANSWER_MS);
  const settled = settle({ level: level.id, mode: "sprint", skill: "arcade" }, s.answers);
  assert.deepEqual([settled.timeMs, settled.score, settled.answers[0].ms], [s.round.cardMs, s.round.score, MIN_ANSWER_MS]);
  const raw = settle({ level: level.id, mode: "sprint", skill: "arcade" }, [{ ...s.answers[0], ms: 0 }]);
  assert.deepEqual([raw.timeMs, raw.score], [settled.timeMs, settled.score], "a posted 0 settles as the pressed 0 played");
});

test("a round played as fast as the screen allows still takes longer on the wall than its cards claim (the server's clock check)", () => {
  // The wall clock from the moment the server started the round: the
  // countdown, every card, every answer shown, the pause before the results.
  for (const [mode, skill] of [["blitz", "easy"], ["sprint", "arcade"], ["survival", "easy"], ["practice", "easy"]] as [Mode, Skill][]) {
    for (const how of ["instant", "wrong", "timeout"] as const) {
      let s = startSession(level, mode, skill);
      let wall = 0;
      for (let i = 0; i < COUNT_FROM; i++) {
        wall += PACE.countStep;
        s = advance(s, { type: "beat" });
      }
      wall += PACE.go;
      for (let i = 0; i < 2_000; i++) {
        s = advance(s, { type: "deal", now: wall, seed: i });
        if (s.phase !== "ask") break;
        if (how === "timeout" && (mode === "survival" || mode === "blitz")) {
          wall += cardLimit(mode, s.round)!;
          s = advance(s, { type: "clock", now: wall });
        } else {
          const pick = how === "wrong" && i % 3 === 0 ? (s.choices.find((n) => n !== cardAnswer(s)) ?? 99) : cardAnswer(s);
          // Answered 1 ms after the card came up: quicker than MIN_ANSWER_MS, so counted as more than it took.
          wall += 1;
          if (skill === "easy") s = advance(s, { type: "choose", n: pick, now: wall });
          else if (pick === cardAnswer(s)) s = typeRight(s, wall);
          else s = each(s, [{ type: "key", key: "9", now: wall }, { type: "key", key: "9", now: wall }, { type: "key", key: "ok", now: wall }]);
        }
        if (s.phase === "done") break;
        wall += s.phase === "right" ? PACE.right : PACE.wrong;
      }
      wall += PACE.done; // (a Survival of all right answers is cut off here at 2,000 cards)
      const claimed = s.answers.reduce((sum, a) => sum + a.ms, 0);
      assert.ok(claimed + PACE.countStep * COUNT_FROM + PACE.go + PACE.done <= wall, `${mode} ${how}: ${claimed} ms counted in ${wall} ms`);
    }
  }
  assert.ok(PACE.right > MIN_ANSWER_MS && PACE.wrong > MIN_ANSWER_MS, "an answer shown outlasts what the floor can add to it");
});

test("a card left waiting where nothing times it counts as the longest an answer can take, so its round can still be saved", () => {
  for (const mode of ["sprint", "practice"] as Mode[]) {
    let s = begin(mode, "arcade");
    assert.equal(cardLimit(mode, s.round), null, mode);
    s = typeRight(s, 3 * 3_600_000); // left over lunch
    assert.equal(s.answers[0].ms, MAX_ANSWER_MS, mode);
    const settled = settle({ level: level.id, mode, skill: "arcade" }, s.answers);
    assert.deepEqual([settled.score, settled.right, settled.answers[0].ms], [s.round.score, 1, MAX_ANSWER_MS], mode);
  }
  // A posted time past it is still refused.
  assert.throws(() => settle({ level: level.id, mode: "sprint", skill: "arcade" }, [{ fact: "2+3", given: 5, ms: MAX_ANSWER_MS + 1 }]), /out of range/);
});
