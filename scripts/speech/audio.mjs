// Measuring and cutting speech, for build.mjs. Nobody listens while the
// clips are made, so the script has to tell a hiss from a hum on its own:
// every 10 ms of a clip is silent, voiced (the throat is humming: a vowel,
// m, b) or unvoiced (breath and hiss only: s, k, th). That is enough to cut
// the "k" off the front of "kuh" exactly where the "uh" starts.
//
// Plain ESM, no dependencies. Samples are Float32Array, mono, RATE Hz.

export const RATE = 24_000;
/** A frame is 30 ms long and they start 10 ms apart. */
export const HOP_MS = 10;
const HOP = (RATE * HOP_MS) / 1000;
const WIN = HOP * 3;
/** Below this a frame is silence. The voice's own silence is under -75 dB;
 *  the quietest sound kept, the "th" of bath, is about -50. */
export const SILENT_DB = -58;
/** Below this a frame is too faint to call voiced or not. */
const FAINT_DB = -45;

/** The samples of a 16-bit mono RIFF file. */
export function pcmOfWav(wav) {
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = wav.toString("ascii", at, at + 4);
    const size = wav.readUInt32LE(at + 4);
    if (id === "data") {
      // A streamed file may claim no length, or more than it has.
      const end = size > 0 && at + 8 + size <= wav.length ? at + 8 + size : wav.length;
      const n = Math.floor((end - at - 8) / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = wav.readInt16LE(at + 8 + i * 2) / 32768;
      return out;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("not a RIFF file with sound in it");
}

/** Samples as raw 16-bit little-endian, for ffmpeg's stdin. */
export function s16Of(x) {
  const b = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
  return b;
}

/** Raw 16-bit little-endian as samples. */
export function pcmOfS16(b) {
  const out = new Float32Array(Math.floor(b.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(i * 2) / 32768;
  return out;
}

/**
 * Every frame of a clip: its level in dB, and whether it is silent ("."),
 * voiced ("v") or unvoiced ("u"). Voiced means it repeats at the pitch of a
 * voice (70-400 Hz) and does not hiss; a frame too faint to tell is "u".
 */
export function frames(x) {
  const out = [];
  for (let s = 0; s + WIN <= x.length; s += HOP) {
    let energy = 0;
    let crossings = 0;
    for (let i = s; i < s + WIN; i++) {
      energy += x[i] * x[i];
      if (i > s && x[i] >= 0 !== x[i - 1] >= 0) crossings++;
    }
    const db = 10 * Math.log10(energy / WIN + 1e-12);
    let periodic = 0;
    if (db >= FAINT_DB) {
      for (let lag = RATE / 400; lag <= RATE / 70; lag += 2) {
        let ac = 0;
        let e1 = 0;
        let e2 = 0;
        for (let i = s; i + lag < s + WIN; i++) {
          ac += x[i] * x[i + lag];
          e1 += x[i] * x[i];
          e2 += x[i + lag] * x[i + lag];
        }
        periodic = Math.max(periodic, ac / Math.sqrt(e1 * e2 + 1e-12));
      }
    }
    const kind = db < SILENT_DB ? "." : periodic > 0.55 && crossings / WIN < 0.15 ? "v" : "u";
    out.push({ db, kind });
  }
  return out;
}

/** A clip in numbers: how long it sounds, how much of that is voiced, how loud. */
export function measure(x) {
  const f = frames(x);
  const kinds = f.map((q) => q.kind).join("");
  const first = kinds.search(/[uv]/);
  const last = Math.max(kinds.lastIndexOf("u"), kinds.lastIndexOf("v"));
  const count = (k) => kinds.split(k).length - 1;
  return {
    ms: Math.round((x.length / RATE) * 1000),
    soundMs: first < 0 ? 0 : (last - first + 1) * HOP_MS,
    voicedMs: count("v") * HOP_MS,
    unvoicedMs: count("u") * HOP_MS,
    levelDb: Math.round(levelOf(x) * 10) / 10,
    track: first < 0 ? "" : kinds.slice(first, last + 1),
  };
}

/** The level of the part of a clip that sounds: RMS over the frames within
 *  20 dB of its loudest, in dB. -Infinity for silence. */
export function levelOf(x) {
  const f = frames(x);
  if (!f.length) return -Infinity;
  const peak = Math.max(...f.map((q) => q.db));
  const loud = f.filter((q) => q.db > peak - 20 && q.db >= SILENT_DB);
  if (!loud.length) return -Infinity;
  return 10 * Math.log10(loud.reduce((sum, q) => sum + 10 ** (q.db / 10), 0) / loud.length);
}

const at = (frame) => frame * HOP;
const samples = (ms) => Math.round((RATE * ms) / 1000);

/** The longest run of voiced frames, which in a carrier syllable is its
 *  vowel: its first and last frame. Null when nothing hums for 30 ms. */
function vowelRun(kinds) {
  let best = null;
  for (const m of kinds.matchAll(/v{3,}/g)) if (!best || m[0].length > best[0].length) best = m;
  return best ? { first: best.index, last: best.index + best[0].length - 1 } : null;
}

/**
 * The part of a clip a recipe asks for, as [start, end) in samples.
 *   all            everything that sounds
 *   voice          the vowel alone: the "i" of "if"
 *   before-voice   the breath and hiss right before the vowel: the "k" of
 *                  "kuh", the "h" of "huh"
 *   after-voice    from where the voice stops to the last sound: the "s" of "us"
 *   voiced-stop    from the first sound to `keepVoicedMs` into the vowel:
 *                  the "b" of "buh", with as little "uh" as still lets it
 *                  be heard
 * Throws when the clip has no such part: a recipe that no longer fits what
 * the voice says must not pass quietly.
 */
export function partOf(x, post) {
  const f = frames(x);
  const kinds = f.map((q) => q.kind).join("");
  const first = kinds.search(/[uv]/);
  if (first < 0) throw new Error("the clip is silent");
  const last = Math.max(kinds.lastIndexOf("u"), kinds.lastIndexOf("v"));
  const whole = [Math.max(0, at(first) - samples(5)), Math.min(x.length, at(last) + WIN)];
  if (post.cut === "all") return whole;
  const vowel = vowelRun(kinds);
  if (!vowel) throw new Error(`no voice in the clip to cut at (${kinds})`);
  if (post.cut === "voice") {
    // In from each end: the edges of a vowel lean towards its neighbours.
    const span = [at(vowel.first) + HOP, at(vowel.last) + HOP];
    if (span[1] - span[0] < samples(150)) throw new Error(`the vowel is too short (${kinds})`);
    return span;
  }
  if (post.cut === "before-voice") {
    // The unvoiced frames that run up to the vowel, and nothing before them.
    let start = vowel.first;
    while (start > 0 && kinds[start - 1] === "u") start--;
    // The vowel's first frame holds the start of the voice somewhere in its
    // 30 ms; stop just inside it, and the fade takes the rest.
    const span = [Math.max(0, at(start) - samples(5)), at(vowel.first) + HOP / 2];
    if (span[1] - span[0] < samples(50)) throw new Error(`nothing before the voice (${kinds})`);
    return span;
  }
  if (post.cut === "voiced-stop") return [whole[0], Math.min(whole[1], at(vowel.first) + HOP + samples(post.keepVoicedMs))];
  if (post.cut === "after-voice") {
    const start = at(kinds.lastIndexOf("v")) + WIN;
    if (whole[1] - start < samples(80)) throw new Error(`nothing after the voice (${kinds})`);
    return [start, whole[1]];
  }
  throw new Error(`unknown cut "${post.cut}"`);
}

/**
 * A hiss or a breath made to last `want` samples. Slowing one down the way
 * a voice is slowed repeats little pieces of it, and repeated noise rings
 * like a note. A hiss is the same all the way through, so more of it is
 * made instead: short grains taken from its middle at places that do not
 * repeat (always the same places, so the same clip comes out every time),
 * laid over each other, and set between its own beginning and end.
 */
function longerHiss(part, want) {
  const more = want - part.length;
  if (more <= 0) return part;
  const mid = [Math.floor(part.length * 0.25), Math.floor(part.length * 0.75)];
  const grain = Math.min(samples(60), (mid[1] - mid[0]) & ~1);
  if (grain < samples(20)) throw new Error("too short a hiss to make longer");
  // Within a grain of long enough already.
  if (more < grain) return part;
  const half = grain / 2;
  const join = Math.floor(part.length / 2);
  // The new middle, with half a grain at each end to cross over into.
  const fill = new Float32Array(more + grain);
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) | 0;
    return ((seed ^ (seed >>> 13)) >>> 0) / 2 ** 32;
  };
  // Sine-shaped grains half overlapped: their powers add up to one.
  for (let at0 = -half; at0 < fill.length; at0 += half) {
    const from = mid[0] + Math.floor(rnd() * (mid[1] - mid[0] - grain + 1));
    for (let i = 0; i < grain; i++) {
      const to = at0 + i;
      if (to >= 0 && to < fill.length) fill[to] += part[from + i] * Math.sin((Math.PI * (i + 0.5)) / grain);
    }
  }
  const out = new Float32Array(part.length + more);
  out.set(part.subarray(0, join - half), 0);
  for (let i = 0; i < grain; i++) {
    const t = (i + 0.5) / grain;
    // In: the hiss's own first half gives way to the new middle; out: the other way.
    out[join - half + i] = part[join - half + i] * Math.cos((Math.PI / 2) * t) + fill[i] * Math.sin((Math.PI / 2) * t);
  }
  out.set(fill.subarray(grain, more), join + half);
  for (let i = 0; i < grain; i++) {
    const t = (i + 0.5) / grain;
    out[join - half + more + i] = fill[more + i] * Math.cos((Math.PI / 2) * t) + part[join - half + i] * Math.sin((Math.PI / 2) * t);
  }
  out.set(part.subarray(join + half), join + half + more);
  return out;
}

/**
 * A recipe's `post` applied: the part cut out, held longer if the recipe
 * asks (`holdMs`: a sound a teacher would hold, stretched to at least that;
 * `tempo`: the whole thing slowed to that share of its speed), faded in and
 * out so it does not click, brought to `levelDb` (never past -1 dB at its
 * peak), with a little silence either side (`tailMs` after it).
 * `stretch(samples, tempo)` does the slowing without changing the pitch.
 * Returns the samples and the gain it took.
 */
export function finish(x, post, stretch) {
  const [start, end] = partOf(x, post);
  let part = Float32Array.from(x.subarray(start, end));
  if (post.hold === "hiss") part = longerHiss(part, samples(post.holdMs));
  else {
    const tempo = post.tempo ?? (post.holdMs && part.length < samples(post.holdMs) ? Math.max(0.4, part.length / samples(post.holdMs)) : 1);
    if (tempo < 0.999) part = Float32Array.from(stretch(part, tempo));
  }
  const fadeIn = Math.min(samples(post.fadeInMs), part.length >> 1);
  const fadeOut = Math.min(samples(post.fadeOutMs), part.length >> 1);
  for (let i = 0; i < fadeIn; i++) part[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) part[part.length - 1 - i] *= i / fadeOut;
  const level = levelOf(part);
  if (!Number.isFinite(level)) throw new Error("the part cut out is silent");
  let peak = 0;
  for (const v of part) peak = Math.max(peak, Math.abs(v));
  const gainDb = Math.min(post.levelDb - level, -1 - 20 * Math.log10(peak));
  const gain = 10 ** (gainDb / 20);
  const lead = samples(10);
  const out = new Float32Array(lead + part.length + samples(post.tailMs ?? 40));
  for (let i = 0; i < part.length; i++) out[lead + i] = part[i] * gain;
  return { pcm: out, gainDb: Math.round(gainDb * 10) / 10 };
}
