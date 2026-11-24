import type { IncomingMessage, ServerResponse } from "node:http";
import { factStats } from "../shared/comet/deck.ts";
import { RuleError, openLevels, type GameRules, type PlayConfig, type Settled } from "../shared/play.ts";
import { RULES } from "../shared/rules.ts";
import type { BoardReply, PlayReply, PlayRequest, ProgressReply, ScoreRow } from "../shared/wire.ts";
import { findPlayer } from "../../scripts/db/players.ts";
import { bestsOf, board, rankOf, recentAnswers, recordPlay, starsOf, type BoardKey, type BoardRow } from "../../scripts/db/plays.ts";
import { rawDb, type Db } from "./db.ts";
import { HttpError, isUuid, methodNotAllowed, pathSegments, queryParams, readJsonBody, sendJson } from "./http.ts";

// /api/plays: rounds, high scores and progress.
//   POST /api/plays                                   a finished round; the server scores it
//   GET  /api/plays/board?game=&level=&mode=&skill=   a high score table
//   GET  /api/plays/progress?player=&game=            stars, open levels, bests, fact stats
//
// The browser sends answers, never a score: every number stored is worked
// out here with the game's rules (web/shared/rules.ts).

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
  return { playId: r.playId, playerId: r.playerId, name: r.name, avatar: r.avatar, score: r.score, timeMs: r.timeMs, right: r.right, at: r.at.toISOString() };
}

async function boardReply(db: Db, rules: GameRules, key: BoardKey): Promise<BoardReply> {
  const kind = rules.modes.find((m) => m.id === key.mode)?.board ?? null;
  return { kind, rows: kind ? (await board(db, key, kind)).map(toScoreRow) : [] };
}

/** What happens to a settled play beyond storing it. The Prize Counter adds
 *  to this (tickets, badges); a game never does. */
export async function settlePlay(db: Db, rules: GameRules, playerId: string, key: BoardKey, settled: Settled): Promise<PlayReply> {
  const kind = settled.finished ? settled.board : null;
  // The player's best before this play, to tell a new best from a first try.
  const before = (await bestsOf(db, playerId, key.gameId)).find((b) => b.level === key.level && b.mode === key.mode && b.skill === key.skill);
  const openBefore = openLevels(rules.levels, await starsOf(db, playerId, key.gameId));
  const { playId, starsBefore, starsAfter } = await recordPlay(db, playerId, key, settled);
  const openAfter = openLevels(rules.levels, await starsOf(db, playerId, key.gameId));
  const personalBest = !!kind && !!before && (kind === "score" ? settled.score > before.score : settled.timeMs < before.timeMs);
  return {
    playId,
    score: settled.score,
    right: settled.right,
    wrong: settled.wrong,
    bestCombo: settled.bestCombo,
    timeMs: settled.timeMs,
    finished: settled.finished,
    starsBefore,
    starsAfter,
    opened: openAfter.find((id) => !openBefore.includes(id)) ?? null,
    personalBest,
    rank: kind ? await rankOf(db, key, kind, { playId, score: settled.score, timeMs: settled.timeMs }) : null,
    board: await boardReply(db, rules, key),
  };
}

async function postPlay(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = rawDb();
  const body = await readJsonBody<Partial<PlayRequest>>(req);
  const rules = rulesFor(body.gameId);
  const playerId = await playerFor(db, body.playerId);
  const config: PlayConfig = { level: text(body.level), mode: text(body.mode), skill: text(body.skill) };
  let settled: Settled;
  try {
    settled = rules.settle(config, body.answers as PlayRequest["answers"]);
  } catch (e) {
    if (e instanceof RuleError) throw new HttpError(400, e.message);
    throw e;
  }
  // A level is played only once it is open: the ladder is the game.
  const open = openLevels(rules.levels, await starsOf(db, playerId, body.gameId as string));
  if (!open.includes(config.level)) throw new HttpError(403, "That level is still locked.");
  sendJson(res, 201, await settlePlay(db, rules, playerId, { gameId: body.gameId as string, ...config }, settled));
}

export async function handlePlays(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const [what, ...rest] = pathSegments(req);
  if (what === undefined) {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return postPlay(req, res);
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
    open: openLevels(rules.levels, stars),
    bests: await bestsOf(db, playerId, gameId),
    facts: factStats(await recentAnswers(db, playerId, gameId)),
  } satisfies ProgressReply);
}
