// npm run speech:build: every clip Sound Machine can play, spoken by one
// voice and written to web/public/speech/sound-machine/ with a manifest.
// The clips are committed; the app only ever fetches them. Nothing at run
// time needs a key or leaves the house.
//
//   node scripts/speech/build.mjs              make what is missing or out of date
//   node scripts/speech/build.mjs --force      make everything again
//   node scripts/speech/build.mjs --only sound-k,word-cat
//   node scripts/speech/build.mjs --check      no network, no key: is every clip there? (npm run speech:check)
//   node scripts/speech/build.mjs --verify     measure every clip and ask speech-to-text what it hears
//
// Making and verifying need AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the
// environment (never in a file here), and ffmpeg on the PATH. One way that
// prints nothing:  node --env-file=<your env file> scripts/speech/build.mjs
// SPEECH_CACHE_DIR=<a folder> keeps what the voice sent, so a recipe's cut can
// be tuned without asking again.
//
// A clip is never edited by hand. Its manifest entry holds what was asked of
// the voice (`ssml`) and what was done to the answer (`post`), so running
// this again makes it again. To change how a sound is said, change its
// recipe below and run this.
//
// The hard part is a sound on its own. Asked for a bare "k" the voice gives
// 70 ms at a whisper, and asked for the letter it says its name. So a stop
// is asked for in front of a vowel ("kuh", slowly) and cut off where the
// voice starts; a hiss is asked for after one ("us") and cut from where the
// voice stops; a sound that hums (m, n, l) is asked for on its own, slowed;
// and a short vowel is cut out of a short word ("it"), because asked for
// alone it drifts ("ee").
// audio.mjs finds those places by measuring, since nobody is listening.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOUNDS, SPEECH_DIR, WORDS, allClips, soundClip, wordClip } from "../../web/shared/soundmachine/words.ts";
import { RATE, finish, measure, pcmOfS16, pcmOfWav, s16Of } from "./audio.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "web/public", SPEECH_DIR);
const MANIFEST = path.join(OUT, "manifest.json");

/** One voice for the whole game. Of the plain en-US voices that take
 *  <phoneme> and <prosody>, this one keeps its short vowels furthest apart
 *  (the i of chick from the e of check) and says a bare sound cleanly. */
const VOICE = "en-US-SaraNeural";
const FORMAT = "mp3, 24 kHz, mono, 64 kbit/s";
const BITRATE = "64k";

// ---------- recipes ----------

const speak = (inner) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${VOICE}">${inner}</voice></speak>`;
const ipa = (ph, text) => `<phoneme alphabet="ipa" ph="${ph}">${text}</phoneme>`;
const rate = (percent, inner) => (percent ? `<prosody rate="${percent}%">${inner}</prosody>` : inner);

/** The vowel a consonant is said against before it is cut away: the "uh" of "sun". */
const CARRIER = "ʌ";

/** How loud each kind of clip is made, in dB (audio.mjs levelOf). A hiss at
 *  a vowel's level would be a shout, so breath sounds sit lower. */
const LEVEL = { word: -20, voiced: -20, stop: -24, hiss: -27, breath: -30 };

