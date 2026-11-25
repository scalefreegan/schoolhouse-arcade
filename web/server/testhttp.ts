import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnswerInput } from "../shared/play.ts";
import { startClock } from "./clock.ts";
import { rawDb } from "./db.ts";

// Calling a route handler the way connect would, without a socket: the
// request is a stream of the JSON body, the response records what was sent.
// Not a test itself (the npm glob is *.test.ts).

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface Sent<T = unknown> {
  status: number;
  body: T;
}

/** `url` is the path after the mount point ("/", "/<id>", "/?x=1").
 *  `remoteAddress` is where the socket comes from: this machine, unless the
 *  test says otherwise. */
export async function request<T = unknown>(handler: Handler, method: string, url = "/", body?: unknown, headers: Record<string, string> = {}, remoteAddress = "127.0.0.1"): Promise<Sent<T>> {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, url, headers, socket: { remoteAddress } }) as unknown as IncomingMessage;
  const sent = { status: 0, text: "" };
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number) {
      sent.status = code;
      return this;
    },
    end(chunk?: string) {
      sent.text = chunk ?? "";
    },
  } as unknown as ServerResponse;
  await handler(req, res);
  return { status: sent.status, body: (sent.text ? JSON.parse(sent.text) : null) as T };
}

/** The clock (clock.ts) of a round (Comet Cards', unless `gameId` says) started long enough ago to
 *  have played these answers and its countdown, as a real screen's would
 *  be. "" for a player id the database cannot look up: such a play is
 *  refused before its clock is read. */
export async function playedClock(playerId: unknown, roundId: unknown, answers: AnswerInput[], gameId = "comet-cards"): Promise<string> {
  // Each answer counted as at least a second: more than either game's floor.
  const ms = Array.isArray(answers) ? answers.reduce((sum, a) => sum + Math.max(1_000, Number(a?.ms) || 0), 0) : 0;
  try {
    return await startClock(rawDb(), { playerId: String(playerId), gameId, roundId: String(roundId).toLowerCase() }, Date.now() - ms - 3_000);
  } catch {
    return "";
  }
}
