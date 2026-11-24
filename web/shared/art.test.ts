import assert from "node:assert/strict";
import { test } from "node:test";
import { ART } from "../src/sprites/art.ts";
import { spriteRuns } from "../src/sprites/runs.ts";
import { AVATARS, AVATAR_IDS, cleanPlayerName } from "./avatars.ts";

// The drawings are typed by hand as rows of characters; one short row or one
// character missing from a palette would draw a hole or a black bar.

test("every sprite is a rectangle, and every character in it has a colour in every palette", () => {
  for (const [id, art] of Object.entries(ART)) {
    const width = art.rows[0].length;
    art.rows.forEach((row, y) => assert.equal(row.length, width, `${id} row ${y} is ${row.length} wide, not ${width}`));
    const used = new Set(art.rows.join("").replaceAll(".", ""));
    for (const [name, colours] of Object.entries(art.palettes as Record<string, Record<string, string>>)) {
      for (const key of used) assert.match(colours[key] ?? "", /^#[0-9a-f]{6}$/, `${id}/${name} has no colour for "${key}"`);
    }
  }
});

test("runs cover exactly the drawn pixels", () => {
  for (const [id, art] of Object.entries(ART)) {
    const palette = Object.keys(art.palettes)[0];
    const drawn = art.rows.join("").replaceAll(".", "").length;
    assert.equal(spriteRuns(art, palette).reduce((n, r) => n + r.w, 0), drawn, id);
  }
});

test("every avatar names a drawing and a palette that exist, and ids are unique", () => {
  assert.equal(new Set(AVATAR_IDS).size, AVATARS.length);
  for (const a of AVATARS) {
    const art = ART[a.sprite] as { palettes: Record<string, unknown> };
    assert.ok(art, `${a.id}: no sprite ${a.sprite}`);
    assert.ok(a.palette in art.palettes, `${a.id}: ${a.sprite} has no palette ${a.palette}`);
  }
});

test("a player's name is trimmed and capped; an empty or overlong one is refused", () => {
  assert.equal(cleanPlayerName("  Em  "), "Em");
  assert.equal(cleanPlayerName("a  b"), "a b");
  assert.equal(cleanPlayerName("   "), null);
  assert.equal(cleanPlayerName("x".repeat(11)), null);
  assert.equal(cleanPlayerName(42), null);
});
