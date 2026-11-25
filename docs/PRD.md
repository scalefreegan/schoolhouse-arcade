# Schoolhouse Arcade — PRD

A **retro coin-op arcade of small learning games** for a first-grader and
the grown-up playing alongside. Each cabinet is one standalone game that
drills one idea until recall is fast. Playing earns **tickets** and
**badges**, and a grown-up trades those for **real prizes** (an ice cream, a
candy, a new video game). The list of cabinets is meant to grow; the first
is **Comet Cards**, addition and subtraction flashcards against the clock,
and the second is **Sound Machine**, letter sounds and sounding out short
words (build a word, read one, or split one into its sounds), with nothing
timed, and the third is **Rhyme Time**, hearing which words rhyme, from
pictures and voices alone.

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
| Players | **Profiles with avatars.** A "Who is playing?" screen; each player picks a pixel character, its colour, and a name. Tickets, badges and unlocks are per player; the high score tables show everyone |
| Theme | Space and aliens, dinosaurs, robots, monsters: **all four**, as the cast of avatars, since joined by a wizard, a dragon, a ghost, a rocket, a cat, an owl, a frog and a cupcake (twelve, in rows of four), each in six colours. The first game is the space one |
| Hosting | **Mac server and Postgres**, the shape of Lingo Dojo and Lean Into It. The tablet reaches the Mac over home Wi-Fi; scores are shared across devices; it works when the Mac is on and at home |
| Artwork | **Pixel sprites drawn in code** (`web/src/sprites/art.ts`): small character grids with palettes. Nothing downloaded, nothing to license. `docs/ART.md` says how to swap in made art later |
| Look | **Neon CRT cabinet.** Early-80s coin-op: black glass, scanlines and glow, cyan / magenta / yellow, chunky pixel type, a title screen that says *press start* |
| Stack | Match Lean Into It: React 19 + Vite 8 + TS strict, Vite middleware API behind `wrap()`, Tailwind 4, oxlint, `node --test`, beads (prefix `arc`); **port 38900** |
| Repo | **Private** for now, `github.com/scalefreegan/schoolhouse-arcade`, **AGPL-3.0-only** |

## Vocabulary

| Word | Meaning |
|---|---|
| **Cabinet** | One game on the arcade floor. Listed in `web/shared/games.ts` |
| **Player** | A row picked on the "Who is playing?" screen: a name, an avatar and its colour. No logins |
| **Avatar** | The pixel character a player is, in one of its colours (`web/shared/avatars.ts`). The first colour is the character's own look |
| **Fact** | What a game asks: one sum, written `7+5` or `10-2`, in Comet Cards; one word, `chick`, in Sound Machine and Rhyme Time (there, the word a question is about). The unit everything is counted in |
| **Sound** | One spoken sound (a phoneme): the k of cat, kick and duck is one sound |
| **Tile** | The letter or letters that write one sound: `c`, `a`, `ch`, `ck`. A digraph is one tile |
| **Card** | A fact shown to be answered |
| **Level** | A set of facts (add within 5, …). Levels unlock in order |
| **Mode** | How a round is played: in Comet Cards how it is timed (Blitz, Sprint, Survival, Practice); in Sound Machine which game (Build it, Read it, Split it); in Rhyme Time Find it or Odd one out |
| **Rhyme family** | In Rhyme Time, words whose vowel and what follows it sound the same: cat, hat, chat and bat are the family `a-t`. Kept as data, never guessed from spelling |
| **Gem** | In Split it, one sound of a word split right. Shown during the round and on its results only; never stored |
| **Skill** | How hard a round is: in Comet Cards Easy (four choices) or Arcade (number pad); in Sound Machine and Rhyme Time how many pictures or tiles there are, and how alike |
| **Play** | One finished round: a player, a level, a mode, a skill, and every answer in it |
| **Combo** | Right answers in a row. Raises the points per card |
| **Star** | A level's mastery mark, 0 to 3 |
| **Ticket** | The arcade's currency, earned by playing |
| **Badge** | A mastery achievement, earned once |
| **Prize** | A real-world reward with a ticket price and sometimes a badge it needs |
| **Grown-up area** | The PIN-locked screens where prizes are set and handed over |

## User flow

1. **Title screen.** The marquee, the cast, *press start*. A tap or any key.
2. **Who is playing?** Pick a player, or join with a character, a colour and
   a name. The colours are the character itself, once in each. A
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
while a missed card's answer is shown, so reading it costs nothing. An
answer is never counted as taking less than 250 ms (nobody reads a card and
answers faster), so a round of instant answers still uses up its clock; this
bounds a forged play, it does not make a time trustworthy.

