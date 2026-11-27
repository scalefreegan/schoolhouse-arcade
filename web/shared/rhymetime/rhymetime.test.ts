import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ART } from "../../src/sprites/art.ts";
import { BADGES } from "../badges.ts";
import { seeded, type FactStat } from "../deal.ts";
import { GAMES } from "../games.ts";
import type { AnswerInput } from "../play.ts";
import { RULES } from "../rules.ts";
import { SPEECH_DIR as SOUND_DIR, WORDS as SOUND_WORDS, LEVELS as SOUND_LEVELS, wordClip } from "../soundmachine/words.ts";
import { pairKey, questionFor, roundPlan } from "./pick.ts";
import { MAX_ANSWER_MS, MIN_ANSWER_MS, MODES, PICTURES, SKILLS, answerText, faultOf, pairOf, parseAnswer, pay, rhymeTimeRules, rightOf, settle, type Mode, type Question, type Skill } from "./rules.ts";
import { PACE, READ_DELAY_MS, REVEAL_WAIT_MS, TAP_WAIT_MS, advance, cutUnheard, readQuestion, ready, revealDone, startSession, waited, type Session } from "./session.ts";
import { DOUBTFUL, LEVELS, LOOKALIKES, ROUND_QUESTIONS, SPEECH_DIR, WORDS, anchorsOf, doubtful, levelById, lookalike, nothingAlike, ownClips, partnersOf, rhymeOf, rhymes, sayUrl, tempting, wordById } from "./words.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const level = (id: string) => levelById(id)!;
const word = (id: string) => wordById(id)!;
const find = (call: string, ...choices: string[]): Question => ({ mode: "find", call, choices });
const odd = (...choices: string[]): Question => ({ mode: "odd", call: null, choices });
const SETUPS = [["find", "easy"], ["find", "arcade"], ["odd", "easy"], ["odd", "arcade"]] as [Mode, Skill][];

// ---------- the words ----------

test("every word is three sounds with a short vowel; Sound Machine's are its own, unchanged, and the new ones are not Sound Machine's", () => {
  assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length);
  for (const w of WORDS) {
    assert.ok(["a", "e", "i", "o", "u"].includes(w.vowel), w.id);
    assert.ok(w.first && w.last, w.id);
    assert.equal(w.picture, `w_${w.id}`);
  }
  // Every Sound Machine word is here, as itself; nothing here is added to Sound Machine.
  assert.deepEqual(WORDS.filter((w) => w.shared).map((w) => w.id), SOUND_WORDS.map((w) => w.id));
  const own = WORDS.filter((w) => !w.shared).map((w) => w.id);
  assert.deepEqual(own, ["bat", "van", "fan", "pan", "cap", "map", "wig", "hen", "pen", "ten", "net", "jet", "mop", "mug", "rug", "bun"]);
  for (const id of own) assert.ok(!SOUND_LEVELS.some((l) => l.focus.some((w) => w.id === id)), `${id} is not a Sound Machine word`);
  // A rhyme is the vowel and what follows, by sound: sock and rock rhyme, sock and sack do not; c, k and ck are one sound.
  assert.equal(rhymeOf(word("sock")), "o-k");
  assert.ok(rhymes(word("sock"), word("rock")) && rhymes(word("cat"), word("chat")) && rhymes(word("bath"), word("math")));
  assert.ok(!rhymes(word("sock"), word("sack")) && !rhymes(word("cat"), word("cap")) && !rhymes(word("cat"), word("cat")));
  assert.ok(nothingAlike(word("cat"), word("pin")) && !nothingAlike(word("cat"), word("cup")));
  assert.ok(tempting(word("cap"), word("cat")) && tempting(word("kick"), word("cat")) && !tempting(word("hat"), word("cat")) && !tempting(word("pin"), word("cat")));
});

test("the levels: a i, then o e u, then ck sh th, then all of them; every word is on one of the first three and in Mix", () => {
  assert.deepEqual(LEVELS.map((l) => l.id), ["a-i", "o-e-u", "ck-sh-th", "mix"]);
  const firstThree = LEVELS.slice(0, 3).flatMap((l) => l.words.map((w) => w.id));
  assert.equal(new Set(firstThree).size, firstThree.length, "a word is on one level");
  assert.deepEqual([...firstThree].sort(), WORDS.map((w) => w.id).sort());
  assert.equal(level("mix").words.length, WORDS.length);
  for (const w of level("a-i").words) assert.ok(["a", "i"].includes(w.vowel) && !["k", "sh", "th", "ch"].includes(w.last), w.id);
  for (const w of level("o-e-u").words) assert.ok(["o", "e", "u"].includes(w.vowel) && !["k", "sh", "th"].includes(w.last), w.id);
  for (const w of level("ck-sh-th").words) assert.ok(["k", "sh", "th", "ch"].includes(w.last), w.id);
  for (const l of LEVELS) {
    // Enough to ask about for a round, each with a rhyme to stand beside it.
    assert.ok(anchorsOf(l).length >= ROUND_QUESTIONS, l.id);
    for (const a of anchorsOf(l)) assert.ok(partnersOf(a, l).every((p) => rhymes(p, a) && !lookalike(p.id, a.id)));
  }
  assert.deepEqual(anchorsOf(level("o-e-u")).map((w) => w.id).filter((id) => ["web", "cup"].includes(id)), [], "a word that rhymes with nothing is only ever a wrong picture");
});

