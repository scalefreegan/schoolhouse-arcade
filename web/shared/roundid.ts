// A round's id. The browser makes one when a round starts (the server's
// clock for the round is signed for it) and sends it with every try at
// saving that round, so a round whose reply was lost can be sent again
// without being stored, or paid, twice. docs/DATA.md.
//
// Pure apart from the randomness it is handed, and run by Node as is.

/** The part of the browser's `crypto` a round id needs. */
export interface RandomSource {
  getRandomValues(into: Uint8Array<ArrayBuffer>): unknown;
  randomUUID?(): string;
}

/**
 * A new round id (a version 4 UUID). The tablet reaches the Mac over plain
 * http at a private address, where a browser has no crypto.randomUUID but
 * still has getRandomValues.
 */
export function newRoundId(source: RandomSource = crypto): string {
  if (source.randomUUID) return source.randomUUID();
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // the standard variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
