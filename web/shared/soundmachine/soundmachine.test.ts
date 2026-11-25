import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ART } from "../../src/sprites/art.ts";
import { seeded, type FactStat } from "../deal.ts";
import { GAMES } from "../games.ts";
import type { AnswerInput, PlayConfig } from "../play.ts";
import { RULES } from "../rules.ts";
import { DISTRACTORS, PICTURES, picturesFor, roundWords, trayFor } from "./pick.ts";
import { MAX_ANSWER_MS, MIN_ANSWER_MS, MODES, SKILLS, answerOf, gemsOf, pay, poolOf, settle, soundMachineRules, type Mode, type Skill } from "./rules.ts";
import { GEM_WAIT_MS, PACE, advance, built, gemsMayFly, cutEnough, full, pieces, startSession, waited, type Session } from "./session.ts";
import { DIGRAPHS, LEVELS, LOOKALIKES, ROUND_WORDS, SOUNDS, SPEECH_DIR, TILE_SOUND, VOWELS, WORDS, allClips, levelById, lookalike, piecesOf, reviewOf, reviewRoom, slowClip, soundClip, soundOf, splitKey, tileClip, tilesKey, wordById, wordClip } from "./words.ts";

const level = (id: string) => levelById(id)!;
const cfg = (levelId: string, mode: Mode = "build", skill: Skill = "easy") => ({ level: levelId, mode, skill });
const ok = (mode: Mode, id: string, ms = 3000): AnswerInput => ({ fact: id, given: answerOf(mode, wordById(id)!), ms });

// ---------- the words ----------

test("every word is three sounds, consonant - short vowel - consonant, spelt by its tiles, and each tile has a sound", () => {
  assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length, "a word is listed twice");
  for (const w of WORDS) {
    assert.match(w.id, /^[a-z]+$/, w.id);
    assert.ok(!w.id.includes("x"), `${w.id}: x is two sounds`);
    assert.equal(w.tiles.join(""), w.id, w.id);
    assert.equal(w.tiles.length, 3, `${w.id} is not three sounds`);
    const [first, vowel, last] = w.tiles;
    assert.ok(VOWELS.includes(vowel), `${w.id}: the middle is not a short vowel`);
    for (const c of [first, last]) assert.ok(!VOWELS.includes(c) && soundOf(c), `${w.id}: ${c} is not a consonant tile`);
    // A digraph is always one tile: its two letters never sit in two boxes.
    for (const d of DIGRAPHS) assert.equal(w.id.includes(d), w.tiles.includes(d), `${w.id}: ${d} is split, or made of two tiles`);
    assert.equal(tilesKey(w.tiles).split("-").join(""), w.id);
  }
  assert.equal(soundOf("c"), "k");
  assert.equal(soundOf("ck"), "k");
  assert.equal(soundOf("k"), "k");
  assert.equal(soundOf("constructor"), undefined);
});

test("every tile is pinned to its sound and every sound to how it is said: none may drift to a neighbour", () => {
  // Written out, not derived: a tile that came to say another sound (th as sh, b as d) fails here.
  assert.deepEqual({ ...TILE_SOUND }, {
    a: "a", e: "e", i: "i", o: "o", u: "u",
    b: "b", c: "k", d: "d", f: "f", g: "g", h: "h", k: "k", l: "l", m: "m", n: "n", p: "p", r: "r", s: "s", t: "t", w: "w",
    ch: "ch", ck: "k", sh: "sh", th: "th",
  });
  assert.deepEqual(Object.fromEntries(SOUNDS.map((s) => [s.id, s.ipa])), {
    a: "\u00e6", e: "\u025b", i: "\u026a", o: "\u0251", u: "\u028c",
    b: "b", d: "d", f: "f", g: "\u0261", h: "h", k: "k", l: "l", m: "m", n: "n", p: "p", r: "\u0279", s: "s", t: "t", w: "w",
    ch: "t\u0283", sh: "\u0283", th: "\u03b8",
  });
  // A sound that can be held is one a mouth can keep making; a stop is not.
  assert.deepEqual(SOUNDS.filter((s) => !s.held).map((s) => s.id).sort(), ["b", "ch", "d", "g", "k", "p", "t"]);
  for (const tile of Object.keys(TILE_SOUND)) assert.equal(tileClip(tile), `sound-${TILE_SOUND[tile]}`);
});

test("a level's words need only what it and the levels before it teach, and carry what it teaches", () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ["cvc", "ch", "ck", "sh", "th", "mix"]);
  LEVELS.forEach((l, at) => {
    const taught = DIGRAPHS.filter((d) => DIGRAPHS.indexOf(d) < at || l.id === "mix");
    for (const w of l.focus) {
      for (const t of w.tiles) assert.ok(t.length === 1 || taught.includes(t), `${l.id}: ${w.id} needs ${t}, not taught yet`);
      if (DIGRAPHS.includes(l.id)) assert.ok(w.tiles.includes(l.id), `${l.id}: ${w.id} has no ${l.id}`);
      if (l.id === "cvc") assert.ok(w.tiles.every((t) => t.length === 1), w.id);
      if (l.id === "mix") assert.ok(w.tiles.some((t) => DIGRAPHS.includes(t)), w.id);
    }
    // A round is eight different words: the level's own, filled up from earlier levels.
    assert.ok(l.focus.length + reviewOf(l).length >= ROUND_WORDS, `${l.id} cannot fill a round`);
    assert.ok(l.focus.length >= 5, `${l.id} has only ${l.focus.length} words of its own`);
    for (const w of reviewOf(l)) assert.ok(!l.focus.includes(w) && LEVELS.slice(0, at).some((e) => e.focus.includes(w)), `${l.id} reviews ${w.id}`);
  });
  assert.deepEqual([reviewRoom(level("cvc")), reviewRoom(level("ch")), reviewRoom(level("ck")), reviewRoom(level("sh")), reviewRoom(level("mix"))], [0, 3, 0, 2, 0]);
  assert.deepEqual(LEVELS.map((l) => l.focus.length), [11, 5, 8, 6, 6, 28]);
  for (const id of ["chick", "check", "shock"]) assert.ok(level("mix").focus.some((w) => w.id === id) && !level("ck").focus.some((w) => w.id === id), id);
});

