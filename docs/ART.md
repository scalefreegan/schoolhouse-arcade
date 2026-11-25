# The artwork

Everything drawn in the arcade is in one file, `web/src/sprites/art.ts`, as
pixels typed by hand. Nothing is downloaded and nothing needs a licence.

## How a sprite is written

```ts
alien: {
  rows: [
    "...g........g...",
    "....g......g....",
    …
  ],
  palettes: {
    green: { g: "#7dff5a", d: "#2fae3a", w: "#ffffff", k: "#0b0620" },
    pink: { g: "#ff7ac8", d: "#c23a8c", w: "#ffffff", k: "#0b0620" },
  },
},
```

- Each string is one row of pixels; each character is one pixel.
- `.` is empty. Any other character is a key into the palette.
- Every row must be the same length. `npm test` checks that, and that every
  character has a colour in every palette.
- A character is one drawing; its palettes are the colours it comes in,
  named from one list (green, pink, blue … `COLOUR_NAMES` in
  `web/shared/avatars.ts`). The first is the character's own look.

`<Sprite id="alien" palette="green" size={64} />` draws one at any size, as
whole blocks. `<AvatarSprite avatar="zib" colour="pink" />` draws a
player's character in their colour (no colour: its own look).

## Adding a character, or a colour

1. Draw it in `art.ts` at 16 × 16 like the others, with a palette per
   colour; or add a palette to a drawing that is already there.
2. Add it to `CHARACTERS` in `web/shared/avatars.ts` (a new `id`, a short
   original name, its colours with its own look first), or the new colour
   to that character's `colours`. The picker is rows of four.
3. Never rename or remove a character `id` or a colour once someone has
   picked it: both are stored on their player row.

The first eight avatars were four drawings in two looks each. `nova`,
`dash`, `gizmo` and `blip` are kept in `LEGACY_AVATARS` as Zib in pink, Rex
in orange, Bolt in gold and Fuzz in blue: a row that holds one draws as it
always did, and its edit form opens on that character and colour. The
picker no longer offers them by name.

## Prizes and badges

A prize's picture is one of `PRIZE_ICONS` in `web/shared/prizes.ts` (candy,
icecream, gamepad, gift, pizza, book, ball, popcorn); a badge names its
drawing and palette in `web/shared/badges.ts`. To add a prize picture, draw
it in `art.ts` with a `default` palette and add its id to `PRIZE_ICONS`.
`npm test` checks every badge and prize picture has a drawing. A badge not
yet earned is the same drawing unlit (`<Sprite off />`), so a badge needs a
shape that reads as a silhouette.

## Sound Machine's pictures

Each word in `web/shared/soundmachine/words.ts` has a 16 × 16 drawing named
`w_<word>` (`w_cat`, `w_chick`) with a `default` palette; `npm test` checks
there is one for every word and that no two words share one. In Read the
picture is the answer, so a picture has to be named at a glance by a
six-year-old, and two that could be taken for each other are listed in
`LOOKALIKES` there, which keeps them from being offered side by side. A
word that cannot be drawn clearly does not belong in the list. Where the
word is a part or a quality rather than a thing (chin, neck, thin, thick) a
cyan arrow points at it. `arrow` and `blend` are what the machine's buttons
show; `bell`, `cog` and `megaphone` are its badges, and `machine` its
cabinet on the floor (a game names its drawing in `web/shared/games.ts`).

## Replacing a drawing with made art

The rest of the app only knows a sprite's id, so art made elsewhere (ArtCraft,
PhotoCraft, an asset pack) can replace a drawing without touching a game:

1. Export a square PNG with a transparent background. For the pixel look,
   draw at 16 × 16 or 32 × 32 and export at that size; the app scales it up
   with `image-rendering: pixelated`.
2. Put it in `web/public/sprites/<id>.png`.
3. In `web/src/sprites/Sprite.tsx`, draw an `<img>` for that id instead of
   the rows. (This switch does not exist yet; it is one `if` when the first
   made sprite arrives.)

## Prompts for making characters

For an image tool, one character at a time:

> A single 16-bit pixel-art game character sprite, facing the viewer, full
> body, centred, on a plain transparent background. [A friendly one-eyed
> purple monster with two small yellow horns and a wide toothy grin.]
> Chunky pixels, a limited palette of six flat colours, a one-pixel dark
> outline, no shading gradients, no text, no shadow on the ground.

Swap the bracketed sentence. The cast so far, to keep a family likeness
(each also comes in five other colours): a green alien with two antennae and
three stubby legs (Zib); a small green T-rex in profile with a cream belly
(Rex); a boxy steel robot with cyan eyes and a pink antenna bulb (Bolt); a
round purple one-eyed monster with horns (Fuzz); a bearded wizard in a blue
starry hat with a glowing staff (Fenn); a red winged dragon with a yellow
belly, facing left (Toast); a round white ghost with blushing cheeks and a
curling tail (Peeka); a white rocket with a red nose, fins and a face
(Orbit); a sitting ginger cat with whiskers (Mitts); a brown owl with big
yellow eyes on a branch (Tawny); a wide green frog with a big smile (Puddle);
a pink-iced cupcake with a cherry and a smile (Crumb).

## The colours on screen

Three phosphors, each with one meaning (`web/src/index.css`):

| Colour | Means |
|---|---|
| Cyan `#2ff3e0` | the game talking: titles, the card, what to do next |
| Magenta `#ff2e9a` | the player: their name, their score, the button they press |
| Yellow `#ffd23f` | reward: tickets, stars, a new best |
| Green `#7dff5a` / red `#ff5a3c` | right and wrong, and nothing else |

Sprites may use any colours; the interface around them uses only these.
