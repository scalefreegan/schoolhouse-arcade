// Every beep the arcade makes, synthesised: square and triangle waves
// through the Web Audio API. (The only audio files are Sound Machine's
// spoken clips, which speech.ts plays through the context made here.)
// A browser only lets sound start from a tap or a key press; the first call
// that follows one wakes the context.

const KEY = "arcade.muted";

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* private browsing: the choice lasts for this visit */
  }
}

/** When a context that was not running was first asked to wake (0: not waiting on one). */
let asked = 0;
/** A context asked to wake that is still not running this long after is given up on (ms). */
const WAKE_MS = 1_500;

/**
 * The one audio context, awake, or null when the sound is off. Speech
 * (speech.ts) plays through it too, so one tap wakes both.
 *
 * A context that is not running is asked to wake on every call: not only a
 * "suspended" one, since a tablet that has slept reports "interrupted". If
 * it was asked and is still not running WAKE_MS later (or it is closed), it
 * is let go and a new one made, so the next tap gets sound back; a game is
 * never left silent for good by a context that will not wake.
 */
export function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (ctx && (ctx.state === "closed" || (ctx.state !== "running" && asked && performance.now() - asked > WAKE_MS))) {
      const dead = ctx;
      ctx = null;
      asked = 0;
      if (dead.state !== "closed") void dead.close().catch(() => undefined);
    }
    ctx ??= new AudioContext();
    if (ctx.state === "running") asked = 0;
    else {
      asked ||= performance.now();
      const waking = ctx;
      // A refusal is not an error to show: the wait above deals with it.
      void waking.resume().then(
        () => {
          if (waking === ctx && waking.state === "running") asked = 0;
        },
        () => undefined,
      );
    }
    return ctx;
  } catch {
    return null;
  }
}

interface Note {
  /** Hz. */
  f: number;
  /** Seconds after the sound starts. */
  at: number;
  /** Seconds it lasts. */
  len: number;
  /** Slide to this pitch over the note. */
  to?: number;
}

function play(notes: Note[], wave: OscillatorType = "square", volume = 0.08): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) osc.frequency.linearRampToValueAtTime(n.to, t0 + n.at + n.len);
    gain.gain.setValueAtTime(volume, t0 + n.at);
    gain.gain.setValueAtTime(volume, t0 + n.at + n.len * 0.7);
    gain.gain.linearRampToValueAtTime(0, t0 + n.at + n.len);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.len + 0.02);
  }
}

/** A run of equal notes, one after another. */
const run = (freqs: number[], len: number): Note[] => freqs.map((f, i) => ({ f, at: i * len, len }));

export const sfx = {
  /** A menu choice, a key on the pad. */
  tap: () => play([{ f: 660, at: 0, len: 0.05 }]),
  /** A coin dropping: the game is starting. */
  coin: () => play([{ f: 988, at: 0, len: 0.07 }, { f: 1319, at: 0.07, len: 0.22 }]),
  /** Right answer. `step` (0-4) raises the pitch as the combo climbs. */
  right: (step = 0) => {
    const base = 523 * 2 ** (Math.min(step, 4) / 6);
    play([{ f: base, at: 0, len: 0.06 }, { f: base * 1.5, at: 0.06, len: 0.1 }]);
  },
  /** Wrong answer: low and short, not a punishment. */
  wrong: () => play([{ f: 196, at: 0, len: 0.16, to: 147 }], "triangle", 0.16),
  /** The clock's last seconds. */
  tick: () => play([{ f: 880, at: 0, len: 0.03 }], "square", 0.05),
  /** The round is over. */
  over: () => play(run([523, 392, 330, 262], 0.12), "triangle", 0.14),
  /** A new best, a star, a badge. */
  fanfare: () => play([...run([523, 659, 784, 1047], 0.09), { f: 1319, at: 0.36, len: 0.3 }]),
  /** Tickets counting up; call once per step. */
  ticket: () => play([{ f: 1568, at: 0, len: 0.03 }], "square", 0.05),
  /** One gem, a glassy ping. `step` raises it a little each time (a count, a row of gems). */
  gem: (step = 0) => {
    const f = 1319 * 2 ** ((step % 8) / 12);
    play([{ f, at: 0, len: 0.05 }, { f: f * 2, at: 0.04, len: 0.09 }], "triangle", 0.1);
  },
  /** `n` gems dropping into the tray, one ping each, climbing. Never over speech: after the word is said.
   *  Only on a context that is running: queued on one that is not, they would sound whenever it woke,
   *  over whatever was being said by then. (They follow the lever by seconds, so a healthy context is awake.) */
  gems: (n: number) => {
    if (audio()?.state !== "running") return;
    play(Array.from({ length: Math.max(0, Math.min(n, 8)) }, (_, i) => ({ f: 1047 * 2 ** ((i * 4) / 12), at: i * 0.09, len: 0.08 })), "triangle", 0.1);
  },
};
