# AGENTS.md

Guidance for AI agents working on the qbreader/website codebase. Read this fully before making changes — the repo has strong conventions and an unusual isomorphic architecture that are easy to violate if you pattern-match from typical Node/React projects.

## What This Project Is

[qbreader.org](https://www.qbreader.org) is a website for practicing quizbowl (competitive academic trivia). It offers:

- **Singleplayer practice** — tossups and bonuses read word-by-word in the browser, with buzzing, answer checking, and stat tracking. Runs entirely client-side.
- **Multiplayer rooms** — real-time rooms over WebSockets where players hear the same question and race to buzz.
- **A searchable question database** — tens of thousands of tossups/bonuses from real tournaments, stored in MongoDB.
- **Geoword** — a paid audio-based geography competition (Stripe integration).
- **User accounts** — stats, starred questions, email verification, leaderboards.

The production stack is Heroku + MongoDB Atlas. The server intentionally restarts daily at 8:00 AM UTC.

## Philosophy

These are the principles this codebase is built on. Work within them rather than against them.

1. **Boring, dependency-light JavaScript.** This is a plain ES-modules Node.js + vanilla-browser-JS project. There is no TypeScript, no framework on the server beyond Express, and React is used only on a handful of complex pages. Do not introduce new frameworks, build steps, or dependencies when the existing tools can do the job. A new npm package needs a strong justification.

2. **Types are documentation, enforced by discipline.** Types live in JSDoc comments (see `types.js` for the core `Tossup`/`Bonus`/`Packet`/`Set` typedefs). Keep JSDoc accurate on any function you touch. Do not add TypeScript.

3. **Validate at the boundary, trust inside.** Every HTTP query parameter is validated/coerced in `routes/` using the helpers in `routes/validators/`. Functions in `database/` **assume their arguments are already type-correct** (though they may be logically wrong, e.g. a set name that doesn't exist). Never put type validation in `database/`; never skip it in `routes/`.

4. **Write once, run on both sides.** The quizbowl game engine in `shared/` runs unchanged in the browser (solo play) and on the server (multiplayer). Code in `shared/` must never import server-only (`fs`, `mongodb`, …) or browser-only (`document`, `window`, …) dependencies. This isomorphism is the most valuable property of the architecture — protect it.

5. **Small files, one job each.** Database functions are one-per-file (`get-tossup.js`, `create-user.js`). Routes mirror the URL structure one-per-file. Follow this granularity; don't create grab-bag utility files.

6. **Match the house style exactly.** Lint (`semistandard`) is a hard CI gate. Beyond lint, follow the naming and ordering conventions below — consistency is valued over personal preference.

7. **Verify before you claim done.** There is no automated test suite. Correctness is established by building (`npm run build`), running the server, and exercising the affected page or endpoint. Never consider a task complete on the strength of "it should work."

## Repository Layout

```
app.js                 Express app assembly (middleware, session, security headers)
server.js              Entry point: HTTP server + WebSocket server
types.js               JSDoc typedefs for core question data shapes

client/                Everything served to the browser (static, no server code)
  play/                Game pages: tossups/, bonuses/, mp/ (multiplayer), geoword/
  db/                  Question database explorer (React)
  scripts/             Shared client utilities, api wrappers, React components
  user/                Account pages (login, signup, stats, stars)
  ssi/                 HTML fragments injected server-side (nav, head, modals)
  admin/, settings/, about/, tools/  Misc pages

shared/                Isomorphic game engine + constants (client AND server)
  Room.js → QuestionRoom.js → TossupRoom.js / BonusRoom.js / TossupBonusRoom.js
  Player.js, Team.js, CategoryManager (category-manager.js), categories.js

routes/                Express routers; folder structure mirrors URL structure
  api/                 Public JSON API (/api/tossup, /api/query, …)
  auth/                Account endpoints (login, signup, password reset, stars)
  validators/          Query-param validation helpers (int, enum, string, …)
  ssi-middleware.js    Injects client/ssi/ fragments into served HTML

database/              All MongoDB access, one function per file
  databases.js         MongoClient connection (top-level await on import)
  qbreader/            Question data (three databases: qbreader,
  account-info/         account-info, geoword — each folder has a
  geoword/              collections.js exporting its collections)

server/                Remaining server-only code
  multiplayer/         WebSocket room server (wraps shared/ room classes)
  moderation/          IP bans, username filtering, profanity checks
  authentication.js    Password hashing, JWTs, email verification tokens

scss/                  Source styles → compiled to client/style.css via sass
tools/                 Operator CLI scripts (upload sets, backups, migrations)
docs/                  Static assets served by GitHub Pages (not documentation)
.github/CONTRIBUTING.md  Human contributor guide — the conventions there apply
```

Routing example: `routes/api/packet.js` handles `/api/packet`; `routes/api/index.js` handles `/api`. Static files are served from `client/` by express.static with `.html` extension inference, plus `node_modules/` and `shared/` are served statically (client code imports Bootstrap and shared modules by URL path).

## The Game Engine (read before touching gameplay)

The core abstraction is a **Room** that receives typed messages and emits typed messages, defined in `shared/`:

- `Room` — players, sockets, timer, `message()` dispatch, `emitMessage()` broadcast.
- `QuestionRoom` — query settings (set, categories, difficulties), question fetching.
- `TossupRoom` / `BonusRoom` / `TossupBonusRoom` — game-mode logic (buzzing, reading speed, scoring), built partly via mixins (`TossupRoomMixin`).

**Solo play** (`client/play/tossups/`, `client/play/bonuses/`): the room class runs *in the browser* (`SoloTossupRoom`), wired to a fake socket object whose `sendToServer` calls `room.message(...)` directly and whose `send` calls the client's `onmessage`. No server round-trips during gameplay.

**Multiplayer** (`server/multiplayer/`): `ServerTossupRoom` etc. extend the same shared classes, adding persistence, moderation, vote-kick, and real WebSocket sockets (`handle-wss-connection.js`). The browser side (`client/play/mp/`) uses a real WebSocket with the same message protocol.

Client counterparts live in `client/play/*Client.js` (`QuestionClient` → `TossupClient` → …): they receive room messages and update the DOM. When you add a message type, you must handle it in the room class (game state), the client class (DOM), and — for multiplayer — confirm it serializes over the wire (10 KB max WebSocket payload).

## Build, Run, Verify

```sh
npm install
npm run build        # webpack (.jsx → .min.js) + sass (scss → client/style.css)
npm start            # serve on localhost:3000
npm run lint         # semistandard --fix (CI gate)

npm run webpack -- --watch   # rebuild .jsx on change
npm run sass -- --watch      # rebuild .scss on change
```

Requirements and gotchas:

- **`.env` is required.** `MONGODB_USERNAME`/`MONGODB_PASSWORD` (or `MONGODB_URI`) must point at a MongoDB instance with the qbreader data; credentials for the real read-only DB come from the maintainer (see CONTRIBUTING.md). `databases.js` uses **top-level await** — merely importing anything that touches `database/` connects to MongoDB, so the server won't boot without a reachable DB. Other env vars: `SECRET`, `SALT`, `SECRET_KEY_1`, `SECRET_KEY_2` (required in production, defaulted in dev), `EMAIL_USERNAME`/`EMAIL_PASSWORD`, `STRIPE_SECRET_KEY`/`STRIPE_SIGNING_SECRET`, `BASE_URL`, `PORT`, `NODE_ENV`.
- **Build artifacts are gitignored.** `**.min.js`, `**.css`, `**.css.map` are never committed. If a page looks broken or unstyled, run `npm run build` first. Never edit a `.min.js` or `client/style.css` directly — edit the `.jsx` or `scss/` source.
- React pages are only the six webpack entries in `webpack.config.js` (tossups, bonuses, mp room, db explorer, frequency list, category reports). Everything else is plain JS/HTML served as-is — **plain `.js` client files are not transpiled or bundled**, so they must be valid browser ES modules as written.
- Some client files import directly from CDNs (e.g. `qb-answer-checker` from jsdelivr in `client/scripts/api/index.js`); this is intentional.
- HTML pages use a homegrown SSI system: `<!--#include virtual="/ssi/nav.html" -->` comments are replaced server-side (`routes/ssi-middleware.js`) with fragments from `client/ssi/`. New pages should include `head.html` and `nav.html` the same way.

### Verification expectations

Lint must pass (`npm run lint` — it auto-fixes most issues). Then actually exercise your change: load the affected page, hit the endpoint with curl, or play through the game flow you modified. For gameplay changes test both solo and multiplayer paths if the change is in `shared/`.

## Code Conventions

- **Style**: [semistandard](https://github.com/standard/semistandard) — 2-space indent, semicolons, single quotes. CI fails otherwise.
- **Modules**: ESM everywhere (`"type": "module"`). Use explicit file extensions in imports (`./foo.js`).
- **Naming**: kebab-case filenames for modules (`get-random-name.js`); PascalCase filenames for classes (`TossupRoom.js`). A class with a **lowercase name consists of all static methods** (e.g. `api`, `account`); a **capitalized class is meant to be instantiated**.
- **Client file ordering** (top to bottom): imports → global variables → function definitions → DOM event listeners → other code.
- **DOM**: use `textContent`, never `innerText`. Think hard before using `innerHTML` with user-influenced input — user-facing multiplayer strings are sanitized with DOMPurify on the server; don't create new unsanitized paths.
- **Routes**: validate every query param through `routes/validators/` helpers (they coerce, clamp, and default rather than reject where sensible). Return proper status codes: 400 for invalid input, 404 for not found, JSON bodies for data.
- **Database**: one exported function per file; JSDoc the parameters and return type; get collections from the folder's `collections.js`.

## Boundaries and Cautions

- **Don't touch money or auth casually.** `routes/api/webhook.js` (Stripe, uses raw body parsing mounted *before* `express.json()` — order matters), `server/authentication.js`, and `database/geoword/` payment code should only change when the task explicitly requires it.
- **Rate limiting and moderation exist for a reason** (`server/RateLimit.js`, `server/moderation/`). Don't loosen limits, ban logic, or the 10 KB WebSocket max payload as a side effect.
- **Deprecated API routes** (`routes/api/deprecated/`) are kept for external consumers. Don't delete or change their behavior.
- **The answer checker is a separate package** ([qb-answer-checker](https://github.com/qbreader/qb-answer-checker)). Answer-judging bugs are usually fixed there, not here.
- **`docs/` is not documentation** — it's static assets for GitHub Pages. Real contributor docs are `README.md` and `.github/CONTRIBUTING.md`.
- The MongoDB data itself is shared infrastructure. Tools in `tools/` mutate the live database — never run them speculatively.

## KSHSAA Fork (this checkout only)

`Adncoder/website` is a fork adding KSHSAA Scholars Bowl practice tooling.
Everything under `routes/kshsaa-*.js`, `server/kshsaa/`, and the root
`import-*.js` scripts is fork-only and does not exist upstream; the rest of this
document describes the upstream codebase and still applies.

| File | Page |
| --- | --- |
| `routes/kshsaa-play.js` | The reader: MODAQ plus a timer bar, the World Language full-screen display, lineup reuse, next round with the same teams, and save-once stats export |
| `routes/kshsaa-round.js` | Builds a 16-question round from MongoDB at a level, never repeating a question before its pool runs out; exports `CATEGORY_BY_QUESTION`, `CATEGORIES`, `LEVELS`, and the shared `levelControls()` markup |
| `routes/kshsaa-stats.js` | Password-gated practice stats: sign-in for every KSHSAA page, upload, rosters and squads, lineups, month and level filters, players table, the game editor, the read-only export |
| `routes/kshsaa-insights.js` | Insights: team builder, player focus report, question difficulty (numbers from `server/kshsaa/insights.js`) |
| `routes/kshsaa-questions.js` | Question bank: review, approve, reject, add |
| `routes/kshsaa-tournaments.js` | Tournaments: printable scoresheet, entry grid for typing a sheet in afterwards, season table |
| `routes/kshsaa-spanish.js` | Spanish practice |
| `server/kshsaa/math-tier.js` | Sorts a math question into basic / intermediate / advanced from its wording |
| `server/kshsaa/giveaway.js` | Turns a middle-school tossup into a Beginner question (its giveaway line) |
| `server/kshsaa/name-autocomplete.js` | Player-name autocomplete fragment shared by the reader and the game editor |
| `server/kshsaa/game-stats.js` | Reading stored games: who played and for how long, celerity, month/level filters |
| `server/kshsaa/nav.js` | The bar across every KSHSAA page (logo, sections, QBReader link) and the favicon; `client/kshsaa/logo.svg` is the mark |
| `import-kshsaa.js`, `import-beginner.js`, `import-current-events.js` | Operator scripts that load questions into MongoDB; run by hand with `MONGODB_URI` set. The last two share `server/kshsaa/qbreader-import.js` |

Round structure follows the official KSHSAA manual, verified against 117 real
packets: 1 World Language, 3 Language Arts, 3 Science/Health, 3 Social Studies,
3 Mathematics, 2 Fine Arts, 1 Year in Review.

### Question sources and levels

Every question the pages use carries `kshsaaImport: true`; the **set name
prefix** says where it came from: `QB Converted` (varsity quizbowl rewritten
for scholars bowl), `SJA Generated` (question bank), `QB Beginner`
(`import-beginner.js`), `QB Current Events` (`import-current-events.js`, recent
Year in Review only), anything else real KSHSAA. `LEVELS` in
`kshsaa-round.js` lists the pools each level draws from in order of preference,
ordered by how hard the clues are: Beginner reads the middle-school giveaways,
JV the real KSHSAA archive (whose clues are easy), Varsity converted quizbowl.
Later pools fill slots the earlier ones cannot (the converted and Beginner sets
have no World Language, and the converted sets no math).

Year in Review uses only questions written this calendar year or last. The year
comes from the set name (the spring year of a `24-25` season, else the latest
year in the name), because imported sets store a placeholder `set.year`; only
question-bank tossups (`sjaGenerated`) are trusted to carry a real one. A set
whose name has no year is never used for Year in Review.

Rounds avoid repeats through `kshsaa_question_usage` (one document per question
used, keyed by the tossup id as a string): unread questions first, then the ones
read longest ago. A question counts as used as soon as a round is generated, and
builds run one at a time so simultaneous rooms cannot draw the same question.
`import-kshsaa.js` re-creates tossup ids, so re-running it resets this history.

Every page puts `${KSHSAA_HEAD}` in its `<head>` and `${kshsaaNav('/kshsaa-…')}`
at the top of the body; change the bar there, not in a page. The Spanish
practice page is a static file and keeps its own copy, and the QBReader navbar's
KSHSAA menu (`client/ssi/nav.html`) lists the same sections. The bar has three
sections; the other pages are tabs inside one, and pass that section's path to
`kshsaaNav`. Download packet (`/kshsaa-round`) is a tab under Read a round
(`readTabs()` from `nav.js`), and Insights, Tournaments, and the question bank
are tabs under Practice stats, whose tab lists are written out in each of those
pages.

The stats page has two sortable tables, the players and the roster. Attach each
one's header handlers through a selector scoped to that table (`#content
th[data-sort]`, `th[data-rsort]`). A bare `th.sortable` picks up the other
table's headers too, and whichever renders last silently takes over both.

### These pages are template literals, not client files

Each page is a **single template literal inside its route file**. There is no
webpack entry, no `.jsx`, and no build step — edit the route file and restart the
server. Two consequences:

1. **Every backslash is consumed once by Node before the browser sees it.** A
   regex written as `/:\s*-?\d+/` arrives as `/:s*-?d+/` — still valid
   JavaScript, silently matching the wrong thing. Double every escape (`\\d`) or
   avoid regex entirely (`split('(').length - 1`, `String.includes`).
   `npm run lint` catches most cases through `no-useless-escape`, so lint is the
   detector here, not just a style gate. It does not catch `'\n'`: that becomes
   a real line break inside the page's string and the whole script fails to
   parse. Write `'\\n'`, and load the page to check.
2. **The server does not hot-reload them.** Restart after every edit, and kill the
   previous listener first — a stale process serves the old page and makes a
   working fix look broken.

### MODAQ

`kshsaa-play.js` embeds MODAQ 1.41.1 from esm.sh. Points worth knowing before
touching the reader:

- Anything using the `Modaq` namespace must appear **after** its dynamic import,
  or round building dies with `Cannot access 'Modaq' before initialization`.
- `persistState` is `false` on purpose: MODAQ writes no localStorage, which is
  what keeps multiple simultaneous reader tabs independent for running several
  tryout rooms at once.
- MODAQ indexes buzzes against **buzzable** words, excluding pronunciation guides
  in parentheses. Celerity inputs must be computed the same way.
- Its cycle row has a fixed `height: 45px` and computes ~8px tall while its
  buttons overflow to 32px, and React rebuilds it. Measure its descendants and
  re-apply placement continuously; do not restructure its layout.
- The buzz menu lists only players with `isStarter`; there is no other cap.
  Scholars bowl plays five a side, so the first five per team start.
- `customExport.onExport` is called from the menu **and** from the prompt after
  the last question. It must return `{ isError, status }` — MODAQ shows
  `status` only on errors, and a fixed "Export succeeded." otherwise. Saves carry
  the round's `roundId`, and the server refuses a second save with 409.
- MODAQ listens for its keyboard shortcuts across the whole document and does
  not skip text boxes outside its own root: typing "n" or "p" anywhere moves
  the question. Anything the moderator types into (the note panel) has to stop
  `keydown`, `keypress`, and `keyup` from propagating.
- Notes written in the reader go out with the save (`notes`), or, once the game
  is saved, to `POST /kshsaa-stats/notes` with the `roundId`.

### Sign-in

Two passwords, both server environment variables. `STATS_PASSWORD` opens
everything: stats, roster, insights, tournaments, the question bank. `READER_PASSWORD`, if
set, is what moderators type into the reader; it only loads names and lineups
and saves games (`requireReader`), so reading rounds never shows players the
stats. Use `requireAuth` for anything else. A session stores an HMAC
fingerprint of the password it used, so changing either password signs out
everyone who used the old one.

`GET /kshsaa-stats/export` returns every game, the roster, the squads, and a
summary of the question pools. It answers a stats session or
`Authorization: Bearer $STATS_EXPORT_TOKEN`, and is off when that variable is
unset. Squads live in `kshsaa_settings` (`_id: 'squads'`), edited on the Roster
tab, strongest first: the team builder fills them in that order.

`/kshsaa-round?drill=<category>&level=<level>` builds a practice set of one
category. Practice sets are not recorded in `kshsaa_question_usage`, so
studying never uses up questions for rounds.

### Stats

Celerity is accumulated **only on correct buzzes**, matching qbreader's
`celerity.correct.average`. That makes it a poor ranking metric on its own — one
lucky early buzz tops the board — so the players table defaults to points per
question.

A player is credited with a game, and its questions heard, for being on a
team's list with tossups heard — buzzing is not required. Every wrong answer
counts against buzz accuracy, the 0-point ones included; `negs` counts only −5s.
Months are bucketed in `America/Chicago`, and the school year starts in August.
Games store `level` (a `LEVELS` key or null), which the game editor can change
along with the name, teams, and buzzes. Games saved from the reader also store
`questionIds`, the tossup read at each number, which the question difficulty
table needs.

Insights rates a player per category as (correct − ½·negs) per question heard,
pulled toward the player's overall rate and that toward the team's while the
sample is small. One scale factor, fitted so that "someone in the room knew it"
matches how often questions were answered, turns rates into rough chances of
knowing a question; team strength is the expected number of a round's 16
questions at least one starter knows. A category is flagged "work on" only when
it is below the team and at least 1.5 answers short of the player's own usual
level, so players weak everywhere do not get arbitrary flags.

Roster entries can carry a coach `rating` (1–10 in halves, shown as "Past
rating x/10"; null is N/A, for anyone not yet seen play) and `permanent` (stays
on their squad). The team builder blends a rating with
stats, stats counting for rounds ÷ (rounds + N) with N = 6 by default
(adjustable on the page), mapping ratings onto the stats' scale by rank among
measured players; a rated player with no games is placed on the rating alone.
Permanent players are only ever placed on their own squad. The first squad
takes the strongest individuals and the rest maximize category coverage,
unless that checkbox is cleared.

The roster paste box takes, after a name, any of grade, squad, email, a past
rating written as `7/10`, `N/A` (clears it), and `coach`. Pasting a name already
on the roster changes only what that line gives. A `coach` entry is on the
roster for autocomplete and may play in practice games, but is left out of
player counts, and the Insights route drops coaches from its players and
roster, so the team builder and player focus never see them.

Roster entries can also carry an `email`, set on the Roster tab (edit row, or
a fourth comma part when pasting). Player focus then offers an "Email" button
that opens the viewer's own mail app through a `mailto:` link with the drafted
message; the site never sends mail itself. The export leaves emails out.
"Print focus sheet" prints only `#printSheet` (everyone in the current filters,
by squad, with a notes column) by toggling `body.printing-focus` around
`window.print()`.

Games carry `notes: [{ questionNumber, player, text }]` (player and question
optional). They are checked by `cleanNotes()` in `server/kshsaa/game-stats.js`,
edited in the game editor, carried through player renames, and shown on the
player's card, including "Show to player".

### Tournaments

KSHSAA allows no electronic devices during a competition round, so tournament
games are typed in afterwards from a paper scoresheet. The printed sheet and
the entry grid share one layout (a row per question, our players by number),
and the grid takes a key per question. Tournament games live in `kshsaa_games`
with `kind: 'tournament'`, `tournament`, `round`, `opponent`, and `lineup`
(`[{ name, from, to }]`, so a sub's questions heard are right). The opposing
team is marked `opponent: true` and has no players, and **its buzzes have
`player: null`**. Code that walks buzzes for player stats must skip those. The
insights scale fit uses practice games only, since half of a tournament room is
another school. The `kind` filter (`readFilters`, `inKind`) is on the stats and
Insights pages. Tournament games are edited on the Tournaments tab, never in
the stats page's game editor, which refuses them.

In the entry grid, the grid redraws as the lineup is typed (`input`), not on
`change`. A `change` fires when a name box loses focus, which is in the middle
of the click on a grid row, and redrawing there drops the click.

A `per-tossup-data` document must exist for a tossup or `recordTossupData`
silently drops the buzz. `publishQuestion()` writes one; if stats look empty,
check for that document before suspecting auth or the upload path.

### Local testing

```sh
PORT=3028 STATS_PASSWORD=claude-test-pw node server.js
```

Use a throwaway password rather than the real one from `.env`. Lint passing is
not verification for these pages: load the page, generate a round, and click the
flow you changed. For layout work, assert measured element rects rather than
eyeballing a screenshot.

## How to Approach a Task

1. **Locate by URL.** Given a page or endpoint, the file is where the URL says it is: `/api/query` → `routes/api/query.js`; `/play/tossups` → `client/play/tossups/`.
2. **Trace the layer boundary.** Route → validator → database function, or client → room message → client handler. Make your change at the correct layer.
3. **Check `shared/` impact.** If your change touches anything in `shared/`, it affects solo play, multiplayer, and possibly the server simultaneously.
4. **Keep diffs minimal and idiomatic.** Small files, small functions, house naming. A change that requires reformatting unrelated code is a smell.
5. **Build, run, click through it, lint.** Then you're done — not before.
