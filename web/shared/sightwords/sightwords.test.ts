import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ART } from "../../src/sprites/art.ts";
import { BADGES } from "../badges.ts";
import { seeded } from "../deal.ts";
import { GAMES } from "../games.ts";
import { RULES } from "../rules.ts";
import { SPEECH_DIR as RHYME_DIR } from "../rhymetime/words.ts";
import { SPEECH_DIR as SOUND_DIR } from "../soundmachine/words.ts";
import { choicesFor, roundWords } from "./pick.ts";
import { MAX_ANSWER_MS, MIN_ANSWER_MS, MODES, SKILLS, TOP_SPEED, answerText, faultOf, parseAnswer, pay, settle, sightWordRules, speedOf, type Skill } from "./rules.ts";
import { PACE, REVEAL_WAIT_MS, advance, revealDone, startSession, waited, type Session } from "./session.ts";
import { CHOICES, LEVELS, ROUND_WORDS, SPEECH_DIR, WORDS, alike, allClips, levelById, nothingAlike, poolOf, sayUrl, sightClip, wordById } from "./words.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const level = (id: string) => levelById(id)!;
const word = (id: string) => wordById(id)!;
const SKILL_IDS = ["easy", "arcade"] as Skill[];

/** Answer the word that is up: the right word, or the first wrong one shown. */
const answerAt = (s: Session, now: number, right: boolean): Session => advance(s, { type: "pick", word: right ? s.word!.id : s.choices.find((c) => c !== s.word!.id)!, now });

// ---------- the words ----------

test("fifty words in five levels of ten; a word is in one level, spelled in letters, and no two are said alike", () => {
  assert.deepEqual(LEVELS.map((l) => [l.id, l.words.length]), [["meadow", 10], ["woods", 10], ["creek", 10], ["hills", 10], ["summit", 10]]);
  assert.equal(new Set(WORDS.map((w) => w.id.toLowerCase())).size, 50);
  for (const w of WORDS) assert.match(w.id, /^([a-z]{1,8}|I)$/, w.id);
  // A word is asked by voice alone: none of these may stand beside the word it sounds like.
  const sameSound = [["to", "two", "too"], ["no", "know"], ["there", "their"], ["here", "hear"], ["one", "won"], ["for", "four"], ["see", "sea"], ["would", "wood"], ["I", "eye"], ["where", "wear"], ["so", "sew"], ["do", "due"], ["we", "wee"], ["be", "bee"], ["by", "buy", "bye"], ["our", "hour"], ["right", "write"]];
  for (const group of sameSound) assert.ok(group.filter((id) => wordById(id)).length <= 1, group.join(" / "));
  assert.ok(ROUND_WORDS <= 10 && CHOICES === 4);
  assert.deepEqual(poolOf(level("woods")).length, 20);
  assert.deepEqual(LEVELS.map((l) => l.blurb), ["the I a", "of was are", "said have they", "where there were", "could would because"]);
});

test("what looks alike: the same first letter, the same last two, or one letter apart; nothing alike shares no last letter either", () => {
  const yes = [["the", "they"], ["the", "to"], ["where", "there"], ["here", "there"], ["me", "we"], ["no", "so"], ["could", "would"], ["I", "is"], ["was", "we"]];
  for (const [a, b] of yes) assert.ok(alike(word(a), word(b)) && alike(word(b), word(a)), `${a} ${b}`);
  const no = [["the", "you"], ["said", "for"], ["my", "go"], ["of", "was"]];
  for (const [a, b] of no) assert.ok(!alike(word(a), word(b)), `${a} ${b}`);
  assert.ok(!alike(word("the"), word("the")));
  assert.ok(!alike(word("I"), word("a")), "two one-letter words are not one letter apart");
  assert.ok(nothingAlike(word("the"), word("you")));
  assert.ok(!nothingAlike(word("the"), word("we")), "they end alike");
  assert.ok(!nothingAlike(word("the"), word("to")));
  for (const a of WORDS) for (const b of WORDS) assert.ok(!(alike(a, b) && nothingAlike(a, b)));
  // Every word has enough words nothing like it for an Easy question, on its own level.
  for (const l of LEVELS) for (const w of l.words) assert.ok(poolOf(l).filter((x) => nothingAlike(x, w)).length >= CHOICES - 1, `${l.id} ${w.id}`);
});

