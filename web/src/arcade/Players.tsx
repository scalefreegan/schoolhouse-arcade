import { useState, type FormEvent } from "react";
import { AVATARS, PLAYER_NAME_MAX, cleanPlayerName } from "../../shared/avatars.ts";
import type { Player } from "../../shared/wire.ts";
import { ApiError, addPlayer, changePlayer } from "../api/client.ts";
import { go } from "../router.ts";
import { sfx } from "../sound.ts";
import { AvatarSprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";
import { Hud } from "./Hud.tsx";

/** The form for a new player, or for changing one: a character and a name. */
function PlayerForm({ editing, onDone, onCancel }: { editing: Player | null; onDone: (p: Player) => void; onCancel: () => void }) {
  const [avatar, setAvatar] = useState(editing?.avatar ?? AVATARS[0].id);
  const [name, setName] = useState(editing?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanPlayerName(name);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(editing ? await changePlayer(editing.id, { name: clean, avatar }) : await addPlayer({ name: clean, avatar }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto mt-8 w-full max-w-2xl">
      <h2 className="font-display glow m-0 text-center text-base text-cyan">{editing ? `Change ${editing.name}` : "Pick your character"}</h2>
      <div className="mt-6 grid grid-cols-4 gap-2" role="group" aria-label="Character">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            className="panel pick flex flex-col items-center gap-2"
            aria-pressed={avatar === a.id}
            onClick={() => {
              sfx.tap();
              setAvatar(a.id);
            }}
          >
            <AvatarSprite avatar={a.id} size={64} className={avatar === a.id ? "hop" : ""} />
            <span className={avatar === a.id ? "text-yellow" : "text-dim"}>{a.name}</span>
          </button>
        ))}
      </div>

      <label className="mt-8 block">
        <span className="font-display text-sm text-cyan">Your name</span>
        <input
          className="field mt-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={PLAYER_NAME_MAX}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          placeholder="AAA"
        />
      </label>
      {error && (
        <p role="alert" className="panel panel-cyan mt-4 text-cyan">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Back
        </button>
        <button type="submit" className="btn btn-lg" disabled={!clean || busy}>
          {editing ? "Save changes" : "Join the arcade"}
        </button>
      </div>
    </form>
  );
}

/**
 * "Who is playing?": everyone who has joined, and a way to join. Picking a
 * player goes to the arcade floor. "Change a player" turns the same cards
 * into edit buttons.
 */
export function Players() {
  const { players, error, choosePlayer, reload } = useArcade();
  const [mode, setMode] = useState<"pick" | "edit">("pick");
  const [form, setForm] = useState<{ editing: Player | null } | null>(null);

  if (error) {
    return (
      <main className="screen">
        <Hud />
        <div role="alert" className="panel panel-cyan mx-auto mt-16 max-w-xl text-center">
          <p className="font-display text-sm text-cyan">No signal</p>
          <p className="mt-4">{error}</p>
          <button type="button" className="btn btn-cyan mt-6" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!players) {
    return (
      <main className="screen items-center justify-center">
        <p className="font-display blink text-sm text-dim">Loading</p>
      </main>
    );
  }

  // Nobody yet: the form is the screen.
  const showForm = form ?? (players.length === 0 ? { editing: null } : null);

  return (
    <main className="screen">
      <Hud />
      {showForm ? (
        <PlayerForm
          editing={showForm.editing}
          onCancel={() => (players.length === 0 ? go("home") : setForm(null))}
          onDone={async (p) => {
            await reload();
            setForm(null);
            setMode("pick");
            if (!showForm.editing) {
              sfx.coin();
              choosePlayer(p.id);
              go("lobby");
            }
          }}
        />
      ) : (
        <>
          <h1 className="font-display glow mt-10 mb-0 text-center text-cyan text-[clamp(1rem,3.4vw,1.75rem)]">{mode === "edit" ? "Change which player?" : "Who is playing?"}</h1>
          <div className="mx-auto mt-8 grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                className="panel pick flex flex-col items-center gap-3 py-6"
                onClick={() => {
                  if (mode === "edit") {
                    sfx.tap();
                    setForm({ editing: p });
                    return;
                  }
                  sfx.coin();
                  choosePlayer(p.id);
                  go("lobby");
                }}
              >
                <AvatarSprite avatar={p.avatar} size={88} />
                <span className="font-display text-sm text-magenta">{p.name}</span>
              </button>
            ))}
            {mode === "pick" && (
              <button
                type="button"
                className="panel pick flex flex-col items-center justify-center gap-3 py-6"
                onClick={() => {
                  sfx.tap();
                  setForm({ editing: null });
                }}
              >
                <span className="font-display text-5xl leading-[88px] text-cyan" aria-hidden>
                  +
                </span>
                <span className="font-display text-sm text-cyan">New player</span>
              </button>
            )}
          </div>
          <div className="mt-10 flex justify-center">
            <button type="button" className="btn btn-quiet" onClick={() => setMode(mode === "edit" ? "pick" : "edit")}>
              {mode === "edit" ? "Back" : "Change a player"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