test("doubtful rhymes and lookalike pictures name real words, and pin and pen are never asked together", () => {
  for (const [a, b] of LOOKALIKES) assert.ok(wordById(a) && wordById(b), `${a} / ${b}`);
  for (const pair of DOUBTFUL) for (const fam of pair) assert.ok(WORDS.some((w) => rhymeOf(w) === fam), fam);
  assert.ok(doubtful(word("pin"), word("pen")) && doubtful(word("ten"), word("chin")) && !doubtful(word("pin"), word("pan")));
  assert.equal(faultOf(find("chin", "thin", "ten", "dog", "rock"), level("mix"), "arcade", "chin"), '"chin" and "ten" may or may not rhyme, by who says them.');
  assert.match(faultOf(find("pin", "chin", "pen", "dog", "rock"), level("mix"), "arcade", "pin")!, /"pin" and "pen"/);
});

test("every word has a 16 x 16 picture of its own; the cabinet and its badges have drawings", () => {
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
  const game = GAMES.find((g) => g.id === "rhyme-time")!;
  assert.ok(Object.hasOwn(art, game.sprite));
  for (const b of BADGES.filter((x) => x.id.startsWith("rhyme-"))) assert.ok(art[b.sprite]?.palettes[b.palette], b.id);
});

test("each new word has one clip of its own, on disk and in the manifest, and nothing else is there; the others are Sound Machine's", () => {
  const dir = path.join(here, "../../public", SPEECH_DIR);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as { clips: Record<string, { kind: string; voice: string }> };
  const clips = ownClips();
  assert.equal(clips.length, WORDS.filter((w) => !w.shared).length);
  assert.deepEqual(Object.keys(manifest.clips).sort(), [...clips].sort());
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort(), clips.map((c) => `${c}.mp3`).sort());
  for (const clip of clips) {
    assert.equal(manifest.clips[clip].kind, "word");
    const size = fs.statSync(path.join(dir, `${clip}.mp3`)).size;
    assert.ok(size > 1_000 && size < 200_000, `${clip}.mp3 is ${size} bytes`);
  }
  // The same voice as Sound Machine's.
  const sound = JSON.parse(fs.readFileSync(path.join(here, "../../public", SOUND_DIR, "manifest.json"), "utf8")) as { clips: Record<string, { voice: string }> };
  assert.deepEqual(new Set([...Object.values(manifest.clips), ...Object.values(sound.clips)].map((c) => c.voice)).size, 1);
  for (const w of WORDS) {
    const url = sayUrl(w);
    const [dirOf, file] = [path.dirname(url).slice(1), path.basename(url, ".mp3")];
    assert.equal(file, wordClip(w.id));
    assert.equal(dirOf, w.shared ? SOUND_DIR : SPEECH_DIR, w.id);
    assert.ok(fs.existsSync(path.join(here, "../../public", url)), url);
  }
});

// ---------- the rules ----------

test("the game is listed, live, with rules; its ids are the ones stored on plays; two badges of its own", () => {
  assert.equal(RULES["rhyme-time"], rhymeTimeRules);
  assert.equal(GAMES.find((g) => g.id === "rhyme-time")?.status, "live");
  assert.deepEqual(MODES.map((m) => [m.id, m.board]), [["find", "score"], ["odd", "score"]]);
  assert.deepEqual(SKILLS.map((s) => s.id), ["easy", "arcade"]);
  assert.deepEqual(rhymeTimeRules.levels.map((l) => l.id), ["a-i", "o-e-u", "ck-sh-th", "mix"]);
  assert.deepEqual(PICTURES, { find: { easy: 3, arcade: 4 }, odd: { easy: 3, arcade: 3 } });
  const ours = BADGES.filter((b) => b.id.startsWith("rhyme-"));
  assert.deepEqual(ours.map((b) => [b.id, b.tickets]), [["rhyme-ear", 25], ["rhyme-champion", 300]]);
  const stars = (n: number) => ({ "rhyme-time": Object.fromEntries(LEVELS.map((l) => [l.id, n])) });
  const facts = (s: Record<string, Record<string, number>>) => ({ plays: 1, right: 0, bestCombo: 0, cleanSprints: 0, stars: s });
  assert.deepEqual(ours.map((b) => b.earned(facts({ "rhyme-time": { "o-e-u": 1 } }))), [true, false]);
  assert.deepEqual(ours.map((b) => b.earned(facts(stars(3)))), [true, true]);
  assert.deepEqual(ours.map((b) => b.earned(facts({ "sound-machine": { cvc: 3 } }))), [false, false], "another game's stars are not Rhyme Time's");
});

