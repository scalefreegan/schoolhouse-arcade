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
import { SPEECH_DIR as SIGHT_DIR } from "../sightwords/words.ts";
import { SOUNDS, SPEECH_DIR as SOUND_DIR, soundOf } from "../soundmachine/words.ts";
import { roundWords, trayFor } from "./pick.ts";
import { MAX_ANSWER_MS, MIN_ANSWER_MS, MODES, SKILLS, answerText, faultOf, parseAnswer, pay, settle, wordFamilyRules, type Skill } from "./rules.ts";
import { PACE, REVEAL_WAIT_MS, advance, revealDone, startSession, waited, type Session } from "./session.ts";
import { BLOCKED, FAMILIES, FAMILY_WORDS, LEVELS, NEAR, ONSETS, ROUND_FAMILIES, ROUND_WORDS, SPEECH_DIR, TRAY, WORDS, familyById, levelById, near, onsetUrl, onsetsFor, ownClips, ownWords, rimeClip, rimeUrl, sayUrl, wordById } from "./words.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "../../public");
const level = (id: string) => levelById(id)!;
const word = (id: string) => wordById(id)!;
const SKILL_IDS = ["easy", "arcade"] as Skill[];

/** Answer the word that is up: its own first tile, or the first other tile in the tray. */
const answerAt = (s: Session, now: number, right: boolean): Session => advance(s, { type: "pick", tile: right ? s.word!.onset : s.tray.find((t) => t !== s.word!.onset)!, now });

// ---------- the words ----------

test("eighteen families in six levels; a word is its first tile and its ending, in one family, and every family has a round's four", () => {
  assert.deepEqual(LEVELS.map((l) => [l.id, l.groups.map((g) => g.family.id).join(" ")]), [
    ["a", "at an ap"],
    ["i", "ig in ip"],
    ["o", "op ot og"],
    ["e-u", "et en ed ug un"],
    ["ck", "ack eck ick ock"],
    ["mix", FAMILIES.map((f) => f.id).join(" ")],
  ]);
  assert.equal(FAMILIES.length, 18);
  assert.equal(WORDS.length, 110);
  assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length);
  for (const w of WORDS) {
    const f = familyById(w.family)!;
    assert.equal(w.id, w.onset + f.id, w.id);
    assert.equal(f.id, f.tiles.join(""));
    assert.match(w.id, /^[a-z]{3,5}$/);
    assert.ok(onsetsFor(f).includes(w.onset), `${w.id}: its own first tile may stand in its tray`);
  }
  for (const f of FAMILIES) {
    assert.equal(f.tiles.length, 2, f.id);
    for (const t of f.tiles) assert.ok(soundOf(t), `${f.id}: ${t} has a sound`);
  }
  for (const l of LEVELS) {
    assert.ok(l.groups.length >= ROUND_FAMILIES, l.id);
    for (const g of l.groups) assert.ok(g.words.length >= FAMILY_WORDS && g.words.every((w) => w.family === g.family.id), `${l.id} ${g.family.id}`);
    assert.deepEqual(l.words, l.groups.flatMap((g) => g.words));
  }
  assert.deepEqual(LEVELS.map((l) => l.blurb), ["bat cat", "big dig", "hop mop", "net pet", "back pack", "bat cat"]);
  // The words that start with ch, sh or th and end in a plain family are asked on Mix only; the ck level has its own.
  const mixOnly = WORDS.filter((w) => LEVELS.slice(0, -1).every((l) => !l.words.includes(w))).map((w) => w.id);
  assert.deepEqual(mixOnly, ["chat", "chin", "thin", "shin", "chip", "ship", "chop", "shop", "shot", "shed"]);
  assert.equal(ROUND_WORDS, ROUND_FAMILIES * FAMILY_WORDS);
});