test("the cabinet's drawing and its badges' are there; the runner's speed is the run of right answers, from a jog to flat out", () => {
  const art = ART as Record<string, { rows: string[]; palettes: Record<string, unknown> }>;
  const game = GAMES.find((g) => g.id === "sight-word-sprint")!;
  assert.ok(Object.hasOwn(art, game.sprite));
  for (const b of BADGES.filter((x) => x.id.startsWith("sight-"))) assert.ok(art[b.sprite]?.palettes[b.palette], b.id);
  assert.ok(art.pine.palettes.far);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map(speedOf), [0, 1, 2, 3, 4, 4, 4]);
  assert.equal(TOP_SPEED, 4);
});

test("each word has one clip of its own, on disk and in the manifest, and nothing else is there; the voice is the other games'", () => {
  const dir = path.join(here, "../../public", SPEECH_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { clips: Record<string, { kind: string; voice: string; word: string }> };
  const clips = allClips();
  assert.equal(new Set(clips).size, WORDS.length);
  assert.equal(sightClip("I"), "sight-i");
  assert.deepEqual(Object.keys(manifest.clips).sort(), [...clips].sort());
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort(), clips.map((c) => `${c}.mp3`).sort());
  for (const w of WORDS) {
    const clip = sightClip(w.id);
    assert.deepEqual([manifest.clips[clip].kind, manifest.clips[clip].word], ["word", w.id.toLowerCase()]);
    const size = fs.statSync(path.join(dir, `${clip}.mp3`)).size;
    assert.ok(size > 1_000 && size < 200_000, `${clip}.mp3 is ${size} bytes`);
    assert.equal(sayUrl(w), `/${SPEECH_DIR}/${clip}.mp3`);
  }
  // A clip's name is its own across every game's clips, and one voice says them all.
  const others = [SOUND_DIR, RHYME_DIR].map((d) => JSON.parse(fs.readFileSync(path.join(here, "../../public", d, "manifest.json"), "utf8")) as { clips: Record<string, { voice: string }> });
  for (const o of others) for (const name of Object.keys(o.clips)) assert.ok(!clips.includes(name), name);
  assert.equal(new Set([manifest, ...others].flatMap((m) => Object.values(m.clips).map((c) => c.voice))).size, 1);
});

// ---------- the rules ----------

test("the game is listed, live, with rules; its ids are the ones stored on plays; two badges of its own", () => {
  assert.equal(RULES["sight-word-sprint"], sightWordRules);
  assert.equal(GAMES.find((g) => g.id === "sight-word-sprint")?.status, "live");
  assert.deepEqual(MODES.map((m) => [m.id, m.board]), [["hear", "score"]]);
  assert.deepEqual(SKILLS.map((s) => s.id), ["easy", "arcade"]);
  assert.deepEqual(sightWordRules.levels.map((l) => l.id), ["meadow", "woods", "creek", "hills", "summit"]);
  const ours = BADGES.filter((b) => b.id.startsWith("sight-"));
  assert.deepEqual(ours.map((b) => [b.id, b.tickets]), [["sight-blazer", 25], ["sight-champion", 300]]);
  const stars = (n: number) => ({ "sight-word-sprint": Object.fromEntries(LEVELS.map((l) => [l.id, n])) });
  const facts = (s: Record<string, Record<string, number>>) => ({ plays: 1, right: 0, bestCombo: 0, cleanSprints: 0, stars: s });
  assert.deepEqual(ours.map((b) => b.earned(facts({ "sight-word-sprint": { creek: 1 } }))), [true, false]);
  assert.deepEqual(ours.map((b) => b.earned(facts(stars(3)))), [true, true]);
  assert.deepEqual(ours.map((b) => b.earned(facts({ "rhyme-time": { "a-i": 3 } }))), [false, false], "another game's stars are not this game's");
});

test("an answer is written with its whole question and read back the same; anything else is not an answer", () => {
  assert.equal(answerText(["the", "you", "is", "my"], "you"), "the|you|is|my=you");
  assert.deepEqual(parseAnswer("the|you|I|my=I"), { choices: ["the", "you", "I", "my"], pick: "I" });
  for (const bad of ["", "the", "the|you=", "=the", "the|you=is=my", "the||you=the", "the|y0u=the", "the|you=becauseofit", "the|you =the"]) assert.equal(parseAnswer(bad), null, bad);
});

