// Request and reply types shared by the server and the client. Types only:
// nothing here runs.

import type { FactStat } from "./comet/deck.ts";
import type { AnswerInput, BoardKind, PlayConfig } from "./play.ts";
import type { PrizeFields } from "./prizes.ts";
import type { TicketLine } from "./tickets.ts";

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
  /** What the play paid, line by line, and the player's tickets after it. */
  tickets: { lines: TicketLine[]; total: number; balance: number };
  /** Badge ids this play won (shared/badges.ts). */
  badges: string[];
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

/** A prize on the shelf. */
export interface Prize extends PrizeFields {
  id: string;
}

/** A prize that was handed over. */
export interface WonPrize {
  id: number;
  name: string;
  icon: string;
  cost: number;
  /** ISO time. */
  at: string;
}

/** GET /api/counter?player=: the Prize Counter as one player sees it. */
export interface CounterReply {
  tickets: number;
  prizes: Prize[];
  /** The badges held: id (shared/badges.ts) and when it was won. */
  badges: { id: string; at: string }[];
  won: WonPrize[];
}

/** An error `code` the client acts on. */
export type ErrorCode =
  /** No grown-up PIN has been chosen yet. */
  | "pin_unset"
  /** The request needs the PIN and carried none, or the wrong one. */
  | "pin_wrong"
  /** Too many wrong tries: wait and try again. */
  | "pin_locked";

/** GET /api/grownup/pin */
export interface PinState {
  set: boolean;
}

/** One level of one game, for one player, as a grown-up sees it. */
export interface LevelState {
  gameId: string;
  game: string;
  level: string;
  title: string;
  stars: number;
  open: boolean;
}

export interface GrownupPlayer extends Player {
  tickets: number;
  levels: LevelState[];
}

export interface LedgerLine {
  id: number;
  playerId: string;
  name: string;
  delta: number;
  /** A TicketReason (shared/tickets.ts). */
  reason: string;
  note: string | null;
  at: string;
}

/** GET /api/grownup (needs the PIN): everything the grown-up area shows. */
export interface GrownupReply {
  players: GrownupPlayer[];
  prizes: Prize[];
  /** The latest hand-overs to anyone. */
  handed: (WonPrize & { playerId: string; player: string })[];
  /** The latest ticket changes of any kind. */
  ledger: LedgerLine[];
}

/** POST /api/grownup/redeem (needs the PIN) */
export interface RedeemRequest {
  playerId: string;
  prizeId: string;
}
export interface RedeemReply {
  /** The player's tickets afterwards. */
  tickets: number;
  won: WonPrize;
}

/** POST /api/grownup/tickets (needs the PIN) */
export interface AdjustRequest {
  playerId: string;
  /** Tickets to add (positive) or take away (negative). */
  delta: number;
  note?: string;
}

/** POST /api/grownup/levels (needs the PIN) */
export interface OpenLevelRequest {
  playerId: string;
  gameId: string;
  level: string;
}