test("a tray's tiles: one sound each and no two alike in a family, k before e and i and c elsewhere, and nothing spelled that should not be", () => {
  for (const t of ONSETS) assert.ok(SOUNDS.some((s) => s.id === soundOf(t)), t);
  for (const f of FAMILIES) {
    const may = onsetsFor(f);
    assert.equal(new Set(may.map(soundOf)).size, may.length, `${f.id}: two tiles of one sound`);
    assert.equal(may.includes("k"), f.tiles[0] === "e" || f.tiles[0] === "i", f.id);
    assert.ok(may.includes("c") ? !may.includes("k") : may.includes("k") || f.id === "ock", f.id);
    for (const t of may) assert.ok(!BLOCKED.includes(t + f.id), t + f.id);
    assert.ok(may.length >= 13, f.id);
  }
  assert.ok(!onsetsFor(familyById("ock")!).includes("c") && !onsetsFor(familyById("ick")!).includes("d") && !onsetsFor(familyById("ig")!).includes("n"));
  // Nor a word said another way than its tiles say: the th of that buzzes, the g of gin is soft.
  assert.ok(!onsetsFor(familyById("at")!).includes("sh") && !onsetsFor(familyById("at")!).includes("th") && !onsetsFor(familyById("in")!).includes("g"));
  // ch, sh and th are in a tray only on a level whose words start with them; a level's words always have their own tile.
  assert.deepEqual(LEVELS.map((l) => l.digraphs), [false, false, false, false, true, true]);
  for (const l of LEVELS) {
    for (const g of l.groups) {
      const may = onsetsFor(g.family, l);
      if (!l.digraphs) assert.ok(may.every((t) => t.length === 1), `${l.id} ${g.family.id}`);
      for (const w of g.words) assert.ok(may.includes(w.onset), `${l.id} ${w.id}`);
      assert.ok(may.length >= 11, `${l.id} ${g.family.id}`);
    }
  }
  // What sounds alike goes both ways, and is never a tile with itself or with its own sound.
  for (const [a, b] of NEAR) assert.ok(near(a, b) && near(b, a), `${a} ${b}`);
  assert.ok(near("c", "g") && near("k", "g") && !near("c", "k") && !near("b", "b") && !near("h", "m"));
  // Every word has tiles enough for an Easy tray that sound nothing like its own, and room in Arcade's for every one that does.
  for (const l of LEVELS) {
    for (const w of l.words) {
      const others = onsetsFor(familyById(w.family)!, l).filter((t) => t !== w.onset);
      assert.ok(others.filter((t) => !near(t, w.onset)).length >= TRAY.arcade - 1, `${l.id} ${w.id}`);
      assert.ok(others.filter((t) => near(t, w.onset)).length <= TRAY.arcade - 1, `${l.id} ${w.id}`);
    }
  }
});

test("the cabinet's drawing and its badges' are there", () => {
  const art = ART as Record<string, { rows: string[]; palettes: Record<string, unknown> }>;
  const game = GAMES.find((g) => g.id === "word-families")!;
  assert.ok(Object.hasOwn(art, game.sprite));
  for (const b of BADGES.filter((x) => x.id.startsWith("family-"))) assert.ok(art[b.sprite]?.palettes[b.palette], b.id);
});

test("every word and ending has a clip on disk: this game's own in its folder and manifest and nothing else there, the rest another game's; one voice", () => {
  const dir = path.join(pub, SPEECH_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { clips: Record<string, { kind: string; voice: string }> };
  const clips = ownClips();
  assert.equal(clips.length, FAMILIES.length + ownWords().length);
  assert.equal(new Set(clips).size, clips.length);
  assert.deepEqual(Object.keys(manifest.clips).sort(), [...clips].sort());
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort(), clips.map((c) => `${c}.mp3`).sort());
  for (const f of FAMILIES) {
    assert.equal(manifest.clips[rimeClip(f.id)].kind, "rime");
    assert.equal(rimeUrl(f), `/${SPEECH_DIR}/rime-${f.id}.mp3`);
  }
  const sizeOf = (url: string) => fs.statSync(path.join(pub, url), { throwIfNoEntry: false })?.size ?? 0;
  for (const w of WORDS) assert.ok(sizeOf(sayUrl(w)) > 1_000 && sizeOf(sayUrl(w)) < 200_000, `${w.id}: ${sayUrl(w)}`);
  for (const t of ONSETS) assert.ok(sizeOf(onsetUrl(t)) > 500, t);
  assert.equal(sayUrl(word("cat")), `/${SOUND_DIR}/word-cat.mp3`);
  assert.equal(sayUrl(word("bat")), `/${RHYME_DIR}/word-bat.mp3`);
  assert.equal(sayUrl(word("fat")), `/${SPEECH_DIR}/word-fat.mp3`);
  assert.equal(onsetUrl("c"), `/${SOUND_DIR}/sound-k.mp3`);
  // A clip's name is its own across every game's clips, and one voice says them all.
  const others = [SOUND_DIR, RHYME_DIR, SIGHT_DIR].map((d) => JSON.parse(fs.readFileSync(path.join(pub, d, "manifest.json"), "utf8")) as { clips: Record<string, { voice: string }> });
  for (const o of others) for (const name of Object.keys(o.clips)) assert.ok(!clips.includes(name), name);
  assert.equal(new Set([manifest, ...others].flatMap((m) => Object.values(m.clips).map((c) => c.voice))).size, 1);
});

