import type { ReactNode } from "react";
import { href } from "../router.ts";
import { sfx } from "../sound.ts";
import { AvatarSprite, Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";

/** The sound switch. Its label says what pressing it does. */
export function SoundToggle() {
  const { muted, setMuted } = useArcade();
  return (
    <button
      type="button"
      className="btn btn-quiet"
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      onClick={() => {
        setMuted(!muted);
        if (muted) sfx.tap();
      }}
    >
      <Sprite id={muted ? "mute" : "speaker"} size={30} />
    </button>
  );
}

/**
 * The strip along the top of every screen past the title: who is playing
 * (press it to change player) on the left; on the right their tickets (press
 * them for the Prize Counter), what the screen adds, and the sound switch.
 */
export function Hud({ children }: { children?: ReactNode }) {
  const { player, tickets } = useArcade();
  return (
    <header className="flex items-center justify-between gap-3">
      {player ? (
        <a href={href("players")} className="flex min-h-14 items-center gap-3 text-magenta no-underline" aria-label={`Playing as ${player.name}. Change player`}>
          <AvatarSprite avatar={player.avatar} colour={player.colour} size={44} />
          <span className="font-display glow text-sm max-sm:hidden">{player.name}</span>
        </a>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-4">
        {player && tickets !== null && (
          <a href={href("prizes")} className="flex min-h-14 items-center gap-2 text-yellow no-underline" aria-label={`${tickets} tickets. Go to the Prize Counter`}>
            <Sprite id="ticket" size={40} />
            <span className="font-display glow text-sm">{tickets}</span>
          </a>
        )}
        {children}
        <SoundToggle />
      </div>
    </header>
  );
}