test("every word has a 16 x 16 picture of its own, and every lookalike pair names two words", () => {
  const art = ART as Record<string, { rows: string[]; palettes: Record<string, unknown> }>;
  const seen = new Set<string>();
  for (const w of WORDS) {
    assert.ok(Object.hasOwn(art, w.picture), `${w.id}: no drawing ${w.picture}`);
    assert.deepEqual([art[w.picture].rows.length, art[w.picture].rows[0].length], [16, 16], w.picture);
    assert.ok("default" in art[w.picture].palettes, w.picture);
    const rows = art[w.picture].rows.join("\n");
    assert.ok(!seen.has(rows), `${w.id} shares its drawing with another word`);
    seen.add(rows);
  }
  for (const [a, b] of LOOKALIKES) assert.ok(wordById(a) && wordById(b), `${a} / ${b}`);
  for (const g of GAMES) assert.ok(Object.hasOwn(art, g.sprite), `${g.id}: no drawing ${g.sprite}`);
});

test("every sound has a clip and every word has two (plain and slow), on disk and in the manifest, and nothing else is there", () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../public", SPEECH_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { clips: Record<string, { kind: string; voice: string; bytes: number }> };
  const clips = allClips();
  assert.equal(clips.length, SOUNDS.length + 2 * WORDS.length);
  assert.equal(new Set(clips).size, clips.length);
  assert.equal(new Set(SOUNDS.map((s) => s.id)).size, SOUNDS.length);
  for (const tile of Object.keys(TILE_SOUND)) assert.ok(clips.includes(tileClip(tile)), `no clip for the tile ${tile}`);
  for (const w of WORDS) {
    assert.ok(clips.includes(wordClip(w.id)));
    assert.equal(slowClip(w.id), `${wordClip(w.id)}-slow`);
    assert.ok(clips.includes(slowClip(w.id)), `${w.id} has no slow clip`);
    for (const t of w.tiles) assert.ok(SOUNDS.some((s) => soundClip(s.id) === tileClip(t)), `${w.id}: ${t} has no sound`);
  }
  for (const clip of clips) {
    const entry = manifest.clips[clip];
    assert.ok(entry, `${clip} is not in the manifest`);
    assert.equal(entry.kind, clip.startsWith("word-") ? "word" : "sound", clip);
    assert.ok(entry.voice, `${clip}: the manifest does not say which voice`);
    const size = fs.statSync(path.join(dir, `${clip}.mp3`)).size;
    assert.ok(size > 1_000 && size < 200_000, `${clip}.mp3 is ${size} bytes`);
  }
  assert.deepEqual(Object.keys(manifest.clips).sort(), [...clips].sort(), "the manifest lists a clip the game does not have");
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort(), clips.map((c) => `${c}.mp3`).sort());
  // One voice says everything.
  assert.equal(new Set(Object.values(manifest.clips).map((c) => c.voice)).size, 1);
});

// ---------- the rules ----------

test("the game is listed, live, with rules; its ids are the ones stored on plays", () => {
  assert.equal(RULES["sound-machine"], soundMachineRules);
  assert.equal(GAMES.find((g) => g.id === "sound-machine")?.status, "live");
  assert.deepEqual(MODES.map((m) => [m.id, m.board]), [["build", "score"], ["read", "score"], ["gems", "score"]]);
  assert.deepEqual(SKILLS.map((s) => s.id), ["easy", "arcade"]);
});

test("a right word scores 100 and 20 more for each right one before it in a row; a wrong one scores nothing and ends the run", () => {
  const words = level("cvc").focus.map((w) => w.id);
  const three = settle(cfg("cvc"), words.slice(0, 3).map((id) => ok("build", id)));
  assert.deepEqual([three.score, three.right, three.wrong, three.bestCombo, three.finished, three.stars], [100 + 120 + 140, 3, 0, 3, false, 0]);
  const missed = settle(cfg("cvc"), [ok("build", "cat"), { fact: "hat", given: "h-a-d", ms: 4000 }, ok("build", "bed")]);
  assert.deepEqual([missed.score, missed.right, missed.wrong, missed.bestCombo], [200, 2, 1, 1]);
  assert.deepEqual(missed.answers.map((a) => [a.fact, a.given, a.correct]), [["cat", "c-a-t", true], ["hat", "h-a-d", false], ["bed", "b-e-d", true]]);
  const perfect = settle(cfg("cvc"), words.slice(0, 8).map((id) => ok("build", id)));
  assert.deepEqual([perfect.score, perfect.finished, perfect.board, perfect.timeMs], [800 + 20 * 28, true, "score", 8 * 3000]);
});

test("Build is judged on the tiles in order, Read on the word picked; the spelling counts, not the sound", () => {
  assert.equal(settle(cfg("ck"), [{ fact: "duck", given: "d-u-ck", ms: 2000 }]).right, 1);
  assert.equal(settle(cfg("ck"), [{ fact: "duck", given: "d-u-k", ms: 2000 }]).right, 0, "k says the same but is not how duck is spelt");
  assert.equal(settle(cfg("ck"), [{ fact: "duck", given: "ck-u-d", ms: 2000 }]).right, 0);
  assert.equal(settle(cfg("mix", "read"), [{ fact: "chick", given: "chick", ms: 2000 }]).right, 1);
  assert.equal(settle(cfg("mix", "read"), [{ fact: "chick", given: "check", ms: 2000 }]).right, 0);
});