// ---------- the rules ----------

test("the game is listed, live, with rules; its ids are the ones stored on plays; two badges of its own", () => {
  assert.equal(RULES["word-families"], wordFamilyRules);
  assert.equal(GAMES.find((g) => g.id === "word-families")?.status, "live");
  assert.deepEqual(MODES.map((m) => [m.id, m.board]), [["build", "score"]]);
  assert.deepEqual(SKILLS.map((s) => s.id), ["easy", "arcade"]);
  assert.deepEqual(wordFamilyRules.levels.map((l) => l.id), ["a", "i", "o", "e-u", "ck", "mix"]);
  assert.deepEqual(TRAY, { easy: 4, arcade: 6 });
  const ours = BADGES.filter((b) => b.id.startsWith("family-"));
  assert.deepEqual(ours.map((b) => [b.id, b.tickets]), [["family-door", 25], ["family-champion", 300]]);
  const stars = (n: number) => ({ "word-families": Object.fromEntries(LEVELS.map((l) => [l.id, n])) });
  const facts = (s: Record<string, Record<string, number>>) => ({ plays: 1, right: 0, bestCombo: 0, cleanSprints: 0, stars: s });
  assert.deepEqual(ours.map((b) => b.earned(facts({ "word-families": { o: 1 } }))), [true, false]);
  assert.deepEqual(ours.map((b) => b.earned(facts(stars(3)))), [true, true]);
  assert.deepEqual(ours.map((b) => b.earned(facts({ "rhyme-time": { "a-i": 3 } }))), [false, false], "another game's stars are not this game's");
});

test("an answer is written with its whole tray and read back the same; anything else is not an answer", () => {
  assert.equal(answerText(["b", "c", "h", "m"], "c"), "b|c|h|m=c");
  assert.deepEqual(parseAnswer("b|ch|h|m=ch"), { tray: ["b", "ch", "h", "m"], pick: "ch" });
  for (const bad of ["", "b", "b|c=", "=b", "b|c=b=c", "b||c=b", "b|C=b", "b|c=cat", "b|c =b", "b|1=b"]) assert.equal(parseAnswer(bad), null, bad);
});