test("a fair question: four different words the level shows, the word said among them; Easy's others look nothing like it, Arcade's tempt where they can", () => {
  const m = level("meadow");
  assert.equal(faultOf(["the", "you", "is", "my"], m, "easy", "the"), null);
  assert.match(faultOf(["the", "you", "is", "my"], m, "easy", "said")!, /not a word Meadow asks/);
  assert.match(faultOf(["the", "you", "is", "said"], m, "easy", "the")!, /not a word Meadow shows/);
  assert.match(faultOf(["the", "you", "is", "is"], m, "easy", "the")!, /once in a question/);
  assert.match(faultOf(["the", "you", "is"], m, "easy", "the")!, /shows 4 words/);
  assert.match(faultOf(["the", "you", "is", "my", "go"], m, "easy", "the")!, /shows 4 words/);
  assert.match(faultOf(["a", "you", "is", "my"], m, "easy", "the")!, /not among the words shown/);
  assert.match(faultOf(["the", "to", "is", "my"], m, "easy", "the")!, /look nothing like/);
  assert.match(faultOf(["the", "we", "is", "my"], m, "easy", "the")!, /look nothing like/);
  // Arcade: "to" looks like "the", so a question without a look-alike is Easy's, not Arcade's.
  assert.match(faultOf(["the", "you", "is", "my"], m, "arcade", "the")!, /look like the word/);
  assert.equal(faultOf(["the", "to", "is", "my"], m, "arcade", "the"), null);
  // Every look-alike there is, up to three: one where there are four is not enough.
  assert.match(faultOf(["no", "so", "the", "you"], level("woods"), "arcade", "no")!, /as many as can/);
  assert.equal(faultOf(["no", "so", "go", "do"], level("woods"), "arcade", "no"), null);
  // A word nothing looks like: any other words will do on Arcade.
  assert.equal(faultOf(["you", "the", "is", "my"], m, "arcade", "you"), null);
  // A word of an earlier level may be shown, never asked.
  assert.equal(faultOf(["said", "you", "of", "my"], level("creek"), "easy", "said"), null);
  assert.match(faultOf(["the", "you", "is", "my"], level("creek"), "easy", "the")!, /not a word Creek asks/);
});

test("every question dealt is fair: each word on every level and skill, four seeds each; Arcade shows every look-alike it can, up to three", () => {
  for (const l of LEVELS) {
    for (const skill of SKILL_IDS) {
      for (const w of l.words) {
        for (let seed = 1; seed <= 4; seed++) {
          const choices = choicesFor(w, skill, l, seeded(seed));
          assert.equal(faultOf(choices, l, skill, w.id), null, `${l.id} ${skill} ${w.id}: ${choices.join(" ")}`);
          if (skill === "arcade") {
            const could = poolOf(l).filter((x) => alike(x, w)).length;
            assert.equal(choices.filter((c) => alike(word(c), w)).length, Math.min(CHOICES - 1, could), `${l.id} ${w.id}`);
          }
        }
      }
    }
  }
  // The word is not always in the same place.
  const places = new Set(Array.from({ length: 40 }, (_, i) => choicesFor(word("the"), "easy", level("meadow"), seeded(i)).indexOf("the")));
  assert.equal(places.size, CHOICES);
});

test("a round is eight of the level's ten words, none twice, leaning towards the ones missed", () => {
  for (const l of LEVELS) {
    const words = roundWords(l, {}, seeded(3));
    assert.equal(words.length, ROUND_WORDS);
    assert.equal(new Set(words).size, ROUND_WORDS);
    assert.ok(words.every((w) => l.words.includes(w)));
  }
  // Two words are left out of each round: a missed word is left out far less often than a known one.
  const m = level("meadow");
  const known = { seen: 5, missed: 0, ms: 9000 };
  const stats = Object.fromEntries(m.words.map((w) => [w.id, w.id === "you" ? { ...known, missed: 3 } : known]));
  let [missed, other] = [0, 0];
  for (let seed = 0; seed < 300; seed++) {
    const ids = roundWords(m, stats, seeded(seed)).map((w) => w.id);
    if (!ids.includes("you")) missed++;
    if (!ids.includes("my")) other++;
  }
  assert.ok(missed * 3 < other, `left out: missed ${missed}, known ${other}`);
});

