import { useEffect, useState } from "react";

// Hash routing: the app is one page served by the dev server, and a hash
// route survives a reload and a home-screen relaunch without any server
// routing.
//   #/              the title screen
//   #/players       who is playing?
//   #/lobby         the arcade floor: pick a cabinet
//   #/play/<game>   a game (ids in shared/games.ts)
//   #/prizes        the Prize Counter: tickets, the shelf, badges
//   #/grownups      behind the PIN: prizes, tickets by hand, players

export interface Route {
  name: string;
  arg?: string;
  sub?: string;
}

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "home", ...(parts[1] ? { arg: parts[1] } : {}), ...(parts[1] && parts[2] ? { sub: parts[2] } : {}) };
}

// A new route starts at the top: once, here, before any useRoute listener.
window.addEventListener("hashchange", () => window.scrollTo(0, 0));

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function href(name: string, arg?: string, sub?: string): string {
  return `#/${name === "home" ? "" : name}${arg ? `/${encodeURIComponent(arg)}${sub ? `/${encodeURIComponent(sub)}` : ""}` : ""}`;
}

export function go(name: string, arg?: string, sub?: string): void {
  window.location.hash = href(name, arg, sub);
}
