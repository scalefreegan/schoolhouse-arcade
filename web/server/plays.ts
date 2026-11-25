import type { IncomingMessage, ServerResponse } from "node:http";
import { newBadges } from "../shared/badges.ts";
import { factStats } from "../shared/deal.ts";
import { RuleError, openLevels, type GameRules, type PlayConfig, type Settled } from "../shared/play.ts";
import { RULES } from "../shared/rules.ts";
import { ticketLines, totalOf } from "../shared/tickets.ts";
import type { BoardReply, PlayReply, PlayRequest, ProgressReply, RoundStartReply, RoundStartRequest, ScoreRow } from "../shared/wire.ts";
import { awardBadges, badgesOf } from "../../scripts/db/badges.ts";
import { findPlayer, lockPlayer } from "../../scripts/db/players.ts";
import { bestsOf, board, lastPlayOf, opensOf, playOfRound, rankOf, recentAnswers, recordPlay, starsOf, tallyOf, type BoardKey, type BoardRow, type StoredPlay } from "../../scripts/db/plays.ts";
import { addTickets, balanceOf, linesOf } from "../../scripts/db/tickets.ts";
import { readClock, startClock, type RoundOf } from "./clock.ts";
import { rawDb, type Db } from "./db.ts";
import { HttpError, isUuid, methodNotAllowed, pathSegments, queryParams, readJsonBody, sendJson } from "./http.ts";

// /api/plays: rounds, high scores and progress.
//   POST /api/plays/start                             a round begins: the server's clock for it (clock.ts)
//   POST /api/plays                                   a finished round; the server scores it, once
//   GET  /api/plays/board?game=&level=&mode=&skill=   a high score table
//   GET  /api/plays/progress?player=&game=            stars, open levels, bests, fact stats
//
// The browser sends answers, never a score: every number stored is worked
// out here with the game's rules (web/shared/rules.ts), and so are the
// tickets and badges a play earns (web/shared/tickets.ts, badges.ts).

function rulesFor(gameId: unknown): GameRules {
  const rules = typeof gameId === "string" && Object.hasOwn(RULES, gameId) ? RULES[gameId] : undefined;
  if (!rules) throw new HttpError(404, "no such game");
  return rules;
}