test("Split is judged on where the word is cut: a digraph is one piece, and nothing but the word's own letters is taken", () => {
  assert.equal(answerOf("gems", wordById("ship")!), "sh|i|p");
  assert.equal(answerOf("gems", wordById("chick")!), "ch|i|ck");
  assert.equal(answerOf("gems", wordById("cat")!), "c|a|t");
  assert.deepEqual(piecesOf("ship", [true, false, true]), ["s", "hi", "p"]);
  assert.deepEqual(piecesOf("ship", [false, false, false]), ["ship"]);
  assert.equal(splitKey(piecesOf("thick", [false, true, true, false])), "th|i|ck");
  const one = (level: string, fact: string, given: string) => settle(cfg(level, "gems"), [{ fact, given, ms: 2000 }]).answers[0].correct;
  assert.equal(one("sh", "ship", "sh|i|p"), true);
  assert.equal(one("sh", "ship", "s|h|i|p"), false, "four letters, three sounds: sh is one");
  assert.equal(one("sh", "ship", "sh|ip"), false);
  // Three pieces, as many as its sounds, cut in the wrong places: still wrong.
  assert.equal(one("sh", "ship", "s|hi|p"), false);
  assert.equal(one("sh", "ship", "s|h|ip"), false);
  assert.equal(one("mix", "chick", "c|hi|ck"), false);
  assert.equal(one("th", "thick", "th|ic|k"), false);
  assert.equal(one("sh", "ship", "ship"), false, "not cut at all is an answer, and a wrong one");
  assert.equal(one("ck", "duck", "d|u|c|k"), false);
  assert.equal(one("mix", "chick", "ch|i|ck"), true);
  assert.equal(one("mix", "chick", "c|h|i|ck"), false);
  assert.equal(one("cvc", "cat", "c|a|t"), true);
  assert.equal(one("cvc", "cat", "c|at"), false);
  const no = (given: unknown, why: RegExp) => assert.throws(() => settle(cfg("sh", "gems"), [{ fact: "ship", given, ms: 2000 } as AnswerInput]), why);
  for (const given of ["sh|i|pp", "s||hip", "|ship", "ship|", "p|i|sh", "sh-i-p", "shop", "SH|I|P", ""]) no(given, /not "ship" cut into pieces/);
  no(5, /a word, its tiles or its pieces/);
  // Each game's answers are its own.
  assert.throws(() => settle(cfg("sh", "build"), [{ fact: "ship", given: "sh|i|p", ms: 2000 }]), /does not fit the boxes/);
  assert.throws(() => settle(cfg("sh", "read"), [{ fact: "ship", given: "sh|i|p", ms: 2000 }]), /not a picture/);
});

test("gems: three for each word split right, none for one split wrong, and only a right split in its own game counts", () => {
  const answers = [
    { fact: "ship", given: "sh|i|p" },
    { fact: "fish", given: "f|i|s|h" },
    { fact: "cat", given: "c|a|t" },
    { fact: "zebra", given: "z|e|b" },
  ];
  assert.equal(gemsOf("gems", answers), 6);
  assert.equal(gemsOf("gems", []), 0);
  assert.equal(gemsOf("build", answers), 0, "a Build answer is tiles, not pieces");
  // The gems are the right words' sounds: three for every right word, since every word is three sounds.
  const s = settle(cfg("sh", "gems"), answers.slice(0, 2).map((a) => ({ ...a, ms: 2000 })));
  assert.equal(gemsOf("gems", s.answers), 3 * s.right);
});

test("stars: a finished round with 5 right is one, 7 is two, all 8 is three; an unfinished round has none", () => {
  const words = level("ck").focus.map((w) => w.id);
  const round = (right: number, n = 8) => settle(cfg("ck", "read"), words.slice(0, n).map((id, i) => (i < right ? ok("read", id) : { fact: id, given: i ? words[0] : words[1], ms: 2000 })));
  assert.deepEqual([0, 4, 5, 6, 7, 8].map((n) => round(n).stars), [0, 0, 1, 1, 2, 3]);
  assert.deepEqual([round(7, 7).stars, round(7, 7).finished], [0, false]);
});

test("a right answer pays 1 ticket on Easy and 2 on Arcade", () => {
  const s = settle(cfg("cvc"), ["cat", "hat", "bed"].map((id) => ok("build", id)));
  assert.equal(pay(cfg("cvc", "build", "easy"), s), 3);
  assert.equal(pay(cfg("cvc", "read", "arcade"), s), 6);
});

