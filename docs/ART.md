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
    lime: { g: "#7dff5a", d: "#2fae3a", w: "#ffffff", k: "#0b0620" },
    rose: { g: "#ff7ac8", d: "#c23a8c", w: "#ffffff", k: "#0b0620" },
  },
},
```

- Each string is one row of pixels; each character is one pixel.
- `.` is empty. Any other character is a key into the palette.
- Every row must be the same length. `npm test` checks that, and that every
  character has a colour in every palette.
- The same drawing with another palette is another character: Zib and Nova
  are one alien. That is how eight avatars come from four drawings.

`<Sprite id="alien" palette="lime" size={64} />` draws one at any size, as
whole blocks. `<AvatarSprite avatar="zib" />` draws a player's character.

## Adding an avatar

1. Draw it in `art.ts` (16 × 16 matches the others), or add a palette to a
   drawing that is already there.
2. Add a line to `AVATARS` in `web/shared/avatars.ts` with a new `id`.
3. Never rename or remove an `id` once someone has picked it: it is stored
   on their player row.

## Prizes and badges

A prize's picture is one of `PRIZE_ICONS` in `web/shared/prizes.ts` (candy,
icecream, gamepad, gift, pizza, book, ball, popcorn); a badge names its
drawing and palette in `web/shared/badges.ts`. To add a prize picture, draw
it in `art.ts` with a `default` palette and add its id to `PRIZE_ICONS`.
`npm test` checks every badge and prize picture has a drawing. A badge not
yet earned is the same drawing unlit (`<Sprite off />`), so a badge needs a
shape that reads as a silhouette.

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

Swap the bracketed sentence. The cast so far, to keep a family likeness:
a green alien with two antennae and three stubby legs (Zib, Nova in pink); a
small green T-rex in profile with a cream belly (Rex, Dash in orange); a
boxy steel robot with cyan eyes and a red antenna bulb (Bolt, Gizmo in
brass); a round one-eyed monster with horns (Fuzz in purple, Blip in blue).

## The colours on screen

Three phosphors, each with one meaning (`web/src/index.css`):

| Colour | Means |
|---|---|
| Cyan `#2ff3e0` | the game talking: titles, the card, what to do next |
| Magenta `#ff2e9a` | the player: their name, their score, the button they press |
| Yellow `#ffd23f` | reward: tickets, stars, a new best |
| Green `#7dff5a` / red `#ff5a3c` | right and wrong, and nothing else |

Sprites may use any colours; the interface around them uses only these.
