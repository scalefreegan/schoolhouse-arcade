import { useEffect, useState } from "react";
import { sfx } from "../../sound.ts";
import { Sprite } from "../../sprites/Sprite.tsx";

// Split it's gems, as drawn: on a piece of a word, in the round's tray, and
// counted on the results. A gem is for the round only; nothing stores one.

/** A gem's colour by the place of its sound in the word (art.ts: jewel). */
const COLOURS = ["gold", "violet", "blue"];

/** The gem for the sound at place `i` of a word (or the `i`th gem of a round). */
export function Jewel({ i, size, className = "", off = false }: { i: number; size: number; className?: string; off?: boolean }) {
  return <Sprite id="jewel" palette={COLOURS[i % COLOURS.length]} size={size} className={className} off={off} />;
}

/** The round's gems so far, in a tray along the bottom of the machine. Reward, so yellow. */
export function GemTray({ gems }: { gems: number }) {
  return (
    <div className="gm-tray" role="img" aria-label={`${gems} gems`}>
      <span className="gm-tray-gems">
        {Array.from({ length: gems }, (_, i) => (
          <Jewel key={i} i={i} size={20} />
        ))}
      </span>
      <b className="font-display text-sm text-yellow">{gems}</b>
    </div>
  );
}

const STEP_MS = 90;

/**
 * The results: the round's gems lit one by one, a ping each, out of the
 * gems its words held. Straight there for reduced motion.
 */
export function GemTally({ gems, of }: { gems: number; of: number }) {
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(still ? gems : 0);
  useEffect(() => {
    if (shown >= gems) return;
    const timer = window.setTimeout(() => {
      sfx.gem(shown);
      setShown(shown + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [shown, gems]);
  return (
    <div className="panel panel-yellow mx-auto mt-5 max-w-md" role="img" aria-label={`${gems} gems`}>
      <p className="m-0 flex items-center justify-center gap-3" aria-hidden>
        <Jewel i={0} size={40} />
        <span className="font-display glow text-xl text-yellow">{shown}</span>
      </p>
      <p className="m-0 mt-2 flex flex-wrap justify-center gap-1" aria-hidden>
        {Array.from({ length: of }, (_, i) => (
          <Jewel key={i} i={i} size={24} off={i >= shown} />
        ))}
      </p>
    </div>
  );
}
