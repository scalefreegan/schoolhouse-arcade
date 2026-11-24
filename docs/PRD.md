# Schoolhouse Arcade — PRD

A **retro coin-op arcade of small learning games** for a first-grader and
the grown-up playing alongside. Each cabinet is one standalone game that
drills one idea until recall is fast. Playing earns **tickets** and
**badges**, and a grown-up trades those for **real prizes** (an ice cream, a
candy, a new video game). The list of cabinets is meant to grow; the first
is **Comet Cards**, addition and subtraction flashcards against the clock.

The name nods to the Saturday-morning idea that a lesson can be something
you want to sit through. Everything in the app (names, characters, art,
sounds) is original.

Decided 2026-11-23/24 in the intake interview (12 questions in three rounds;
all answers below are final for v1):

| Decision | Choice |
|---|---|
| Devices | **Touch and keyboard.** A big on-screen arcade keypad that also listens to the number keys, so the same game works on an iPad, a phone and a laptop |
| Answering | **Both, as a skill setting.** *Easy* shows four answer buttons (recognition); *Arcade* is the number pad (recall). Separate high score tables per skill, and Arcade pays double tickets |
| Game modes | All four in v1: **Blitz** (60 seconds, as many cards as possible, combo multiplier), **Sprint** (a deck of 20, fastest time wins), **Survival** (each card has its own shrinking countdown, three lives), **Practice** (no clock, no scores) |
| Fact range | **A level ladder**, unlocked by mastery: add within 5, add within 10, take away within 10, mixed within 10, then both numbers 0–10 with sums to 20. Subtraction never goes below zero |
| Mistakes | **Show the answer, and the card returns.** The right answer flashes, the combo resets, the fact comes back later in the round and more often in later games until it sticks. No other penalty, except in Survival where it costs a life |
| Prizes | **Tickets and mastery badges.** Every game pays tickets, spent at a Prize Counter on small prizes the grown-up prices. Big prizes are locked behind mastery badges as well, so they cannot be ground out by volume alone |
| Players | **Profiles with avatars.** A "Who is playing?" screen; each player picks a pixel character and a name. Tickets, badges and unlocks are per player; the high score tables show everyone |
| Theme | Space and aliens, dinosaurs, robots, monsters: **all four**, as the cast of avatars. The first game is the space one |
| Hosting | **Mac server and Postgres**, the shape of Lingo Dojo and Lean Into It. The tablet reaches the Mac over home Wi-Fi; scores are shared across devices; it works when the Mac is on and at home |
| Artwork | **Pixel sprites drawn in code** (`web/src/sprites/art.ts`): small character grids with palettes. Nothing downloaded, nothing to license. `docs/ART.md` says how to swap in made art later |
| Look | **Neon CRT cabinet.** Early-80s coin-op: black glass, scanlines and glow, cyan / magenta / yellow, chunky pixel type, a title screen that says *press start* |
| Stack | Match Lean Into It: React 19 + Vite 8 + TS strict, Vite middleware API behind `wrap()`, Tailwind 4, oxlint, `node --test`, beads (prefix `arc`); **port 38900** |
| Repo | **Private** for now, `github.com/scalefreegan/schoolhouse-arcade`, **AGPL-3.0-only** |

## Vocabulary

| Word | Meaning |
|---|---|
| **Cabinet** | One game on the arcade floor. Listed in `web/shared/games.ts` |
| **Player** | A row picked on the "Who is playing?" screen: a name and an avatar. No logins |
| **Avatar** | The pixel character a player is (`web/shared/avatars.ts`) |
| **Fact** | One sum, written `7+5` or `10-2`. The unit everything is counted in |
| **Card** | A fact shown to be answered |
| **Level** | A set of facts (add within 5, …). Levels unlock in order |
| **Mode** | How a round is timed: Blitz, Sprint, Survival, Practice |
| **Skill** | How an answer is given: Easy (four choices) or Arcade (number pad) |
| **Play** | One finished round: a player, a level, a mode, a skill, and every answer in it |
| **Combo** | Right answers in a row. Raises the points per card |
| **Star** | A level's mastery mark, 0 to 3 |
| **Ticket** | The arcade's currency, earned by playing |
| **Badge** | A mastery achievement, earned once |
| **Prize** | A real-world reward with a ticket price and sometimes a badge it needs |
| **Grown-up area** | The PIN-locked screens where prizes are set and handed over |

## User flow

1. **Title screen.** The marquee, the cast, *press start*. A tap or any key.
2. **Who is playing?** Pick a player, or join with a character and a name. A
   device remembers its player, so next time start goes to the floor.
3. **The floor.** Every cabinet. Pick one.
4. **Comet Cards: set up.** Pick a level (locked ones are shown dark), a mode
   and a skill. Each level shows its stars and the player's best.
5. **Play.** One card at a time, large. Answer on the pad or the keys. Right:
   the card zaps away, the combo climbs. Wrong: the right answer shows for a
   moment and the clock waits.
6. **Results.** Score, right and wrong, best combo, tickets earned (counted
   up one by one), any new star or badge, and where the play landed on the
   high score table. Play again, or change the set-up.
7. **Prize Counter.** Tickets and badges against the prize list. Picking a
   prize asks for a grown-up, who enters the PIN to hand it over.

## Comet Cards

### Levels

