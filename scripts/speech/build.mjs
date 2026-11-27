// npm run speech:build: every clip Sound Machine, Rhyme Time and Sight Word
// Sprint can play, spoken by one voice and written with a manifest to
// web/public/speech/sound-machine/ (Sound Machine's sounds and words, which
// Rhyme Time says too), web/public/speech/rhyme-time/ (the words only
// Rhyme Time has) and web/public/speech/sight-word-sprint/ (its sight
// words). The clips are committed; the app only ever fetches them.
// Nothing at run time needs a key or leaves the house.
//
//   node scripts/speech/build.mjs              make what is missing or out of date
//   node scripts/speech/build.mjs --force      make everything again
//   node scripts/speech/build.mjs --only sound-k,word-cat
//   node scripts/speech/build.mjs --check      no network, no key: is every clip there? (npm run speech:check)
//   node scripts/speech/build.mjs --verify     measure every clip and ask speech-to-text what it hears
//                                 (--match -slow: only the clips with that in their name)
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
import { SPEECH_DIR as RHYME_DIR, WORDS as RHYME_WORDS, ownClips } from "../../web/shared/rhymetime/words.ts";
import { SPEECH_DIR as SIGHT_DIR, WORDS as SIGHT_WORDS, allClips as sightClips, sightClip } from "../../web/shared/sightwords/words.ts";
import { SOUNDS, SPEECH_DIR, WORDS, allClips, slowClip, soundClip, wordClip } from "../../web/shared/soundmachine/words.ts";
import { RATE, finish, measure, pcmOfS16, pcmOfWav, s16Of } from "./audio.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

/** How loud each kind of clip is made, in dB (audio.mjs levelOf): one
 *  confident loudness. A hiss at a vowel's level is a shout, so breath
 *  sounds sit a little lower, and no further. */
const LEVEL = { word: -20, voiced: -20, stop: -20, hiss: -22, breath: -23 };

/** How long a sound that can be held is held, in ms: the way a teacher
 *  says "mmmm" to a child, not the way it passes inside a word. What the
 *  voice gives is stretched to this (never to more than 2.5 times). */
const HOLD = { vowel: 700, hum: 750, hiss: 750, breath: 380 };

/** How each sound is asked for, and which part of the answer is kept. */
const SOUND_RECIPES = {
  // Short vowels: said in a short word that ends without a voice ("at",
  // "it", "etch"), and the vowel cut out and held. Asked for alone, this
  // voice's short i comes out as "ee" and its short a as "ah"; inside a word
  // they are right.
  a: { say: () => rate(-50, "at."), post: { cut: "voice", holdMs: HOLD.vowel, levelDb: LEVEL.voiced } },
  e: { say: () => rate(-50, "etch."), post: { cut: "voice", holdMs: HOLD.vowel, levelDb: LEVEL.voiced } },
  i: { say: () => rate(-50, "it."), post: { cut: "voice", holdMs: HOLD.vowel, levelDb: LEVEL.voiced } },
  o: { say: (s) => rate(-50, ipa(s.ipa + "t", "ot")), post: { cut: "voice", holdMs: HOLD.vowel, levelDb: LEVEL.voiced } },
  u: { say: () => rate(-50, "up."), post: { cut: "voice", holdMs: HOLD.vowel, levelDb: LEVEL.voiced } },
  // Sounds that hum: on their own, slowed, whole, held. (Three in a row,
  // "nnn", comes out with a vowel in the middle.)
  m: { say: (s) => rate(-50, ipa(s.ipa, "m")), post: { cut: "all", holdMs: HOLD.hum, levelDb: LEVEL.voiced, fadeInMs: 20, fadeOutMs: 70 } },
  n: { say: (s) => rate(-35, ipa(s.ipa, "n")), post: { cut: "all", holdMs: HOLD.hum, levelDb: LEVEL.voiced, fadeInMs: 20, fadeOutMs: 70 } },
  l: { say: (s) => rate(-35, ipa(s.ipa, "l")), post: { cut: "all", holdMs: HOLD.hum, levelDb: LEVEL.voiced, fadeInMs: 20, fadeOutMs: 70 } },
  r: { say: (s) => rate(-40, ipa(s.ipa, "r")), post: { cut: "all", holdMs: HOLD.hum, levelDb: LEVEL.voiced, fadeInMs: 20, fadeOutMs: 70 } },
  w: { say: (s) => rate(-50, ipa(s.ipa, "w")), post: { cut: "all", holdMs: HOLD.hum, levelDb: LEVEL.voiced, fadeInMs: 20, fadeOutMs: 70 } },
  // Hisses: after the carrier vowel, cut from where the voice stops, held.
  f: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "uff")), post: { cut: "after-voice", hold: "hiss", holdMs: HOLD.hiss, levelDb: LEVEL.hiss } },
  s: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "us")), post: { cut: "after-voice", hold: "hiss", holdMs: HOLD.hiss, levelDb: LEVEL.hiss } },
  sh: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "ush")), post: { cut: "after-voice", hold: "hiss", holdMs: HOLD.hiss, levelDb: LEVEL.hiss } },
  th: { say: (s) => rate(-50, ipa(CARRIER + s.ipa, "uth")), post: { cut: "after-voice", hold: "hiss", holdMs: HOLD.hiss, levelDb: LEVEL.breath } },
  // h is the breath before a vowel, held as long as a breath can be.
  h: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "huh")), post: { cut: "before-voice", hold: "hiss", holdMs: HOLD.breath, levelDb: LEVEL.breath, fadeInMs: 30, fadeOutMs: 70, tailMs: 40 } },
  // Stops without a voice cannot be held: the whole burst and its breath,
  // up to where the vowel would start, the tail faded and not cut.
  k: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "kuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  p: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "puh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  t: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "tuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  ch: { say: (s) => rate(-50, ipa(s.ipa + CARRIER, "chuh")), post: { cut: "before-voice", levelDb: LEVEL.stop } },
  // Stops with a voice cannot be heard with no vowel at all: a short one is
  // kept and dies away, as it does when a teacher says "b!".
  b: { say: (s) => ipa(s.ipa + CARRIER, "buh"), post: { cut: "voiced-stop", keepVoicedMs: 110, levelDb: LEVEL.voiced } },
  d: { say: (s) => ipa(s.ipa + CARRIER, "duh"), post: { cut: "voiced-stop", keepVoicedMs: 110, levelDb: LEVEL.voiced } },
  g: { say: (s) => ipa(s.ipa + CARRIER, "guh"), post: { cut: "voiced-stop", keepVoicedMs: 110, levelDb: LEVEL.voiced } },
};

