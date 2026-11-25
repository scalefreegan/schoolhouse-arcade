// Spoken clips: real recorded-style speech, made ahead of time by
// `npm run speech:build` and served as static files (web/public/speech/).
// Nothing here calls out of the house; a clip is fetched from the Mac once,
// decoded, and kept.
//
// Clips play through the same audio context as the arcade's beeps
// (sound.ts), so the tap that wakes one wakes the other (a browser lets
// sound start only from a tap), and the sound switch silences both.

import { audio } from "./sound.ts";

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
/** What is playing now, or queued to. */
let playing: AudioBufferSourceNode[] = [];
let turn = 0;

/** Decoding needs a context but not a running one: with the sound off there
 *  is still something to decode with, so a round can be made ready. */
let decoder: BaseAudioContext | null = null;
function decodeWith(): BaseAudioContext {
  return audio() ?? (decoder ??= new OfflineAudioContext(1, 1, 44_100));
}

async function load(url: string): Promise<AudioBuffer> {
  const had = buffers.get(url);
  if (had) return had;
  let wait = loading.get(url);
  if (!wait) {
    wait = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The sound ${url} is missing (${res.status}).`);
      const buffer = await decodeWith().decodeAudioData(await res.arrayBuffer());
      buffers.set(url, buffer);
      return buffer;
    })();
    loading.set(url, wait);
    // A failed fetch may be tried again.
    wait.catch(() => loading.delete(url));
  }
  return wait;
}

/** Fetch and decode these clips, so that playing one later starts at once.
 *  Rejects if any is missing: a round should not begin without its sounds. */
export async function preload(urls: string[]): Promise<void> {
  try {
    await Promise.all([...new Set(urls)].map(load));
  } catch (e) {
    throw new Error(e instanceof TypeError ? "The arcade's computer is not answering. Ask a grown-up to check that it is switched on." : e instanceof Error ? e.message : String(e));
  }
}

/** Stop whatever is being said. */
export function hush(): void {
  turn++;
  for (const node of playing) {
    try {
      node.onended = null;
      node.stop();
    } catch {
      /* it had already ended */
    }
  }
  playing = [];
}

/**
 * Say these clips one after another, `gap` seconds apart. Whatever was
 * being said stops first: a new tap is a new thing to hear. `onEach` is
 * called as each clip starts (to light the tile it belongs to). Resolves
 * when the last has ended (or at once when the sound is off, or when
 * something newer cut it short).
 */
export async function say(urls: string[], opts: { gap?: number; onEach?: (index: number) => void } = {}): Promise<void> {
  hush();
  const mine = turn;
  const ac = audio();
  if (!ac || !urls.length) return;
  let clips: AudioBuffer[];
  try {
    clips = await Promise.all(urls.map(load));
  } catch {
    return;
  }
  if (mine !== turn) return;
  const gap = opts.gap ?? 0.12;
  let at = ac.currentTime + 0.03;
  await new Promise<void>((done) => {
    clips.forEach((buffer, i) => {
      const node = ac.createBufferSource();
      node.buffer = buffer;
      node.connect(ac.destination);
      node.start(at);
      const delay = Math.max(0, (at - ac.currentTime) * 1000);
      if (opts.onEach) window.setTimeout(() => mine === turn && opts.onEach?.(i), delay);
      if (i === clips.length - 1) node.onended = () => done();
      playing.push(node);
      at += buffer.duration + gap;
    });
    // If this was cut short, hush() dropped the callbacks: let go when the time is up.
    window.setTimeout(done, (at - ac.currentTime) * 1000 + 250);
  });
}

/** For the tests in a browser: how many clips are decoded, and their total length in seconds. */
export function decoded(): { clips: number; seconds: number } {
  let seconds = 0;
  for (const b of buffers.values()) seconds += b.duration;
  return { clips: buffers.size, seconds };
}
