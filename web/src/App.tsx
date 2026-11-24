import { useEffect } from "react";
import { Attract } from "./arcade/Attract.tsx";
import { Grownups } from "./arcade/Grownups.tsx";
import { Lobby } from "./arcade/Lobby.tsx";
import { Players } from "./arcade/Players.tsx";
import { PrizeCounter } from "./arcade/PrizeCounter.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { GAME_SCREENS } from "./games/index.ts";
import { go, useRoute } from "./router.ts";
import { ArcadeProvider, useArcade } from "./state.tsx";

/** Send the browser somewhere else once this has rendered. */
function Redirect({ to }: { to: string }) {
  useEffect(() => go(to), [to]);
  return null;
}

function Screens() {
  const route = useRoute();
  const { player, players } = useArcade();

  if (route.name === "home") return <Attract />;
  if (route.name === "players") return <Players />;
  // Behind its own door (the PIN), with or without a player.
  if (route.name === "grownups") return <Grownups />;
  // Past here a screen needs a player. Until the list has loaded we cannot
  // tell "nobody chosen" from "not loaded yet", so wait rather than bounce.
  if (!player) return players ? <Redirect to="players" /> : <Players />;
  if (route.name === "lobby") return <Lobby />;
  if (route.name === "prizes") return <PrizeCounter />;
  if (route.name === "play" && route.arg) {
    const Game = GAME_SCREENS[route.arg];
    if (Game)
      return (
        <ErrorBoundary label={route.arg}>
          <Game player={player} onExit={() => go("lobby")} />
        </ErrorBoundary>
      );
  }
  return <Redirect to="lobby" />;
}

export function App() {
  return (
    <ArcadeProvider>
      <div className="tube">
        <Screens />
      </div>
    </ArcadeProvider>
  );
}