/** The fades each cut gets, and the quiet after it, in ms: a cut edge needs
 *  a longer fade than a natural one, and a stop needs room to ring. A recipe
 *  may say otherwise. */
const FADES = {
  all: { fadeInMs: 5, fadeOutMs: 20 },
  voice: { fadeInMs: 25, fadeOutMs: 80 },
  "before-voice": { fadeInMs: 5, fadeOutMs: 40, tailMs: 120 },
  "after-voice": { fadeInMs: 30, fadeOutMs: 70 },
  "voiced-stop": { fadeInMs: 3, fadeOutMs: 80, tailMs: 120 },
};

/** A word said slowly: how much slower the voice is asked to say it. */
const SLOW_RATE = -30;
/** Words the voice does not say as themselves at SLOW_RATE (speech-to-text
 *  hears another word): what is done for each instead. `rate` asks for
 *  another speed; `tempo` asks for the word at its usual speed and slows the
 *  sound itself to that share, which keeps every sound in it as it was.
 *  (bed and duck: speech-to-text hears any slow one as "bad" and "dark",
 *  even the plain clip slowed; it goes by the vowel's length.) */
const SLOW_FIX = { bed: { tempo: 0.72 }, chip: { rate: -20 }, duck: { tempo: 0.72 }, shop: { rate: -20 }, shed: { rate: -20 } };

/** Words whose vowel the voice says a little off the one the game teaches,
 *  and so are asked for by their sounds. Its "dog", "log" and "moth" lean
 *  towards "aw"; the short o of "chop", "sock" and the o tile is opener. */
const WORD_IPA = { dog: "dɑɡ", log: "lɑɡ", moth: "mɑθ" };
const asWord = (w) => `${WORD_IPA[w.id] ? ipa(WORD_IPA[w.id], w.id) : w.id}.`;

/** A word said plainly, as a sentence of its own so it falls at the end. */
const plainWord = (w) => ({ kind: "word", provider: "azure", voice: VOICE, ssml: speak(asWord(w)), post: { cut: "all", levelDb: LEVEL.word, ...FADES.all } });

