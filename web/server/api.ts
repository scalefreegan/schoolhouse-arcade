import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ErrorReply } from "../shared/wire.ts";
import { checkDatabase, setDb, type Db } from "./db.ts";
import { HttpError, INTERNAL_ERROR, sendJson } from "./http.ts";
import { fromApp, homeHost, sameOrigin } from "./origin.ts";
import { handlePlayers } from "./players.ts";
import { handlePlays } from "./plays.ts";

// The whole "backend": dev-server-only middleware on the Vite server. Same
// shape as Lean Into It's, with one difference: this server is reachable
// from the home network (a tablet plays, the Mac keeps score), so the wall
// in wrap() admits a private address as well as localhost.

export { fromApp, homeHost, sameOrigin };

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * Every route goes through here: the home-host, same-origin and
 * from-the-app checks first, then a JSON error envelope for anything
 * thrown. No exceptions: a route that bypasses wrap() is the bug the rule
 * in CLAUDE.md exists to prevent.
 */
export function wrap(fn: Handler): Handler {
  return (req, res) => {
    if (!homeHost(req.headers.host) || !sameOrigin(req.headers.origin, req.headers.host) || !fromApp(req.headers)) {
      sendJson(res, 403, { error: "cross-origin request refused" } satisfies ErrorReply);
      return;
    }
    return Promise.resolve()
      .then(() => fn(req, res))
      .catch((e) => {
        const known = e instanceof HttpError;
        const status = known ? e.status : 500;
        if (!known) console.error(`[schoolhouse-arcade] ${req.method} ${req.url}:`, e);
        // Headers already out: there is no envelope left to send, and
        // sendJson's writeHead would throw inside this catch. Cut the socket
        // so the client sees a broken response rather than a hung one.
        if (res.headersSent) { res.destroy(); return; }
        if (res.writableEnded) return;
        // Only an HttpError's sentence is meant for the client; anything
        // else is logged above and answered with the generic line.
        const reply: ErrorReply = known ? { error: e.message, ...(e.code ? { code: e.code } : {}) } : { error: INTERNAL_ERROR };
        sendJson(res, status, reply);
      });
  };
}

/** The route table, in mount order. Exported so a test can prove every
 *  route is behind wrap(). */
export const ROUTES: [string, Handler][] = [
  ["/api/players", handlePlayers],
  ["/api/plays", handlePlays],
];

export function apiPlugins(opts: { checkDatabase?: boolean; db?: Db } = {}): Plugin {
  // The tests hand in an in-process PGlite: the real routes, no server.
  if (opts.db) setDb(opts.db);
  return {
    name: "schoolhouse-arcade-api",
    apply: "serve",
    configureServer(server) {
      for (const [route, handler] of ROUTES) server.middlewares.use(route, wrap(handler));
      // Anything else under /api is a typo, not the SPA shell: answer in the
      // envelope the client already parses instead of index.html.
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
      // The boot check: Vite awaits this hook, so a database that is
      // missing, down or behind on migrations stops `npm run dev` with
      // checkDatabase's message (what to run) instead of starting a server
      // whose first database route fails far from the cause.
      if (opts.checkDatabase === false) return;
      return checkDatabase().then(({ applied }) => {
        server.config.logger.info(`  database ready (${applied} migration(s) applied)`);
      });
    },
  };
}