async function playerFor(db: Db, id: unknown): Promise<string> {
  if (!isUuid(id) || !(await findPlayer(db, id))) throw new HttpError(404, "no such player");
  return id;
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

function toScoreRow(r: BoardRow): ScoreRow {
  return { playId: r.playId, playerId: r.playerId, name: r.name, avatar: r.avatar, colour: r.colour, score: r.score, timeMs: r.timeMs, right: r.right, at: r.at.toISOString() };
}

const boardOf = (rules: GameRules, mode: string) => rules.modes.find((m) => m.id === mode)?.board ?? null;

async function boardReply(db: Db, rules: GameRules, key: BoardKey): Promise<BoardReply> {
  const kind = boardOf(rules, key.mode);
  return { kind, rows: kind ? (await board(db, key, kind)).map(toScoreRow) : [] };
}

/** What a reply says of the play itself, before its place on the table. */
type Told = Omit<PlayReply, "rank" | "board">;

/**
 * What to say of a play that is already stored, when its round is sent
 * again. It is rebuilt from the rows the play wrote, so it says what the
 * first reply said: a best and each badge are there as the lines they paid.
 * What cannot be had back is the moment: the balance, the rank and the board
 * are as they stand now, and a level a grown-up has since opened by hand no
 * longer counts as opened by this play.
 */
async function retell(tx: Db, playerId: string, { key, ...play }: StoredPlay): Promise<Told> {
  const levels = rulesFor(key.gameId).levels;
  const stars = await starsOf(tx, playerId, key.gameId);
  const opens = await opensOf(tx, playerId, key.gameId);
  const openWith = (n: number) => openLevels(levels, { ...stars, [key.level]: n }, opens);
  const openBefore = openWith(play.starsBefore);
  const lines = await linesOf(tx, playerId, play.playId);
  return {
    ...play,
    opened: openWith(play.starsAfter).find((id) => !openBefore.includes(id)) ?? null,
    personalBest: lines.some((l) => l.reason === "best"),
    badges: lines.flatMap((l) => l.badge ?? []),
    tickets: { lines, total: totalOf(lines), balance: await balanceOf(tx, playerId) },
  };
}

/**
 * Everything a settled play sets off, all or nothing: it is stored, its
 * stars counted, any badge it won handed over, and its tickets written to
 * the ledger. The game supplies only what the play itself is worth
 * (rules.pay); the rest is the arcade's and the same on every cabinet.
 *
 * And once: a round id this player has already sent is answered with the
 * play it was stored as, and nothing is written. A reply can be lost after
 * the commit, so a screen must be able to send a round again.
 *
 * `admit` is asked, with the lock held, only of a round not yet stored: it
 * throws to refuse it (postPlay's clock check). A round already stored is
 * answered whatever it would say.
 */
export async function settlePlay(db: Db, rules: GameRules, playerId: string, key: BoardKey, settled: Settled, roundId: string, admit?: (tx: Db) => Promise<void>): Promise<PlayReply> {
  const { at, told } = await db.transaction(async (tx): Promise<{ at: BoardKey; told: Told }> => {
    // One play at a time per player: badges and tickets are read, then written.
    if (!(await lockPlayer(tx, playerId))) throw new HttpError(404, "no such player");
    // Asked with the lock held: of two tries at one round, the second waits
    // here for the first to commit, and then sees its play (each statement
    // reads what is committed by then). Were that ever not so, the unique
    // index on round ids would throw, and this try would write nothing.
    const stored = await playOfRound(tx, playerId, roundId);
    if (stored) return { at: stored.key, told: await retell(tx, playerId, stored) };
    await admit?.(tx);
    // The player's best before this play, to tell a new best from a first try.
    const before = (await bestsOf(tx, playerId, key.gameId)).find((b) => b.level === key.level && b.mode === key.mode && b.skill === key.skill);
    const opens = await opensOf(tx, playerId, key.gameId);
    const openBefore = openLevels(rules.levels, await starsOf(tx, playerId, key.gameId), opens);
    const recorded = await recordPlay(tx, playerId, key, settled, roundId);
    const openAfter = openLevels(rules.levels, await starsOf(tx, playerId, key.gameId), opens);
    const kind = settled.finished ? settled.board : null;
    const personalBest = !!kind && !!before && (kind === "score" ? settled.score > before.score : settled.timeMs < before.timeMs);

    const held = (await badgesOf(tx, playerId)).map((b) => b.badgeId);
    const won = newBadges(await tallyOf(tx, playerId), held);
    await awardBadges(tx, playerId, won.map((b) => b.id));
    const lines = ticketLines({ base: rules.pay(key, settled), personalBest, newStars: recorded.starsAfter - recorded.starsBefore, badges: won });
    await addTickets(tx, playerId, lines.map((l) => ({ delta: l.amount, reason: l.reason, playId: recorded.playId, ...(l.badge ? { note: l.badge } : {}) })));
    const told: Told = {
      ...recorded,
      score: settled.score,
      right: settled.right,
      wrong: settled.wrong,
      bestCombo: settled.bestCombo,
      timeMs: settled.timeMs,
      finished: settled.finished,
      opened: openAfter.find((id) => !openBefore.includes(id)) ?? null,
      personalBest,
      badges: won.map((b) => b.id),
      tickets: { lines, total: totalOf(lines), balance: await balanceOf(tx, playerId) },
    };
    return { at: key, told };
  });
  const tables = rulesFor(at.gameId);
  const kind = told.finished ? boardOf(tables, at.mode) : null;
  return { ...told, rank: kind ? await rankOf(db, at, kind, told) : null, board: await boardReply(db, tables, at) };
}

/** A round begins: the server notes the time, in a clock the browser keeps
 *  for the round and sends back with it. */
async function startRound(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = rawDb();
  const body = await readJsonBody<Partial<RoundStartRequest>>(req);
  rulesFor(body.gameId);
  const playerId = await playerFor(db, body.playerId);
  if (!isUuid(body.roundId)) throw new HttpError(400, "This page is too old to start a round. Reload it.");
  const clock = await startClock(db, { playerId, gameId: body.gameId as string, roundId: body.roundId.toLowerCase() });
  sendJson(res, 201, { clock } satisfies RoundStartReply);
}

/**
 * The clock check, for a round not yet stored: its clock is this server's,
 * for this player's round; no other play was stored since it started; and
 * its cards claim no more time than has passed since then on this server's
 * clock. That last needs no slack: the browser spends time it never counts
 * on every round (the countdown, each answer shown, the pause before the
 * results; each game's session.ts PACE), and that is far more than the
 * little it can count over (an answer quicker than its MIN_ANSWER_MS).
 */
function clockCheck(round: RoundOf, clock: unknown, settled: Settled) {
  return async (tx: Db): Promise<void> => {
    if (clock === undefined) throw new HttpError(400, "This page is too old to save a score. Reload it.");
    const started = await readClock(tx, clock, round);
    if (!started) throw new HttpError(400, "This round was not started here.");
    if ((await lastPlayOf(tx, round.playerId)) !== started.after) throw new HttpError(409, "Another round was saved while this one was played.");
    const cardMs = settled.answers.reduce((sum, a) => sum + a.ms, 0);
    if (cardMs > Date.now() - started.at) throw new HttpError(400, "That round was quicker than the clock.");
  };
}

async function postPlay(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = rawDb();
  const body = await readJsonBody<Partial<PlayRequest>>(req);
  const rules = rulesFor(body.gameId);
  const playerId = await playerFor(db, body.playerId);
  // Required. Only this app's pages post plays, and one that names no round
  // (a page left open since before rounds had ids) could be paid twice.
  if (!isUuid(body.roundId)) throw new HttpError(400, "This page is too old to save a score. Reload it.");
  const config: PlayConfig = { level: text(body.level), mode: text(body.mode), skill: text(body.skill) };
  let settled: Settled;
  try {
    settled = rules.settle(config, body.answers as PlayRequest["answers"]);
  } catch (e) {
    if (e instanceof RuleError) throw new HttpError(400, e.message);
    throw e;
  }
  // A level is played only once it is open: the ladder is the game.
  const gameId = body.gameId as string;
  const open = openLevels(rules.levels, await starsOf(db, playerId, gameId), await opensOf(db, playerId, gameId));
  if (!open.includes(config.level)) throw new HttpError(403, "That level is still locked.");
  // Round ids are stored lower case (a uuid column); the clock was signed so.
  const round: RoundOf = { playerId, gameId, roundId: body.roundId.toLowerCase() };
  sendJson(res, 201, await settlePlay(db, rules, playerId, { gameId, ...config }, settled, body.roundId, clockCheck(round, body.clock, settled)));
}

export async function handlePlays(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const [what, ...rest] = pathSegments(req);
  if (what === undefined) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return postPlay(req, res);
  }
  if (what === "start" && !rest.length) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return startRound(req, res);
  }
  if (rest.length || (what !== "board" && what !== "progress")) throw new HttpError(404, "no such route");
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  const db = rawDb();
  const q = queryParams(req);
  const gameId = q.get("game") ?? "";
  const rules = rulesFor(gameId);
  if (what === "board") {
    const key: BoardKey = { gameId, level: q.get("level") ?? "", mode: q.get("mode") ?? "", skill: q.get("skill") ?? "" };
    if (!rules.levels.some((l) => l.id === key.level) || !rules.modes.some((m) => m.id === key.mode) || !rules.skills.some((s) => s.id === key.skill)) throw new HttpError(404, "no such table");
    sendJson(res, 200, await boardReply(db, rules, key));
    return;
  }
  const playerId = await playerFor(db, q.get("player"));
  const stars = await starsOf(db, playerId, gameId);
  sendJson(res, 200, {
    stars,
    open: openLevels(rules.levels, stars, await opensOf(db, playerId, gameId)),
    bests: await bestsOf(db, playerId, gameId),
    facts: factStats(await recentAnswers(db, playerId, gameId)),
  } satisfies ProgressReply);
}
