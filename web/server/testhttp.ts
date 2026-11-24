import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

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