test("a play that cannot be is refused", () => {
  const no = (config: PlayConfig, answers: unknown, why: RegExp) => assert.throws(() => settle(config, answers as AnswerInput[]), why);
  no({ ...cfg("cvc"), level: "zz" }, [], /no level/);
  no({ ...cfg("cvc"), mode: "blitz" }, [], /no mode/);
  no({ ...cfg("cvc"), skill: "hard" }, [], /no skill/);
  no(cfg("cvc"), "cat", /not a round/);
  no(cfg("cvc"), [{ fact: "zebra", given: "z-e-b", ms: 2000 }], /not a word in/);
  no(cfg("cvc"), [{ fact: "duck", given: "d-u-ck", ms: 2000 }], /not a word in/);
  no(cfg("cvc"), [{ fact: "constructor", given: "c-a-t", ms: 2000 }], /not a word in/);
  no(cfg("cvc"), [ok("build", "cat"), ok("build", "cat")], /once in a round/);
  no(cfg("cvc"), level("cvc").focus.slice(0, 9).map((w) => ok("build", w.id)), /not a round/);
  no(cfg("cvc"), [{ fact: "cat", given: 3, ms: 2000 }], /a word, its tiles or its pieces/);
  no(cfg("cvc"), [{ fact: "cat", given: null, ms: 2000 }], /a word, its tiles or its pieces/);
  no(cfg("cvc"), [{ fact: "cat", given: "c-a", ms: 2000 }], /does not fit the boxes/);
  no(cfg("cvc"), [{ fact: "cat", given: "c-a-zz", ms: 2000 }], /does not fit the boxes/);
  no(cfg("cvc"), [{ fact: "cat", given: "cat", ms: 2000 }], /does not fit the boxes/);
  no(cfg("cvc", "read"), [{ fact: "cat", given: "c-a-t", ms: 2000 }], /not a picture/);
  no(cfg("cvc", "read"), [{ fact: "cat", given: "zebra", ms: 2000 }], /not a picture/);
  for (const ms of [-1, Number.NaN, MAX_ANSWER_MS + 1, "3" as unknown as number]) no(cfg("cvc"), [{ fact: "cat", given: "c-a-t", ms }], /out of range/);
  // ch has five words of its own: three old ones fill its round, and no more.
  const old = level("cvc").focus.map((w) => w.id);
  assert.equal(settle(cfg("ch"), [...old.slice(0, 3), "chip"].map((id) => ok("build", id))).right, 4);
  no(cfg("ch"), old.slice(0, 4).map((id) => ok("build", id)), /that many old words/);
  no(cfg("ck"), [ok("build", "cat")], /not a word in/);
  assert.equal(settle(cfg("cvc"), []).score, 0, "an empty round is a round");
});

test("a time under the floor is counted as the floor", () => {
  const s = settle(cfg("cvc"), [{ fact: "cat", given: "c-a-t", ms: 0 }, { fact: "hat", given: "h-a-t", ms: 2500.4 }]);
  assert.deepEqual(s.answers.map((a) => a.ms), [MIN_ANSWER_MS, 2500]);
  assert.equal(s.timeMs, MIN_ANSWER_MS + 2500);
});

test("the session counts a word's time between the floor and the longest a word can take, so its round can always be saved", () => {
  for (const mode of ["build", "read", "gems"] as Mode[]) {
    let s = startSession(level("cvc"), mode, "easy", {}, 3);
    s = advance(s, { type: "next", now: 1000, seed: 1 });
    // Answered the moment it came up: the floor, in the session as in settle().
    s = answerAt(s, 1000, true);
    assert.equal(s.answers[0].ms, MIN_ANSWER_MS, mode);
    assert.equal(s.round.ms, MIN_ANSWER_MS, mode);
    // Left on the machine for three hours: the longest a word can take, not a time settle() refuses.
    s = advance(s, { type: "next", now: 10_000, seed: 2 });
    s = answerAt(s, 10_000 + 3 * 3_600_000, true);
    assert.equal(s.answers[1].ms, MAX_ANSWER_MS, mode);
    const settled = settle(cfg("cvc", mode), s.answers);
    assert.deepEqual([settled.score, settled.right, settled.timeMs], [s.round.score, 2, MIN_ANSWER_MS + MAX_ANSWER_MS], mode);
  }
  // A posted time past the longest is still refused: the session never makes one.
  assert.throws(() => settle(cfg("cvc"), [ok("build", "cat", MAX_ANSWER_MS + 1)]), /out of range/);
});

// ---------- what a round is made of ----------

test("a round is eight different words: all of a short level's own and old ones to fill it, missed words first in line", () => {
  for (const l of LEVELS) {
    for (let seed = 0; seed < 40; seed++) {
      const words = roundWords(l, {}, seeded(seed));
      assert.equal(words.length, ROUND_WORDS, l.id);
      assert.equal(new Set(words).size, ROUND_WORDS, l.id);
      const own = words.filter((w) => l.focus.includes(w));
      assert.equal(own.length, Math.min(ROUND_WORDS, l.focus.length), l.id);
      assert.ok(words.every((w) => poolOf(l).includes(w)));
      // What the session plays is a round settle() takes.
      assert.equal(settle(cfg(l.id, "read"), words.map((w) => ok("read", w.id))).stars, 3);
    }
  }
  // cvc has eleven words: three sit out each round. A missed one sits out less often than a known one.
  const known: FactStat = { seen: 5, missed: 0, ms: 3000 };
  const stats: Record<string, FactStat> = Object.fromEntries(level("cvc").focus.map((w) => [w.id, known]));
  stats.pig = { seen: 5, missed: 2, ms: 3000 };
  let pig = 0;
  let dog = 0;
  for (let seed = 0; seed < 400; seed++) {
    const ids = roundWords(level("cvc"), stats, seeded(seed)).map((w) => w.id);
    pig += ids.includes("pig") ? 1 : 0;
    dog += ids.includes("dog") ? 1 : 0;
  }
  assert.ok(pig > 380 && dog < 330, `pig ${pig}, dog ${dog}`);
  // Nothing here is on a clock, so a word got right slowly is a word known:
  // it comes up no more often than one got right fast.
  stats.pig = { seen: 5, missed: 0, ms: 9 * 60_000 };
  let slow = 0;
  let quick = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const ids = roundWords(level("cvc"), stats, seeded(seed)).map((w) => w.id);
    slow += ids.includes("pig") ? 1 : 0;
    quick += ids.includes("dog") ? 1 : 0;
  }
  assert.ok(Math.abs(slow - quick) < 60 && slow < 790, `slow ${slow}, quick ${quick}`);
  // The order is not always the list's.
  assert.notDeepEqual(roundWords(level("ck"), {}, seeded(1)).map((w) => w.id), roundWords(level("ck"), {}, seeded(2)).map((w) => w.id));
});

