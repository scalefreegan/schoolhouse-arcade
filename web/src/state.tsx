import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Player } from "../shared/wire.ts";
import { ApiError, getPlayers } from "./api/client.ts";
import { isMuted, setMuted as storeMuted } from "./sound.ts";

// What the whole arcade knows: who can play, who is playing now, and
// whether the sound is on. Who is playing is remembered per device (a
// tablet stays signed in as its usual player); everything else is the
// server's.

const PLAYER_KEY = "arcade.player";

interface Arcade {
  /** null until the first load answers. */
  players: Player[] | null;
  /** Why the players could not be loaded, in the server's words. */
  error: string | null;
  player: Player | null;
  choosePlayer: (id: string | null) => void;
  /** Read the players again (after adding or changing one). */
  reload: () => Promise<void>;
  muted: boolean;
  setMuted: (next: boolean) => void;
}

const ArcadeContext = createContext<Arcade | null>(null);

function storedPlayerId(): string | null {
  try {
    return localStorage.getItem(PLAYER_KEY);
  } catch {
    return null;
  }
}

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(storedPlayerId);
  const [muted, setMutedState] = useState(isMuted);

  const reload = useCallback(async () => {
    try {
      setPlayers((await getPlayers()).players);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // The first load. reload() only sets state after the server answers.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  const choosePlayer = useCallback((id: string | null) => {
    setPlayerId(id);
    try {
      if (id) localStorage.setItem(PLAYER_KEY, id);
      else localStorage.removeItem(PLAYER_KEY);
    } catch {
      /* private browsing: remembered for this visit only */
    }
  }, []);

  const setMuted = useCallback((next: boolean) => {
    storeMuted(next);
    setMutedState(next);
  }, []);

  const value = useMemo<Arcade>(
    () => ({ players, error, player: players?.find((p) => p.id === playerId) ?? null, choosePlayer, reload, muted, setMuted }),
    [players, error, playerId, choosePlayer, reload, muted, setMuted],
  );
  return <ArcadeContext.Provider value={value}>{children}</ArcadeContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useArcade(): Arcade {
  const arcade = useContext(ArcadeContext);
  if (!arcade) throw new Error("useArcade outside ArcadeProvider");
  return arcade;
}
