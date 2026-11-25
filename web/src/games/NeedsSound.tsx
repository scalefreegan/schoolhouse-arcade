import { sfx } from "../sound.ts";
import { Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";

// For a game that is its sounds (Sound Machine, Rhyme Time): with the sound
// switched off it will not start a round in silence. The set-up screen shows
// NeedsSound in place of starting; a round under way shows SoundOff over it.

/** On the set-up screen: the sound is off, and a way to turn it on. */
export function NeedsSound() {
  const { setMuted } = useArcade();
  return (
    <div role="alert" className="panel panel-cyan mt-4 flex flex-wrap items-center justify-center gap-4 text-center">
      <p className="m-0">
        <span className="font-display text-sm text-cyan">This game needs sound.</span>
        <br />
        The sound is off.
      </p>
      <button
        type="button"
        className="btn btn-cyan"
        onClick={() => {
          setMuted(false);
          sfx.coin();
        }}
      >
        <Sprite id="speaker" palette="ink" size={30} />
        Turn sound on
      </button>
    </div>
  );
}

/** Over a round: the sound was switched off, so the round waits. Turning it on resumes it (`onResume`). */
export function SoundOff({ onQuit, onResume }: { onQuit: () => void; onResume: () => void }) {
  const { setMuted } = useArcade();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-tube/90 p-4" role="dialog" aria-modal="true" aria-label="The sound is off">
      <div className="panel panel-cyan max-w-md text-center">
        <p className="font-display glow m-0 text-base text-cyan">This game needs sound.</p>
        <p className="mt-4">The sound is off.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-quiet" onClick={onQuit}>
            Stop the round
          </button>
          <button
            type="button"
            className="btn btn-cyan"
            autoFocus
            onClick={() => {
              setMuted(false);
              sfx.coin();
              onResume();
            }}
          >
            <Sprite id="speaker" palette="ink" size={30} />
            Turn sound on
          </button>
        </div>
      </div>
    </div>
  );
}