test("Build's tray: Easy holds exactly the word's tiles; Arcade adds up to three that tempt; never in the word's own order", () => {
  for (const l of LEVELS) {
    const at = LEVELS.indexOf(l);
    for (const w of poolOf(l)) {
      for (let seed = 0; seed < 25; seed++) {
        const easy = trayFor(w, "easy", l, seeded(seed));
        assert.deepEqual([...easy].sort(), [...w.tiles].sort(), `${l.id} ${w.id}`);
        assert.notDeepEqual(easy, w.tiles, `${w.id}: the tray spells it already`);
        const tray = trayFor(w, "arcade", l, seeded(seed));
        const extra = tray.filter((t) => !w.tiles.includes(t));
        assert.equal(new Set(tray).size, tray.length, `${w.id}: a tile twice in ${tray}`);
        assert.ok(w.tiles.every((t) => tray.includes(t)), `${w.id}: ${tray}`);
        assert.ok(extra.length >= 2 && extra.length <= DISTRACTORS, `${l.id} ${w.id}: ${tray}`);
        assert.notDeepEqual(tray.slice(0, 3), w.tiles);
        assert.ok(extra.some((t) => VOWELS.includes(t)), `${w.id}: no other vowel in ${tray}`);
        for (const t of extra) {
          assert.ok(soundOf(t), t);
          assert.ok(t.length === 1 || l.id === "mix" || DIGRAPHS.indexOf(t) < at, `${l.id} ${w.id}: ${t} is not taught yet`);
          // Before ck is taught, no second spelling of a sound the word has.
          if (at < 2) assert.ok(!w.tiles.some((own) => soundOf(own) === soundOf(t)), `${l.id} ${w.id}: ${t} sounds like one of its own`);
        }
      }
    }
  }
  // Once ck is taught, a word with the k sound is offered another way to spell it.
  for (const id of ["duck", "kick", "cash", "chick"]) {
    const l = id === "cash" ? level("sh") : id === "chick" ? level("mix") : level("ck");
    const tray = trayFor(wordById(id)!, "arcade", l, seeded(7));
    assert.ok(tray.some((t) => ["c", "k", "ck"].includes(t) && !wordById(id)!.tiles.includes(t)), `${id}: ${tray}`);
  }
});

test("Read's pictures: the word's own among 3 on Easy and 4 on Arcade, no two alike, and Arcade's share a first or last sound when any do", () => {
  for (const l of LEVELS) {
    for (const w of poolOf(l)) {
      for (let seed = 0; seed < 25; seed++) {
        for (const skill of ["easy", "arcade"] as Skill[]) {
          const pics = picturesFor(w, skill, l, seeded(seed));
          assert.equal(pics.length, PICTURES[skill], `${l.id} ${w.id}`);
          assert.equal(new Set(pics).size, pics.length);
          assert.ok(pics.includes(w.id));
          assert.ok(pics.every((id) => poolOf(l).some((p) => p.id === id)), `${l.id} ${w.id}: ${pics}`);
          for (const a of pics) for (const b of pics) assert.ok(!lookalike(a, b), `${a} beside ${b}`);
        }
      }
    }
  }
  // Arcade's wrong pictures are the near ones first. In "3 sounds" only cup
  // starts like cat and only hat ends like it, so both are always there; pig
  // has four near it (pin; dog, log, bug), so all three beside it are near.
  // Easy takes any, so it does not always.
  const sharesWith = (id: string, other: string) => {
    const [a, b] = [wordById(id)!, wordById(other)!];
    return soundOf(a.tiles[0]) === soundOf(b.tiles[0]) || soundOf(a.tiles[2]) === soundOf(b.tiles[2]);
  };
  let easyNear = 0;
  for (let seed = 0; seed < 40; seed++) {
    const cat = picturesFor(wordById("cat")!, "arcade", level("cvc"), seeded(seed));
    assert.ok(cat.includes("cup") && cat.includes("hat"), `cat on Arcade: ${cat}`);
    const pig = picturesFor(wordById("pig")!, "arcade", level("cvc"), seeded(seed)).filter((id) => id !== "pig");
    assert.ok(pig.every((id) => ["pin", "dog", "log", "bug"].includes(id)), `pig on Arcade: ${pig}`);
    easyNear += picturesFor(wordById("cat")!, "easy", level("cvc"), seeded(seed)).filter((id) => id === "cup" || id === "hat").length;
  }
  assert.ok(easyNear < 80, "Easy does not go looking for the near ones");
  // And everywhere: as many near ones as there is room for and words to be had.
  for (const l of LEVELS) {
    for (const w of poolOf(l)) {
      const nearBy = poolOf(l).filter((o) => o.id !== w.id && !lookalike(o.id, w.id) && sharesWith(w.id, o.id));
      for (let seed = 0; seed < 5; seed++) {
        const got = picturesFor(w, "arcade", l, seeded(seed)).filter((id) => id !== w.id && sharesWith(w.id, id));
        // Two near ones that look alike cannot both be shown, so one may be lost to that.
        assert.ok(got.length >= Math.min(PICTURES.arcade - 1, nearBy.length) - 1 && (nearBy.length === 0 || got.length >= 1), `${l.id} ${w.id}: ${got} of ${nearBy.map((o) => o.id)}`);
      }
    }
  }
  const places = new Set(Array.from({ length: 30 }, (_, seed) => picturesFor(wordById("cat")!, "easy", level("cvc"), seeded(seed)).indexOf("cat")));
  assert.equal(places.size, 3, "the right picture is not always in the same place");
});

// ---------- a round, event by event ----------

