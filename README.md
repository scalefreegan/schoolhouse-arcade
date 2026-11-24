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

<!-- docs/hero.png goes here once it is generated from docs/hero-image-prompt.md -->

## What it is

An arcade for a first-grader, played on a tablet over home Wi-Fi and served
from a Mac. A player picks a pixel character and a name, walks onto the
floor and picks a cabinet. The look is an early-80s tube: black glass,
scanlines, cyan, magenta and yellow.

The first cabinet is **Comet Cards**: addition and subtraction flashcards,
0 to 10, against the clock. [`docs/PRD.md`](docs/PRD.md) has the whole
design: levels, modes, scoring, tickets, badges and prizes.

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
