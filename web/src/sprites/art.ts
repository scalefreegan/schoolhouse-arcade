// Every drawing in the arcade, as pixels. A sprite is rows of characters:
// "." is empty, any other character is a key into a palette. The same
// drawing with another palette is another character (Zib and Nova are one
// alien), which is how eight avatars come from four drawings.
//
// To replace a drawing with made art, see docs/ART.md: this file is the
// only place that knows what anything looks like.

export interface SpriteArt {
  rows: string[];
  /** Named colour sets; `default` when the sprite has only one look. */
  palettes: Record<string, Record<string, string>>;
}

const WHITE = "#ffffff";
const INK = "#0b0620";

export const ART = {
  alien: {
    rows: [
      "...g........g...",
      "....g......g....",
      "....g......g....",
      "...gggggggggg...",
      "..gggggggggggg..",
      ".gggggggggggggg.",
      ".ggwwwggggwwwgg.",
      ".ggwkwggggwkwgg.",
      ".ggwwwggggwwwgg.",
      ".gggggggggggggg.",
      ".gggkggggggkggg.",
      "..gggkkkkkkggg..",
      "...gggggggggg...",
      "....gg.gg.gg....",
      "....gg.gg.gg....",
      "...dd..dd..dd...",
    ],
    palettes: {
      lime: { g: "#7dff5a", d: "#2fae3a", w: WHITE, k: INK },
      rose: { g: "#ff7ac8", d: "#c23a8c", w: WHITE, k: INK },
    },
  },
  dino: {
    rows: [
      "................",
      "........ggggggg.",
      ".......ggggggggg",
      ".......ggwkggggg",
      ".......ggggggggg",
      ".......gggggwwww",
      ".......ggggg....",
      "g.....gggggggg..",
      "g....ggggggg.g..",
      "gg..gggggggg....",
      "ggggggggggyg....",
      ".ggggggggyyg....",
      "..gggggggyyg....",
      "...ggg..ggg.....",
      "...gg...gg......",
      "...ggg..ggg.....",
    ],
    palettes: {
      moss: { g: "#4fd66a", y: "#ffe27a", w: WHITE, k: INK },
      ember: { g: "#ff8a3c", y: "#ffe27a", w: WHITE, k: INK },
    },
  },
  robot: {
    rows: [
      ".......rr.......",
      ".......kk.......",
      "...ssssssssss...",
      "...slllllllls...",
      "...slccllccls...",
      "...slccllccls...",
      "...slllllllls...",
      "...slkkkkkkls...",
      "...ssssssssss...",
      ".....kkkkkk.....",
      "..ssssssssssss..",
      "s.sslyylllrlss.s",
      "s.ssllllllllss.s",
      "k.ssssssssssss.k",
      "....sss..sss....",
      "...kkkk..kkkk...",
    ],
    palettes: {
      steel: { s: "#7f8fb8", l: "#c9d4f2", k: "#3d4468", c: "#2ff3e0", r: "#ff2e9a", y: "#ffd23f" },
      brass: { s: "#c08a2e", l: "#ffd98a", k: "#6b4a1a", c: "#7dff5a", r: "#ff5a3c", y: "#2ff3e0" },
    },
  },
  monster: {
    rows: [
      "..y..........y..",
      "..yy........yy..",
      "..pppppppppppp..",
      ".pppppppppppppp.",
      ".pppppwwwwppppp.",
      ".ppppwwwwwwpppp.",
      ".ppppwwkkwwpppp.",
      ".ppppwwkkwwpppp.",
      ".pppppwwwwppppp.",
      ".pppppppppppppp.",
      ".ppkkkkkkkkkkpp.",
      ".pppkwkwwkwkppp.",
      "..pppkkkkkkppp..",
      "..pppppppppppp..",
      "...ppp....ppp...",
      "..pppp....pppp..",
    ],
    palettes: {
      grape: { p: "#a65cff", y: "#ffd23f", w: WHITE, k: INK },
      tide: { p: "#2fa8ff", y: "#ff9ad1", w: WHITE, k: INK },
    },
  },
  comet: {
    rows: [
      "................",
      "............ww..",
      "...........wyyw.",
      "..........wyyyyw",
      ".........cwyyyyw",
      "........cccwyyw.",
      ".......ccc.cww..",
      "......ccc.cc....",
      ".....ccc.cc.....",
      "....cc..cc......",
      "...cc..cc.......",
      "..cc..c.........",
      ".c...c..........",
      "c...c...........",
      "................",
      "................",
    ],
    palettes: { default: { w: WHITE, y: "#ffd23f", c: "#2ff3e0" } },
  },
  star: {
    rows: [
      "....y....",
      "....y....",
      "...yyy...",
      "yyyyyyyyy",
      ".yyyyyyy.",
      "..yyyyy..",
      "..yyyyy..",
      ".yyy.yyy.",
      ".y.....y.",
    ],
    palettes: { on: { y: "#ffd23f" }, off: { y: "#3b2b7c" } },
  },
  heart: {
    rows: [
      ".rr...rr.",
      "rrrr.rrrr",
      "rrrrrrrrr",
      "rrrrrrrrr",
      ".rrrrrrr.",
      "..rrrrr..",
      "...rrr...",
      "....r....",
    ],
    palettes: { on: { r: "#ff2e9a" }, off: { r: "#3b2b7c" } },
  },
  lock: {
    rows: [
      "..kkkk..",
      ".k....k.",
      ".k....k.",
      "kkkkkkkk",
      "kkkkkkkk",
      "kkk..kkk",
      "kkk..kkk",
      "kkkkkkkk",
      "kkkkkkkk",
    ],
    palettes: { default: { k: "#a99bdc" } },
  },
  speaker: {
    rows: [
      ".....w....",
      "....ww..w.",
      "wwwwww...w",
      "wwwwww.w.w",
      "wwwwww.w.w",
      "wwwwww...w",
      "....ww..w.",
      ".....w....",
    ],
    palettes: { default: { w: "#f2ecff" } },
  },
  mute: {
    rows: [
      ".....w....",
      "....ww....",
      "wwwwww.r.r",
      "wwwwww..r.",
      "wwwwww..r.",
      "wwwwww.r.r",
      "....ww....",
      ".....w....",
    ],
    palettes: { default: { w: "#a99bdc", r: "#ff5a3c" } },
  },
} satisfies Record<string, SpriteArt>;

export type SpriteId = keyof typeof ART;