/** Answer the word on the machine at `now`, right or wrong. */
function answerAt(s: Session, now: number, right: boolean): Session {
  const word = s.word!;
  if (s.mode === "read") return advance(s, { type: "pick", word: right ? word.id : s.pictures.find((id) => id !== word.id)!, now });
  if (s.mode === "gems") {
    // Right: a cut after each tile but the last. Wrong: as many pieces as it
    // has sounds, cut in the wrong places ("s|h|ip", or "ri|c|h" where
    // "r|i|ch" is right), where it has four letters or more; a three-letter
    // word has only one way into three pieces, so it is cut once ("c|at").
    const good = word.tiles.slice(0, -1).map((_, i) => word.tiles.slice(0, i + 1).join("").length - 1);
    const at = right ? good : word.id.length === 3 ? [0] : good.join() === "0,1" ? [1, 2] : [0, 1];
    for (const gap of at) s = advance(s, { type: "cut", at: gap });
    return advance(s, { type: "go", now });
  }
  const order = right ? word.tiles : [...word.tiles].reverse();
  for (const tile of order) s = advance(s, { type: "place", tile: s.tray.findIndex((t, i) => t === tile && !s.boxes.includes(i)) });
  return advance(s, { type: "go", now });
}

test("Build: tiles go into the first empty box and come back out; the lever does nothing until every box is full", () => {
  let s = startSession(level("ch"), "build", "arcade", {}, 5);
  assert.deepEqual([s.phase, s.words.length, s.word], ["start", 8, null]);
  assert.equal(advance(s, { type: "go", now: 5 }), s, "no word yet");
  s = advance(s, { type: "next", now: 1000, seed: 9 });
  const word = s.word!;
  assert.deepEqual([s.phase, s.boxes, s.pictures], ["ask", [null, null, null], []]);
  assert.ok(s.tray.length > 3);
  const at = (tile: string) => s.tray.indexOf(tile);
  s = advance(s, { type: "place", tile: at(word.tiles[1]) });
  assert.deepEqual(built(s), [word.tiles[1], "", ""]);
  assert.equal(advance(s, { type: "place", tile: at(word.tiles[1]) }), s, "a tile is in one box at a time");
  assert.equal(advance(s, { type: "place", tile: 99 }), s);
  assert.equal(advance(s, { type: "go", now: 2000 }), s, "two boxes are empty");
  s = advance(s, { type: "take", box: 0 });
  assert.deepEqual(built(s), ["", "", ""]);
  assert.equal(advance(s, { type: "take", box: 0 }), s);
  for (const t of word.tiles) s = advance(s, { type: "place", tile: at(t) });
  assert.ok(full(s));
  assert.equal(advance(s, { type: "place", tile: s.tray.findIndex((_, i) => !s.boxes.includes(i)) }), s, "no box left");
  assert.equal(advance(s, { type: "pick", word: word.id, now: 2500 }), s, "there are no pictures to pick in Build");
  s = advance(s, { type: "take", box: 1 });
  s = advance(s, { type: "place", tile: at(word.tiles[1]) });
  s = advance(s, { type: "go", now: 4000 });
  assert.deepEqual([s.phase, s.last, s.answers], ["right", { given: tilesKey(word.tiles), correct: true, gained: 100 }, [{ fact: word.id, given: tilesKey(word.tiles), ms: 3000 }]]);
  assert.equal(advance(s, { type: "go", now: 4100 }), s, "one try per word");
  assert.equal(advance(s, { type: "take", box: 0 }), s);
});

test("Read: one tap on a picture is the answer; a wrong one is shown, never punished, and the round moves on", () => {
  let s = startSession(level("cvc"), "read", "easy", {}, 3);
  s = advance(s, { type: "next", now: 0, seed: 1 });
  assert.deepEqual([s.pictures.length, s.tray.length], [3, 0]);
  assert.equal(advance(s, { type: "pick", word: "zebra", now: 10 }), s);
  assert.equal(advance(s, { type: "place", tile: 0 }), s);
  const first = s.word!.id;
  s = answerAt(s, 2500, true);
  assert.deepEqual([s.phase, s.round.score], ["right", 100]);
  s = advance(s, { type: "next", now: 2500 + PACE.right, seed: 2 });
  assert.notEqual(s.word!.id, first);
  s = answerAt(s, 9000, false);
  assert.deepEqual([s.phase, s.last?.correct, s.last?.gained, s.round.score, s.round.streak], ["wrong", false, 0, 100, 0], "the points already won are kept");
  assert.equal(advance(s, { type: "pick", word: s.word!.id, now: 9100 }), s, "one try");
});

