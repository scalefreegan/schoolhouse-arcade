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
 * (press it to change player) on the left, what the screen adds in the
 * middle, the sound switch on the right.
 */
export function Hud({ children }: { children?: ReactNode }) {
  const { player } = useArcade();
  return (
    <header className="flex items-center justify-between gap-3">
      {player ? (
        <a href={href("players")} className="flex items-center gap-3 text-magenta no-underline" aria-label={`Playing as ${player.name}. Change player`}>
          <AvatarSprite avatar={player.avatar} size={44} />
          <span className="font-display glow text-sm">{player.name}</span>
        </a>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-4">
        {children}
        <SoundToggle />
      </div>
    </header>
  );
}