/** How each sound is asked for, and which part of the answer is kept. */
const SOUND_RECIPES = {
  // Short vowels: said in a short word that ends without a voice ("at",
  // "it", "etch"), and the vowel cut out. Asked for alone, this voice's short
  // i comes out as "ee" and its short a as "ah"; inside a word they are right.
  a: { say: () => rate(-35, "at."), post: { cut: "voice", levelDb: LEVEL.voiced } },
  e: { say: () => rate(-35, "etch."), post: { cut: "voice", levelDb: LEVEL.voiced } },
  i: { say: () => rate(-35, "it."), post: { cut: "voice", levelDb: LEVEL.voiced } },
  o: { say: (s) => rate(-35, ipa(s.ipa + "t", "ot")), post: { cut: "voice", levelDb: LEVEL.voiced } },
  u: { say: () => rate(-35, "up."), post: { cut: "voice", levelDb: LEVEL.voiced } },
  // Sounds that hum: on their own, slowed, whole. (Three in a row, "nnn",
  // comes out with a vowel in the middle.)
  m: { say: (s) => rate(-50, ipa(s.ipa, "m")), post: { cut: "all", levelDb: LEVEL.voiced } },
  n: { say: (s) => rate(-35, ipa(s.ipa, "n")), post: { cut: "all", levelDb: LEVEL.voiced } },
  l: { say: (s) => rate(-35, ipa(s.ipa, "l")), post: { cut: "all", levelDb: LEVEL.voiced } },
  r: { say: (s) => rate(-40, ipa(s.ipa, "r")), post: { cut: "all", levelDb: LEVEL.voiced } },
  w: { say: (s) => rate(-50, ipa(s.ipa, "w")), post: { cut: "all", levelDb: LEVEL.voiced } },
  // Hisses: after the carrier vowel, cut from where the voice stops.
  f: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "uff")), post: { cut: "after-voice", levelDb: LEVEL.hiss } },
  s: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "us")), post: { cut: "after-voice", levelDb: LEVEL.hiss } },
  sh: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "ush")), post: { cut: "after-voice", levelDb: LEVEL.hiss } },
  th: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "uth")), post: { cut: "after-voice", levelDb: LEVEL.breath } },
  // h is the breath before a vowel.
  h: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "huh")), post: { cut: "before-voice", levelDb: LEVEL.breath } },
  // Stops without a voice: the burst and its breath, cut where the vowel starts.
  k: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "kuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  p: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "puh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  t: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "tuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  ch: { say: (s) => rate(-20, ipa(s.ipa + CARRIER, "chuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  // Stops with a voice cannot be heard with no vowel at all: a sliver is kept.
  b: { say: (s) => ipa(s.ipa + CARRIER, "buh"), post: { cut: "voiced-stop", keepVoicedMs: 70, levelDb: LEVEL.voiced } },
  d: { say: (s) => ipa(s.ipa + CARRIER, "duh"), post: { cut: "voiced-stop", keepVoicedMs: 70, levelDb: LEVEL.voiced } },
  g: { say: (s) => ipa(s.ipa + CARRIER, "guh"), post: { cut: "voiced-stop", keepVoicedMs: 70, levelDb: LEVEL.voiced } },
};

/** The fades each cut gets, in ms: a cut edge needs a longer one than a natural edge. */
const FADES = {
  all: { fadeInMs: 5, fadeOutMs: 20 },
  voice: { fadeInMs: 15, fadeOutMs: 50 },
  "before-voice": { fadeInMs: 5, fadeOutMs: 20 },
  "after-voice": { fadeInMs: 20, fadeOutMs: 20 },
  "voiced-stop": { fadeInMs: 3, fadeOutMs: 40 },
};

/** What each clip is: the SSML sent, and what is done to what comes back. */
function recipes() {
  const out = {};
  for (const s of SOUNDS) {
    const r = SOUND_RECIPES[s.id];
    if (!r) throw new Error(`no recipe for the sound "${s.id}" (scripts/speech/build.mjs SOUND_RECIPES)`);
    out[soundClip(s.id)] = { kind: "sound", provider: "azure", voice: VOICE, ssml: speak(r.say(s)), post: { ...r.post, ...FADES[r.post.cut] } };
  }
  // A word: said plainly, as a sentence of its own so it falls at the end.
  for (const w of WORDS) out[wordClip(w.id)] = { kind: "word", provider: "azure", voice: VOICE, ssml: speak(`${w.id}.`), post: { cut: "all", levelDb: LEVEL.word, ...FADES.all } };
  return out;
}

// ---------- the outside world ----------

class Failed extends Error {}

function env(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Failed(`${name} is not set. Making and verifying clips needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in the environment.`);
  return v;
}

function ffmpeg(args, input) {
  const done = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { input, maxBuffer: 1 << 28 });
  if (done.error?.code === "ENOENT") throw new Failed("ffmpeg is not on the PATH. It cuts and encodes the clips: brew install ffmpeg.");
  if (done.error) throw done.error;
  if (done.status !== 0) throw new Failed(`ffmpeg failed: ${done.stderr.toString().trim()}`);
  return done.stdout;
}

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** POST, waiting and trying again while the service says it is busy. Any
 *  other failure stops the run with the status and what the service said. */
