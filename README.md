<h1 align="center">Schoolhouse Arcade</h1>

<p align="center"><b>A retro coin-op arcade of small learning games.</b></p>
<p align="center">Each cabinet drills one idea until recall is fast. Playing earns tickets and badges that a grown-up trades for real prizes.</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Postgres-17-336791?style=flat-square&logo=postgresql&logoColor=white" alt="Postgres 17">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="AGPL-3.0 license"></a>
  <img src="https://img.shields.io/badge/status-early%20WIP-orange?style=flat-square" alt="Status: early WIP">
</p>

<p align="center">
  <!-- Stand-in: replace with docs/hero.png once it is generated from docs/hero-image-prompt.md -->
  <img src="docs/screenshots/title.png" alt="The Schoolhouse Arcade title screen: the name in pixel letters over a starfield, with the twelve characters in a row and PRESS START" width="800">
  <br>
  <sub><i>Press start: twelve characters, one arcade, and a strip of tickets to win.</i></sub>
</p>

## Features

An arcade for a first-grader, played on a tablet over home Wi-Fi and served
from a Mac. The look is an early-80s tube: black glass, scanlines, cyan,
magenta and yellow. [`docs/PRD.md`](docs/PRD.md) has the whole design.

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/characters.png" alt="The character picker: twelve pixel characters in rows of four, six colours of the chosen cat beside them, and a name field" width="100%">
      <br><sub><i>Pick a character, then its colour, then type a name.</i></sub>
      <h3>Twelve characters, no logins</h3>
      <p>A player is a name and a pixel character: an alien, a dinosaur, a robot, a monster, a wizard, a dragon, a ghost, a rocket, a cat, an owl, a frog or a cupcake, each in six colours. Tickets, badges and unlocked levels belong to the player; the high score tables show everyone.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/floor.png" alt="The arcade floor: the Comet Cards and Sound Machine cabinets side by side, and below them the Rhyme Time jukebox and the Sight Word Sprint signpost" width="100%">
      <br><sub><i>The floor: four cabinets so far, and more on the delivery truck.</i></sub>
      <h3>An arcade floor</h3>
      <p>Each cabinet drills one idea until recall is fast. The first is <b>Comet Cards</b>: adding and taking away, 0 to 10. The second is <b>Sound Machine</b>: letter sounds and sounding out short words. The third is <b>Rhyme Time</b>: hearing which words rhyme. The fourth is <b>Sight Word Sprint</b>: the commonest words, known on sight. New cabinets plug into the same players, tickets and badges.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/round.png" alt="A Comet Cards round: the card 1 + 3 = ? beside four large answer buttons, with the score, the clock and a combo of eight" width="100%">
      <br><sub><i>A Sprint round on Easy: one card, four answers, a combo building.</i></sub>
      <h3>Flashcards against the clock</h3>
      <p>Answer the card before the comet burns out. Easy offers four answers to pick from; Arcade has you type it. A wrong answer shows the right one and never takes away anything already earned, and cards a player has missed come round more often.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/setup.png" alt="The Comet Cards set-up screen: five levels, four game modes, two skills and a high score table" width="100%">
      <br><sub><i>Five levels, four ways to play, two skills.</i></sub>
      <h3>Levels and modes</h3>
      <p>Five levels from Add to 5 up to Big Sums; a star on one opens the next. Blitz is 60 seconds, Sprint is 20 cards, Survival is three lives, and Practice has no clock at all. Every combination keeps its own high score table.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/sound-machine-build.png" alt="A Sound Machine Build it round: a picture of an axe chopping a log, buttons to hear the word and hear it slowly, the tiles ch and o in the first two of three boxes, and the tile p left in the tray" width="100%">
      <br><sub><i>Build it: hear "chop", put its sounds in the boxes.</i></sub>
      <h3>Sound Machine</h3>
      <p>Letter sounds and the digraphs ch, ck, sh and th, over six levels. Every word has three sounds, and a digraph is one tile. In <i>Build it</i> you hear a word and put its sound tiles in order. In <i>Read it</i> you sound out a word and find its picture. Every sound is spoken and nothing is timed. A wrong answer shows the right one and takes nothing away.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/sound-machine-split.png" alt="A Split it round on the sh level: a picture of a fish, the word fish cut once into f and ish, three empty gem slots, and a tray holding six gems from the words before" width="100%">
      <br><sub><i>Split it: four letters, three sounds, a gem for each.</i></sub>
      <h3>A gem a sound</h3>
      <p>In <i>Split it</i> a word comes up whole. Tap between its letters to cut it where one sound ends and the next begins, then pull the lever. "Fish" is four letters but three sounds, so it earns three gems. The gems fill a tray for the round and are counted up on the results screen.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/rhyme-time-find.png" alt="A Rhyme Time Find it round answered right: a map on the left, and of a pig, a cap and a pencil between two arrows, the cap lit green, with map and cap written under them and their ending ap lit" width="100%">
      <br><sub><i>Find it: "map" rhymes with "cap".</i></sub>
      <h3>Rhyme Time</h3>
      <p>A jukebox that plays words. In <i>Find it</i> you hear a word and pick the picture that rhymes with it; in <i>Odd one out</i> two of three pictures rhyme and you pick the one that does not. Tap a picture to hear it, then pull the lever. No word is written until you answer: then the rhyme is written with its shared ending lit, and said.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/rhyme-time-odd.png" alt="A Rhyme Time Odd one out round answered wrong: a pin marked red, a pencil between two arrows outlined in cyan, and a wig lit green as the odd one, with pin and thin written and their ending in lit" width="100%">
      <br><sub><i>Odd one out: pin and thin rhyme, so the wig is the odd one.</i></sub>
      <h3>Heard, not read</h3>
      <p>Over 50 words in four levels, each a picture with a spoken clip. On Easy the wrong pictures sound nothing like the word; on Arcade they start the same or share its vowel. Rhymes an accent can blur (pin and pen) are never asked against each other, and the Mac checks every question was a fair one before it scores the answer.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/sight-word-sprint.png" alt="A Sight Word Sprint round: a dragon running a trail of pines with all five speed pips lit, a speaker button, and four written words, one of them lit green" width="100%">
      <br><sub><i>Four right in a row: flat out.</i></sub>
      <h3>Sight Word Sprint</h3>
      <p>The short, common words the letter sounds do not explain: the, of, said, where. You hear a word and tap it among four. Your own character runs a trail across the top, and every right answer in a row makes it run faster; a miss is a jog again, and takes nothing you have earned. No clock.</p>
    </td>
    <td width="50%" valign="top">
      <h3>Known on sight</h3>
      <p>Fifty words in five levels, from Meadow to Summit. On Easy the other three words look nothing like the word; on Arcade they are its look-alikes (the, they, there), so only reading the whole word finds it. No two words in the game sound the same, and the Mac checks every question was a fair one before it scores the answer.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/results.png" alt="A results screen: a time of 13.1 seconds, 20 right, one star, a best yet, 30 tickets won and first place on the high score table" width="100%">
      <br><sub><i>After a round: stars, tickets, and where it landed on the table.</i></sub>
      <h3>Stars, tickets and badges</h3>
      <p>Every right answer pays tickets; stars, badges and beating your own best pay more. The Mac keeps score: a game sends its answers, and the server works out the score, the tickets and the badges, once per round.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/prize-counter.png" alt="The Prize Counter: 465 tickets, with a candy for 100, an ice cream for 300 and a new video game for 2500 that also needs a badge" width="100%">
      <br><sub><i>The Prize Counter: what the tickets can buy today.</i></sub>
      <h3>A Prize Counter for real prizes</h3>
      <p>A grown-up stocks the shelf (a candy, an ice cream, a new video game) and sets the prices. Handing a prize over, changing tickets by hand, opening a level and retiring a player all take a four-digit grown-up PIN, checked on the Mac every time.</p>
    </td>
  </tr>