The server keeps a clock of its own for each round: it is started (on the
Mac) before the countdown, and a play whose cards claim more time than the
whole round took is not saved. A real round always takes longer than its
cards: the countdown, each answer shown and the pause before the results are
never counted. A round cannot start without the Mac (the screen says "No
signal" and offers Try again, before anything is played), and one player's
rounds are saved one after another: a round is refused if another round of
the same player was saved while it was played. This makes a hand-made play
wait out the time it claims; it still does not make a card's time
trustworthy.

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

## Sound Machine

A machine that builds words out of sound tiles. Decided 2026-11-24 by the
grown-up: one cabinet, two ways to play, no clock anywhere, real spoken
sounds, and a different kind of game from Comet Cards. A third way to play,
Split it, was added on 2026-11-25 after the classroom activity it copies (see
a word, pull out its sounds, a gem on each).

### Three games

| Game (mode id) | The player | The answer |
|---|---|---|
| **Build it** (`build`) | sees a picture and hears its word, then puts sound tiles into boxes in order, one sound a box, and pulls the lever | the tiles, in order (`ch-i-ck`) |
| **Read it** (`read`) | sees the word, a button under each sound to hear it, sounds it out, and picks its picture | the word picked |
| **Split it** (`gems`) | sees the word as plain letters joined in one block, with its picture, and hears it; taps between letters to cut it where one sound ends and the next begins (a tap again joins them), and pulls the lever | the letters as cut (`sh\|i\|p`) |

A digraph is one tile and one box. In Build, pressing a tile says its sound
and puts it in the next empty box; pressing a box says it and takes it back
out; a button says the whole word again, and the snail beside it says it
slowly (one word still, the way a teacher says it for a child); the lever
does nothing until every box is full. In Read, pressing a sound says it,
and the blend button says the sounds one at a time, takes a breath, and
says them again run together. **Read never says the whole word before the
answer**, plain or slow: hearing it would be the answer. Both buttons
appear once it is answered.

In Split, the point is that sh, ch, ck and th are one sound each: "ship" is
four letters and three sounds. The word comes up whole and is said (as in
Build: the question is where its sounds part, and its picture names it
anyway). A letter is not a button and nothing says a piece before the
answer, since a piece with no sound would give the answer away. A tap on
either half of a letter goes to the gap on that side, so the gaps are easy
to hit with a finger. The lever does nothing until the word has been cut at
least once. Right: a gem drops on each piece as its sound is said, the
word is said whole, and the gems fly into the round's tray. Wrong: the cut
tried is crossed out above, the right pieces are shown in the game's cyan
and sounded out the same way, and no gem is taken from the tray.

**Gems are for the round only.** Each sound of a word split right is one
gem (three a word). They fill the tray during the round and are counted on
the results, where they stand for the same right words as the score, the
stars and the tickets: they are not paid on top, and they are not stored.

A sound on its own is said the way a teacher models it: one that can be
held is held ("mmmm", "ssss", a long open "a"), and one that cannot (b, d,
g, p, t, k, ch) is one clear burst with no "uh" hung on a quiet one.

One try a word. In every game the word is then said sound by sound,
unhurried, and whole. After a right answer the next word comes by itself when that has
been said. A wrong one shows the right one (the word built in the boxes
with the try crossed out above it, the right picture lit, or the right
pieces with the cut tried crossed out above them); the next word
comes when the player presses the arrow, which lights when the word has
been said. A new word always stops whatever was being said of the last.
Nothing earned is ever taken away.

### Levels

Every word is three sounds: a consonant, a short vowel, a consonant, where a
digraph counts as one consonant. No blends, no long vowels, no silent
letters, no x, no doubled letters, and th is always the quiet one of *bath*.
A level's words need only what it and the levels before it teach, and each
has a picture a six-year-old can name.

| Level | Its words |
|---|---|
| 1 3 sounds (`cvc`) | cat hat bed web pig pin dog log sun bug cup |
| 2 ch | chip chin chop chat rich |
| 3 ck | duck sock rock lock kick neck sack lick |
| 4 sh | ship shop shed fish dish cash |
| 5 th | bath moth path math thin thick |
| 6 Mix | every word of levels 2 to 5, and chick check shock |

Level 1 is open; a star on a level opens the next; a grown-up can open any.

**A round is eight different words.** It takes as many of the level's own
words as it can hold and, where a level has fewer than eight (ch has five,
sh and th six), fills up with words from the levels before, so ch is
practised beside the c and h it is mistaken for. Which words come up leans
towards the ones the player has missed lately (five times as likely as a
word they know) and the ones never seen (three times).

### Skills

| Skill | Build it | Read it | Split it |
|---|---|---|---|
| Easy | exactly the tiles the word needs, mixed up | three pictures | an empty gem slot for each of the word's sounds, as a hint; the lever still takes any cut |
| Arcade | up to three more tiles that tempt: another vowel, a consonant that looks or sounds like one of the word's, and, once ck is taught, another spelling of its k sound | four pictures, the wrong ones starting or ending with the same sound where the level has any | no slots |

Split's lever does not wait on Easy for as many pieces as there are slots:
a three-letter word has only one way into three pieces, so that would make
every one of them right.

A level never offers a digraph it has not taught. Two pictures that could
be taken for each other (a bug and a moth, a shop and a shed) are never
offered together. Build is judged on spelling: `d-u-k` sounds right and is
not how duck is written.

### Scoring and stars

A right word scores 100, and 20 more for each right word before it in a row.
All three games rank by score, with a table for each level, game and skill
(Split's tables are its own). A finished round earns ★ for 5 right, ★★ for
7, ★★★ for all 8, on either skill and in any of the three games: a level's
stars are the level's, so a star won in Split opens the next level as one
won in Build does, and the Sound Machine badges count it the same. Split
adds no badge of its own. Tickets: one a right word on Easy, two on Arcade,
and the arcade's own bonuses.

The server judges every answer from what is posted (the word, and the word
picked, the tiles placed or the letters as cut) with
`web/shared/soundmachine/rules.ts`; a verdict or a number from the browser
is not read. It refuses a word the level does not hold, a word twice in a
round, more than eight, more old words than the level leaves room for, and
an answer that is not a word (Read), not a box-full of tiles (Build) or not
the word's own letters cut into pieces (Split). Split's answer is stored as
text, like the others (`answers.given_text`).

There is no clock for the player. The time a word waited is kept, to be
looked at, and counted as at least one second, so that the server's round
clock means the same here as in Comet Cards: a hand-made round has to wait
the eight seconds it claims. A real round always takes longer than its
words, because each answer stays up (1.7 seconds when right, at least 1.4
when wrong) before the next word can come. Split keeps the same times.

### Speech

Every sound and every word is a recorded clip, made ahead of time by
`npm run speech:build` (Azure text-to-speech, one voice) and served by the
Mac as a static file: the game calls nowhere outside the house and needs no
key to run. A word has two clips, plain and slow. A round's clips are
fetched before it starts, and none is waited on for more than eight
seconds. Build cannot ask a word it cannot say, so a Build round does not
start without its words' clips (the screen says so, with a way back and a
way to try again); any other clip that will not come is left out, and that
tile or button is silent. The game needs sound: with the sound switch off
it says so and offers to turn it on rather than start in silence, from the
set-up screen and from Play again alike, and a round in which the sound is
switched off stops and says the same. *Grown-ups → Sound check* plays
every sound and every word, plain and slow, so the pronunciation can be
listened through in one place.

## Rhyme Time

A jukebox that plays words, and the player listens for the rhyme. Added
2026-11-25: a third cabinet for the skill that comes before sounding out,
hearing that cat and hat end the same. It is built like Sound Machine's
Read it (pictures, voices, a lever, no clock), and it reuses Sound
Machine's words, pictures and clips, with sixteen words of its own.

### Two games

| Game (mode id) | The player | The answer |
|---|---|---|
| **Find it** (`find`) | sees a picture and hears its word, then hears each picture to pick from, and picks the one that rhymes | the question and the picture picked (`cat>hat\|pin\|dog=hat`) |
| **Odd one out** (`odd`) | sees three pictures and hears each; two rhyme, and the player picks the one that does not | the question and the picture picked (`cat\|hat\|pin=pin`) |

**Before the answer it is pictures and voices only.** A written word would
let the letters find the rhyme (and the letters of a rhyme do not always
match: sock and lock do, but the game is about the ear). Pressing a picture
says its word and makes it the player's choice (magenta); pressing another
changes the choice; the lever does nothing until one is chosen. In Find it
the word to rhyme with stays on the left (on top, on a narrow screen), and
pressing it says it again. When a question comes up its words are said in
turn, each picture glowing as it is said.

One try a question. Then the words are written under their pictures, lower
case, with the ending they share lit in the game's cyan (c**at**, h**at**),
and the rhyme is said: the word and its rhyme (Find it), or the pair and
then the odd one (Odd one out). Right: the picture is lit green and the next
question comes by itself once the words have been said. Wrong: the try is
marked red, the right picture is lit green (and in Odd one out the pair is
shown in cyan), and the arrow lights once the words have been said. Neither
waits on a clip for more than six seconds. Nothing earned is taken away.

### Words and rhymes

Every word is three sounds, as in Sound Machine: all 39 of its words, and
bat van fan pan cap map wig hen pen ten net jet mop mug rug bun, added so
the families are bigger (van and jet bring the two sounds Sound Machine has
no tile for). Two words rhyme when their vowel and last sound are the same
sound (sock, lock, rock and shock are one family: c, k and ck are one
sound); that is data in `web/shared/rhymetime/words.ts`, never a guess from
the spelling.

Kept out of each other's questions:

- **Doubtful rhymes.** Many American speakers say pin and pen alike, so the
  `i-n` and `e-n` families never stand in one question: a wrong answer
  there would be right to the ear that hears it.
- **Lookalike pictures.** Sound Machine's pairs, and a cap and a hat, a mug
  and a cup, a net and a web, a pen and a pin, a hen and a chick, a map and
  a path, the number ten and the sum, a bun and a chip, a bat and a moth, a
  hen and a duck.

### Levels

| Level | Its words |
|---|---|
| 1 a i (`a-i`) | cat hat chat bat · van fan pan · cap map · pin chin thin · pig wig · chip ship |
| 2 o e u (`o-e-u`) | dog log · chop shop mop · bed shed · hen pen ten · net jet · web · bug mug rug · sun bun · cup |
| 3 ck sh th (`ck-sh-th`) | rock sock lock shock · kick lick chick thick · neck check · fish dish · bath path math · sack cash rich duck moth |
| 4 Mix (`mix`) | every word |

A question is about a word with a rhyme on its level; a word without one
(web, cup, duck, …) is only ever a wrong picture. Level 1 is open; a star on
a level opens the next; a grown-up can open any.

**A round is eight questions about eight different words.** Which words
leans towards the ones the player has missed lately (five times as likely
as a word they know) and the ones never seen (three times), and a family is
not asked about twice while the level has one not yet asked. In Odd one out
a pair is never asked twice in a round.

### Skills

| Skill | Find it | Odd one out |
|---|---|---|
| Easy | three pictures; the two wrong ones share no sound in the same place with the word (not the first sound, the vowel or the last sound) | three pictures; the odd one shares no sound in the same place with either of the pair |
| Arcade | four pictures; the wrong ones are near misses where the level has them (the same first sound as the word, or its vowel), and at least one always is when the level has a word that could be | three pictures; the odd one is a near miss (the same first sound as one of the pair, or their vowel) whenever the level has a word that could be |

In Find it, no two wrong pictures rhyme with each other, so there is one
answer and the others are not a second pair.

### Scoring and stars

As Sound Machine: a right answer scores 100, and 20 more for each right
answer before it in a row; a table for each level, game and skill; ★ for 5
right, ★★ for 7, ★★★ for all 8, in either game and on either skill; tickets
one a right answer on Easy, two on Arcade, and the arcade's own bonuses.
Two badges: Good Ear and Rhyme Champion (below). No per-level star badges,
to keep the Prize Counter's badge wall short.

The server judges every answer from the question and the pick
(`answers.given_text`), with `web/shared/rhymetime/rules.ts`. It refuses a
question about a word with no rhyme on the level, a word asked about twice,
a picture not on the level, a picture twice in a question, the wrong number
of pictures for the skill, lookalike pictures together, a doubtful rhyme,
a question with no single answer, an Easy question whose wrong pictures
(or odd one) share a sound in the same place with the word (or the pair),
an Arcade question with no near miss where the level had one to show (so an
Easy round cannot be sent as Arcade's, for its tickets or its table), an Odd
one out pair asked twice, and a pick that is not one of the pictures. Whether the pick is right is the server's
finding, not the browser's.

Nothing is timed for the player. As in Sound Machine, each question's time
is counted as at least one second and each answer stays up (1.7 seconds
right, at least 1.4 wrong) before the next can come, so the server's round
clock holds.

### Speech

A word Sound Machine has is said with Sound Machine's clip. Rhyme Time's
sixteen own words have one plain clip each, made by the same
`npm run speech:build` into `web/public/speech/rhyme-time/`. A round's
words are fetched before it starts, and a round does not start without them
(the pictures mean nothing unheard). Like Sound Machine it will not start,
or go on, with the sound switched off. *Grown-ups → Sound check* lists Rhyme
Time's own words after Sound Machine's.

## Tickets, badges, prizes

**Tickets per play.** One per right answer on Easy, two on Arcade. Practice
pays a flat 5 for finishing. Beating your own best with a set-up adds 10;
each new star adds 20. A badge pays its own bonus once. Every line is
written to a ledger (`ticket_events`); a balance is the sum of its rows,
and rows are only ever added. A round pays once: sending it again after a
lost reply shows what it paid the first time.

**Badges** are earned once per player and never taken away
(`web/shared/badges.ts`). Whether one is earned is asked after every play,
from everything the player has done, so a badge added later reaches whoever
already deserves it the next time they play.

| Badge | For | Pays |
|---|---|---|
| First Game | finishing a game | 10 |
| *Level* Star (five of them) | a first star on that level | 25 each |
| Hot Streak | 10 right in a row | 20 |
| Unstoppable | 25 right in a row | 50 |
| 100 Club | 100 right answers | 30 |
| 1000 Club | 1000 right answers | 150 |
| Clean Sweep | a Sprint with no misses | 40 |
| Arcade Ace | two stars on every Comet Cards level | 200 |
| Comet Champion | three stars on every Comet Cards level | 500 |
| *Level* Star (six of them, Sound Machine's) | a first star on that Sound Machine level | 25 each |
| Word Builder | a star on every Sound Machine level | 100 |
| Sound Champion | three stars on every Sound Machine level | 300 |
| Good Ear | a star in Rhyme Time | 25 |
| Rhyme Champion | three stars on every Rhyme Time level | 300 |

Arcade Ace and Comet Champion mean Comet Cards' levels, as they always
have; the counting badges (First Game, the Clubs, the streaks) count every
game.

**Prizes** are a list the grown-up edits: a name, one of eight pictures, a
ticket price, and optionally a badge that must be held. The arcade starts
with three examples to edit or delete: a candy (100 tickets), an ice cream
(300), and a new video game (2500 tickets and the Arcade Ace badge).

For scale: a good Easy Blitz is about 20 tickets and a good Arcade one about
50, so a candy is a handful of rounds and an ice cream a week of short
sessions. The prices are the grown-up's to change.

**The Prize Counter** (`#/prizes`) shows a player their tickets, the shelf
with a bar filling towards each prize, every badge (unlit until earned,
with how to earn it) and the prizes they have won.

**Handing over a prize** needs the grown-up PIN at the counter, typed at
that moment. Tickets are taken then, and the hand-over is written down with
the name and price of the day. There is no "pending" state: a prize is
either still on the shelf or handed over. A prize can be won more than
once.

**The grown-up area** (`#/grownups`) is behind the same PIN and also covers:
editing the shelf, adding or taking away tickets by hand with a note (a
balance never goes below nothing), opening a level early, and retiring a
player.

**The PIN** is four digits, chosen on first use and stored only as a salted
scrypt hash. The first one is chosen only on the Mac itself, in its own
browser at `http://localhost:38900`: until there is a PIN, the tablet says
so and offers no pad, or whoever opened *Grown-ups* first would choose it.
Once there is one it is changed from any device, with the old PIN. It is
sent with every request that needs it and checked by the server every time;
the browser keeps it only while the grown-up screen is open. Five wrong
tries in a row lock every PIN request for a minute. It keeps a six-year-old
out; it is not a safe. A forgotten PIN is reset at the Mac:
`npm run pin:reset`.

## Adding a cabinet

1. Add the game to `web/shared/games.ts` (id, title, pitch, what it teaches).
2. Put its rules in `web/shared/<game>/` as pure functions with tests: what a
   legal play is, and how a play is scored from its answers.
3. Register its screen in `web/src/games/index.ts`.
4. Plays, high scores, tickets and badges are the arcade's, not the game's:
   the game posts a play and the arcade does the rest. So are the set-up,
   saving and results screens (`web/src/games/Cabinet.tsx`): a game supplies
   its round and what it has to say about the words or cards missed.
5. An answer is a number or a piece of text (`AnswerInput.given`); the
   game's rules decide which they take.

## Trust and safety

- **Served to the home network on purpose**, unlike the sibling apps. Every
  route goes through `wrap()`: the Host must be this machine, a private
  address, a `.local` name or the one Tailscale name a grown-up set
  (`ARCADE_TAILNET_HOST`); the Origin must match it; and the request must
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
- Speech input, or speech made while the game runs (Sound Machine's clips
  are made ahead of time).
- Blends, long vowels and longer words in Sound Machine and Rhyme Time.
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
