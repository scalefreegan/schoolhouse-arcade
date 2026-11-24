// Request and reply types shared by the server and the client. Types only:
// nothing here runs.

import type { FactStat } from "./comet/deck.ts";
import type { AnswerInput, BoardKind, PlayConfig } from "./play.ts";

/** Every error reply, whatever the route. */
export interface ErrorReply {
  error: string;
  code?: string;
}

/** A player as the client sees one. */
export interface Player {
  id: string;
  name: string;
  /** An id from shared/avatars.ts. */
  avatar: string;
}

/** GET /api/players */
export interface PlayersReply {
  players: Player[];
}

/** POST /api/players, PATCH /api/players/<id> (either field) */
export interface PlayerInput {
  name?: string;
  avatar?: string;
}

/** POST /api/plays: one finished round. The server scores it from the answers. */
export interface PlayRequest extends PlayConfig {
  playerId: string;
  gameId: string;
  answers: AnswerInput[];
}

/** One line of a high score table. */
export interface ScoreRow {
  playId: number;
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  timeMs: number;
  right: number;
  /** ISO time the play was made. */
  at: string;
}

/** GET /api/plays/board?game=&level=&mode=&skill= */
export interface BoardReply {
  /** How the table is ranked; null for a mode that keeps none. */
  kind: BoardKind | null;
  rows: ScoreRow[];
}

/** The reply to POST /api/plays: the play as the server scored it. */
export interface PlayReply {
  playId: number;
  score: number;
  right: number;
  wrong: number;
  bestCombo: number;
  timeMs: number;
  finished: boolean;
  /** The level's stars before and after this play. */
  starsBefore: number;
  starsAfter: number;
  /** The level this play opened, if it opened one. */
  opened: string | null;
  /** This beat the player's own best with this set-up (and was not their first). */
  personalBest: boolean;
  /** Where it landed on its table (1 is the top); null when it is not ranked. */
  rank: number | null;
  board: BoardReply;
}

/** A player's best with one set-up. */
export interface BestRow extends PlayConfig {
  score: number;
  timeMs: number;
  plays: number;
}

/** GET /api/plays/progress?player=&game= */
export interface ProgressReply {
  /** Stars per level id (absent means none). */
  stars: Record<string, number>;
  /** The level ids the player may start. */
  open: string[];
  bests: BestRow[];
  /** How the player has done on each fact lately; a fact never answered is absent. */
  facts: Record<string, FactStat>;
}
