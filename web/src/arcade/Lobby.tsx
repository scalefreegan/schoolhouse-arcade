import { GAMES, type GameInfo } from "../../shared/games.ts";
import { GAME_SCREENS } from "../games/index.ts";
import { go, href } from "../router.ts";
import { sfx } from "../sound.ts";
import { Picture, Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";
import { Hud } from "./Hud.tsx";

/** One cabinet on the floor: a lit marquee, a screen, and what it teaches. */
function Cabinet({ game }: { game: GameInfo }) {
  const live = game.status === "live" && game.id in GAME_SCREENS;
  return (
    <button
      type="button"
      className={`panel pick flex w-full max-w-sm flex-col items-center gap-4 py-6 ${live ? "panel-cyan" : ""}`}
      disabled={!live}
      onClick={() => {
        sfx.coin();
        go("play", game.id);
      }}
    >
      <span className={`font-display text-base ${live ? "glow text-cyan" : "text-dim"}`}>{game.title}</span>
      <span className={`flex h-36 w-full items-center justify-center bg-tube ${live ? "" : "opacity-40"}`}>
        <Picture id={game.sprite} size={96} className={live ? "hop" : ""} />
      </span>
      <span>{game.pitch}</span>
      <span className="text-dim">{game.teaches}</span>
      {live ? <span className="font-display glow blink text-sm text-yellow">Play</span> : <span className="font-display text-sm text-dim">Coming soon</span>}
    </button>
  );
}

/** The way to the Prize Counter: what the tickets are for. */
function CounterDoor() {
  const { tickets } = useArcade();
  return (
    <button
      type="button"
      className="panel pick panel-yellow flex w-full max-w-sm flex-col items-center gap-4 py-6"
      onClick={() => {
        sfx.tap();
        go("prizes");
      }}
    >
      <span className="font-display glow text-base text-yellow">Prize Counter</span>
      <span className="flex h-36 w-full items-center justify-center gap-4 bg-tube">
        <Sprite id="gift" size={80} />
        <Sprite id="icecream" size={80} />
      </span>
      <span>Trade your tickets for real prizes</span>
      <span className="flex items-center gap-2 text-yellow">
        <Sprite id="ticket" size={32} />
        <span className="font-display text-sm">{tickets ?? " "}</span>
      </span>
      <span className="font-display text-sm text-yellow">Look</span>
    </button>
  );
}

/** The arcade floor: every cabinet, then the Prize Counter. */
export function Lobby() {
  return (
    <main className="screen">
      <Hud />
      <h1 className="font-display glow mt-10 mb-0 text-center text-cyan text-[clamp(1rem,3.4vw,1.75rem)]">Pick a game</h1>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {GAMES.map((g) => (
          <Cabinet key={g.id} game={g} />
        ))}
        <CounterDoor />
        <div className="panel flex w-full max-w-sm flex-col items-center justify-center gap-4 py-6 text-center text-dim">
          <span className="font-display text-base">? ? ?</span>
          <span>More cabinets are on the delivery truck.</span>
        </div>
      </div>
      <p className="mt-10 mb-0 text-center">
        <a href={href("grownups")} className="text-dim">
          Grown-ups
        </a>
      </p>
    </main>
  );
}
