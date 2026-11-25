// Every sound the arcade makes, synthesised: square and triangle waves
// through the Web Audio API, so there are no audio files to ship or license.
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

/** The one audio context, awake, or null when the sound is off. Speech
 *  (speech.ts) plays through it too, so one tap wakes both. */
export function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
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
};