test("an answer is written with its whole question and read back the same; anything else is not an answer", () => {
  const q = find("cat", "hat", "pin", "dog");
  assert.equal(answerText(q, "hat"), "cat>hat|pin|dog=hat");
  assert.deepEqual(parseAnswer("find", "cat>hat|pin|dog=hat"), { question: q, pick: "hat" });
  assert.equal(answerText(odd("cat", "hat", "pin"), "pin"), "cat|hat|pin=pin");
  assert.deepEqual(parseAnswer("odd", "cat|hat|pin=pin"), { question: odd("cat", "hat", "pin"), pick: "pin" });
  for (const bad of ["cat>hat|pin|dog", "cat>hat|pin|dog=hat=hat", "hat|pin|dog=hat", "cat>hat>pin|dog=hat", "cat>hat|PIN|dog=hat", "cat>hat||dog=hat", "cat>hat|pin|dog=", " cat>hat|pin|dog=hat"]) assert.equal(parseAnswer("find", bad), null, bad);
  assert.equal(parseAnswer("odd", "cat>hat|pin=pin"), null, "a call is Find it's");
});

test("which picture is right: the one rhyme in Find it, the one that rhymes with neither in Odd one out", () => {
  assert.equal(rightOf(find("cat", "pin", "hat", "dog")), "hat");
  assert.equal(rightOf(find("cat", "pin", "dog", "sun")), null);
  assert.equal(rightOf(find("cat", "hat", "bat", "dog")), null);
  assert.equal(rightOf(odd("cat", "pin", "hat")), "pin");
  assert.equal(rightOf(odd("cat", "bat", "hat")), null);
  assert.equal(rightOf(odd("cat", "pin", "dog")), null);
  assert.equal(pairOf(odd("hat", "pin", "cat")), "cat+hat");
});

test("a question that could not have been put is refused, with why", () => {
  const ai = level("a-i");
  const fault = (q: Question, skill: Skill = "easy", fact = q.call ?? q.choices[0], l = ai) => faultOf(q, l, skill, fact);
  assert.equal(fault(find("cat", "hat", "pig", "ship")), null);
  assert.equal(fault(find("cat", "hat", "pig", "pan", "chip"), "arcade"), null);
  assert.match(fault(find("cat", "hat", "pig", "dog"))!, /not a picture in a i/);
  assert.match(fault(find("cat", "hat", "pig"))!, /how many pictures Easy/);
  assert.match(fault(find("cat", "hat", "pig", "ship", "chin"))!, /how many pictures Easy/);
  assert.match(fault(find("cat", "hat", "pig", "pig"))!, /once in a question/);
  assert.match(fault(find("cat", "cat", "pig", "ship"))!, /once in a question/);
  assert.match(fault(find("cat", "hat", "bat", "pig"))!, /only one, rhymes/);
  assert.match(fault(find("cat", "pin", "pig", "ship"))!, /only one, rhymes/);
  assert.match(fault(find("cat", "hat", "pin", "chin"))!, /No two of the pictures rhyme/);
  assert.match(fault(find("cat", "hat", "cap", "pig"))!, /look too alike/);
  assert.match(fault(find("cat", "hat", "can" as string, "pig"))!, /not a picture/);
  assert.match(fault(find("cat", "chat", "pin", "van"))!, /On Easy the wrong pictures sound nothing like/, "van shares cat's vowel");
  assert.equal(fault(find("cat", "chat", "pin", "chip")), null, "chip and pin share a vowel with each other, not with cat");
  assert.match(fault(find("cat", "hat", "pig", "ship"), "easy", "hat")!, /not the word the question was for/);
  assert.equal(fault(odd("cat", "hat", "pig")), null);
  assert.equal(fault(odd("cat", "hat", "van"), "arcade"), null);
  assert.match(fault(odd("cat", "hat", "van"))!, /odd one sounds nothing like the pair/);
  assert.match(fault(odd("cat", "hat", "cap"), "arcade")!, /look too alike/);
  assert.match(fault(odd("cat", "bat", "hat"))!, /Two pictures rhyme/);
  assert.match(fault(odd("cat", "hat", "pig"), "easy", "pig")!, /not for one of its pair/);
  assert.match(fault(odd("cat", "hat", "pig", "ship"), "arcade")!, /how many pictures Arcade/);
  // Arcade has to tempt where the level could: nothing in pig, ship or thin
  // starts like cat or has its a, and van or pan could have stood there.
  assert.match(fault(find("cat", "hat", "pig", "ship", "thin"), "arcade")!, /On Arcade a wrong picture starts like the word/);
  assert.equal(fault(find("cat", "hat", "pig", "ship", "van"), "arcade"), null, "one tempting wrong picture is enough");
  assert.match(fault(odd("cat", "hat", "pig"), "arcade")!, /On Arcade the odd one starts like the pair/);
  assert.equal(fault(odd("pig", "wig", "pin"), "arcade"), null, "pin starts like pig");
});