| Level | Facts | Count |
|---|---|---|
| 1 Add to 5 | `a+b`, sum ≤ 5 | 21 |
| 2 Add to 10 | `a+b`, sum ≤ 10 | 66 |
| 3 Take away | `a-b`, a ≤ 10, result ≥ 0 | 66 |
| 4 Mix to 10 | levels 2 and 3 together | 132 |
| 5 Big sums | `a+b` with a, b ≤ 10 (sums to 20) and the matching take-aways | 242 |

Level 1 is open. Each next level opens when the one before it has a star. A
grown-up can open any level from the grown-up area.

### Modes

| Mode | Ends when | Ranked by |
|---|---|---|
| Blitz | 60 seconds of card time are used | score, high first |
| Sprint | 20 cards are answered right | time, low first; a wrong answer adds 3 seconds and the card returns |
| Survival | three lives are gone (a wrong answer or a card timing out) | score, high first |
| Practice | 15 cards are answered | not ranked |

The clock counts only the time a card is waiting for an answer. It stops
while a missed card's answer is shown, so reading it costs nothing.

Survival's countdown per card starts at 10 seconds and loses 0.3 seconds for
every right answer, down to 2.5.

### Scoring

A right answer scores 100 × the combo multiplier, plus 50 if it took under 2
seconds. The multiplier is ×1 for the first two right answers in a row, ×2
from the 3rd, ×3 from the 6th, ×4 from the 10th and ×5 from the 15th. A wrong
answer scores nothing and resets the combo.

The server replays the answers through the same rules
(`web/shared/comet/rules.ts`) and stores what it computes; the score the
browser showed is never trusted.

### Which card comes next

Not uniform. A fact the player has missed recently is five times as likely
as one they have down; a fact never seen is three times as likely; a slow
one twice. No fact repeats within three cards. A card missed in this round
is put back four cards later.

### Stars

- ★ One timed round (Blitz, Sprint or Survival) with at least 15 right and at
  least 85% right, on either skill.
- ★★ The same on Arcade skill.
- ★★★ A Blitz on Arcade skill with at least 25 right and at least 95% right.

### Easy skill's choices

Four buttons: the answer and three wrong ones chosen to be tempting (one
off, two off, and the answer to the opposite operation when it fits), never
below 0, never repeated, in random order.

## Tickets, badges, prizes

**Tickets per play.** One per right answer on Easy, two on Arcade. Practice
pays a flat 5 for finishing. A new personal best adds 10; a new star adds 20.
A badge pays its own bonus once.

**Badges** are earned once per player and never taken away. The starting
set: first game, each level's first star, combos of 10 and 25, 100 and 1000
right answers, a Sprint with no misses, two stars on every level
(*Arcade Ace*), three stars on every level (*Comet Champion*).

**Prizes** are a list the grown-up edits: a name, a picture, a ticket price,
and optionally a badge that must be held. The arcade starts with three
examples to edit or delete: a candy (100 tickets), an ice cream (300), and a
new video game (2500 tickets and the Arcade Ace badge).

**Handing over a prize** needs the grown-up PIN at the counter. Tickets are
taken at that moment, and the hand-over is written down. There is no
"pending" state: a prize is either still on the shelf or handed over.

**The grown-up area** (PIN, four digits, set on first use and stored only as
a hash) also covers: adding or removing tickets by hand with a note, opening
a level early, and retiring a player.

## Adding a cabinet

1. Add the game to `web/shared/games.ts` (id, title, pitch, what it teaches).
2. Put its rules in `web/shared/<game>/` as pure functions with tests: what a
   legal play is, and how a play is scored from its answers.
3. Register its screen in `web/src/games/index.ts`.
4. Plays, high scores, tickets and badges are the arcade's, not the game's:
   the game posts a play and the arcade does the rest.

## Trust and safety

- **Served to the home network on purpose**, unlike the sibling apps. Every
  route goes through `wrap()`: the Host must be this machine, a private
  address or a `.local` name; the Origin must match it; and the request must
  come from the app. `ARCADE_LOCAL_ONLY=1` binds to this machine only.
- **No personal data beyond a first name and a character.** No accounts, no
  email, nothing leaves the Mac. Nothing personal is committed to the repo.
- **What costs real money is behind the PIN**: handing over a prize, editing
  the prize list, changing tickets by hand. The PIN is checked by the server
  on every such request.
- **The server keeps score.** It recomputes every play from its answers.
- **Kind by design.** A wrong answer shows the right one and costs a combo,
  never points already earned. No ads, no streak guilt, no timers on when
  to come back.

## Non-goals (v1)

- Logins, accounts, or play away from home (a later sync could add it).
- Multiplication, division or numbers past 20 in Comet Cards.
- Spoken questions or speech input.
- A native app. Added to an iPad's home screen it opens full screen.

## Architecture

```
web/shared/     pure rules, shared by server and browser, run directly by Node
web/server/     the API: Vite dev-server middleware, every route behind wrap()
web/src/        the arcade: shell (arcade/), sprites, sound, one folder per game
scripts/db/     the schema, migrations, setup CLI and the row-level functions
docs/           this file, DATA.md (what is stored where), ART.md (the sprites)
```

## What the first PRs contain

1. **Foundation**: the repository, the database, the API wall, the arcade
   shell (title screen, players, the floor), the sprites and the sound.
2. **Comet Cards**: the game, its rules, plays and high scores, stars and
   level unlocks.
3. **Prize Counter**: tickets, badges, prizes and the grown-up area.
