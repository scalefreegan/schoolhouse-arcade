// Who may call the API: this Mac or a device on the home network, from this
// app's own pages. A leaf module (no imports), so any route can use it
// without a cycle; api.ts applies sameOrigin, homeHost and fromApp in wrap(),
// and grownup.ts asks atThisMac before it takes a first PIN.
//
// Unlike the sibling apps, this one is served to the home network on
// purpose: the game is played on a tablet, the database is on the Mac.

/**
 * Reject cross-origin requests. Without this, any website visited while the
 * app is up could POST to these routes (a text/plain body is a CORS "simple
 * request", sent with no preflight) and hand out tickets. A request with no
 * Origin (same-origin navigation, curl) is allowed here and stopped by
 * fromApp; one whose Origin host doesn't match the request Host is refused.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // no Origin → not a cross-site fetch
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 10/8, 172.16/12, 192.168/16: the addresses a home router hands out.
 *  100.64/10 as well: carrier-grade NAT space, which is what a Tailscale
 *  network numbers its devices from, and not routable on the internet. */
function privateIpv4(name: string): boolean {
  const m = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** The name in a Host header, without its port. */
const hostName = (host: string): string => host.replace(/:\d+$/, "").toLowerCase();

/** The names by which a machine calls itself. */
const loopbackName = (name: string): boolean => name === "localhost" || name === "127.0.0.1" || name === "[::1]";

/**
 * The names this app answers to: this machine (localhost), a private
 * network address, or a Bonjour name (my-mac.local). The same-origin check
 * compares Origin with Host, and a page on another site that resolves its
 * own name to a private address (DNS rebinding) sends a matching pair; its
 * Host is still none of these.
 */
export function homeHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = hostName(host);
  if (loopbackName(name) || privateIpv4(name)) return true;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.local$/.test(name);
}

/** A socket address that only this machine can have: ::1 or 127/8. A server
 *  listening on both families sees the second as ::ffff:127.0.0.1. */
function loopbackAddress(address: string): boolean {
  return address === "::1" || /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(address);
}

/**
 * The request was made at this Mac, in its own browser: it asked for a
 * loopback name, and it came from a loopback address. Both are needed. Any
 * device can write "localhost" in its Host header, but none can have the
 * address; a tunnel or proxy running on this Mac has the address, but passes
 * on the name that was asked for.
 */
export function atThisMac(host: string | undefined, remoteAddress: string | undefined): boolean {
  if (!host || !remoteAddress) return false;
  return loopbackName(hostName(host)) && loopbackAddress(remoteAddress);
}

/** The header only the app's own code sends (web/src/api/client.ts). */
export const APP_HEADER = "x-schoolhouse-arcade";

/**
 * The request came from the app, not just from this network. A browser says
 * where a request came from (Sec-Fetch-Site): from another site it is
 * refused whatever it carries, from this one it passes. Anything that does
 * not say must carry APP_HEADER, which an <img>, a link or a form on another
 * page cannot add. It is not a secret; it stops a client that cannot choose
 * its headers. What a grown-up alone may do is behind the PIN, not this.
 */
export function fromApp(headers: Record<string, string | string[] | undefined>): boolean {
  const site = headers["sec-fetch-site"];
  if (site !== undefined) return site === "same-origin";
  return headers[APP_HEADER] === "1";
}