test("an Easy question is not taken as Arcade's: every Easy Odd one out question dealt, posted as Arcade, is refused, and an Easy round is refused as Arcade in both games", () => {
  let tried = 0;
  for (const l of LEVELS)
    for (const a of anchorsOf(l))
      for (const partner of partnersOf(a, l))
        for (let seed = 0; seed < 4; seed++) {
          const q = questionFor("odd", "easy", l, { anchor: a, partner }, seeded(seed));
          assert.ok(faultOf(q, l, "arcade", a.id), `${l.id} ${q.choices}`);
          tried++;
        }
  assert.ok(tried > 300);
  for (const l of LEVELS)
    for (const mode of ["find", "odd"] as Mode[])
      for (let seed = 0; seed < 10; seed++) {
        const answers = roundPlan(l, mode, {}, seeded(seed)).map((p, i) => {
          const q = questionFor(mode, "easy", l, p, seeded(seed * 100 + i));
          return { fact: p.anchor.id, given: answerText(q, rightOf(q)!), ms: 3000 };
        });
        assert.equal(settle({ level: l.id, mode, skill: "easy" }, answers).right, ROUND_QUESTIONS);
        assert.throws(() => settle({ level: l.id, mode, skill: "arcade" }, answers), mode === "find" ? /how many pictures Arcade/ : /On Arcade the odd one/, `${l.id} ${mode} ${seed}`);
      }
});

test("lookalike pictures are never dealt together, and the server refuses any question that shows them together", () => {
  // The three added after the first review, by name, so a slip in the list fails here.
  for (const [a, b] of [["bun", "chip"], ["bat", "moth"], ["hen", "duck"]]) assert.ok(lookalike(a, b) && lookalike(b, a), `${a}/${b}`);
  const mix = level("mix");
  const others = (x: string, y: string, n: number) => WORDS.filter((w) => w.id !== x && w.id !== y && !lookalike(w.id, x) && !lookalike(w.id, y)).slice(0, n).map((w) => w.id);
  for (const [x, y] of LOOKALIKES) {
    for (const [mode, skill] of SETUPS) {
      const rest = others(x, y, PICTURES[mode][skill] - (mode === "find" ? 1 : 2));
      const q = mode === "find" ? find(x, y, ...rest) : odd(x, y, ...rest);
      assert.match(faultOf(q, mix, skill, x) ?? "", new RegExp(`"${x}" and "${y}" look too alike`), `${x}/${y} ${mode} ${skill}`);
    }
  }
  let dealt = 0;
  for (const l of LEVELS)
    for (const [mode, skill] of SETUPS)
      for (let seed = 0; seed < 40; seed++) {
        const rng = seeded(seed * 31 + 7);
        for (const p of roundPlan(l, mode, {}, rng)) {
          const q = questionFor(mode, skill, l, p, rng);
          const shown = q.call ? [q.call, ...q.choices] : q.choices;
          for (const x of shown) for (const y of shown) assert.ok(!lookalike(x, y), `${l.id} ${mode} ${skill}: ${shown}`);
          dealt++;
        }
      }
  assert.equal(dealt, LEVELS.length * SETUPS.length * 40 * ROUND_QUESTIONS);
});

test("dealing: every word a level asks about makes a question on both skills of both games that the server would take", () => {
  for (const l of LEVELS)
    for (const [mode, skill] of SETUPS)
      for (const a of anchorsOf(l))
        for (const partner of partnersOf(a, l))
          for (let seed = 0; seed < 4; seed++) {
            const q = questionFor(mode, skill, l, { anchor: a, partner }, seeded(seed));
            assert.ok(mode === "find" ? rightOf(q) === partner.id : q.choices.includes(partner.id));
            assert.equal(faultOf(q, l, skill, a.id), null, `${l.id} ${mode} ${skill} ${a.id}`);
            assert.equal(q.choices.length, PICTURES[mode][skill]);
            const right = word(rightOf(q)!);
            const wrong = q.choices.filter((c) => c !== right.id).map(word);
            if (mode === "find") assert.ok(rhymes(right, a));
            else assert.ok(q.choices.includes(a.id) && !rhymes(right, a));
            // Arcade's wrong ones tempt when the level has any that may stand there.
            if (skill === "arcade" && mode === "find") {
              const could = l.words.some((w) => tempting(w, a) && !lookalike(w.id, a.id) && !lookalike(w.id, partner.id) && !doubtful(w, a));
              if (could) assert.ok(wrong.some((w) => tempting(w, a)), `${l.id} find arcade ${a.id}: ${q.choices}`);
            }
            if (skill === "arcade" && mode === "odd") {
              const pair = q.choices.filter((c) => c !== right.id).map(word);
              const could = l.words.some((w) => pair.some((p) => tempting(w, p)) && !rhymes(w, a) && pair.every((p) => !lookalike(w.id, p.id) && !doubtful(w, p)));
              if (could) assert.ok(pair.some((p) => tempting(right, p)), `${l.id} odd arcade ${a.id}: ${q.choices}`);
            }
          }
});

