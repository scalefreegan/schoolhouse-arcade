import { useEffect, useState, type FormEvent } from "react";
import { BADGES, badgeById } from "../../shared/badges.ts";
import { ADJUST_MAX, NOTE_MAX, PRIZE_COST_MAX, PRIZE_ICONS, PRIZE_NAME_MAX, cleanPrize, type PrizeFields } from "../../shared/prizes.ts";
import type { GrownupPlayer, GrownupReply, LedgerLine, PinState, Prize } from "../../shared/wire.ts";
import { ApiError, addPrize, adjustTickets, changePrize, choosePin, getGrownup, getPinState, openLevelFor, removePrize, retirePlayer } from "../api/client.ts";
import { go } from "../router.ts";
import { AvatarSprite, Picture, Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";
import { PinPad } from "./PinPad.tsx";
import { Stars } from "./Stars.tsx";

// The grown-up area: everything that costs real money or overrides the
// game. The PIN typed at the door is held in this screen's memory only,
// sent with every request, and gone when the screen is left. Its words are
// for an adult: this is the one place that is not written for a six-year-old.

const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function why(l: LedgerLine): string {
  if (l.reason === "play") return "Played a round";
  if (l.reason === "best") return "Beat their best";
  if (l.reason === "star") return "Won a star";
  if (l.reason === "badge") return `Badge: ${badgeById(l.note ?? "")?.title ?? l.note}`;
  if (l.reason === "prize") return `Prize: ${l.note}`;
  return l.note ? `By hand: ${l.note}` : "By hand";
}

/** One player: their tickets and levels, and what a grown-up can do about them. */
function PlayerRow({ p, busy, onAdjust, onOpen, onRetire }: { p: GrownupPlayer; busy: boolean; onAdjust: (delta: number, note: string) => Promise<boolean>; onOpen: (gameId: string, level: string) => void; onRetire: () => void }) {
  const [form, setForm] = useState<null | "tickets" | "retire">(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const n = /^[0-9]+$/.test(amount) ? Number(amount) : 0;
  const ok = n >= 1 && n <= ADJUST_MAX;
  const next = p.levels.find((l) => !l.open);

  const send = async (sign: 1 | -1) => {
    if (await onAdjust(sign * n, note)) {
      setForm(null);
      setAmount("");
      setNote("");
    }
  };

  return (
    <li className="panel">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <AvatarSprite avatar={p.avatar} size={48} />
        <span className="font-display text-sm text-magenta">{p.name}</span>
        <span className="flex items-center gap-2 text-yellow">
          <Sprite id="ticket" size={28} />
          <span className="font-display text-sm">{p.tickets}</span>
        </span>
        <span className="flex flex-1 flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-quiet" aria-expanded={form === "tickets"} onClick={() => setForm(form === "tickets" ? null : "tickets")}>
            Tickets
          </button>
          {next && (
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onOpen(next.gameId, next.level)}>
              Unlock {next.title}
            </button>
          )}
          <button type="button" className="btn btn-quiet" aria-expanded={form === "retire"} onClick={() => setForm(form === "retire" ? null : "retire")}>
            Retire
          </button>
        </span>
      </div>

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-dim">
        {p.levels.map((l) => (
          <li key={`${l.gameId}/${l.level}`} className="flex items-center gap-2">
            {l.title}
            {l.open ? <Stars count={l.stars} size={14} /> : <Sprite id="lock" size={14} title="locked" />}
          </li>
        ))}
      </ul>

      {form === "tickets" && (
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(ev) => ev.preventDefault()}>
          <label className="block w-28">
            How many
            <input className="field field-plain" inputMode="numeric" value={amount} onChange={(ev) => setAmount(ev.target.value.replace(/[^0-9]/g, "").slice(0, 5))} autoFocus />
          </label>
          <label className="block min-w-40 flex-1">
            What for (optional)
            <input className="field field-plain" value={note} maxLength={NOTE_MAX} onChange={(ev) => setNote(ev.target.value)} placeholder="Tidied the playroom" />
          </label>
          <button type="button" className="btn btn-yellow" disabled={!ok || busy} onClick={() => void send(1)}>
            Add
          </button>
          <button type="button" className="btn btn-quiet" disabled={!ok || busy || n > p.tickets} onClick={() => void send(-1)}>
            Take away
          </button>
        </form>
      )}
      {form === "retire" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="m-0 flex-1">
            Take {p.name} off the "Who is playing?" screen? Their scores stay on the high score tables. This cannot be undone from here.
          </p>
          <button type="button" className="btn btn-bad" disabled={busy} onClick={onRetire}>
            Retire {p.name}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setForm(null)}>
            Keep
          </button>
        </div>
      )}
    </li>
  );
}

