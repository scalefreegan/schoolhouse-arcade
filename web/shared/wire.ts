// Request and reply types shared by the server and the client. Types only:
// nothing here runs.

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
