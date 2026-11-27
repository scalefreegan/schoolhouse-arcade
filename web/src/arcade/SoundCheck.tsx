import { useEffect, useState } from "react";
import { WORDS as RHYME_WORDS, sayUrl, type RhymeWord } from "../../shared/rhymetime/words.ts";
import { WORDS as SIGHT_WORDS, sayUrl as sightUrl, type SightWord } from "../../shared/sightwords/words.ts";
import { LEVELS, SOUNDS, TILE_SOUND, clipUrl, slowClip, soundClip, wordClip, type Word } from "../../shared/soundmachine/words.ts";
import { hush, preload, say } from "../speech.ts";
import { Picture, Sprite } from "../sprites/Sprite.tsx";
import { useArcade } from "../state.tsx";

// The grown-up's Sound check: every sound and every word Sound Machine can
// say, and the words only Rhyme Time has, each with a button, so the
// pronunciation can be listened through in one sitting. The clips are made by `npm run speech:build`; one that sounds
// wrong is fixed there and made again, never edited by hand.

/** The tiles that make a sound: "c k ck" for k. */
const tilesOf = (soundId: string) => Object.keys(TILE_SOUND).filter((t) => TILE_SOUND[t] === soundId);

function WordRow({ word }: { word: Word }) {
  return (
    <li className="panel flex flex-wrap items-center justify-end gap-2">
      <Picture id={word.picture} size={64} className="shrink-0" title={word.id} />
      <span className="flex-1">
        <span className="sm-letter block text-base">{word.id}</span>
        <span className="whitespace-nowrap text-dim">{word.tiles.join("-")}</span>
      </span>
      <button type="button" className="btn btn-quiet" aria-label={`Sound out ${word.id}`} onClick={() => void say([...word.tiles.map((t) => clipUrl(soundClip(TILE_SOUND[t]))), clipUrl(wordClip(word.id))], { gap: 0.3 })}>
        <Sprite id="blend" palette="light" size={30} />
      </button>
      <button type="button" className="btn btn-quiet" aria-label={`Hear ${word.id} slowly`} onClick={() => void say([clipUrl(slowClip(word.id))])}>
        <Sprite id="snail" palette="light" size={30} />
      </button>
      <button type="button" className="btn btn-cyan" aria-label={`Hear ${word.id}`} onClick={() => void say([clipUrl(wordClip(word.id))])}>
        <Sprite id="speaker" palette="ink" size={30} />
      </button>
    </li>
  );
}

/** One of Rhyme Time's own words: one clip, said plainly. */
function RhymeRow({ word }: { word: RhymeWord }) {
  return (
    <li className="panel flex flex-wrap items-center justify-end gap-2">
      <Picture id={word.picture} size={64} className="shrink-0" title={word.id} />
      <span className="sm-letter flex-1 text-base">{word.id}</span>
      <button type="button" className="btn btn-cyan" aria-label={`Hear ${word.id}`} onClick={() => void say([sayUrl(word)])}>
        <Sprite id="speaker" palette="ink" size={30} />
      </button>
    </li>
  );
}

/** One of Sight Word Sprint's words: written, and one clip said plainly. */
function SightRow({ word }: { word: SightWord }) {
  return (
    <li className="panel flex flex-wrap items-center justify-end gap-2">
      <span className="sm-letter flex-1 text-base">{word.id}</span>
      <button type="button" className="btn btn-cyan" aria-label={`Hear ${word.id}`} onClick={() => void say([sightUrl(word)])}>
        <Sprite id="speaker" palette="ink" size={30} />
      </button>
    </li>
  );
}

export function SoundCheck({ onBack }: { onBack: () => void }) {
  const { muted, setMuted } = useArcade();
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    // Every clip a button here plays, the slow words too: one that is missing is said so, not left silent.
    const words = LEVELS.flatMap((l) => l.focus);
    const all = [...SOUNDS.map((s) => clipUrl(soundClip(s.id))), ...words.map((w) => clipUrl(wordClip(w.id))), ...words.map((w) => clipUrl(slowClip(w.id))), ...RHYME_WORDS.filter((w) => !w.shared).map(sayUrl), ...SIGHT_WORDS.map(sightUrl)];
    preload(all).catch((e: unknown) => setMissing(e instanceof Error ? e.message : String(e)));
    return hush;
  }, []);

  return (
    <main className="screen">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display glow m-0 text-base text-cyan">Sound check</h1>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </header>
      <p className="mt-3 mb-0 text-dim">Every sound and word Sound Machine says, the words only Rhyme Time has (its others are these), and Sight Word Sprint's words. A sound should be the pure sound a teacher says (mmm, sss, a clipped k), never the letter's name. One that is wrong is made again with npm run speech:build.</p>
      {muted && (
        <p role="alert" className="panel panel-cyan mt-3 flex flex-wrap items-center gap-4">
          <span className="flex-1">The sound is off, so nothing will play.</span>
          <button type="button" className="btn btn-cyan" onClick={() => setMuted(false)}>
            Turn sound on
          </button>
        </p>
      )}
      {missing && (
        <p role="alert" className="panel panel-cyan mt-3 text-cyan">
          {missing}
        </p>
      )}

      <h2 className="font-display mt-6 mb-0 text-xs text-dim">Sounds ({SOUNDS.length})</h2>
      <ul className="m-0 mt-1 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 lg:grid-cols-6">
        {SOUNDS.map((s) => (
          <li key={s.id}>
            <button type="button" className="panel pick flex w-full flex-col items-center gap-1" data-sound={s.id} onClick={() => void say([clipUrl(soundClip(s.id))])}>
              <span className="sm-letter text-xl text-cyan">{tilesOf(s.id).join(" ")}</span>
              <span className="text-dim">
                /{s.ipa}/ {s.as}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {LEVELS.slice(0, -1).map((l) => (
        <section key={l.id}>
          <h2 className="font-display mt-6 mb-0 text-xs text-dim">
            Level: {l.title} ({l.focus.length} words)
          </h2>
          <ul className="m-0 mt-1 grid list-none gap-x-3 p-0 sm:grid-cols-2">
            {l.focus.map((w) => (
              <WordRow key={w.id} word={w} />
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h2 className="font-display mt-6 mb-0 text-xs text-dim">Level: Mix (every word above with a digraph, and these)</h2>
        <ul className="m-0 mt-1 grid list-none gap-x-3 p-0 sm:grid-cols-2">
          {LEVELS[LEVELS.length - 1].focus
            .filter((w) => !LEVELS.slice(0, -1).some((l) => l.focus.includes(w)))
            .map((w) => (
              <WordRow key={w.id} word={w} />
            ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display mt-6 mb-0 text-xs text-dim">Rhyme Time's own words ({RHYME_WORDS.filter((w) => !w.shared).length})</h2>
        <ul className="m-0 mt-1 grid list-none gap-x-3 p-0 sm:grid-cols-2">
          {RHYME_WORDS.filter((w) => !w.shared).map((w) => (
            <RhymeRow key={w.id} word={w} />
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display mt-6 mb-0 text-xs text-dim">Sight Word Sprint's words ({SIGHT_WORDS.length})</h2>
        <ul className="m-0 mt-1 grid list-none gap-x-3 p-0 sm:grid-cols-2">
          {SIGHT_WORDS.map((w) => (
            <SightRow key={w.id} word={w} />
          ))}
        </ul>
      </section>
    </main>
  );
}