test("settle judges the pick against the word said, scores as Sound Machine does, and refuses what could not be a round", () => {
  const config = { level: "meadow", mode: "hear", skill: "easy" };
  const got = settle(config, [
    { fact: "the", given: "the|you|is|my=the", ms: 3000 },
    { fact: "you", given: "you|the|is|my=you", ms: 200 },
    { fact: "my", given: "my|the|is|go=go", ms: 4000 },
  ]);
  assert.deepEqual([got.score, got.right, got.wrong, got.bestCombo, got.timeMs, got.finished, got.stars, got.board], [220, 2, 1, 2, 3000 + MIN_ANSWER_MS + 4000, false, 0, "score"]);
  assert.deepEqual(got.answers.map((a) => [a.correct, a.ms]), [[true, 3000], [true, 1000], [false, 4000]]);
  assert.equal(pay(config, got), 2);
  assert.equal(pay({ ...config, skill: "arcade" }, got), 4);
  const one = { fact: "the", given: "the|you|is|my=the", ms: 2000 };
  const refused: [object, unknown, RegExp][] = [
    [{ ...config, level: "nope" }, [one], /no level/],
    [{ ...config, mode: "find" }, [one], /no game/],
    [{ ...config, skill: "hard" }, [one], /no skill/],
    [config, "the", /not a round/],
    [config, Array.from({ length: 9 }, () => one), /not a round/],
    [config, [one, one], /once in a round/],
    [config, [{ ...one, fact: "said" }], /not a word Meadow asks/],
    [config, [{ ...one, fact: 7 }], /not a word Meadow asks/],
    [config, [{ ...one, ms: -1 }], /out of range/],
    [config, [{ ...one, ms: MAX_ANSWER_MS + 1 }], /out of range/],
    [config, [{ ...one, given: 3 }], /words shown and the word picked/],
    [config, [{ ...one, given: "x".repeat(60) }], /words shown and the word picked/],
    [config, [{ ...one, given: "the" }], /not four words and a pick/],
    [config, [{ ...one, given: "the|you|is|my=go" }], /not one of the words shown/],
    [config, [{ ...one, given: "the|to|is|my=the" }], /look nothing like/],
    [{ ...config, skill: "arcade" }, [one], /look like the word/],
  ];
  for (const [c, answers, why] of refused) assert.throws(() => settle(c as never, answers as never), why, JSON.stringify(answers));
});

// ---------- the round ----------

test("a round, event by event: a word comes, one tap answers it, and the next waits for the answer's time on show", () => {
  let s = startSession(level("meadow"), "easy", {}, 5);
  assert.deepEqual([s.phase, s.words.length, s.word], ["start", ROUND_WORDS, null]);
  s = advance(s, { type: "next", now: 1000, seed: 1 });
  assert.deepEqual([s.phase, s.word, s.choices.length], ["ask", s.words[0], CHOICES]);
  assert.equal(waited(s, 3500), 2500);
  // A word that is not one of the four is no answer.
  assert.equal(advance(s, { type: "pick", word: "because", now: 2000 }), s);
  s = answerAt(s, 3500, true);
  assert.deepEqual([s.phase, s.last, s.round.score, s.round.streak], ["right", { pick: s.words[0].id, correct: true, gained: 100 }, 100, 1]);
  assert.deepEqual(s.answers, [{ fact: s.words[0].id, given: answerText(s.choices, s.words[0].id), ms: 2500 }]);
  // One try: a second tap changes nothing.
  assert.equal(advance(s, { type: "pick", word: s.choices[0], now: 3600 }), s);
  assert.equal(advance(s, { type: "next", now: 3500 + PACE.right - 1, seed: 2 }), s);
  s = advance(s, { type: "next", now: 3500 + PACE.right, seed: 2 });
  assert.deepEqual([s.phase, s.word, s.last], ["ask", s.words[1], null]);
  s = answerAt(s, 10_000, false);
  assert.deepEqual([s.phase, s.last?.correct, s.last?.gained, s.round.score, s.round.streak], ["wrong", false, 0, 100, 0]);
  assert.equal(advance(s, { type: "next", now: 10_000 + PACE.wrong - 1, seed: 3 }), s);
  assert.equal(advance(s, { type: "next", now: 10_000 + PACE.wrong, seed: 3 }).phase, "ask");
  assert.deepEqual([revealDone({ said: false, shownAt: 0, now: REVEAL_WAIT_MS - 1 }), revealDone({ said: false, shownAt: 0, now: REVEAL_WAIT_MS }), revealDone({ said: true, shownAt: 0, now: 1 })], [false, true, true]);
});

test("the runner speeds up with each right answer in a row and jogs again after a miss; the score already won stays", () => {
  let s = startSession(level("woods"), "arcade", {}, 9);
  let now = 0;
  const speeds: number[] = [];
  const scores: number[] = [];
  for (const right of [true, true, true, false, true, true, true, true]) {
    s = advance(s, { type: "next", now, seed: now });
    now += 2000;
    s = answerAt(s, now, right);
    speeds.push(speedOf(s.round.streak));
    scores.push(s.round.score);
    now += 2000;
  }
  assert.deepEqual(speeds, [1, 2, 3, 0, 1, 2, 3, 4]);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i] >= scores[i - 1]);
});