test("a fair question: the skill's number of different tiles that may stand before the ending, the word's own among them; Easy's sound nothing like it, Arcade's has every one that does", () => {
  const a = level("a");
  assert.equal(faultOf(["b", "c", "h", "m"], a, "easy", "bat"), null);
  assert.match(faultOf(["b", "c", "h", "m"], a, "easy", "pig")!, /not a word a asks/);
  assert.match(faultOf(["b", "c", "h", "m"], a, "easy", "chat")!, /not a word a asks/);
  assert.match(faultOf(["b", "k", "h", "m"], a, "easy", "bat")!, /"k" is not a tile shown with -at/);
  assert.match(faultOf(["b", "x", "h", "m"], a, "easy", "bat")!, /not a tile shown/);
  assert.match(faultOf(["b", "c", "h", "h"], a, "easy", "bat")!, /once in a tray/);
  assert.match(faultOf(["b", "c", "h"], a, "easy", "bat")!, /holds 4 tiles/);
  assert.match(faultOf(["b", "c", "h", "m", "s", "r"], a, "easy", "bat")!, /holds 4 tiles/);
  assert.match(faultOf(["s", "c", "h", "m"], a, "easy", "bat")!, /first tile is not in the tray/);
  assert.match(faultOf(["b", "p", "h", "m"], a, "easy", "bat")!, /no other tile sounds like/);
  assert.match(faultOf(["b", "d", "h", "m"], a, "easy", "bat")!, /no other tile sounds like/);
  // Arcade: p and d sound like b, so both are in the tray.
  assert.match(faultOf(["b", "c", "h", "m"], a, "arcade", "bat")!, /holds 6 tiles/);
  assert.match(faultOf(["b", "p", "h", "m", "s", "r"], a, "arcade", "bat")!, /every tile that sounds like/);
  assert.equal(faultOf(["b", "p", "d", "m", "s", "r"], a, "arcade", "bat"), null);
  // A first sound nothing sounds like: any tiles will do on Arcade.
  assert.equal(faultOf(["h", "p", "d", "m", "s", "r"], a, "arcade", "hat"), null);
  // A tile that would spell what should not be spelled is not one that sounds like it, and may not be shown.
  assert.match(faultOf(["k", "d", "l", "s"], level("ck"), "easy", "kick")!, /"d" is not a tile shown with -ick/);
  assert.equal(faultOf(["p", "b", "k", "l", "s", "th"], level("ck"), "arcade", "pick"), null, "d would sound like p's b, but it is b that sounds like p");
  // ch, sh and th are not shown on a level that asks no word starting with them.
  assert.match(faultOf(["s", "sh", "h", "m"], a, "easy", "hat")!, /"sh" is not a tile shown/);
  assert.equal(faultOf(["s", "b", "c", "m", "h", "r"], a, "arcade", "sat"), null, "nothing a shows sounds like s");
  assert.match(faultOf(["s", "b", "k", "m", "h", "r"], level("mix"), "arcade", "sip")!, /every tile that sounds like/);
  assert.equal(faultOf(["s", "sh", "th", "m", "h", "r"], level("mix"), "arcade", "sip"), null);
  // Mix asks the words the earlier levels do not.
  assert.equal(faultOf(["ch", "b", "h", "m"], level("mix"), "easy", "chat"), null);
});

test("every question dealt is fair: each word on every level and skill, four seeds each; most of an Easy tray makes a word of the family", () => {
  for (const l of LEVELS) {
    for (const skill of SKILL_IDS) {
      for (const w of l.words) {
        for (let seed = 1; seed <= 4; seed++) {
          const tray = trayFor(w, skill, l, seeded(seed));
          assert.equal(faultOf(tray, l, skill, w.id), null, `${l.id} ${skill} ${w.id}: ${tray.join(" ")}`);
          assert.equal(tray.length, TRAY[skill]);
        }
      }
    }
  }
  // The others are the family's own first tiles while there are any that may stand there.
  const kin = level("a").words.filter((w) => w.family === "at").map((w) => w.onset);
  for (const l of LEVELS) for (const skill of SKILL_IDS) for (const w of l.words) for (let seed = 0; seed < 12; seed++) for (const t of trayFor(w, skill, l, seeded(seed))) assert.ok(!BLOCKED.includes(t + w.family), t + w.family);
  for (let seed = 0; seed < 20; seed++) assert.ok(trayFor(word("hat"), "easy", level("a"), seeded(seed)).every((t) => kin.includes(t)));
  // The word's tile is not always in the same place.
  const places = new Set(Array.from({ length: 40 }, (_, i) => trayFor(word("hat"), "easy", level("a"), seeded(i)).indexOf("h")));
  assert.equal(places.size, TRAY.easy);
});

test("a round is two of the level's families, four words of one and then four of the other, none twice, leaning towards what was missed", () => {
  for (const l of LEVELS) {
    for (let seed = 0; seed < 6; seed++) {
      const words = roundWords(l, {}, seeded(seed));
      assert.equal(words.length, ROUND_WORDS);
      assert.equal(new Set(words).size, ROUND_WORDS);
      assert.ok(words.every((w) => l.words.includes(w)));
      const families = words.map((w) => w.family);
      assert.equal(new Set(families.slice(0, FAMILY_WORDS)).size, 1);
      assert.equal(new Set(families.slice(FAMILY_WORDS)).size, 1);
      assert.notEqual(families[0], families[FAMILY_WORDS]);
    }
  }
  // A missed word is left out of its family's four far less often than a known one, and its family out of the round.
  const a = level("a");
  const known = { seen: 5, missed: 0, ms: 9000 };
  const stats = Object.fromEntries(a.words.map((w) => [w.id, w.id === "sat" ? { ...known, missed: 3 } : known]));
  let [missed, other, withAt, withAn] = [0, 0, 0, 0];
  for (let seed = 0; seed < 400; seed++) {
    const ids = roundWords(a, stats, seeded(seed)).map((w) => w.id);
    if (ids.some((id) => id.endsWith("at"))) {
      withAt++;
      if (!ids.includes("sat")) missed++;
      if (!ids.includes("rat")) other++;
    }
    if (ids.some((id) => id.endsWith("an"))) withAn++;
  }
  assert.ok(missed * 3 < other, `left out: missed ${missed}, known ${other}`);
  assert.ok(withAt > withAn, `rounds with -at ${withAt}, with -an ${withAn}`);
});

