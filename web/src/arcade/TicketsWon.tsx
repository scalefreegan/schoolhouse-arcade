import { useEffect, useState } from "react";
import { badgeById } from "../../shared/badges.ts";
import type { TicketLine } from "../../shared/tickets.ts";
import type { PlayReply } from "../../shared/wire.ts";
import { sfx } from "../sound.ts";
import { Picture, Sprite } from "../sprites/Sprite.tsx";

const STEPS = 12;
const STEP_MS = 70;

/** Count up to `total` in a few steps, with a blip on each. Straight there for reduced motion. */
function useCountUp(total: number): number {
  const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(still ? STEPS : 0);
  useEffect(() => {
    if (step >= STEPS || total <= 0) return;
    const timer = window.setTimeout(() => {
      sfx.ticket();
      setStep(step + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, total]);
  return Math.round((total * Math.min(step, STEPS)) / STEPS);
}

function label(l: TicketLine): string {
  if (l.reason === "best") return "Your best yet";
  if (l.reason === "star") return "New star";
  if (l.reason === "badge") return badgeById(l.badge ?? "")?.title ?? "Badge";
  return "This round";
}

/**
 * What a round paid, in the server's numbers: the tickets counting up, each
 * reason they were paid, and any badge the round won.
 */
export function TicketsWon({ tickets, badges }: { tickets: PlayReply["tickets"]; badges: string[] }) {
  const shown = useCountUp(tickets.total);
  const won = badges.map(badgeById).filter((b) => b !== undefined);
  if (tickets.total <= 0 && !won.length) return null;
  return (
    <div className="panel panel-yellow mx-auto mt-5 max-w-md">
      <p className="m-0 flex items-center justify-center gap-3" aria-label={`${tickets.total} tickets won`}>
        <Sprite id="ticket" size={48} />
        <span className="font-display glow text-xl text-yellow" aria-hidden>
          +{shown}
        </span>
      </p>
      {tickets.lines.length > 1 && (
        <ul className="m-0 mt-2 flex list-none flex-wrap justify-center gap-x-5 gap-y-1 p-0">
          {tickets.lines.map((l, i) => (
            <li key={i}>
              {label(l)} <span className="text-yellow">+{l.amount}</span>
            </li>
          ))}
        </ul>
      )}
      {won.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-4 p-0">
          {won.map((b) => (
            <li key={b.id} className="flex flex-col items-center gap-1">
              <Picture id={b.sprite} palette={b.palette} size={56} className="hop" />
              <span className="font-display text-xs text-yellow">{b.title}</span>
              <span className="text-dim">New badge!</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
