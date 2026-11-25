// Spoken clips: real recorded-style speech, made ahead of time by
// `npm run speech:build` and served as static files (web/public/speech/).
// Nothing here calls out of the house; a clip is fetched from the Mac once,
// decoded, and kept.
//
// Clips play through the same audio context as the arcade's beeps
// (sound.ts), so the tap that wakes one wakes the other (a browser lets
// sound start only from a tap), and the sound switch silences both.
//
// A clip that cannot be had (not there, not sound, or too slow in coming)
// is left out of what is said and never holds anything up: one silent tile
// is better than a dead screen. A game says which clips it cannot start a
// round without (preload's `need`).

import { audio } from "./sound.ts";

/** How long one clip may take to arrive before it is given up on (ms). */
export const CLIP_WAIT_MS = 8_000;

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();
/** Clips that could not be had when last asked for: say() does not wait on them again. */
const missing = new Set<string>();
/** What is playing now, or queued to. */
let playing: AudioBufferSourceNode[] = [];
let turn = 0;

/** Why a clip could not be had, in words for a screen a child reads. */
export type ClipTrouble = "away" | "slow" | "missing";
export const CLIP_TROUBLE: Record<ClipTrouble, string> = {
  away: "The arcade's computer is not answering. Ask a grown-up to check that it is switched on.",
  slow: "The sounds are taking too long to come. Try again.",
  missing: "Some of this game's sounds are missing. Ask a grown-up to look.",
};

class ClipError extends Error {
  trouble: ClipTrouble;
  constructor(trouble: ClipTrouble, detail: string) {
    super(detail);
    this.trouble = trouble;
  }
}

/** Decoding needs a context but not a running one: with the sound off there
 *  is still something to decode with, so a round can be made ready. */
let decoder: BaseAudioContext | null = null;
function decodeWith(): BaseAudioContext {
  return audio() ?? (decoder ??= new OfflineAudioContext(1, 1, 44_100));
}

async function fetchClip(url: string): Promise<AudioBuffer> {
  let res: Response;
  let bytes: ArrayBuffer;
  try {
    // The time allowed covers the whole clip arriving, not only its first byte.
    const signal = AbortSignal.timeout(CLIP_WAIT_MS);
    res = await fetch(url, { signal });
    if (!res.ok) throw new ClipError("missing", `${url}: the server answered ${res.status}`);
    // A server that has no such file may answer with a page instead (the dev server does).
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("audio/")) throw new ClipError("missing", `${url}: not a sound (${type || "no type"})`);
    bytes = await res.arrayBuffer();
  } catch (e) {
    if (e instanceof ClipError) throw e;
    const name = e instanceof Error ? e.name : "";
    throw new ClipError(name === "TimeoutError" || name === "AbortError" ? "slow" : "away", `${url}: ${name === "TimeoutError" || name === "AbortError" ? "took too long" : "no answer"}`);
  }
  try {
    return await decodeWith().decodeAudioData(bytes);
  } catch {
    throw new ClipError("missing", `${url}: it cannot be played (not an mp3?)`);
  }
}

function load(url: string): Promise<AudioBuffer> {
  const had = buffers.get(url);
  if (had) return Promise.resolve(had);
  let wait = loading.get(url);
  if (!wait) {
    wait = fetchClip(url).then(
      (buffer) => {
        buffers.set(url, buffer);
        missing.delete(url);
        loading.delete(url);
        return buffer;
      },
      (e: unknown) => {
        // Nothing failed is kept: the next asking tries again from the start.
        loading.delete(url);
        missing.add(url);
        throw e;
      },
    );
    loading.set(url, wait);
  }
  return wait;
}

/**
 * Fetch and decode clips before a round, so that playing one later starts
 * at once. `need` are the clips the round cannot be played without: if one
 * cannot be had this rejects, with a sentence fit for the player's screen
 * (what exactly went wrong goes to the console, for a grown-up). `want` are
 * tried just the same, but a round starts without any of them that fail.
 * Never waits longer than CLIP_WAIT_MS.
 */
export async function preload(need: string[], want: string[] = []): Promise<void> {
  const needed = [...new Set(need)];
  const all = [...new Set([...need, ...want])];
  const got = await Promise.allSettled(all.map(load));
  const failed = got.flatMap((g, i) => (g.status === "rejected" ? [{ url: all[i], why: g.reason as unknown }] : []));
  if (failed.length) console.error(`Speech: ${failed.length} of ${all.length} clips could not be loaded. npm run speech:check says whether the files are there.`, failed.map((f) => (f.why instanceof Error ? f.why.message : f.url)));
  const fatal = failed.filter((f) => needed.includes(f.url));
  if (!fatal.length) return;
  const troubles = fatal.map((f) => (f.why instanceof ClipError ? f.why.trouble : "missing"));
  // If the Mac is not there at all, say that; then slowness; then a file that is not there.
  throw new Error(CLIP_TROUBLE[troubles.includes("away") ? "away" : troubles.includes("slow") ? "slow" : "missing"]);
}

/**
 * Something is being said now, or is queued to be: whatever say() started
 * last, even if it cut short an earlier say() (whose promise still waits out
 * its own time). For a sound that must not land on speech.
 */
export function speaking(): boolean {
  return playing.length > 0;
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
 * Say these clips one after another. `gap` is the quiet between them in
 * seconds: one number, or a function of the clip just said (its place in
 * `urls`). Whatever was being said stops first: a new tap is a new thing to
 * hear. `onEach` is called as each clip starts (to light the tile it
 * belongs to). A clip that cannot be had is left out. Resolves when the last
 * has ended (or at once when the sound is off, or when something newer cut
 * it short).
 */
export async function say(urls: string[], opts: { gap?: number | ((index: number) => number); onEach?: (index: number) => void } = {}): Promise<void> {
  hush();
  const mine = turn;
  const ac = audio();
  if (!ac || !urls.length) return;
  // A clip known to be missing is not waited for again here; preload tries it afresh.
  const found = await Promise.all(urls.map((url) => buffers.get(url) ?? (missing.has(url) ? null : load(url).catch(() => null))));
  if (mine !== turn) return;
  const clips = found.flatMap((buffer, index) => (buffer ? [{ buffer, index }] : []));
  if (!clips.length) return;
  const gapAfter = (index: number) => (typeof opts.gap === "function" ? opts.gap(index) : (opts.gap ?? 0.12));
  let at = ac.currentTime + 0.03;
  await new Promise<void>((done) => {
    clips.forEach(({ buffer, index }, i) => {
      const node = ac.createBufferSource();
      node.buffer = buffer;
      node.connect(ac.destination);
      node.start(at);
      const delay = Math.max(0, (at - ac.currentTime) * 1000);
      if (opts.onEach) window.setTimeout(() => mine === turn && opts.onEach?.(index), delay);
      if (i === clips.length - 1) node.onended = () => done();
      // A clip that has finished is no longer being said (speaking()).
      node.addEventListener("ended", () => {
        playing = playing.filter((n) => n !== node);
      });
      playing.push(node);
      at += buffer.duration + gapAfter(index);
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