test("settle judges the pick against the word's first tile, scores as Sound Machine does, and refuses what could not be a round", () => {
  const config = { level: "a", mode: "build", skill: "easy" };
  const got = settle(config, [
    { fact: "bat", given: "b|c|h|m=b", ms: 3000 },
    { fact: "cat", given: "h|c|m|s=c", ms: 200 },
    { fact: "hat", given: "h|c|m|s=m", ms: 4000 },
  ]);
  assert.deepEqual([got.score, got.right, got.wrong, got.bestCombo, got.timeMs, got.finished, got.stars, got.board], [220, 2, 1, 2, 3000 + MIN_ANSWER_MS + 4000, false, 0, "score"]);
  assert.deepEqual(got.answers.map((x) => [x.correct, x.ms]), [[true, 3000], [true, 1000], [false, 4000]]);
  assert.equal(pay(config, got), 2);
  assert.equal(pay({ ...config, skill: "arcade" }, got), 4);
  const one = { fact: "bat", given: "b|c|h|m=b", ms: 2000 };
  const refused: [object, unknown, RegExp][] = [
    [{ ...config, level: "nope" }, [one], /no level/],
    [{ ...config, mode: "hear" }, [one], /no game/],
    [{ ...config, skill: "hard" }, [one], /no skill/],
    [config, "bat", /not a round/],
    [config, Array.from({ length: 9 }, () => one), /not a round/],
    [config, [one, one], /once in a round/],
    [config, [{ ...one, fact: "pig" }], /not a word a asks/],
    [config, [{ ...one, fact: 7 }], /not a word a asks/],
    [config, [{ ...one, ms: -1 }], /out of range/],
    [config, [{ ...one, ms: MAX_ANSWER_MS + 1 }], /out of range/],
    [config, [{ ...one, given: 3 }], /tiles shown and the tile picked/],
    [config, [{ ...one, given: "b|".repeat(20) }], /tiles shown and the tile picked/],
    [config, [{ ...one, given: "bat" }], /not a tray of tiles and a pick/],
    [config, [{ ...one, given: "b|c|h|m=s" }], /not one of the tiles shown/],
    [config, [{ ...one, given: "b|p|h|m=b" }], /no other tile sounds like/],
    [{ ...config, skill: "arcade" }, [one], /holds 6 tiles/],
    // Not a round's words: a third family, a family come back to, or five of one.
    [config, [one, { fact: "can", given: "c|f|m|r=c", ms: 2000 }, { fact: "cap", given: "c|m|l|t=c", ms: 2000 }], /2 families, one after the other/],
    [config, [one, { fact: "can", given: "c|f|m|r=c", ms: 2000 }, { fact: "hat", given: "h|c|m|s=h", ms: 2000 }], /2 families, one after the other/],
    [config, ["b", "c", "f", "h", "m"].map((t) => ({ fact: `${t}at`, given: `${t}|${t === "r" ? "s" : "r"}|l|w=${t}`, ms: 2000 })), /4 words of a family/],
  ];
  for (const [c, answers, why] of refused) assert.throws(() => settle(c as never, answers as never), why, JSON.stringify(answers));
});

// ---------- the round ----------

