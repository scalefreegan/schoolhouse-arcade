import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ART } from "../src/sprites/art.ts";
import { spriteRuns } from "../src/sprites/runs.ts";
import { AVATAR_IDS, CHARACTERS, COLOUR_NAMES, LEGACY_AVATARS, cleanPlayerName, colourFor, lookOf } from "./avatars.ts";
import { BADGES } from "./badges.ts";
import { PRIZE_ICONS } from "./prizes.ts";

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

test("twelve characters, each its own drawing, with a palette for every colour it offers; ids are unique", () => {
  assert.equal(CHARACTERS.length, 12);
  assert.equal(new Set(CHARACTERS.map((c) => c.sprite)).size, 12, "two characters share a drawing");
  assert.equal(new Set(AVATAR_IDS).size, CHARACTERS.length + LEGACY_AVATARS.length);
  for (const c of CHARACTERS) {
    const art = ART[c.sprite] as { rows: string[]; palettes: Record<string, unknown> };
    assert.ok(art, `${c.id}: no sprite ${c.sprite}`);
    assert.equal(art.rows.length, 16, `${c.id} is not 16 tall`);
    assert.equal(art.rows[0].length, 16, `${c.id} is not 16 wide`);
    assert.ok(c.colours.length >= 4, `${c.id} has only ${c.colours.length} colours`);
    assert.equal(new Set(c.colours).size, c.colours.length, `${c.id} offers a colour twice`);
    assert.deepEqual(Object.keys(art.palettes).sort(), [...c.colours].sort(), `${c.id}: its colours and its drawing's palettes differ`);
    for (const k of c.colours) assert.ok(COLOUR_NAMES[k], `${c.id}: no name for the colour ${k}`);
  }
});

test("the ids from before colours still draw exactly as they did", () => {
  // The four second looks as they were drawn before there were colours.
  const was: Record<string, [string, Record<string, string>]> = {
    nova: ["alien", { g: "#ff7ac8", d: "#c23a8c", w: "#ffffff", k: "#0b0620" }],
    dash: ["dino", { g: "#ff8a3c", y: "#ffe27a", w: "#ffffff", k: "#0b0620" }],
    gizmo: ["robot", { s: "#c08a2e", l: "#ffd98a", k: "#6b4a1a", c: "#7dff5a", r: "#ff5a3c", y: "#2ff3e0" }],
    blip: ["monster", { p: "#2fa8ff", y: "#ff9ad1", w: "#ffffff", k: "#0b0620" }],
    zib: ["alien", { g: "#7dff5a", d: "#2fae3a", w: "#ffffff", k: "#0b0620" }],
    rex: ["dino", { g: "#4fd66a", y: "#ffe27a", w: "#ffffff", k: "#0b0620" }],
    bolt: ["robot", { s: "#7f8fb8", l: "#c9d4f2", k: "#3d4468", c: "#2ff3e0", r: "#ff2e9a", y: "#ffd23f" }],
    fuzz: ["monster", { p: "#a65cff", y: "#ffd23f", w: "#ffffff", k: "#0b0620" }],
  };
  for (const [id, [sprite, colours]] of Object.entries(was)) {
    assert.ok(AVATAR_IDS.includes(id), `${id} is no longer accepted`);
    const look = lookOf(id, null);
    assert.equal(look.character.sprite, sprite, id);
    assert.deepEqual((ART[look.character.sprite].palettes as Record<string, unknown>)[look.colour], colours, id);
  }
  // And the drawings themselves, pixel for pixel (a hash of their rows as they were).
  const rowsWere: Record<string, string> = { alien: "e68bd3a8205bb2d2", dino: "d34c1f09321dbd22", robot: "d4ff145cd7627953", monster: "8e2e7feb30e97457" };
  for (const [sprite, hash] of Object.entries(rowsWere)) {
    const rows = (ART as Record<string, { rows: string[] }>)[sprite].rows;
    assert.equal(createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 16), hash, `${sprite} was redrawn`);
  }
  // An old id keeps its own colour, whatever a row says beside it.
  assert.deepEqual([lookOf("nova", "blue").character.id, lookOf("nova", "blue").colour], ["zib", "pink"]);
  assert.ok(!CHARACTERS.some((c) => LEGACY_AVATARS.some((l) => l.id === c.id)), "an old id is offered in the picker");
});

test("a look: no colour or one the character lacks is its own look; an unknown id draws the first character", () => {
  assert.equal(lookOf("toast", null).colour, "red");
  assert.equal(lookOf("toast", "teal").colour, "teal");
  assert.equal(lookOf("toast", "silver").colour, "red");
  assert.equal(lookOf("nobody", "pink").character.id, CHARACTERS[0].id);
});

test("a colour may be stored only with a character that comes in it", () => {
  assert.equal(colourFor("toast", undefined), null);
  assert.equal(colourFor("toast", null), null);
  assert.equal(colourFor("toast", "teal"), "teal");
  assert.equal(colourFor("toast", "silver"), undefined);
  assert.equal(colourFor("toast", 3), undefined);
  assert.equal(colourFor("nova", "pink"), undefined, "an old id takes no colour");
  assert.equal(colourFor("nova", null), null);
});

test("every badge and every prize picture names a drawing (and palette) that exists", () => {
  const art = ART as Record<string, { palettes: Record<string, unknown> }>;
  for (const b of BADGES) {
    assert.ok(Object.hasOwn(art, b.sprite), `${b.id}: no sprite ${b.sprite}`);
    assert.ok(b.palette in art[b.sprite].palettes, `${b.id}: ${b.sprite} has no palette ${b.palette}`);
  }
  for (const icon of PRIZE_ICONS) {
    assert.ok(Object.hasOwn(art, icon), `no sprite for the prize picture ${icon}`);
    assert.ok("default" in art[icon].palettes, `${icon} has no default palette`);
  }
  // What the screens draw by name.
  for (const id of ["ticket", "gift", "lock"]) assert.ok(Object.hasOwn(art, id), id);
});

test("a player's name is trimmed and capped; an empty or overlong one is refused", () => {
  assert.equal(cleanPlayerName("  Em  "), "Em");
  assert.equal(cleanPlayerName("a  b"), "a b");
  assert.equal(cleanPlayerName("   "), null);
  assert.equal(cleanPlayerName("x".repeat(11)), null);
  assert.equal(cleanPlayerName(42), null);
});