test("pausing stops the word's time; a pause while an answer is shown holds the next word behind the box; one before the first word starts the round again", () => {
  let s = startSession(level("meadow"), "easy", {}, 1);
  // Paused before the first word: "next" is refused, and resuming bumps the step so the screen sends it again.
  s = advance(s, { type: "pause", now: 0 });
  assert.equal(advance(s, { type: "next", now: 10, seed: 1 }), s);
  const before = s.seq;
  s = advance(s, { type: "resume", now: 20 });
  assert.deepEqual([s.phase, s.wantPause, s.seq], ["start", false, before + 1]);
  s = advance(s, { type: "next", now: 100_000, seed: 1 });
  s = advance(s, { type: "toggle", now: 100_600 });
  assert.deepEqual([s.phase, s.wantPause, waited(s, 150_000)], ["paused", true, 600]);
  assert.equal(advance(s, { type: "pick", word: s.choices[0], now: 150_000 }), s);
  s = advance(s, { type: "toggle", now: 160_000 });
  assert.deepEqual([s.phase, waited(s, 160_400)], ["ask", 1000]);
  s = answerAt(s, 160_400, true);
  assert.equal(s.answers[0].ms, 1000);
  s = advance(s, { type: "pause", now: 160_500 });
  assert.deepEqual([s.phase, s.wantPause], ["right", true]);
  assert.equal(advance(s, { type: "next", now: 200_000, seed: 2 }), s);
  s = advance(s, { type: "resume", now: 200_000 });
  s = advance(s, { type: "next", now: 200_000, seed: 2 });
  assert.deepEqual([s.phase, waited(s, 201_000)], ["ask", 1000]);
});

test("what the screen plays is what the server scores: a whole round's answers settle to the same numbers", () => {
  for (const l of LEVELS) {
    for (const skill of SKILL_IDS) {
      let s = startSession(l, skill, {}, 11);
      let now = 0;
      for (let i = 0; i < 20 && s.phase !== "done"; i++) {
        s = advance(s, { type: "next", now, seed: i });
        if (s.phase === "done") break;
        now += 2000 + i * 300;
        s = answerAt(s, now, i % 3 !== 2); // every third word is missed
        now += 5000;
      }
      assert.equal(s.phase, "done", `${l.id} ${skill}`);
      assert.equal(s.answers.length, ROUND_WORDS);
      const settled = settle({ level: l.id, mode: "hear", skill }, s.answers);
      assert.deepEqual([settled.score, settled.right, settled.wrong, settled.bestCombo, settled.timeMs, settled.answers.length], [s.round.score, s.round.right, s.round.wrong, s.round.bestStreak, s.round.ms, ROUND_WORDS], `${l.id} ${skill}`);
      assert.deepEqual([settled.right, settled.finished, settled.stars], [6, true, 1]);
      assert.deepEqual(settled.answers.map((a) => a.ms), s.answers.map((a) => a.ms));
    }
  }
});

test("a round played as fast as the screen allows still takes longer on the wall than its words claim (the server's clock check)", () => {
  for (const skill of SKILL_IDS) {
    for (const how of ["right", "wrong"] as const) {
      let s = startSession(level("hills"), skill, {}, 2);
      let wall = 0;
      for (let i = 0; i < 20; i++) {
        s = advance(s, { type: "next", now: wall, seed: i });
        if (s.phase !== "ask") break;
        // Answered 1 ms after the word came up: under MIN_ANSWER_MS, so counted as more than it took.
        wall += 1;
        s = answerAt(s, wall, how === "right");
        // The next word is asked for at once, and again every millisecond: it comes when the session lets it.
        const shown = wall;
        while (advance(s, { type: "next", now: wall, seed: i + 1 }) === s) wall += 1;
        assert.equal(wall - shown, PACE[how]);
      }
      assert.equal(s.phase, "done");
      wall += PACE.done;
      const claimed = settle({ level: "hills", mode: "hear", skill }, s.answers).answers.reduce((sum, a) => sum + a.ms, 0);
      assert.equal(claimed, ROUND_WORDS * MIN_ANSWER_MS);
      assert.ok(claimed < wall, `${skill} ${how}: ${claimed} ms counted in ${wall} ms`);
    }
  }
  assert.ok(PACE.right > MIN_ANSWER_MS && PACE.wrong > MIN_ANSWER_MS, "an answer on show outlasts what the floor can add to it");
});
