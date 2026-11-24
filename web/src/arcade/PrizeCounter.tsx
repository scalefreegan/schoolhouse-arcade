import { useCallback, useEffect, useState } from "react";
import { BADGES, badgeById, type Badge } from "../../shared/badges.ts";
import type { CounterReply, Prize, WonPrize } from "../../shared/wire.ts";
import { ApiError, getCounter, redeemPrize } from "../api/client.ts";
import { go, href } from "../router.ts";
import { sfx } from "../sound.ts";
import { Picture, Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";
import { Hud } from "./Hud.tsx";
import { PinPad } from "./PinPad.tsx";

/** A badge as a small medal case: lit when held, a dark shape and how to earn it when not. */
export function BadgeTile({ badge, held }: { badge: Badge; held: boolean }) {
  return (
    <li className="panel flex flex-col items-center gap-2 text-center" {...(held ? {} : { "aria-label": `${badge.title}, not earned yet. ${badge.how}.` })}>
      <Picture id={badge.sprite} palette={badge.palette} size={56} off={!held} />
      <span className={`font-display text-xs ${held ? "text-yellow" : "text-dim"}`}>{badge.title}</span>
      <span className="leading-tight text-dim">{badge.how}</span>
    </li>
  );
}

/** One prize on the shelf: what it is, what it costs, and how close this player is. */
function PrizeCase({ prize, tickets, heldBadges, onGet }: { prize: Prize; tickets: number; heldBadges: string[]; onGet: () => void }) {
  const badge = prize.badge ? badgeById(prize.badge) : undefined;
  const needsBadge = !!prize.badge && !heldBadges.includes(prize.badge);
  const short = Math.max(0, prize.cost - tickets);
  const ready = short === 0 && !needsBadge;
  return (
    <li className={`panel flex flex-col items-center gap-2 text-center ${ready ? "panel-yellow" : ""}`}>
      <Picture id={prize.icon} size={80} className={ready ? "hop" : ""} />
      <span className="font-display text-sm">{prize.name}</span>
      <span className="flex items-center gap-2 text-yellow">
        <Sprite id="ticket" size={28} />
        <span className="font-display text-sm">{prize.cost}</span>
      </span>
      {needsBadge && (
        <span className="flex items-center gap-2 text-dim">
          <Sprite id="lock" size={18} />
          Needs the {badge?.title ?? "right"} badge
        </span>
      )}
      {ready ? (
        <button type="button" className="btn btn-yellow mt-1" onClick={onGet}>
          Get it
        </button>
      ) : (
        short > 0 && (
          <>
            <div className="track track-reward w-full" role="progressbar" aria-valuemin={0} aria-valuemax={prize.cost} aria-valuenow={Math.min(tickets, prize.cost)} aria-label={`Tickets towards ${prize.name}`}>
              <div className="track-fill" style={{ width: `${Math.min(100, (tickets / prize.cost) * 100)}%` }} />
            </div>
            <span className="text-dim">{short} more to go</span>
          </>
        )
      )}
    </li>
  );
}

/**
 * The Prize Counter: this player's tickets, the prizes a grown-up has put on
 * the shelf, the badges, and what has been won. Looking is free; taking a
 * prize needs a grown-up to type the PIN, here, at the moment it is handed
 * over.
 */
export function PrizeCounter() {
  const { player, setTickets } = useArcade();
  const [counter, setCounter] = useState<CounterReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<Prize | null>(null);
  const [won, setWon] = useState<WonPrize | null>(null);
  const playerId = player?.id;

  const load = useCallback(async () => {
    if (!playerId) return;
    try {
      const reply = await getCounter(playerId);
      setCounter(reply);
      setTickets(reply.tickets);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  }, [playerId, setTickets]);

  useEffect(() => {
    // The first load. load() only sets state after the server answers.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  if (!player) return null;
  const back = (
    <button type="button" className="btn btn-quiet" onClick={() => go("lobby")}>
      Games
    </button>
  );
  if (error && !counter) {
    return (
      <main className="screen">
        <Hud>{back}</Hud>
        <div role="alert" className="panel panel-bad mx-auto mt-16 max-w-xl text-center">
          <p className="font-display m-0 text-sm text-bad">No signal</p>
          <p className="mt-4">{error}</p>
          <button type="button" className="btn btn-cyan mt-4" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!counter) {
    return (
      <main className="screen items-center justify-center">
        <p className="font-display blink text-sm text-dim">Loading</p>
      </main>
    );
  }

  const held = counter.badges.map((b) => b.id);

  const handOver = async (pin: string): Promise<string | null> => {
    if (!asking) return null;
    try {
      const reply = await redeemPrize(pin, { playerId: player.id, prizeId: asking.id });
      sfx.fanfare();
      setTickets(reply.tickets);
      setWon(reply.won);
      setAsking(null);
      void load();
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.code === "pin_unset") return "Ask a grown-up.";
      return e instanceof ApiError ? e.message : String(e);
    }
  };

  return (
    <main className="screen">
      <Hud>{back}</Hud>
      <h1 className="font-display glow mt-8 mb-0 text-center text-yellow text-[clamp(1rem,3.4vw,1.75rem)]">Prize Counter</h1>
      <p className="mt-4 mb-0 flex items-center justify-center gap-4" aria-label={`${player.name} has ${counter.tickets} tickets`}>
        <Sprite id="ticket" size={72} />
        <span className="font-display glow text-yellow" style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)" }}>
          {counter.tickets}
        </span>
      </p>

      {won && (
        <div role="status" className="panel panel-yellow mx-auto mt-4 flex w-full max-w-md items-center gap-4">
          <Picture id={won.icon} size={56} className="hop" />
          <p className="font-display m-0 flex-1 text-sm text-yellow">{won.name} is yours!</p>
          <button type="button" className="btn btn-quiet" onClick={() => setWon(null)}>
            OK
          </button>
        </div>
      )}

      <h2 className="font-display mt-6 mb-0 text-xs text-dim">Prizes</h2>
      {counter.prizes.length ? (
        <ul className="m-0 mt-1 grid list-none grid-cols-2 p-0 md:grid-cols-3">
          {counter.prizes.map((p) => (
            <PrizeCase
              key={p.id}
              prize={p}
              tickets={counter.tickets}
              heldBadges={held}
              onGet={() => {
                sfx.tap();
                setWon(null);
                setAsking(p);
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="panel mt-1 text-center text-dim">The shelf is empty. A grown-up can put prizes on it.</p>
      )}

      <h2 className="font-display mt-6 mb-0 text-xs text-dim">
        Badges {held.length} of {BADGES.length}
      </h2>
      <ul className="m-0 mt-1 grid list-none grid-cols-2 p-0 sm:grid-cols-3 md:grid-cols-5">
        {BADGES.map((b) => (
          <BadgeTile key={b.id} badge={b} held={held.includes(b.id)} />
        ))}
      </ul>

      {counter.won.length > 0 && (
        <>
          <h2 className="font-display mt-6 mb-0 text-xs text-dim">Prizes won</h2>
          <ul className="panel mt-1 flex list-none flex-wrap gap-x-6 gap-y-2">
            {counter.won.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <Picture id={w.icon} size={32} />
                {w.name}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 mb-0 text-center">
        <a href={href("grownups")} className="text-dim">
          Grown-ups
        </a>
      </p>

      {asking && <PinPad title={`Hand over ${asking.name}?`} hint={`Grown-up: type your PIN. It takes ${asking.cost} of ${player.name}'s tickets.`} onPin={handOver} onCancel={() => setAsking(null)} />}
    </main>
  );
}