test("a round is about eight different words, a family not asked twice while another is left, an Odd one out pair never twice, and missed words first in line", () => {
  for (const l of LEVELS)
    for (const mode of ["find", "odd"] as Mode[])
      for (let seed = 0; seed < 30; seed++) {
        const plan = roundPlan(l, mode, {}, seeded(seed));
        const words = plan.map((q) => q.anchor);
        for (const q of plan) assert.ok(rhymes(q.anchor, q.partner) && partnersOf(q.anchor, l).includes(q.partner));
        if (mode === "odd") assert.equal(new Set(plan.map((q) => pairKey(q.anchor, q.partner))).size, ROUND_QUESTIONS, `${l.id} ${seed}`);
        assert.equal(words.length, ROUND_QUESTIONS);
        assert.equal(new Set(words).size, ROUND_QUESTIONS);
        const families = new Set(anchorsOf(l).map(rhymeOf)).size;
        assert.equal(new Set(words.map(rhymeOf)).size, Math.min(families, ROUND_QUESTIONS), l.id);
      }
  const missed: Record<string, FactStat> = { cat: { seen: 5, missed: 3, ms: 2000 } };
  const known: Record<string, FactStat> = Object.fromEntries(anchorsOf(level("a-i")).map((w) => [w.id, { seen: 5, missed: 0, ms: 2000 }]));
  let first = 0;
  for (let seed = 0; seed < 400; seed++) if (roundPlan(level("a-i"), "find", { ...known, ...missed }, seeded(seed))[0].anchor.id === "cat") first++;
  // cat weighs 5 against 1 for each of 15 others: first about a quarter of the time, against 1 in 16.
  assert.ok(first > 400 * 0.15, `cat came first ${first} times in 400`);
});

test("a right answer scores 100 and 20 more for each right one before it in a row; stars at 5, 7 and 8; 1 ticket a right one on Easy, 2 on Arcade", () => {
  const play = (rights: boolean[], skill: Skill = "easy") => {
    let s = startSession(level("a-i"), "find", skill, {}, 1);
    let now = 0;
    for (const right of rights) {
      s = advance(s, { type: "next", now, seed: now });
      now += 2000;
      s = answerAt(s, now, right);
      now += 5000;
    }
    return settle({ level: "a-i", mode: "find", skill }, s.answers);
  };
  assert.deepEqual([play([true, true, true]).score, play([true, false, true]).score], [100 + 120 + 140, 200]);
  const stars = (n: number) => play(Array.from({ length: 8 }, (_, i) => i < n)).stars;
  assert.deepEqual([stars(4), stars(5), stars(6), stars(7), stars(8)], [0, 1, 1, 2, 3]);
  assert.equal(play([true, true, true, true, true]).stars, 0, "an unfinished round has none");
  const six = play(Array.from({ length: 8 }, (_, i) => i < 6), "arcade");
  assert.deepEqual([pay({ level: "a-i", mode: "find", skill: "arcade" }, six), pay({ level: "a-i", mode: "find", skill: "easy" }, six)], [12, 6]);
});