async function post(what, url, headers, body) {
  for (let tries = 1; ; tries++) {
    let res;
    try {
      res = await fetch(url, { method: "POST", headers, body });
    } catch (e) {
      throw new Failed(`${what}: no answer (${e.cause?.code ?? e.message})`);
    }
    if (res.ok) return res;
    if (res.status === 429 && tries < 8) {
      await wait(1500 * tries);
      continue;
    }
    throw new Failed(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
}

/** The voice's answer to one SSML document, as samples. */
async function synthesise(clip, ssml) {
  const cache = process.env.SPEECH_CACHE_DIR;
  const cached = cache && path.join(cache, `${createHash("sha256").update(ssml).digest("hex").slice(0, 32)}.wav`);
  if (cached && fs.existsSync(cached)) return pcmOfWav(fs.readFileSync(cached));
  const res = await post(`speech for ${clip}`, `https://${env("AZURE_SPEECH_REGION")}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY"),
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
    "User-Agent": "speech-build",
  }, ssml);
  const wav = Buffer.from(await res.arrayBuffer());
  if (cached) fs.writeFileSync(cached, wav);
  // Be gentle: the service throttles a burst.
  await wait(200);
  return pcmOfWav(wav);
}

const encode = (pcm) => ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", BITRATE, "-map_metadata", "-1", "-id3v2_version", "0", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "mp3", "pipe:1"], s16Of(pcm));
const decode = (file, hz = RATE) => pcmOfS16(ffmpeg(["-i", file, "-f", "s16le", "-ar", String(hz), "-ac", "1", "pipe:1"]));

/** What speech-to-text makes of a clip: its guesses, best first, in lower case; none when it hears no words. */
async function heard(clip, file) {
  // Half a second of quiet either side: the recogniser does not take a word that starts at once.
  const wav = ffmpeg(["-i", file, "-af", "adelay=500,apad=pad_dur=0.7", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1"]);
  const res = await post(`speech-to-text for ${clip}`, `https://${env("AZURE_SPEECH_REGION")}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`, {
    "Ocp-Apim-Subscription-Key": env("AZURE_SPEECH_KEY"),
    "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
    Accept: "application/json",
  }, wav);
  const reply = await res.json();
  await wait(200);
  return reply.RecognitionStatus === "Success" ? (reply.NBest ?? []).map((n) => String(n.Lexical ?? "").toLowerCase()) : [];
}

// ---------- the manifest ----------

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return { voice: VOICE, format: FORMAT, clips: {} };
    throw new Failed(`${path.relative(ROOT, MANIFEST)} cannot be read: ${e.message}`);
  }
}

/** Keys in order, so a rebuilt manifest differs only where a clip did. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  return value;
}

function writeManifest(clips) {
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ voice: VOICE, format: FORMAT, clips: sorted(clips) }, null, 2)}\n`);
}

const fileOf = (clip) => path.join(OUT, `${clip}.mp3`);
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// ---------- the commands ----------

/** Is every clip there, with its entry, and nothing else? No network. */
function check() {
  const want = allClips();
  const { clips } = readManifest();
  const wrong = [];
  for (const clip of want) {
    if (!Object.hasOwn(clips, clip)) wrong.push(`${clip}: not in the manifest`);
    const size = fs.statSync(fileOf(clip), { throwIfNoEntry: false })?.size ?? 0;
    if (!size) wrong.push(`${clip}: no file, or an empty one`);
    else if (clips[clip] && clips[clip].bytes !== size) wrong.push(`${clip}: the file is ${size} bytes, the manifest says ${clips[clip].bytes}`);
  }
  for (const clip of Object.keys(clips)) if (!want.includes(clip)) wrong.push(`${clip}: in the manifest, but no word or sound has it`);
  const files = fs.existsSync(OUT) ? fs.readdirSync(OUT) : [];
  for (const f of files) if (f !== "manifest.json" && !(f.endsWith(".mp3") && want.includes(f.slice(0, -4)))) wrong.push(`${f}: a stray file`);
  if (wrong.length) throw new Failed(`${wrong.join("\n")}\n${wrong.length} thing(s) wrong under ${path.relative(ROOT, OUT)}. npm run speech:build makes clips; a stray file is yours to remove.`);
  const bytes = want.reduce((sum, clip) => sum + clips[clip].bytes, 0);
  console.log(`${want.length} clips, ${(bytes / 1024).toFixed(0)} KB, all there.`);
}

