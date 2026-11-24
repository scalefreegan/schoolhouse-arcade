import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { ROUTES, apiPlugins, fromApp, homeHost, sameOrigin, wrap } from "./api.ts";
import { HttpError } from "./http.ts";

// This server is on the home network on purpose. These rules are what keeps
// a website open in another tab, or a page on the wider internet, from
// reaching the routes that hand out tickets.

test("a request from another origin is refused", () => {
  assert.equal(sameOrigin("http://evil.example", "localhost:38900"), false);
  assert.equal(sameOrigin("http://localhost:9999", "localhost:38900"), false);
  assert.equal(sameOrigin("null", "localhost:38900"), false);
  assert.equal(sameOrigin("http://localhost:38900", undefined), false);
});

test("the app's own page, and a request with no Origin, are allowed", () => {
  assert.equal(sameOrigin("http://localhost:38900", "localhost:38900"), true);
  assert.equal(sameOrigin("http://192.168.1.20:38900", "192.168.1.20:38900"), true);
  assert.equal(sameOrigin(undefined, "localhost:38900"), true);
});

test("this machine, a private address and a Bonjour name count as home; nothing else does", () => {
  for (const host of ["localhost:38900", "127.0.0.1:38900", "[::1]:38900", "LOCALHOST:38900", "192.168.1.20:38900", "10.0.0.7:38900", "172.16.4.1:38900", "172.31.255.255", "100.105.11.98:38900", "100.64.0.1", "my-mac.local:38900", "Aarons-MacBook.local"]) {
    assert.equal(homeHost(host), true, host);
  }
  for (const host of ["evil.example:38900", "localhost.evil.example", "8.8.8.8:38900", "172.32.0.1:38900", "172.15.0.1", "100.63.0.1", "100.128.0.1", "192.169.1.1", "999.168.1.1", "192.168.1", "evil.local.example", "a.b.local", ".local", "-x.local", ""]) {
    assert.equal(homeHost(host), false, host);
  }
  assert.equal(homeHost(undefined), false);
});

test("a request from the app: the browser says same-origin, or the app's marker where the browser says nothing", () => {
  assert.equal(fromApp({ "sec-fetch-site": "same-origin" }), true);
  assert.equal(fromApp({ "x-schoolhouse-arcade": "1" }), true);
  assert.equal(fromApp({}), false);
  assert.equal(fromApp({ "x-schoolhouse-arcade": "yes" }), false);
  for (const site of ["cross-site", "same-site", "none"]) assert.equal(fromApp({ "sec-fetch-site": site, "x-schoolhouse-arcade": "1" }), false, site);
});

/** A request as connect would hand it over, and a response that records what was sent. */
function call(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>, headers: Record<string, string>, method = "POST") {
  const sent = { status: 0, body: "" };
  const req = { method, url: "/", headers } as unknown as IncomingMessage;
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number) {
      sent.status = code;
      return this;
    },
    end(chunk?: string) {
      sent.body = chunk ?? "";
    },
  } as unknown as ServerResponse;
  return Promise.resolve(handler(req, res)).then(() => sent);
}

const OWN = { host: "192.168.1.20:38900", origin: "http://192.168.1.20:38900", "x-schoolhouse-arcade": "1" };
const FOREIGN: [string, Record<string, string>][] = [
  ["another site", { host: "localhost:38900", origin: "http://evil.example" }],
  ["an opaque origin", { host: "localhost:38900", origin: "null" }],
  ["another port on this machine", { host: "localhost:38900", origin: "http://localhost:5173" }],
  ["a rebinding host with a matching origin", { host: "evil.example:38900", origin: "http://evil.example:38900" }],
  ["a public address", { host: "8.8.8.8:38900", origin: "http://8.8.8.8:38900", "x-schoolhouse-arcade": "1" }],
  ["a foreign host and no origin", { host: "evil.example:38900" }],
  ["no host at all", {}],
  ["the home network without the app's marker (curl, a fetch tool)", { host: "192.168.1.20:38900" }],
  ["the marker from a page the browser says is another site", { host: "localhost:38900", "x-schoolhouse-arcade": "1", "sec-fetch-site": "cross-site" }],
  ["a typed address, without the marker", { host: "localhost:38900", "sec-fetch-site": "none" }],
];

test("wrap() refuses a foreign request before the handler runs", async () => {
  for (const [name, headers] of FOREIGN) {
    let ran = false;
    const sent = await call(wrap(() => void (ran = true)), headers);
    assert.equal(sent.status, 403, name);
    assert.equal(ran, false, `${name}: the handler must not run`);
  }
});

test("wrap() runs the handler for the app's own page, and turns a thrown error into an envelope", async () => {
  let ran = false;
  await call(wrap(() => void (ran = true)), OWN);
  assert.equal(ran, true);
  const refused = await call(wrap(() => { throw new HttpError(404, "no such player"); }), OWN);
  assert.deepEqual([refused.status, JSON.parse(refused.body)], [404, { error: "no such player" }]);
  const crashed = await call(wrap(() => { throw new Error("secret detail"); }), OWN);
  assert.equal(crashed.status, 500);
  assert.doesNotMatch(crashed.body, /secret detail/);
});

test("every route the plugin mounts is behind wrap()", async () => {
  const mounted: [string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>][] = [];
  const server = { middlewares: { use: (route: string, handler: (typeof mounted)[number][1]) => void mounted.push([route, handler]) }, config: { logger: { info() {} } } };
  const plugin = apiPlugins({ checkDatabase: false });
  await (plugin.configureServer as (server: ViteDevServer) => unknown)(server as unknown as ViteDevServer);
  const routes = mounted.map(([route]) => route);
  for (const [route] of ROUTES) assert.ok(routes.includes(route), `${route} is mounted`);
  assert.ok(routes.includes("/api"), "the catch-all is mounted");
  assert.ok(routes.every((r) => r === "/api" || r.startsWith("/api/")), "nothing is mounted outside /api");
  // A route that skipped wrap() would run its handler here and answer something other than 403.
  for (const [route, handler] of mounted) {
    for (const [name, headers] of FOREIGN) {
      const sent = await call(handler, headers);
      assert.equal(sent.status, 403, `${route}, ${name}`);
    }
  }
});
