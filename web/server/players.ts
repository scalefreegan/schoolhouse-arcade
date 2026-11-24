import type { IncomingMessage, ServerResponse } from "node:http";
import { AVATAR_IDS, PLAYER_NAME_MAX, cleanPlayerName } from "../shared/avatars.ts";
import type { Player, PlayerInput, PlayersReply } from "../shared/wire.ts";
import { createPlayer, listPlayers, updatePlayer, type PlayerRow } from "../../scripts/db/players.ts";
import { rawDb } from "./db.ts";
import { HttpError, isUuid, methodNotAllowed, pathSegments, readJsonBody, sendJson } from "./http.ts";

// /api/players: who is on the "Who is playing?" screen.
//   GET   /api/players        everyone
//   POST  /api/players        a new player { name, avatar }
//   PATCH /api/players/<id>   a new name or character

/** More players than this is a mistake (a stuck button), not a family. */
export const MAX_PLAYERS = 12;

export function toPlayer(row: PlayerRow): Player {
  return { id: row.id, name: row.name, avatar: row.avatar };
}

function nameFrom(body: PlayerInput): string {
  const name = cleanPlayerName(body.name);
  if (!name) throw new HttpError(400, `A player needs a name of 1 to ${PLAYER_NAME_MAX} letters.`);
  return name;
}

function avatarFrom(body: PlayerInput): string {
  if (typeof body.avatar !== "string" || !AVATAR_IDS.includes(body.avatar)) throw new HttpError(400, "Pick one of the characters.");
  return body.avatar;
}

export async function handlePlayers(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const db = rawDb();
  const [id, ...rest] = pathSegments(req);
  if (id === undefined) {
    if (req.method === "GET") {
      sendJson(res, 200, { players: (await listPlayers(db)).map(toPlayer) } satisfies PlayersReply);
      return;
    }
    if (req.method !== "POST") return methodNotAllowed(res, "GET, POST");
    const body = await readJsonBody<PlayerInput>(req);
    const input = { name: nameFrom(body), avatar: avatarFrom(body) };
    if ((await listPlayers(db)).length >= MAX_PLAYERS) throw new HttpError(409, `The arcade holds ${MAX_PLAYERS} players. A grown-up can retire one to make room.`);
    sendJson(res, 201, toPlayer(await createPlayer(db, input)));
    return;
  }
  if (rest.length || !isUuid(id)) throw new HttpError(404, "no such player");
  if (req.method !== "PATCH") return methodNotAllowed(res, "PATCH");
  const body = await readJsonBody<PlayerInput>(req);
  const patch = { ...(body.name === undefined ? {} : { name: nameFrom(body) }), ...(body.avatar === undefined ? {} : { avatar: avatarFrom(body) }) };
  const row = await updatePlayer(db, id, patch);
  if (!row) throw new HttpError(404, "no such player");
  sendJson(res, 200, toPlayer(row));
}