test("a play that cannot be is refused", () => {
  const cfg = { level: "a-i", mode: "find", skill: "easy" };
  const a = (given: string, fact = given.split(/[>|]/)[0], ms = 3000): AnswerInput => ({ fact, given, ms });
  const good = a("cat>hat|pig|ship=hat");
  assert.equal(settle(cfg, [good]).right, 1);
  const cases: [Partial<typeof cfg>, AnswerInput[], RegExp][] = [
    [{ level: "add-5" }, [good], /no level/],
    [{ mode: "read" }, [good], /no game/],
    [{ skill: "hard" }, [good], /no skill/],
    [{}, [a("cat>hat|pig|ship=hat", "dog")], /not a word a i asks about/],
    [{}, [a("cat>hat|pig|ship=hat", "web")], /not a word/],
    [{}, [good, a("cat>bat|pig|ship=bat")], /once in a round/],
    [{}, Array.from({ length: 9 }, () => good), /not a round/],
    [{}, [a("cat>hat|pig|ship=dog")], /not one of the pictures/],
    [{}, [a("cat>hat|pig|ship=pin")], /not one of the pictures/],
    [{}, [a("cat>hat|pig|ship")], /not a question and a pick/],
    [{}, [{ fact: "cat", given: 3, ms: 2000 }], /must be its question/],
    [{}, [{ fact: "cat", given: null, ms: 2000 }], /must be its question/],
    [{}, [a("cat>hat|bat|ship=hat")], /only one, rhymes/],
    [{}, [a("cat>hat|pig|ship=hat", "cat", -1)], /out of range/],
    [{}, [a("cat>hat|pig|ship=hat", "cat", MAX_ANSWER_MS + 1)], /out of range/],
    [{}, [a("cat>hat|pig|ship=hat", "cat", Number.NaN)], /out of range/],
    [{ mode: "odd" }, [a("cat|hat|pig=pig"), a("hat|cat|ship=ship", "hat")], /pair comes up once/],
    [{ mode: "odd" }, [a("cat>hat|pig|ship=hat")], /not a question and a pick/],
  ];
  for (const [patch, answers, why] of cases) assert.throws(() => settle({ ...cfg, ...patch }, answers), why, `${JSON.stringify(patch)} ${JSON.stringify(answers[0])}`);
  // A time under the floor is counted as the floor.
  assert.equal(settle(cfg, [a("cat>hat|pig|ship=hat", "cat", 10)]).answers[0].ms, MIN_ANSWER_MS);
});

// ---------- a round, event by event ----------

/** Choose a picture (right or wrong) and pull the lever at `now`. */
function answerAt(s: Session, now: number, right: boolean): Session {
  const q = s.question!;
  const good = rightOf(q)!;
  s = advance(s, { type: "choose", word: right ? good : q.choices.find((c) => c !== good)! });
  return advance(s, { type: "go", now });
}

test("a picture tapped is chosen, not answered: another may be chosen instead; the lever locks it in; one try", () => {
  let s = startSession(level("a-i"), "find", "arcade", {}, 5);
  assert.deepEqual([s.phase, s.plan.length, s.question], ["start", 8, null]);
  assert.equal(advance(s, { type: "go", now: 5 }), s, "no question yet");
  s = advance(s, { type: "next", now: 1000, seed: 9 });
  const q = s.question!;
  assert.deepEqual([s.phase, q.call, q.choices.length, s.chosen, ready(s), rightOf(q)], ["ask", s.plan[0].anchor.id, 4, null, false, s.plan[0].partner.id]);
  assert.equal(advance(s, { type: "go", now: 1500 }), s, "the lever does nothing until a picture is chosen");
  assert.equal(advance(s, { type: "choose", word: "zebra" }), s);
  assert.equal(advance(s, { type: "choose", word: q.call! }), s, "the call is not a choice");
  const right = rightOf(q)!;
  const wrong = q.choices.find((c) => c !== right)!;
  s = advance(s, { type: "choose", word: wrong });
  assert.deepEqual([s.chosen, s.phase, s.answers.length, ready(s)], [wrong, "ask", 0, true]);
  assert.equal(advance(s, { type: "choose", word: wrong }), s, "the same again changes nothing");
  s = advance(s, { type: "choose", word: right });
  s = advance(s, { type: "go", now: 4000 });
  assert.deepEqual([s.phase, s.last, s.answers], ["right", { pick: right, right, correct: true, gained: 100 }, [{ fact: q.call, given: answerText(q, right), ms: 3000 }]]);
  assert.equal(advance(s, { type: "go", now: 4100 }), s, "one try");
  assert.equal(advance(s, { type: "choose", word: wrong }), s);
  // A wrong one is shown with the right one, and what was won is kept.
  s = advance(s, { type: "next", now: 4000 + PACE.right, seed: 2 });
  assert.equal(s.chosen, null, "a new question starts with nothing chosen");
  s = answerAt(s, 9000, false);
  assert.deepEqual([s.phase, s.last?.correct, s.last?.right, s.round.score, s.round.streak], ["wrong", false, rightOf(s.question!), 100, 0]);
  // Odd one out: three pictures, the anchor one of the pair.
  let o = advance(startSession(level("ck-sh-th"), "odd", "easy", {}, 4), { type: "next", now: 0, seed: 1 });
  assert.deepEqual([o.question!.call, o.question!.choices.length, o.question!.choices.includes(o.plan[0].anchor.id), o.question!.choices.includes(o.plan[0].partner.id)], [null, 3, true, true]);
  o = answerAt(o, 2500, true);
  assert.deepEqual([o.phase, o.answers[0].fact], ["right", o.plan[0].anchor.id]);
});

