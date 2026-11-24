import { useEffect } from "react";
import { AVATARS } from "../../shared/avatars.ts";
import { go } from "../router.ts";
import { sfx } from "../sound.ts";
import { AvatarSprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";

/**
 * The title screen, as a cabinet shows it between games: the marquee, the
 * cast hopping along the floor line, and one thing to do. Any key or a tap
 * anywhere starts.
 */
export function Attract() {
  const { player } = useArcade();

  useEffect(() => {
    const start = () => {
      sfx.coin();
      // A tablet that already knows its player goes straight to the floor.
      go(player ? "lobby" : "players");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab") return;
      start();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", start);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", start);
    };
  }, [player]);

  return (
    <main className="screen items-center justify-center text-center">
      <div className="starfield" />
      <h1 className="m-0">
        <span className="marquee block text-cyan text-[clamp(1.25rem,5.2vw,3rem)]" style={{ "--marquee-depth": "var(--cyan-depth)" } as React.CSSProperties}>
          Schoolhouse
        </span>
        <span className="marquee mt-4 block text-magenta text-[clamp(2.25rem,10vw,6rem)]">Arcade</span>
      </h1>

      <div className="mt-14 w-full max-w-2xl">
        {/* The cast shrinks to fit a phone rather than push the screen wider. */}
        <div className="flex items-end justify-between gap-1 px-4">
          {AVATARS.map((a, i) => (
            <span key={a.id} className="hop min-w-0" style={{ animationDelay: `${(i % 4) * 0.15}s` }}>
              <AvatarSprite avatar={a.id} size={56} className="h-auto max-w-full" />
            </span>
          ))}
        </div>
        <div className="floor" />
      </div>

      <p className="font-display glow blink mt-14 text-yellow text-[clamp(0.875rem,3vw,1.5rem)]">Press start</p>
      <p className="mt-6 text-dim">Tap the screen or press any key</p>
    </main>
  );
}
