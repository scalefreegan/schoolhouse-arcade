// Rhyme Time's rules: what a question may be, how an answer is written,
// and what a round is worth. The browser steps through them to draw the
// round as it happens; the server replays the same answers through the
// same functions and stores what it gets. docs/PRD.md has them in words.
//
// An answer carries its whole question, so the server judges the question
// as well as the pick: the browser deals, and nothing it deals is taken on
// trust. Find it is written `cat>hat|pin|dog=hat` (the call, the pictures
// to pick from in the order they were shown, and the one picked); Odd one
// out `cat|hat|pin=pin` (the three pictures, and the one picked). It is
// stored as text (`answers.given_text`); `answers.fact` is the word the
// question was dealt for (the call, or in Odd one out the word of the pair
// it was dealt for).
//
// Pure, and run by Node as is.

import { RuleError, type AnswerInput, type GameRules, type JudgedAnswer, type PlayConfig, type Settled } from "../play.ts";
import { MAX_ANSWER_MS, countedMs, startRound, starsFor, stepRound } from "../soundmachine/rules.ts";
import { LEVELS, ROUND_QUESTIONS, anchorsOf, doubtful, levelById, lookalike, nothingAlike, rhymeOf, rhymes, wordById, type RhymeLevel, type RhymeWord } from "./words.ts";

// Scoring, stars and the time floor are Sound Machine's, exactly: a round
// of eight, 100 a right answer and 20 more for each right one before it in
// a row, stars at 5, 7 and 8 right, and each answer counted as at least
// MIN_ANSWER_MS so the server's round clock means the same here.
export { MAX_ANSWER_MS, MIN_ANSWER_MS, POINTS, STAR_RIGHT, STREAK_BONUS, countedMs, pointsFor, startRound, starsFor, stepRound, type Round } from "../soundmachine/rules.ts";

/** find: hear a word, pick the picture that rhymes with it. odd: three pictures, two rhyme, pick the one that does not. */
export type Mode = "find" | "odd";
export type Skill = "easy" | "arcade";

/** Ids are stored on plays: never rename one. */
export const MODES: GameRules["modes"] = [
  { id: "find", title: "Find it", blurb: "Find the rhyme", board: "score" },
  { id: "odd", title: "Odd one out", blurb: "Which one is not?", board: "score" },
];

export const SKILLS: GameRules["skills"] = [
  { id: "easy", title: "Easy", blurb: "Fewer to pick from" },
  { id: "arcade", title: "Arcade", blurb: "Trickier ones" },
];

/** How many pictures there are to pick from, by game and skill. */
export const PICTURES: Record<Mode, Record<Skill, number>> = {
  find: { easy: 3, arcade: 4 },
  odd: { easy: 3, arcade: 3 },
};

/** One question as it was put: the call (Find it only) and the pictures to pick from, in order. Word ids. */
export interface Question {
  mode: Mode;
  call: string | null;
  choices: string[];
}

/** A question as an answer writes it, without the pick: `cat>hat|pin|dog`, or `cat|hat|pin`. */
export function questionText(q: Question): string {
  return q.mode === "find" ? `${q.call}>${q.choices.join("|")}` : q.choices.join("|");
}

/** An answer as it is stored: the question, then the picture picked. */
export function answerText(q: Question, pick: string): string {
  return `${questionText(q)}=${pick}`;
}

const ID = /^[a-z]{2,8}$/;

/** An answer read back: its question and its pick, or null if it is not one written as `answerText` writes them. */
export function parseAnswer(mode: Mode, text: string): { question: Question; pick: string } | null {
  const [asked, pick, ...more] = text.split("=");
  if (more.length || pick === undefined || !ID.test(pick)) return null;
  let call: string | null = null;
  let list = asked;
  if (mode === "find") {
    const parts = asked.split(">");
    if (parts.length !== 2 || !ID.test(parts[0])) return null;
    [call, list] = parts;
  } else if (asked.includes(">")) return null;
  const choices = list.split("|");
  if (!choices.every((c) => ID.test(c))) return null;
  return { question: { mode, call, choices }, pick };
}

const words = (ids: string[]): RhymeWord[] => ids.map((id) => wordById(id)!);

/** The picture that is right: in Find it the one that rhymes with the call, in Odd one out the one that rhymes with neither of the others. Null for a question that has none (faultOf says why). */
export function rightOf(q: Question): string | null {
  if (!q.choices.every((id) => wordById(id)) || (q.call !== null && !wordById(q.call))) return null;
  const choices = words(q.choices);
  if (q.mode === "find") {
    const call = wordById(q.call ?? "")!;
    const hits = choices.filter((c) => rhymes(c, call));
    return hits.length === 1 ? hits[0].id : null;
  }
  const odd = choices.filter((c) => !choices.some((o) => rhymes(o, c)));
  return odd.length === 1 && choices.length - odd.length === 2 ? odd[0].id : null;
}

/**
 * Why a question could not have been put on this level and skill, dealt
 * for `fact`; null if it could. What makes one: its words are the level's,
 * different, and as many as the skill shows; no two of the pictures could be
 * taken for one another, and no two have a doubtful rhyme between them;
 * exactly one picture is right. In Find it the call is `fact`, the pictures
 * are all of different families, one rhymes with the call; on Easy the
 * others share no sound in the same place with it. In Odd one out `fact` is
 * one of the pair; on Easy the odd one shares no sound in the same place
 * with either of them.
 */