test("a round of Odd one out never asks the same pair twice", () => {
  for (let seed = 0; seed < 20; seed++) {
    let s = startSession(level("mix"), "odd", "arcade", {}, seed);
    let now = 0;
    while (s.phase !== "done") {
      s = advance(s, { type: "next", now, seed: seed * 31 + now });
      if (s.phase === "done") break;
      now += 2000;
      s = answerAt(s, now, true);
      now += 2000;
    }
    const pairs = s.asked.map(pairOf);
    assert.equal(new Set(pairs).size, pairs.length);
  }
});

test("the next question does not come until the answer has had its time on show; a pause holds it", () => {
  let s = startSession(level("a-i"), "odd", "easy", {}, 3);
  s = advance(s, { type: "next", now: 0, seed: 1 });
  assert.equal(advance(s, { type: "next", now: 50, seed: 2 }), s, "a question is waiting");
  s = answerAt(s, 100, true);
  assert.equal(advance(s, { type: "next", now: 100 + PACE.right - 1, seed: 2 }), s);
  assert.equal(advance(s, { type: "next", now: 100 + PACE.right, seed: 2 }).phase, "ask");
  s = answerAt(advance(s, { type: "next", now: 5000, seed: 2 }), 5100, false);
  assert.equal(advance(s, { type: "next", now: 5100 + PACE.wrong - 1, seed: 3 }), s);
  const paused = advance(s, { type: "pause", now: 5200 });
  assert.equal(advance(paused, { type: "next", now: 100_000, seed: 3 }), paused, "behind the pause box");
  assert.equal(advance(advance(paused, { type: "resume", now: 100_000 }), { type: "next", now: 100_000, seed: 3 }).phase, "ask");
});

test("only the time a question waits is counted: the answer on show and the pause box are not; a pause keeps what was chosen", () => {
  let s = startSession(level("a-i"), "find", "easy", {}, 3);
  s = advance(s, { type: "next", now: 1000, seed: 1 });
  s = advance(s, { type: "choose", word: s.question!.choices[0] });
  assert.equal(waited(s, 3000), 2000);
  s = advance(s, { type: "pause", now: 3000 });
  assert.deepEqual([s.phase, s.wantPause, waited(s, 60_000)], ["paused", true, 2000]);
  assert.equal(advance(s, { type: "go", now: 4000 }), s, "nothing is answered behind the box");
  assert.equal(advance(s, { type: "choose", word: s.question!.choices[1] }), s);
  s = advance(s, { type: "toggle", now: 100_000 });
  assert.deepEqual([s.phase, s.chosen], ["ask", s.question!.choices[0]]);
  s = advance(s, { type: "go", now: 101_500 });
  assert.equal(s.answers[0].ms, 3500);
});

test("a pause before the first question does not lose the round: resuming starts it", () => {
  let s = startSession(level("a-i"), "find", "easy", {}, 3);
  s = advance(s, { type: "pause", now: 100 });
  assert.equal(advance(s, { type: "next", now: 250, seed: 1 }), s);
  const before = s.seq;
  s = advance(s, { type: "resume", now: 5000 });
  assert.deepEqual([s.phase, s.wantPause, s.seq > before], ["start", false, true]);
  assert.equal(advance(s, { type: "next", now: 5250, seed: 1 }).phase, "ask");
});

test("a question is said once, after the screen settles and after a picture pressed early has been heard, never past the limit, and never once the round has moved on", () => {
  const at = { askSeq: 4, seq: 4, phase: "ask" as const, askedAt: 1000, tappedAt: null, speaking: false };
  assert.equal(readQuestion({ ...at, now: 1000 + READ_DELAY_MS - 1 }), "wait");
  assert.equal(readQuestion({ ...at, now: 1000 + READ_DELAY_MS }), "read");
  // Pressed 60 ms in: its word is heard out, then the question is said.
  const tapped = { ...at, tappedAt: 1060 };
  assert.equal(readQuestion({ ...tapped, speaking: true, now: 1400 }), "wait");
  assert.equal(readQuestion({ ...tapped, speaking: false, now: 1400 }), "read");
  assert.equal(readQuestion({ ...tapped, speaking: true, now: 1060 + TAP_WAIT_MS }), "read", "a clip that never ends is not waited on past the limit");
  // Speech nobody pressed for (none should be left: the step's hush() stopped it) does not hold the question.
  assert.equal(readQuestion({ ...at, speaking: true, now: 1300 }), "read");
  // The round moved on while it waited: a pause, the sound switched off, an answer, the next question.
  for (const moved of [{ seq: 5, phase: "paused" as const }, { seq: 5, phase: "right" as const }, { seq: 5, phase: "ask" as const }, { seq: 4, phase: "done" as const }])
    assert.equal(readQuestion({ ...tapped, ...moved, speaking: true, now: 1100 }), "drop", JSON.stringify(moved));
  assert.ok(TAP_WAIT_MS <= 3000 && TAP_WAIT_MS > READ_DELAY_MS);
});

