// The one name beyond the home network this app answers to: the Mac's own
// name on its Tailscale network, when a grown-up has set one.
//
// Why it is needed: `tailscale serve` gives the Mac an https address
// (https://my-mac.my-tailnet.ts.net:38900) and passes that name on in the
// Host header. origin.ts admits addresses and `.local` names only, so the
// name must be given: ARCADE_TAILNET_HOST, in the shell or in .env.local (a
// Dock app starts the server without the shell's profile). Exact names
// only, never a pattern: a name anyone could register and point at a
// private address would undo the Host check (DNS rebinding).

import fs from "node:fs";
import { envFile, parseEnv } from "../../scripts/env.mjs";

/** A full DNS name of two or more labels, no port, no wildcard. */
const NAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** ARCADE_TAILNET_HOST as names: comma- or space-separated, lower-cased;
 *  anything that isn't a plain DNS name is dropped (and said so once). */
export function parseTailnetHosts(value: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of String(value ?? "").split(/[\s,]+/)) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (NAME.test(name)) out.push(name);
    else console.warn(`[schoolhouse-arcade] ARCADE_TAILNET_HOST: "${raw}" is not a host name (no scheme, port or wildcard); ignored`);
  }
  return [...new Set(out)];
}

/** The shell's ARCADE_TAILNET_HOST, else .env.local's, else none. */
export function tailnetHosts(env: Record<string, string | undefined> = process.env, file: string = envFile()): string[] {
  if (env.ARCADE_TAILNET_HOST !== undefined) return parseTailnetHosts(env.ARCADE_TAILNET_HOST);
  try {
    return parseTailnetHosts(parseEnv(fs.readFileSync(file, "utf8")).ARCADE_TAILNET_HOST);
  } catch {
    return []; // no .env.local: nothing set
  }
}
