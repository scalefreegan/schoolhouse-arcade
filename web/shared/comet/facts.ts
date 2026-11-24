// Comet Cards' facts: one sum each, written "7+5" or "10-2". That string is
// what a card shows, what an answer is recorded against and what mastery is
// counted by, so its form never changes.
//
// Pure, and run by Node as is.

export interface Fact {
  a: number;
  op: "+" | "-";
  b: number;
}

/** "7+5" → { a: 7, op: "+", b: 5 }; null for anything else. */
export function parseFact(text: string): Fact | null {
  const m = /^(\d{1,2})([+-])(\d{1,2})$/.exec(text);
  if (!m) return null;
  const fact: Fact = { a: Number(m[1]), op: m[2] as Fact["op"], b: Number(m[3]) };
  // "07+5" is not how any card is written.
  return factKey(fact) === text ? fact : null;
}

export function factKey(f: Fact): string {
  return `${f.a}${f.op}${f.b}`;
}

export function answerOf(f: Fact): number {
  return f.op === "+" ? f.a + f.b : f.a - f.b;
}

export interface Level {
  id: string;
  title: string;
  blurb: string;
  has(f: Fact): boolean;
}

const addWithin = (max: number) => (f: Fact) => f.op === "+" && f.a + f.b <= max;
const takeAwayWithin10 = (f: Fact) => f.op === "-" && f.a <= 10 && f.b <= f.a;
/** Both numbers 0-10: sums reach 20, and so do the numbers taken from. */
const bigSums = (f: Fact) => (f.op === "+" ? f.a <= 10 && f.b <= 10 : f.b <= 10 && f.b <= f.a && f.a - f.b <= 10);

/** In unlock order. Ids are stored on plays and stars: never rename one. */
export const LEVELS: Level[] = [
  { id: "add-5", title: "Add to 5", blurb: "2 + 3", has: addWithin(5) },
  { id: "add-10", title: "Add to 10", blurb: "6 + 4", has: addWithin(10) },
  { id: "sub-10", title: "Take away", blurb: "10 - 2", has: takeAwayWithin10 },
  { id: "mix-10", title: "Mix to 10", blurb: "+ and -", has: (f) => addWithin(10)(f) || takeAwayWithin10(f) },
  { id: "big-20", title: "Big sums", blurb: "8 + 7", has: bigSums },
];

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

const cache = new Map<string, string[]>();

/** Every fact in a level, as keys, in a fixed order. */
export function factsOf(level: Level): string[] {
  let facts = cache.get(level.id);
  if (!facts) {
    facts = [];
    for (const op of ["+", "-"] as const) {
      for (let a = 0; a <= 20; a++) {
        for (let b = 0; b <= 20; b++) {
          const f: Fact = { a, op, b };
          if (level.has(f)) facts.push(factKey(f));
        }
      }
    }
    cache.set(level.id, facts);
  }
  return facts;
}