/** What each of Sound Machine's clips is: the SSML sent, and what is done to what comes back. */
function soundMachineRecipes() {
  const out = {};
  for (const s of SOUNDS) {
    const r = SOUND_RECIPES[s.id];
    if (!r) throw new Error(`no recipe for the sound "${s.id}" (scripts/speech/build.mjs SOUND_RECIPES)`);
    out[soundClip(s.id)] = { kind: "sound", provider: "azure", voice: VOICE, ssml: speak(r.say(s)), post: { ...FADES[r.post.cut], ...r.post } };
  }
  for (const w of WORDS) out[wordClip(w.id)] = plainWord(w);
  // And slowly, as a teacher says it for a child: one word still, not sound by sound.
  for (const w of WORDS) {
    const fix = SLOW_FIX[w.id] ?? {};
    out[slowClip(w.id)] = {
      kind: "word",
      provider: "azure",
      voice: VOICE,
      ssml: speak(fix.tempo ? asWord(w) : rate(fix.rate ?? SLOW_RATE, asWord(w))),
      post: { cut: "all", levelDb: LEVEL.word, ...FADES.all, fadeOutMs: 40, ...(fix.tempo ? { tempo: fix.tempo } : {}) },
    };
  }
  return out;
}

/** Rhyme Time's own clips: each word Sound Machine does not have, said plainly
 *  the way Sound Machine's words are (a rhyme is heard best in one voice and
 *  one way of saying). Its other words are Sound Machine's clips. */
function rhymeTimeRecipes() {
  const out = {};
  for (const w of RHYME_WORDS.filter((x) => !x.shared)) out[wordClip(w.id)] = plainWord(w);
  return out;
}

/** Sight words the voice is asked for by their sounds, because it does not say
 *  them alone the way a teacher does (none so far: each is checked by --verify). */
const SIGHT_IPA = {};

/** Sight Word Sprint's clips: each word said plainly, a sentence of its own.
 *  `word` is what speech-to-text should hear in it (--verify): the clip's
 *  name does not end in the word the way Sound Machine's do. */
function sightWordRecipes() {
  const out = {};
  for (const w of SIGHT_WORDS) {
    const said = SIGHT_IPA[w.id] ? ipa(SIGHT_IPA[w.id], w.id) : w.id;
    out[sightClip(w.id)] = { kind: "word", word: w.id.toLowerCase(), provider: "azure", voice: VOICE, ssml: speak(`${said}.`), post: { cut: "all", levelDb: LEVEL.word, ...FADES.all } };
  }
  return out;
}

/** Each folder of clips: where it is, which clips belong there, and their recipes. */
const SETS = [
  { name: "Sound Machine", out: path.join(ROOT, "web/public", SPEECH_DIR), clips: allClips, recipes: soundMachineRecipes },
  { name: "Rhyme Time", out: path.join(ROOT, "web/public", RHYME_DIR), clips: ownClips, recipes: rhymeTimeRecipes },
  { name: "Sight Word Sprint", out: path.join(ROOT, "web/public", SIGHT_DIR), clips: sightClips, recipes: sightWordRecipes },
];

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
/** Samples slowed to `tempo` of their speed, at the same pitch. */
function stretch(pcm, tempo) {
  // One atempo goes no slower than half speed; two in a row go further.
  const chain = tempo < 0.5 ? `atempo=0.5,atempo=${(tempo / 0.5).toFixed(4)}` : `atempo=${tempo.toFixed(4)}`;
  return pcmOfS16(ffmpeg(["-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-af", chain, "-f", "s16le", "-ar", String(RATE), "-ac", "1", "pipe:1"], s16Of(pcm)));
}
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

const manifestOf = (set) => path.join(set.out, "manifest.json");