test("Split: a word comes up whole; a tap on a gap cuts it there and another joins it; the lever works once it is cut; one try", () => {
  let s = startSession(level("th"), "gems", "easy", {}, 4);
  assert.equal(advance(s, { type: "cut", at: 0 }), s, "no word yet");
  s = advance(s, { type: "next", now: 1000, seed: 3 });
  const word = s.word!;
  assert.deepEqual([s.phase, s.cuts.length, s.cuts.every((c) => !c), s.tray, s.boxes, s.pictures], ["ask", word.id.length - 1, true, [], [], []]);
  assert.deepEqual(pieces(s), [word.id]);
  assert.equal(cutEnough(s), false);
  assert.equal(advance(s, { type: "go", now: 1500 }), s, "a word that is not cut is not an answer");
  for (const at of [-1, word.id.length - 1, 0.5, Number.NaN]) assert.equal(advance(s, { type: "cut", at }), s, `gap ${at}`);
  assert.equal(advance(s, { type: "place", tile: 0 }), s, "there are no tiles in Split");
  assert.equal(advance(s, { type: "pick", word: word.id, now: 1500 }), s, "nor pictures");
  s = advance(s, { type: "cut", at: 0 });
  assert.deepEqual([pieces(s), cutEnough(s)], [[word.id[0], word.id.slice(1)], true]);
  s = advance(s, { type: "cut", at: 0 });
  assert.deepEqual([pieces(s), cutEnough(s)], [[word.id], false], "a second tap joins it again");
  // Cut into its tiles, and pulled.
  let at = -1;
  for (const t of word.tiles.slice(0, -1)) s = advance(s, { type: "cut", at: (at += t.length) });
  assert.deepEqual(pieces(s), word.tiles);
  s = advance(s, { type: "go", now: 4000 });
  assert.deepEqual([s.phase, s.last, s.answers], ["right", { given: splitKey(word.tiles), correct: true, gained: 100 }, [{ fact: word.id, given: splitKey(word.tiles), ms: 3000 }]]);
  assert.equal(advance(s, { type: "go", now: 4100 }), s, "one try per word");
  assert.equal(advance(s, { type: "cut", at: 0 }), s, "the answer on show cannot be cut");
  // A wrong split is shown, the points and gems already won are kept, and the next word comes up whole.
  s = advance(s, { type: "next", now: 4000 + PACE.right, seed: 4 });
  assert.ok(s.cuts.every((c) => !c));
  s = answerAt(s, 9000, false);
  assert.deepEqual([s.phase, s.last?.correct, s.round.score, s.round.streak, gemsOf("gems", s.answers)], ["wrong", false, 100, 0, 3]);
  assert.equal(String(s.answers[1].given).split("|").length, 3, "the wrong split had as many pieces as the word has sounds");
  // Every gap cut: one piece a letter. Every word here has th, so that is wrong.
  s = advance(s, { type: "next", now: 9000 + PACE.wrong, seed: 5 });
  const third = s.word!;
  for (let g = 0; g < third.id.length - 1; g++) s = advance(s, { type: "cut", at: g });
  assert.deepEqual(pieces(s), [...third.id]);
  s = advance(s, { type: "go", now: 12_000 });
  assert.deepEqual([s.phase, s.answers[2].given, s.round.score, gemsOf("gems", s.answers)], ["wrong", [...third.id].join("|"), 100, 3]);
  // Easy and Arcade play alike: the lever waits for a first cut, not for the right number of pieces.
  let a = advance(startSession(level("cvc"), "gems", "arcade", {}, 4), { type: "next", now: 0, seed: 1 });
  a = advance(a, { type: "cut", at: 0 });
  assert.equal(advance(a, { type: "go", now: 2000 }).phase, "wrong");
  let e = advance(startSession(level("cvc"), "gems", "easy", {}, 4), { type: "next", now: 0, seed: 1 });
  e = advance(e, { type: "cut", at: 1 });
  assert.equal(advance(e, { type: "go", now: 2000 }).phase, "wrong", "on Easy too a three-letter word can be cut wrong");
  // Build and Read take no cuts.
  for (const mode of ["build", "read"] as Mode[]) {
    const o = advance(startSession(level("cvc"), mode, "easy", {}, 4), { type: "next", now: 0, seed: 1 });
    assert.deepEqual(o.cuts, []);
    assert.equal(advance(o, { type: "cut", at: 0 }), o, mode);
  }
});

test("a pause during a Split answer on show holds the next word, and a pause while cutting keeps the cuts", () => {
  let s = startSession(level("sh"), "gems", "easy", {}, 4);
  s = advance(s, { type: "next", now: 0, seed: 1 });
  s = advance(s, { type: "cut", at: 0 });
  s = advance(s, { type: "pause", now: 1000 });
  assert.equal(advance(s, { type: "cut", at: 1 }), s, "nothing is cut behind the box");
  assert.equal(advance(s, { type: "go", now: 1100 }), s);
  s = advance(s, { type: "resume", now: 50_000 });
  assert.deepEqual([s.phase, s.cuts[0]], ["ask", true]);
  s = advance(s, { type: "go", now: 51_000 });
  assert.equal(s.answers[0].ms, 2000);
  // Paused 100 ms into the answer on show: the next word waits however long the box is up.
  const shown = s.shownAt;
  s = advance(s, { type: "pause", now: shown + 100 });
  assert.equal(advance(s, { type: "next", now: shown + 100_000, seed: 2 }), s);
  s = advance(s, { type: "resume", now: shown + 100_000 });
  assert.equal(advance(s, { type: "next", now: shown + 100_000, seed: 2 }).phase, "ask");
});

test("Split's gems wait for speech to stop, but never without a limit", () => {
  const fly = (begun: boolean, talking: boolean, settledAt: number | null, now: number) => gemsMayFly({ begun, speaking: talking, settledAt, now });
  assert.equal(fly(false, false, null, 0), false, "not before the reveal has begun");
  assert.equal(fly(true, false, null, 0), true, "at once when nothing is being said");
  assert.equal(fly(true, true, null, 1e9), false, "speech goes on and the reveal is still being said");
  assert.equal(fly(true, true, 4000, 4000 + GEM_WAIT_MS - 1), false, "a clip still playing after the reveal (a hear button) is waited for");
  assert.equal(fly(true, true, 4000, 4000 + GEM_WAIT_MS), true, "a clip that never ends (the audio stopped) is not waited for past the limit");
  // A hear button pressed just before the reveal settles says a word that may outlast it by the
  // word's own length: the limit leaves room for the longest clip there is, and is a few seconds at most.
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../public", SPEECH_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { clips: Record<string, { ms: number }> };
  const longest = Math.max(...Object.values(manifest.clips).map((c) => c.ms));
  assert.ok(GEM_WAIT_MS >= longest + 250 && GEM_WAIT_MS <= 3000, `${GEM_WAIT_MS} ms against the longest clip, ${longest} ms`);
});

