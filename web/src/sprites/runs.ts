import type { SpriteArt } from "./art.ts";

/** One horizontal run of same-coloured pixels: a single <rect>. */
interface Run {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/** Rows of palette keys → the fewest rects that draw them. Pure. */
export function spriteRuns(art: SpriteArt, palette: string): Run[] {
  const colours = art.palettes[palette] ?? Object.values(art.palettes)[0];
  const runs: Run[] = [];
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      if (key !== ".") runs.push({ x, y, w: end - x, fill: colours[key] });
      x = end;
    }
  });
  return runs;
}
