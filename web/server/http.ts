import type { ServerResponse, IncomingMessage } from "node:http";

// HTTP helpers shared by every route (the JSON half of Lean Into It's
// web/server/sse.ts): JSON bodies and replies, and the HttpError that wrap()
// turns into a status.

/** What a 500 says to the client. The thrown error can be a database error
 *  whose message holds the failed query and its parameters; that goes to the
 *  server log, never into a reply. */
export const INTERNAL_ERROR = "something went wrong on the server; its log has the details";

/** Thrown by a handler; wrap() turns it into the status it names. */
export class HttpError extends Error {
  status: number;
  /** A code the client acts on (wire.ts ErrorCode), sent beside the message. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

const MAX_JSON_BODY = 1 << 20; // 1 MB: the largest legitimate body is one game's answers, a few KB

export async function readJsonBody<T>(req: IncomingMessage, max = MAX_JSON_BODY): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, "request body too large");
    chunks.push(c as Buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "body must be a JSON object");
  return parsed as T;
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

export function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, { Allow: allow, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: `method not allowed (use ${allow})` }));
}

/** The path after the mount point, e.g. "/abc/tickets" → ["abc", "tickets"].
 *  connect strips the mount prefix from req.url before the handler sees it. */
export function pathSegments(req: IncomingMessage): string[] {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, "malformed path");
  }
}

/** The query string's parameters. */
export function queryParams(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://localhost").searchParams;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that is safe to hand to a uuid column (Postgres throws on anything else). */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