test("the next word does not come until the answer has had its time on show", () => {
  let s = startSession(level("cvc"), "read", "easy", {}, 3);
  s = advance(s, { type: "next", now: 0, seed: 1 });
  assert.equal(advance(s, { type: "next", now: 50, seed: 2 }), s, "a word is waiting");
  s = answerAt(s, 100, true);
  assert.equal(advance(s, { type: "next", now: 100 + PACE.right - 1, seed: 2 }), s);
  assert.equal(advance(s, { type: "next", now: 100 + PACE.right, seed: 2 }).phase, "ask");
  s = answerAt(advance(s, { type: "next", now: 5000, seed: 2 }), 5100, false);
  assert.equal(advance(s, { type: "next", now: 5100 + PACE.wrong - 1, seed: 3 }), s);
  assert.equal(advance(s, { type: "next", now: 5100 + PACE.wrong, seed: 3 }).phase, "ask");
});

test("a pause before the first word does not lose the round: resuming starts it", () => {
  let s = startSession(level("cvc"), "build", "easy", {}, 3);
  s = advance(s, { type: "pause", now: 100 });
  assert.deepEqual([s.phase, s.wantPause], ["start", true]);
  // The screen's first "next" arrives behind the box and is refused.
  assert.equal(advance(s, { type: "next", now: 250, seed: 1 }), s);
  const before = s.seq;
  s = advance(s, { type: "resume", now: 5000 });
  // The step goes up: that is what makes the screen send "next" again.
  assert.deepEqual([s.phase, s.wantPause, s.seq > before], ["start", false, true]);
  s = advance(s, { type: "next", now: 5250, seed: 1 });
  assert.deepEqual([s.phase, !!s.word, waited(s, 6250)], ["ask", true, 1000]);
  // The same with the pause key pressed twice.
  let t = advance(startSession(level("cvc"), "read", "easy", {}, 3), { type: "toggle", now: 10 });
  const seq = t.seq;
  t = advance(t, { type: "toggle", now: 20 });
  assert.ok(t.seq > seq && !t.wantPause);
  assert.equal(advance(t, { type: "next", now: 300, seed: 1 }).phase, "ask");
});

test("only the time a word waits is counted: the answer on show and the pause box are not", () => {
  let s = startSession(level("cvc"), "read", "easy", {}, 3);
  s = advance(s, { type: "next", now: 1000, seed: 1 });
  assert.equal(waited(s, 3000), 2000);
  s = advance(s, { type: "pause", now: 3000 });
  assert.deepEqual([s.phase, s.wantPause, waited(s, 60_000)], ["paused", true, 2000]);
  assert.equal(advance(s, { type: "pick", word: s.word!.id, now: 4000 }), s, "nothing is answered behind the box");
  s = advance(s, { type: "toggle", now: 100_000 });
  assert.equal(s.phase, "ask");
  s = answerAt(s, 101_500, true);
  assert.equal(s.answers[0].ms, 3500);
  // Paused while the answer is on show: the next word waits behind the box.
  s = advance(s, { type: "pause", now: 101_600 });
  assert.equal(advance(s, { type: "next", now: 200_000, seed: 2 }), s);
  s = advance(s, { type: "resume", now: 200_000 });
  s = advance(s, { type: "next", now: 200_000, seed: 2 });
  assert.deepEqual([s.phase, waited(s, 201_000)], ["ask", 1000]);
});

test("what the screen plays is what the server scores: a whole round's answers settle to the same numbers", () => {
  for (const l of LEVELS) {
    for (const [mode, skill] of [["build", "easy"], ["build", "arcade"], ["read", "easy"], ["read", "arcade"], ["gems", "easy"], ["gems", "arcade"]] as [Mode, Skill][]) {
      let s = startSession(l, mode, skill, {}, 11);
      let now = 0;
      for (let i = 0; i < 20 && s.phase !== "done"; i++) {
        s = advance(s, { type: "next", now, seed: i });
        if (s.phase === "done") break;
        now += 2000 + i * 300;
        s = answerAt(s, now, i % 3 !== 2); // every third word is missed
        now += 5000;
      }
      assert.equal(s.phase, "done", `${l.id} ${mode}`);
      assert.equal(s.answers.length, ROUND_WORDS);
      const settled = settle({ level: l.id, mode, skill }, s.answers);
      assert.deepEqual([settled.score, settled.right, settled.wrong, settled.bestCombo, settled.timeMs, settled.answers.length], [s.round.score, s.round.right, s.round.wrong, s.round.bestStreak, s.round.ms, ROUND_WORDS], `${l.id} ${mode} ${skill}`);
      assert.deepEqual([settled.right, settled.finished, settled.stars], [6, true, 1]);
      assert.deepEqual(settled.answers.map((a) => a.ms), s.answers.map((a) => a.ms));
      // The gems the tray shows are the server's right words, three sounds each.
      if (mode === "gems") assert.equal(gemsOf(mode, s.answers), 3 * settled.right);
    }
  }
});

test("a round played as fast as the screen allows still takes longer on the wall than its words claim (the server's clock check)", () => {
  for (const [mode, skill] of [["build", "easy"], ["read", "arcade"], ["gems", "easy"], ["gems", "arcade"]] as [Mode, Skill][]) {
    for (const how of ["right", "wrong"] as const) {
      let s = startSession(level("ck"), mode, skill, {}, 2);
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
      const claimed = settle({ level: "ck", mode, skill }, s.answers).answers.reduce((sum, a) => sum + a.ms, 0);
      assert.equal(claimed, ROUND_WORDS * MIN_ANSWER_MS);
      assert.ok(claimed < wall, `${mode} ${how}: ${claimed} ms counted in ${wall} ms`);
    }
  }
  assert.ok(PACE.right > MIN_ANSWER_MS && PACE.wrong > MIN_ANSWER_MS, "an answer on show outlasts what the floor can add to it");
});