test("a round, event by event: a word comes, one tap answers it, and the next waits for the answer's time on show", () => {
  let s = startSession(level("a"), "easy", {}, 5);
  assert.deepEqual([s.phase, s.words.length, s.word], ["start", ROUND_WORDS, null]);
  s = advance(s, { type: "next", now: 1000, seed: 1 });
  assert.deepEqual([s.phase, s.word, s.tray.length], ["ask", s.words[0], TRAY.easy]);
  assert.equal(waited(s, 3500), 2500);
  // A tile that is not in the tray is no answer.
  assert.equal(advance(s, { type: "pick", tile: "zz", now: 2000 }), s);
  s = answerAt(s, 3500, true);
  assert.deepEqual([s.phase, s.last, s.round.score, s.round.streak], ["right", { pick: s.words[0].onset, correct: true, gained: 100 }, 100, 1]);
  assert.deepEqual(s.answers, [{ fact: s.words[0].id, given: answerText(s.tray, s.words[0].onset), ms: 2500 }]);
  // One try: a second tap changes nothing.
  assert.equal(advance(s, { type: "pick", tile: s.tray[0], now: 3600 }), s);
  assert.equal(advance(s, { type: "next", now: 3500 + PACE.right - 1, seed: 2 }), s);
  s = advance(s, { type: "next", now: 3500 + PACE.right, seed: 2 });
  assert.deepEqual([s.phase, s.word, s.last], ["ask", s.words[1], null]);
  s = answerAt(s, 10_000, false);
  assert.deepEqual([s.phase, s.last?.correct, s.last?.gained, s.round.score, s.round.streak], ["wrong", false, 0, 100, 0]);
  assert.equal(advance(s, { type: "next", now: 10_000 + PACE.wrong - 1, seed: 3 }), s);
  assert.equal(advance(s, { type: "next", now: 10_000 + PACE.wrong, seed: 3 }).phase, "ask");
  assert.deepEqual([revealDone({ said: false, shownAt: 0, now: REVEAL_WAIT_MS - 1 }), revealDone({ said: false, shownAt: 0, now: REVEAL_WAIT_MS }), revealDone({ said: true, shownAt: 0, now: 1 })], [false, true, true]);
});

test("pausing stops the word's time; a pause while an answer is shown holds the next word behind the box; one before the first word starts the round again", () => {
  let s = startSession(level("a"), "easy", {}, 1);
  // Paused before the first word: "next" is refused, and resuming bumps the step so the screen sends it again.
  s = advance(s, { type: "pause", now: 0 });
  assert.equal(advance(s, { type: "next", now: 10, seed: 1 }), s);
  const before = s.seq;
  s = advance(s, { type: "resume", now: 20 });
  assert.deepEqual([s.phase, s.wantPause, s.seq], ["start", false, before + 1]);
  s = advance(s, { type: "next", now: 100_000, seed: 1 });
  s = advance(s, { type: "toggle", now: 100_600 });
  assert.deepEqual([s.phase, s.wantPause, waited(s, 150_000)], ["paused", true, 600]);
  assert.equal(advance(s, { type: "pick", tile: s.tray[0], now: 150_000 }), s);
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
      const settled = settle({ level: l.id, mode: "build", skill }, s.answers);
      assert.deepEqual([settled.score, settled.right, settled.wrong, settled.bestCombo, settled.timeMs, settled.answers.length], [s.round.score, s.round.right, s.round.wrong, s.round.bestStreak, s.round.ms, ROUND_WORDS], `${l.id} ${skill}`);
      assert.deepEqual([settled.right, settled.finished, settled.stars], [6, true, 1]);
      assert.deepEqual(settled.answers.map((x) => x.ms), s.answers.map((x) => x.ms));
    }
  }
});

test("a round played as fast as the screen allows still takes longer on the wall than its words claim (the server's clock check)", () => {
  for (const skill of SKILL_IDS) {
    for (const how of ["right", "wrong"] as const) {
      let s = startSession(level("ck"), skill, {}, 2);
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
      const claimed = settle({ level: "ck", mode: "build", skill }, s.answers).answers.reduce((sum, x) => sum + x.ms, 0);
      assert.equal(claimed, ROUND_WORDS * MIN_ANSWER_MS);
      assert.ok(claimed < wall, `${skill} ${how}: ${claimed} ms counted in ${wall} ms`);
    }
  }
  assert.ok(PACE.right > MIN_ANSWER_MS && PACE.wrong > MIN_ANSWER_MS, "an answer on show outlasts what the floor can add to it");
});