</table>

The grown-up PIN is chosen on the Mac: open `http://localhost:38900` there
and go to *Grown-ups*. Forgotten it? `npm run pin:reset` at the Mac, then
choose a new one the same way.

## Run it

```sh
brew install postgresql@17 && brew services start postgresql@17
npm install && npm --prefix web install
npm run db:setup
npm run dev
```

Then open `http://localhost:38900` on the Mac, or the *Network* address Vite
prints on a tablet on the same Wi-Fi. On an iPad, *Share → Add to Home
Screen* opens it full screen.

The server answers only this machine, private network addresses and `.local`
names. `ARCADE_LOCAL_ONLY=1 npm run dev` keeps it to this machine.

**Over Tailscale.** The Mac's Tailscale address (`http://100.x.y.z:38900`)
works as it is. For an https name as well, serve the app on **another** port
and tell the app its name (in `.env.local` at the repo root, so the Mac app
sees it too), then restart:

```sh
tailscale serve --bg --https=8900 http://localhost:38900
echo 'ARCADE_TAILNET_HOST=my-mac.my-tailnet.ts.net' >> .env.local
```

Then it is `https://my-mac.my-tailnet.ts.net:8900`. Never serve it on 38900
itself: Tailscale then holds that port on the Mac's Tailscale address, and
the app, which listens on every address, fails to start ("Port 38900 is
already in use").

Only that exact name is answered, never a pattern. Setting up the first PIN
still has to be done at the Mac itself.

### Mac app

`./macos/build-app.sh` installs *Schoolhouse Arcade.app*: click it in the
Dock to start the server and open the arcade in Chrome; quit it to stop the
server. See [`macos/README.md`](macos/README.md). `npm run db:backup` copies
the database into `backups/` ([`docs/DATA.md`](docs/DATA.md) has restore
and an optional daily job).

## Develop

```sh
npm test                           # shared rules, routes, database (in-process PGlite)
npm run typecheck && npm run lint
```

- [`docs/PRD.md`](docs/PRD.md): what was decided, and how to add a cabinet
- [`docs/DATA.md`](docs/DATA.md): what is stored where, changing the schema
- [`docs/ART.md`](docs/ART.md): how the pixel sprites are written and replaced
- [`CLAUDE.md`](CLAUDE.md): the rules that keep it working

## Licence

AGPL-3.0-only. All art, names and sounds are original.
