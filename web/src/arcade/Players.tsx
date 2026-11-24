import { useState, type FormEvent } from "react";
import { CHARACTERS, COLOUR_NAMES, PLAYER_NAME_MAX, cleanPlayerName, lookOf } from "../../shared/avatars.ts";
import type { Player } from "../../shared/wire.ts";
import { ApiError, addPlayer, changePlayer } from "../api/client.ts";
import { go } from "../router.ts";
import { sfx } from "../sound.ts";
import { AvatarSprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";
import { Hud } from "./Hud.tsx";

/**
 * The form for a new player, or for changing one: a character, its colour
 * and a name. The colours are the chosen character itself, once in each.
 * On a tablet the characters sit beside the rest, so nothing scrolls.
 */
function PlayerForm({ editing, onDone, onCancel }: { editing: Player | null; onDone: (p: Player) => void; onCancel: () => void }) {
  // An old id opens as its character with its colour chosen.
  const [first] = useState(() => (editing ? lookOf(editing.avatar, editing.colour) : { character: CHARACTERS[0], colour: CHARACTERS[0].colours[0] }));
  const [character, setCharacter] = useState(first.character);
  const [colour, setColour] = useState(first.colour);
  const [name, setName] = useState(editing?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanPlayerName(name);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    // A look left as it was is not sent, so a rename keeps an old id as it is.
    const look = { avatar: character.id, colour };
    const changedLook = !editing || character.id !== first.character.id || colour !== first.colour;
    try {
      onDone(editing ? await changePlayer(editing.id, { name: clean, ...(changedLook ? look : {}) }) : await addPlayer({ name: clean, ...look }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto mt-6 w-full max-w-4xl">
      <h2 className="font-display glow m-0 text-center text-base text-cyan">{editing ? `Change ${editing.name}` : "Pick your character"}</h2>
      <div className="mt-6 grid items-start gap-x-8 gap-y-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Character">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="panel pick flex min-w-0 flex-col items-center gap-1 px-1 py-2"
              aria-pressed={character.id === c.id}
              onClick={() => {
                sfx.tap();
                // A new pick arrives looking as it does in the grid.
                if (c.id !== character.id) setColour(c.colours[0]);
                setCharacter(c);
              }}
            >
              <AvatarSprite avatar={c.id} colour={character.id === c.id ? colour : null} size={64} className={`max-w-full ${character.id === c.id ? "hop" : ""}`} />
              <span className={`text-lg leading-none ${character.id === c.id ? "text-yellow" : "text-dim"}`}>{c.name}</span>
            </button>
          ))}
        </div>

        <div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Colour">
            {character.colours.map((k) => (
              <button
                key={k}
                type="button"
                className="panel pick flex min-w-0 items-center justify-center p-1"
                aria-pressed={colour === k}
                aria-label={COLOUR_NAMES[k] ?? k}
                onClick={() => {
                  sfx.tap();
                  setColour(k);
                }}
              >
                <AvatarSprite avatar={character.id} colour={k} size={48} className="max-w-full" />
              </button>
            ))}
          </div>

          <label className="mt-6 block">
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

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Back
            </button>
            <button type="submit" className="btn btn-lg" disabled={!clean || busy}>
              {editing ? "Save changes" : "Join the arcade"}
            </button>
          </div>
        </div>
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
                <AvatarSprite avatar={p.avatar} colour={p.colour} size={88} />
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