function readManifest(set) {
  try {
    return JSON.parse(fs.readFileSync(manifestOf(set), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return { voice: VOICE, format: FORMAT, clips: {} };
    throw new Failed(`${path.relative(ROOT, manifestOf(set))} cannot be read: ${e.message}`);
  }
}

/** Keys in order, so a rebuilt manifest differs only where a clip did. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  return value;
}

function writeManifest(set, clips) {
  fs.writeFileSync(manifestOf(set), `${JSON.stringify({ voice: VOICE, format: FORMAT, clips: sorted(clips) }, null, 2)}\n`);
}

const fileOf = (set, clip) => path.join(set.out, `${clip}.mp3`);
const sha = (data) => createHash("sha256").update(data).digest("hex");
/** A recipe in one line: the voice, what it is asked, what is done to the
 *  answer. Kept with each clip (`recipe`), beside the hash of the clip's own
 *  bytes (`sha256`), so check can tell a clip made from an older recipe, or
 *  a file changed by hand, without asking the voice anything. */
const recipeHash = (r) => sha(JSON.stringify(sorted({ voice: r.voice, ssml: r.ssml, post: r.post })));

// ---------- the commands ----------

/** Is every clip of every set there, with its entry, and nothing else? No network. */
function check() {
  const wrong = [];
  for (const set of SETS) {
    const before = wrong.length;
    const want = set.clips();
    const now = set.recipes();
    const { clips } = readManifest(set);
    for (const clip of want) {
      if (!Object.hasOwn(clips, clip)) wrong.push(`${clip}: not in the manifest`);
      else if (clips[clip].recipe !== recipeHash(now[clip])) wrong.push(`${clip}: its recipe has changed since it was made (npm run speech:build)`);
      const size = fs.statSync(fileOf(set, clip), { throwIfNoEntry: false })?.size ?? 0;
      if (!size) wrong.push(`${clip}: no file, or an empty one`);
      else if (clips[clip] && clips[clip].bytes !== size) wrong.push(`${clip}: the file is ${size} bytes, the manifest says ${clips[clip].bytes}`);
      else if (clips[clip] && clips[clip].sha256 !== sha(fs.readFileSync(fileOf(set, clip)))) wrong.push(`${clip}: the file is not the one the manifest describes (made by hand, or by an older run?)`);
    }
    for (const clip of Object.keys(clips)) if (!want.includes(clip)) wrong.push(`${clip}: in the manifest, but no word or sound has it`);
    const files = fs.existsSync(set.out) ? fs.readdirSync(set.out) : [];
    for (const f of files) if (f !== "manifest.json" && !(f.endsWith(".mp3") && want.includes(f.slice(0, -4)))) wrong.push(`${f}: a stray file`);
    if (wrong.length > before) {
      wrong.push(`${wrong.length - before} thing(s) wrong under ${path.relative(ROOT, set.out)}.`);
      continue;
    }
    const bytes = want.reduce((sum, clip) => sum + clips[clip].bytes, 0);
    console.log(`${set.name}: ${want.length} clips, ${(bytes / 1024).toFixed(0)} KB, all there.`);
  }
  if (wrong.length) throw new Failed(`${wrong.join("\n")}\nnpm run speech:build makes clips; a stray file is yours to remove.`);
}

/** Which set a clip named on the command line belongs to (a clip's name is unique across them). */
function setsFor(only) {
  for (const clip of only ?? []) if (!SETS.some((set) => Object.hasOwn(set.recipes(), clip))) throw new Failed(`there is no clip "${clip}"`);
  return only ? SETS.filter((set) => only.some((clip) => Object.hasOwn(set.recipes(), clip))) : SETS;
}

async function build({ force, only }) {
  let made = 0;
  let total = 0;
  for (const set of setsFor(only)) {
    const r = await buildSet(set, { force, only });
    made += r.made;
    total += r.total;
  }
  console.log(`${made} made, ${total - made} already there.`);
}

async function buildSet(set, { force, only }) {
  const want = set.recipes();
  const { clips } = readManifest(set);
  fs.mkdirSync(set.out, { recursive: true });
  let made = 0;
  for (const [clip, recipe] of Object.entries(want)) {
    const had = clips[clip];
    const current = had && fs.existsSync(fileOf(set, clip)) && recipeHash(had) === recipeHash(recipe);
    if (only ? !only.includes(clip) : current && !force) {
      // A clip from before the hashes were kept: it is the one this recipe made, so it is stamped as it stands.
      if (current && !(had.recipe && had.sha256)) clips[clip] = { ...had, recipe: recipeHash(recipe), sha256: sha(fs.readFileSync(fileOf(set, clip))) };
      continue;
    }
    let done;
    try {
      done = finish(await synthesise(clip, recipe.ssml), recipe.post, stretch);
    } catch (e) {
      if (e instanceof Failed) throw e;
      throw new Failed(`${clip}: ${e.message}`);
    }
    const mp3 = encode(done.pcm);
    fs.writeFileSync(fileOf(set, clip), mp3);
    clips[clip] = { ...recipe, recipe: recipeHash(recipe), gainDb: done.gainDb, ms: Math.round((done.pcm.length / RATE) * 1000), bytes: mp3.length, sha256: sha(mp3) };
    // After every clip: a run that stops half way has lost nothing.
    writeManifest(set, clips);
    made++;
    console.log(`made ${clip} (${clips[clip].ms} ms, ${mp3.length} bytes)`);
  }
  // An entry for a clip no word or sound has any more is dropped; its file is left for check to name.
  for (const clip of Object.keys(clips)) if (!Object.hasOwn(want, clip)) delete clips[clip];
  writeManifest(set, clips);
  return { made, total: Object.keys(want).length };
}

/** Letter names: what the voice must never say for a sound. */
const LETTER_NAMES = ["a", "ay", "b", "bee", "be", "c", "see", "sea", "d", "dee", "e", "ee", "f", "eff", "g", "gee", "h", "aitch", "i", "eye", "k", "kay", "l", "el", "m", "em", "n", "en", "o", "oh", "p", "pee", "pea", "r", "are", "s", "es", "ess", "t", "tee", "tea", "u", "you", "w"];
/** Spellings speech-to-text may give that sound the same as a word here. */
const SAME_SOUND = { webb: "web", sac: "sack", sacks: "sax", chic: "chick", cheque: "check", czech: "check", son: "sun", inn: "in" };
/** The same for Sight Word Sprint's words, which have no second spelling in
 *  the game itself (web/shared/sightwords/words.ts) but do in the language. */
const SIGHT_SAME_SOUND = { eye: "i", aye: "i", two: "to", too: "to", u: "you", ewe: "you", wee: "we", know: "no", sew: "so", sow: "so", due: "do", dew: "do", sea: "see", c: "see", four: "for", fore: "for", hear: "here", their: "there", "they're": "there", won: "one", wood: "would", "you're": "your", r: "are", wear: "where", ware: "where" };
/** Words speech-to-text makes nothing of when said alone, though the clip is
 *  the word: "very" comes back empty by itself and as "very many" with
 *  sight-many played after it. For these, no guess at all is not flagged. */
const UNHEARD_ALONE = ["very"];
const VOICELESS = ["f", "s", "sh", "th", "h", "k", "p", "t", "ch"];

/**
 * Every clip as it is on disk, measured, and what speech-to-text hears in
 * it. A word must be heard as itself. A sound is held to its kind: a
 * voiceless one has no voice in it, a held one lasts, a stop is short, and
 * none is heard as a letter's name. What it cannot say is whether a sound
 * is the right sound: a person has to listen for that (the Sound check page).
 */
async function verify({ only, match }) {
  check();
  const held = new Map(SOUNDS.map((s) => [soundClip(s.id), s]));
  const wrong = [];
  console.log("clip          ms  sounds voiced  level  heard        frames (v voiced, u unvoiced, . silent)");
  const every = SETS.flatMap((set) => {
    const { clips } = readManifest(set);
    return set.clips().map((clip) => ({ set, clip, entry: clips[clip] }));
  });
  for (const { set, clip, entry } of every) {
    if (only && !only.includes(clip)) continue;
    if (match && !clip.includes(match)) continue;
    const m = measure(decode(fileOf(set, clip)));
    const guesses = await heard(clip, fileOf(set, clip));
    const said = guesses[0] ?? "";
    const flags = [];
    if (entry.kind === "word") {
      const word = entry.word ?? clip.slice(5).replace(/-slow$/, "");
      const same = entry.word ? SIGHT_SAME_SOUND : SAME_SOUND;
      // A clip that is the word's own sound slowed (`tempo`) has the sounds of
      // the plain clip, which is judged on its own line; speech-to-text takes
      // a long short vowel for another word ("bed" as "bad"), so it is not asked.
      if (!entry.post.tempo && !(guesses.every((g) => g === "") && entry.word && UNHEARD_ALONE.includes(word)) && !guesses.some((g) => g === word || same[g] === word)) flags.push(`heard as "${said}"`);
      if (m.soundMs < 250 || m.soundMs > 1800) flags.push("an odd length for a word");
    } else {
      const s = held.get(clip);
      if (LETTER_NAMES.includes(said) && said !== "") flags.push(`heard as "${said}", which could be a letter's name`);
      if (VOICELESS.includes(s.id) && m.voicedMs > 20) flags.push("a voiceless sound with voice in it");
      if (s.held && (m.soundMs < 300 || m.soundMs > 1000)) flags.push("a held sound of an odd length");
      if (!s.held && m.soundMs > 320) flags.push("a stop that goes on");
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
  else if (flag("--verify")) await verify({ only, match: args.includes("--match") ? args[args.indexOf("--match") + 1] : null });
  else await build({ force: flag("--force"), only });
} catch (e) {
  if (!(e instanceof Failed)) throw e;
  console.error(e.message);
  process.exit(1);
}