test("a picture pressed after the question was sent to be said, before any of it sounded, counts as pressed early: the question is said after it", () => {
  assert.equal(cutUnheard({ readAt: 1200, tappedAt: null }), false, "nothing pressed");
  assert.equal(cutUnheard({ readAt: 1200, tappedAt: 1060 }), false, "pressed before the reading was sent: readQuestion already waited for it");
  assert.equal(cutUnheard({ readAt: 1200, tappedAt: 1230 }), true, "pressed in the gap before the first word");
  assert.equal(cutUnheard({ readAt: 1200, tappedAt: 1200 }), true);
  // And then the question waits for the pressed word and is read again, as for any early press.
  const at = { askSeq: 4, seq: 4, phase: "ask" as const, askedAt: 1000, tappedAt: 1230 };
  assert.equal(readQuestion({ ...at, speaking: true, now: 1300 }), "wait");
  assert.equal(readQuestion({ ...at, speaking: false, now: 1900 }), "read");
});

test("what follows an answer waits for its rhyme to be said, but never without a limit", () => {
  assert.equal(revealDone({ said: true, shownAt: 0, now: 0 }), true);
  assert.equal(revealDone({ said: false, shownAt: 1000, now: 1000 + REVEAL_WAIT_MS - 1 }), false);
  assert.equal(revealDone({ said: false, shownAt: 1000, now: 1000 + REVEAL_WAIT_MS }), true, "a clip that never ends (the audio stopped) is not waited for past the limit");
  // Room for the longest reveal: three words, each with its gap, and the time a clip may take to come.
  const longest = Math.max(...[path.join(here, "../../public", SOUND_DIR), path.join(here, "../../public", SPEECH_DIR)].flatMap((d) => Object.values((JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8")) as { clips: Record<string, { ms: number; kind: string }> }).clips).filter((c) => c.kind === "word").map((c) => c.ms)));
  assert.ok(REVEAL_WAIT_MS >= 3 * (longest + 500) && REVEAL_WAIT_MS <= 8000, `${REVEAL_WAIT_MS} ms against the longest word, ${longest} ms`);
});

test("what the screen plays is what the server scores: a whole round's answers settle to the same numbers", () => {
  for (const l of LEVELS)
    for (const [mode, skill] of SETUPS) {
      let s = startSession(l, mode, skill, {}, 11);
      let now = 0;
      for (let i = 0; i < 20 && s.phase !== "done"; i++) {
        s = advance(s, { type: "next", now, seed: i });
        if (s.phase === "done") break;
        now += 2000 + i * 300;
        s = answerAt(s, now, i % 3 !== 2); // every third is missed
        now += 5000;
      }
      assert.equal(s.phase, "done", `${l.id} ${mode}`);
      assert.equal(s.answers.length, ROUND_QUESTIONS);
      const settled = settle({ level: l.id, mode, skill }, s.answers);
      assert.deepEqual([settled.score, settled.right, settled.wrong, settled.bestCombo, settled.timeMs], [s.round.score, s.round.right, s.round.wrong, s.round.bestStreak, s.round.ms], `${l.id} ${mode} ${skill}`);
      assert.deepEqual([settled.right, settled.finished, settled.stars], [6, true, 1]);
      assert.deepEqual(settled.answers.map((a) => [a.fact, a.given, a.ms]), s.answers.map((a) => [a.fact, a.given, a.ms]));
    }
});

test("a round played as fast as the screen allows still takes longer on the wall than its answers claim (the server's clock check)", () => {
  for (const [mode, skill] of SETUPS)
    for (const how of ["right", "wrong"] as const) {
      let s = startSession(level("o-e-u"), mode, skill, {}, 2);
      let wall = 0;
      for (let i = 0; i < 20; i++) {
        s = advance(s, { type: "next", now: wall, seed: i });
        if (s.phase !== "ask") break;
        // Chosen and locked in 1 ms after it came up: under MIN_ANSWER_MS, so counted as more than it took.
        wall += 1;
        s = answerAt(s, wall, how === "right");
        const shown = wall;
        while (advance(s, { type: "next", now: wall, seed: i + 1 }) === s) wall += 1;
        assert.equal(wall - shown, PACE[how]);
      }
      assert.equal(s.phase, "done");
      wall += PACE.done;
      const claimed = settle({ level: "o-e-u", mode, skill }, s.answers).answers.reduce((sum, a) => sum + a.ms, 0);
      assert.equal(claimed, ROUND_QUESTIONS * MIN_ANSWER_MS);
      assert.ok(claimed < wall, `${mode} ${how}: ${claimed} ms counted in ${wall} ms`);
    }
  assert.ok(PACE.right > MIN_ANSWER_MS && PACE.wrong > MIN_ANSWER_MS);
});