async function build({ force, only }) {
  const want = recipes();
  for (const clip of only ?? []) if (!Object.hasOwn(want, clip)) throw new Failed(`there is no clip "${clip}"`);
  const { clips } = readManifest();
  fs.mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const [clip, recipe] of Object.entries(want)) {
    const had = clips[clip];
    const current = had && fs.existsSync(fileOf(clip)) && same({ voice: had.voice, ssml: had.ssml, post: had.post }, { voice: recipe.voice, ssml: recipe.ssml, post: recipe.post });
    if (only ? !only.includes(clip) : current && !force) continue;
    let done;
    try {
      done = finish(await synthesise(clip, recipe.ssml), recipe.post);
    } catch (e) {
      if (e instanceof Failed) throw e;
      throw new Failed(`${clip}: ${e.message}`);
    }
    const mp3 = encode(done.pcm);
    fs.writeFileSync(fileOf(clip), mp3);
    clips[clip] = { ...recipe, gainDb: done.gainDb, ms: Math.round((done.pcm.length / RATE) * 1000), bytes: mp3.length };
    // After every clip: a run that stops half way has lost nothing.
    writeManifest(clips);
    made++;
    console.log(`made ${clip} (${clips[clip].ms} ms, ${mp3.length} bytes)`);
  }
  // An entry for a clip no word or sound has any more is dropped; its file is left for check to name.
  for (const clip of Object.keys(clips)) if (!Object.hasOwn(want, clip)) delete clips[clip];
  writeManifest(clips);
  console.log(`${made} made, ${Object.keys(want).length - made} already there.`);
}

/** Letter names: what the voice must never say for a sound. */
const LETTER_NAMES = ["a", "ay", "b", "bee", "be", "c", "see", "sea", "d", "dee", "e", "ee", "f", "eff", "g", "gee", "h", "aitch", "i", "eye", "k", "kay", "l", "el", "m", "em", "n", "en", "o", "oh", "p", "pee", "pea", "r", "are", "s", "es", "ess", "t", "tee", "tea", "u", "you", "w"];
/** Spellings speech-to-text may give that sound the same as a word here. */
const SAME_SOUND = { webb: "web", sac: "sack", sacks: "sax", chic: "chick", cheque: "check", czech: "check", son: "sun", inn: "in" };
const VOICELESS = ["f", "s", "sh", "th", "h", "k", "p", "t", "ch"];

/**
 * Every clip as it is on disk, measured, and what speech-to-text hears in
 * it. A word must be heard as itself. A sound is held to its kind: a
 * voiceless one has no voice in it, a held one lasts, a stop is short, and
 * none is heard as a letter's name. What it cannot say is whether a sound
 * is the right sound: a person has to listen for that (the Sound check page).
 */
async function verify({ only }) {
  check();
  const { clips } = readManifest();
  const held = new Map(SOUNDS.map((s) => [soundClip(s.id), s]));
  const wrong = [];
  console.log("clip          ms  sounds voiced  level  heard        frames (v voiced, u unvoiced, . silent)");
  for (const clip of allClips()) {
    if (only && !only.includes(clip)) continue;
    const m = measure(decode(fileOf(clip)));
    const guesses = await heard(clip, fileOf(clip));
    const said = guesses[0] ?? "";
    const flags = [];
    if (clips[clip].kind === "word") {
      const word = clip.slice(5);
      if (!guesses.some((g) => g === word || SAME_SOUND[g] === word)) flags.push(`heard as "${said}"`);
      if (m.soundMs < 250 || m.soundMs > 1500) flags.push("an odd length for a word");
    } else {
      const s = held.get(clip);
      if (LETTER_NAMES.includes(said) && said !== "") flags.push(`heard as "${said}", which could be a letter's name`);
      if (VOICELESS.includes(s.id) && m.voicedMs > 20) flags.push("a voiceless sound with voice in it");
      if (s.held && (m.soundMs < 150 || m.soundMs > 900)) flags.push("a held sound of an odd length");
      if (!s.held && m.soundMs > 220) flags.push("a stop that goes on");
      if (m.soundMs < 40) flags.push("almost nothing there");
    }
    console.log(`${clip.padEnd(12)} ${String(m.ms).padStart(4)}  ${String(m.soundMs).padStart(5)}  ${String(m.voicedMs).padStart(5)}  ${m.levelDb.toFixed(1).padStart(5)}  ${JSON.stringify(said).padEnd(12)} ${m.track}${flags.length ? `\n    !! ${flags.join("; ")}` : ""}`);
    for (const f of flags) wrong.push(`${clip}: ${f}`);
  }
  if (wrong.length) throw new Failed(`${wrong.length} thing(s) to listen to:\n${wrong.join("\n")}`);
  console.log("Nothing flagged. That is not the same as sounding right: listen on the Sound check page.");
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? (args[onlyAt + 1] ?? "").split(",").filter(Boolean) : null;

try {
  if (flag("--check")) check();
  else if (flag("--verify")) await verify({ only });
  else await build({ force: flag("--force"), only });
} catch (e) {
  if (!(e instanceof Failed)) throw e;
  console.error(e.message);
  process.exit(1);
}