export function faultOf(q: Question, level: RhymeLevel, skill: Skill, fact: string): string | null {
  const on = new Set(level.words.map((w) => w.id));
  const all = q.call === null ? q.choices : [q.call, ...q.choices];
  for (const id of all) if (!on.has(id)) return `"${id}" is not a picture in ${level.title}.`;
  if (new Set(all).size !== all.length) return "A picture comes up once in a question.";
  if (q.choices.length !== PICTURES[q.mode][skill]) return `That is not how many pictures ${skill === "easy" ? "Easy" : "Arcade"} shows.`;
  const pics = words(all);
  for (let i = 0; i < pics.length; i++)
    for (let j = i + 1; j < pics.length; j++) {
      if (lookalike(pics[i].id, pics[j].id)) return `"${pics[i].id}" and "${pics[j].id}" look too alike to stand together.`;
      if (doubtful(pics[i], pics[j])) return `"${pics[i].id}" and "${pics[j].id}" may or may not rhyme, by who says them.`;
    }
  const right = rightOf(q);
  if (!right) return q.mode === "find" ? "One picture, and only one, rhymes with the word." : "Two pictures rhyme, and one does not.";
  const choices = words(q.choices);
  if (q.mode === "find") {
    if (q.call !== fact) return "The word asked is not the word the question was for.";
    if (new Set(choices.map(rhymeOf)).size !== choices.length) return "No two of the pictures rhyme with each other.";
    const call = wordById(q.call)!;
    if (skill === "easy" && choices.some((c) => c.id !== right && !nothingAlike(c, call))) return "On Easy the wrong pictures sound nothing like the word.";
    return null;
  }
  if (!q.choices.includes(fact) || fact === right) return "The question was not for one of its pair.";
  const odd = wordById(right)!;
  if (skill === "easy" && choices.some((c) => c.id !== right && !nothingAlike(odd, c))) return "On Easy the odd one sounds nothing like the pair.";
  return null;
}

/** The pair of an Odd one out question, as one key ("cat+hat", in order), so a round never asks the same pair twice. */
export function pairOf(q: Question): string | null {
  const right = rightOf(q);
  return q.mode === "odd" && right ? q.choices.filter((c) => c !== right).sort().join("+") : null;
}

function configOf(config: PlayConfig): { level: RhymeLevel; mode: Mode; skill: Skill } {
  const level = levelById(config.level);
  if (!level) throw new RuleError(`Rhyme Time has no level "${config.level}".`);
  if (!MODES.some((m) => m.id === config.mode)) throw new RuleError(`Rhyme Time has no game "${config.mode}".`);
  if (!SKILLS.some((s) => s.id === config.skill)) throw new RuleError(`Rhyme Time has no skill "${config.skill}".`);
  return { level, mode: config.mode as Mode, skill: config.skill as Skill };
}

/** An answer's longest text: the call and four pictures of up to five letters, and the pick. */
const MAX_TEXT = 60;

/**
 * Judge and score a whole play from its answers alone. Each answer is the
 * question it was put and the picture picked (`answerText`); the server
 * checks the question could have been put (faultOf) and judges the pick
 * itself. Refused: a question for a word the level cannot ask about, or
 * for one word twice; the same pair twice in Odd one out; more questions
 * than a round has; a question that could not have been put; a pick that is
 * not one of its pictures; a time that cannot be. A time under
 * MIN_ANSWER_MS is counted as MIN_ANSWER_MS.
 */
export function settle(config: PlayConfig, inputs: AnswerInput[]): Settled {
  const { level, mode, skill } = configOf(config);
  if (!Array.isArray(inputs) || inputs.length > ROUND_QUESTIONS) throw new RuleError("That is not a round of Rhyme Time.");
  const anchors = new Set(anchorsOf(level).map((w) => w.id));
  const asked = new Set<string>();
  const pairs = new Set<string>();
  let round = startRound();
  const answers: JudgedAnswer[] = [];
  for (const input of inputs) {
    const fact = typeof input?.fact === "string" ? input.fact : "";
    if (!anchors.has(fact)) throw new RuleError(`"${String(input?.fact)}" is not a word ${level.title} asks about.`);
    if (asked.has(fact)) throw new RuleError(`"${fact}" comes up once in a round.`);
    asked.add(fact);
    if (!Number.isFinite(input.ms) || input.ms < 0 || input.ms > MAX_ANSWER_MS) throw new RuleError("An answer's time is out of range.");
    const given = input.given;
    if (typeof given !== "string" || given.length > MAX_TEXT) throw new RuleError("An answer must be its question and the picture picked.");
    const read = parseAnswer(mode, given);
    if (!read) throw new RuleError(`"${given}" is not a question and a pick.`);
    const fault = faultOf(read.question, level, skill, fact);
    if (fault) throw new RuleError(fault);
    const pair = pairOf(read.question);
    if (pair) {
      if (pairs.has(pair)) throw new RuleError("A pair comes up once in a round.");
      pairs.add(pair);
    }
    if (!read.question.choices.includes(read.pick)) throw new RuleError(`"${read.pick}" is not one of the pictures.`);
    const ms = countedMs(input.ms);
    const correct = read.pick === rightOf(read.question);
    answers.push({ fact, given, ms, correct });
    round = stepRound(round, { correct, ms });
  }
  return {
    answers,
    score: round.score,
    right: round.right,
    wrong: round.wrong,
    bestCombo: round.bestStreak,
    timeMs: round.ms,
    finished: round.over,
    stars: starsFor(round),
    board: "score",
  };
}

/** Tickets for a right answer, by skill. */
export const TICKETS_EASY = 1;
export const TICKETS_ARCADE = 2;

export function pay(config: PlayConfig, settled: Settled): number {
  return settled.right * (config.skill === "arcade" ? TICKETS_ARCADE : TICKETS_EASY);
}

export const rhymeTimeRules: GameRules = {
  levels: LEVELS.map(({ id, title, blurb }) => ({ id, title, blurb })),
  modes: MODES,
  skills: SKILLS,
  settle,
  pay,
};