/** Add a prize, or change one. */
function PrizeForm({ editing, busy, onSave, onCancel }: { editing: Prize | null; busy: boolean; onSave: (prize: PrizeFields) => void; onCancel: () => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState(editing?.icon ?? PRIZE_ICONS[0]);
  const [cost, setCost] = useState(editing ? String(editing.cost) : "");
  const [badge, setBadge] = useState(editing?.badge ?? "");
  const prize = cleanPrize({ name, icon, cost: /^[0-9]+$/.test(cost) ? Number(cost) : NaN, badge });
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (typeof prize !== "string") onSave(prize);
  };
  return (
    <form className="panel panel-cyan" onSubmit={submit}>
      <p className="font-display m-0 text-xs text-cyan">{editing ? "Change this prize" : "A new prize"}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="block min-w-48 flex-1">
          What it is
          <input className="field field-plain" value={name} maxLength={PRIZE_NAME_MAX} onChange={(ev) => setName(ev.target.value)} placeholder="A trip to the park" autoFocus />
        </label>
        <label className="block w-32">
          Tickets
          <input className="field field-plain" inputMode="numeric" value={cost} onChange={(ev) => setCost(ev.target.value.replace(/[^0-9]/g, "").slice(0, String(PRIZE_COST_MAX).length))} placeholder="200" />
        </label>
        <label className="block min-w-48 flex-1">
          Also needs a badge
          <select className="field field-plain" value={badge} onChange={(ev) => setBadge(ev.target.value)}>
            <option value="">No badge needed</option>
            {BADGES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.how.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-4 sm:grid-cols-8" role="group" aria-label="Picture">
        {PRIZE_ICONS.map((id) => (
          <button key={id} type="button" className="panel pick flex justify-center" aria-pressed={icon === id} aria-label={id} onClick={() => setIcon(id)}>
            <Picture id={id} size={48} />
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        {typeof prize === "string" && (name || cost) && <p className="m-0 flex-1 text-dim">{prize}</p>}
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-cyan" disabled={typeof prize === "string" || busy}>
          {editing ? "Save" : "Put it on the shelf"}
        </button>
      </div>
    </form>
  );
}

export function Grownups() {
  const { player, reload, setTickets } = useArcade();
  /** Whether a PIN exists, and if not whether this device may choose it; null until the server has said. */
  const [pinState, setPinState] = useState<PinState | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  /** Choosing a PIN: the first typing, waiting for the second. */
  const [first, setFirst] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [data, setData] = useState<GrownupReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prizeForm, setPrizeForm] = useState<{ editing: Prize | null } | null>(null);

  useEffect(() => {
    getPinState().then(setPinState, (e) => setError(message(e)));
  }, []);

  const leave = () => go(player ? "lobby" : "players");

  /** Typed twice the same, a new PIN is chosen. `current` is the old one when changing it. */
  const choose = async (typed: string, current?: string): Promise<string | null> => {
    if (first === null) {
      setFirst(typed);
      return null;
    }
    setFirst(null);
    if (typed !== first) return "Those two did not match. Start again.";
    try {
      await choosePin(typed, current);
      setData(await getGrownup(typed));
      setPin(typed);
      setPinState({ set: true, mayChoose: false });
      if (current) setNotice("The PIN is changed.");
      setChanging(false);
      return null;
    } catch (e) {
      // A first PIN refused: someone chose one meanwhile, or this is not the
      // Mac. Ask again which it is, so the screen offers only what can be done.
      if (current === undefined) getPinState().then(setPinState, () => {});
      return message(e);
    }
  };

  const enter = async (typed: string): Promise<string | null> => {
    try {
      setData(await getGrownup(typed));
      setPin(typed);
      return null;
    } catch (e) {
      return message(e);
    }
  };

  if (pinState === null) {
    return (
      <main className="screen items-center justify-center text-center">
        {error ? (
          <div role="alert" className="panel panel-bad max-w-xl">
            <p className="font-display m-0 text-sm text-bad">No signal</p>
            <p className="mt-4">{error}</p>
            <button type="button" className="btn btn-quiet mt-4" onClick={leave}>
              Back
            </button>
          </div>
        ) : (
          <p className="font-display blink text-sm text-dim">Loading</p>
        )}
      </main>
    );
  }
  if (!pinState.set && !pinState.mayChoose) {
    return (
      <main className="screen items-center justify-center text-center">
        <div className="panel panel-cyan max-w-xl">
          <h1 className="font-display glow m-0 text-sm text-cyan">No PIN yet</h1>
          <p className="mt-4 mb-0">A grown-up chooses it on the Mac.</p>
          <p className="mt-2 mb-0 break-all text-cyan">http://localhost:38900</p>
          <button type="button" className="btn btn-quiet mt-4" onClick={leave}>
            Back
          </button>
        </div>
      </main>
    );
  }
  if (pin === null || data === null) {
    return (
      <main className="screen">
        {pinState.set ? (
          <PinPad title="Grown-ups only" hint="Type the PIN." onPin={enter} onCancel={leave} />
        ) : (
          <PinPad
            title={first === null ? "Choose a grown-up PIN" : "Type it again"}
            hint={first === null ? "Four digits. You will need it to hand over a prize, so pick one a six-year-old will not guess." : "The same four digits, to be sure."}
            onPin={(typed) => choose(typed)}
            onCancel={leave}
          />
        )}
      </main>
    );
  }

  /** Do one thing behind the PIN, then read everything again. */
  const act = async (what: (pin: string) => Promise<unknown>, done?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await what(pin);
      const fresh = await getGrownup(pin);
      setData(fresh);
      setError(null);
      setNotice(done ?? null);
      // The rest of the arcade shows players and tickets too.
      void reload();
      const me = fresh.players.find((p) => p.id === player?.id);
      if (me) setTickets(me.tickets);
      return true;
    } catch (e) {
      setNotice(null);
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display glow m-0 text-base text-cyan">Grown-ups</h1>
        <div className="flex gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => setChanging(true)}>
            Change PIN
          </button>
          <button type="button" className="btn" onClick={leave}>
            Done
          </button>
        </div>
      </header>
      <p className="mt-3 mb-0 text-dim">Tickets are earned by playing: one for a right answer on Easy, two on Arcade, and bonuses for stars, badges and beating a best. A prize is handed over at the Prize Counter, with this PIN.</p>

      {error && (
        <p role="alert" className="panel panel-bad mt-3 text-bad">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="panel panel-cyan mt-3">
          {notice}
        </p>
      )}

      <h2 className="font-display mt-6 mb-0 text-xs text-dim">Players</h2>
      {data.players.length ? (
        <ul className="m-0 mt-1 list-none p-0">
          {data.players.map((p) => (
            <PlayerRow
              key={p.id}
              p={p}
              busy={busy}
              onAdjust={(delta, note) => act((k) => adjustTickets(k, { playerId: p.id, delta, ...(note.trim() ? { note } : {}) }), `${p.name}: ${delta > 0 ? `${delta} tickets added` : `${-delta} tickets taken away`}.`)}
              onOpen={(gameId, level) => void act((k) => openLevelFor(k, { playerId: p.id, gameId, level }), `Opened for ${p.name}.`)}
              onRetire={() => void act((k) => retirePlayer(k, p.id), `${p.name} is retired.`)}
            />
          ))}
        </ul>
      ) : (
        <p className="panel mt-1 text-dim">Nobody has joined the arcade yet.</p>
      )}

      <h2 className="font-display mt-6 mb-0 text-xs text-dim">The prize shelf</h2>
      <ul className="m-0 mt-1 list-none p-0">
        {data.prizes.map((z) =>
          prizeForm?.editing?.id === z.id ? (
            <li key={z.id}>
              <PrizeForm editing={z} busy={busy} onCancel={() => setPrizeForm(null)} onSave={(f) => void act((k) => changePrize(k, z.id, f), "Saved.").then((ok) => ok && setPrizeForm(null))} />
            </li>
          ) : (
            <li key={z.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-2">
              <Picture id={z.icon} size={40} />
              <span className="min-w-32 flex-1">
                {z.name}
                {z.badge && <span className="block text-dim">Also needs the {badgeById(z.badge)?.title ?? z.badge} badge</span>}
              </span>
              <span className="flex items-center gap-2 text-yellow">
                <Sprite id="ticket" size={28} />
                <span className="font-display text-sm">{z.cost}</span>
              </span>
              <button type="button" className="btn btn-quiet" onClick={() => setPrizeForm({ editing: z })}>
                Change
              </button>
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void act((k) => removePrize(k, z.id), `${z.name} is off the shelf.`)}>
                Remove
              </button>
            </li>
          ),
        )}
      </ul>
      {prizeForm && !prizeForm.editing ? (
        <PrizeForm editing={null} busy={busy} onCancel={() => setPrizeForm(null)} onSave={(f) => void act((k) => addPrize(k, f), `${f.name} is on the shelf.`).then((ok) => ok && setPrizeForm(null))} />
      ) : (
        <button type="button" className="btn btn-cyan mt-2 self-start" onClick={() => setPrizeForm({ editing: null })}>
          Add a prize
        </button>
      )}

      {data.handed.length > 0 && (
        <>
          <h2 className="font-display mt-6 mb-0 text-xs text-dim">Prizes handed over</h2>
          <ul className="panel mt-1 list-none">
            {data.handed.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-1">
                <Picture id={h.icon} size={28} />
                <span className="flex-1">
                  {h.player}: {h.name}
                </span>
                <span className="text-dim">
                  {h.cost} tickets, {day(h.at)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.ledger.length > 0 && (
        <>
          <h2 className="font-display mt-6 mb-0 text-xs text-dim">Latest tickets</h2>
          <ul className="panel mt-1 list-none">
            {data.ledger.map((l) => (
              <li key={l.id} className="flex gap-3 py-0.5">
                <span className="w-20 shrink-0 truncate text-magenta sm:w-24">{l.name}</span>
                <span className={`w-12 shrink-0 text-right sm:w-16 ${l.delta > 0 ? "text-yellow" : "text-fg"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
                <span className="flex-1">{why(l)}</span>
                <span className="text-dim max-sm:hidden">{day(l.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {changing && (
        <PinPad
          title={first === null ? "The new PIN" : "Type it again"}
          hint={first === null ? "Four digits." : "The same four digits, to be sure."}
          onPin={(typed) => choose(typed, pin)}
          onCancel={() => {
            setFirst(null);
            setChanging(false);
          }}
        />
      )}
    </main>
  );
}
