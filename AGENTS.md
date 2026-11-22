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
Everything under `routes/kshsaa-*.js`, `server/kshsaa/`, `client/kshsaa/`,
`test/`, and the root `import-*.js` scripts is fork-only and does not exist
upstream; the rest of this document describes the upstream codebase and still
applies.

The fork runs on Render, not Heroku. Render takes the Node.js version from
`engines.node` in `package.json` unless a `NODE_VERSION` environment variable,
`.node-version`, or `.nvmrc` says otherwise; with none of them, a service stays
on whatever default Node had the day it was created and never picks up a
security release. When Node ships one, raise the floor in `engines.node` and
redeploy.

| File | Page |
| --- | --- |
| `routes/kshsaa-play.js` | The reader: KSHSAA or NAQT rounds in MODAQ, plus a timer bar, the World Language full-screen display, Replace question, the scoreboard window feed, lineup reuse, next round with the same teams, and save-once stats export |
| `routes/kshsaa-round.js` | Builds a 16-question round from MongoDB at a level, never repeating a question before its pool runs out or an answer within the round, and the reader's replacement questions (`/kshsaa-round/replacement`); exports the shared `levelControls()` markup, and re-exports `CATEGORY_BY_QUESTION`, `CATEGORIES`, and `LEVELS` from `server/kshsaa/round-shape.js` |
| `client/kshsaa/same-answer.js` | Whether two answer lines name the same thing, so no answer comes up twice in a round. Round building runs it in Node and NAQT rounds in the browser, so it imports nothing |
| `routes/kshsaa-stats.js` | Password-gated stats: sign-in for every KSHSAA page, upload, rosters and squads, lineups, month and level filters, players table, the game editor, the read-only export |
| `routes/kshsaa-insights.js` | Insights: team builder, player focus report, question difficulty (numbers from `server/kshsaa/insights.js`) |
| `routes/kshsaa-questions.js` | Question bank: review, approve, reject, add |
| `routes/kshsaa-tournaments.js` | Tournaments: printable scoresheet, entry grid for typing a sheet in afterwards, season table. The checks on a typed-in sheet are `server/kshsaa/tournament-game.js` |
| `routes/kshsaa-spanish.js` | Spanish practice |
| `routes/kshsaa-math.js`, `client/kshsaa-math/` | Math practice (`/kshsaa-math/`): a static page like Spanish practice, with physics as its own mode. `skills.js` lists every drill (one file per topic in `drills/`), `exact.js` reads and marks typed answers, `formulas.js` is the formula sheet and its flashcards, `anzan.js` makes flash anzan runs, `progress.js` keeps progress in the browser |
| `routes/kshsaa-anki.js` | The Anki leaderboard (`/kshsaa-anki`): the board, player codes and prizes for the stats password, the add-on's `/sync`, and the add-on download (`/kshsaa-anki/addon`) |
| `server/kshsaa/anki-board.js` | The leaderboard's numbers: weeks and months, checking what an add-on sends, ranks and streaks, codes and their hashes |
| `server/kshsaa/anki-addon/` | The Anki add-on, in Python: `stats.py` counts each day from Anki's review log, `client.py` sends the counts, `__init__.py` wires both into Anki. `test_stats.py` tests the counting and stays out of the download |
| `server/kshsaa/zip.js` | Writes the zip the add-on downloads as (an `.ankiaddon` is a zip) |
| `server/kshsaa/rebounds.js` | Which right answers came after every other team had missed, which celerity leaves out |
| `routes/kshsaa-arcade.js` | Octopus Arcade: Friday fun rounds (`/kshsaa-arcade`, a tab under Read a round). Serves the page only |
| `client/kshsaa/arcade/` | The arcade game itself, as browser ES modules: `engine.js` (rules every mode shares), `modes/` (one file per game mode), `modifiers.js` (power-ups), `console.js` (moderator), `board-view.js` (the game on the scoreboard window), `store.js`, `clock.js`, `questions.js`, `qbreader.js` (questions straight from qbreader.org) |
| `routes/kshsaa-scoreboard.js` | The scoreboard window (`/kshsaa-scoreboard`), a second screen for the projector. Serves the page only |
| `client/kshsaa/second-screen.js`, `client/kshsaa/scoreboard/` | How a reader or arcade tab tells its scoreboard window what to show, and the window itself: `page.js` (follows the tab), `match.js` (a normal round), `tiles.js` (shared drawing) |
| `test/kshsaa-*.test.js` | `npm test`: the arcade engine, NAQT rounds, the same-answer check, the archive repair, rebounds, the Anki leaderboard and zip writer, tournament sheets, the room model, and every math drill under `node --test`. A test can only import files that never import `database/databases.js`, whose top-level await hangs without a database, which is why `rebounds.js`, `anki-board.js`, and `tournament-game.js` are files of their own, and why the stats code takes the round's shape from `round-shape.js`, never from `routes/kshsaa-round.js` |
| `server/kshsaa/math-tier.js` | Sorts a math question into basic / intermediate / advanced from its wording and time limit, and tells computation from theory |
| `server/kshsaa/language-tier.js` | Sorts a World Language question into the same three tiers from its Spanish sentence |
| `server/kshsaa/split-answers.js` | Repairs one archive record the packet parser broke: takes the answer back out of the question text, splits questions run together, and drops page headers, footers, and page numbers. The repair tool and `import-kshsaa.js` share it |
| `client/kshsaa/giveaway.js` | Turns a quizbowl tossup into a Beginner question (its giveaway line), a JV one (the giveaway and the clue before it), or a Varsity one (up to three clues before it). The import scripts run it in Node and the arcade in the browser, so it lives under `client/` and imports nothing |
| `client/kshsaa/naqt.js` | NAQT rounds for the reader: 24 tossups and 24 three-part bonuses in NAQT's high school distribution, straight from qbreader.org in the browser, and their replacement tossups. `npm test` runs it in Node, so it imports nothing but `same-answer.js` |
| `server/kshsaa/name-autocomplete.js` | Player-name autocomplete fragment shared by the reader and the game editor |
| `server/kshsaa/round-shape.js` | The 16-question round's categories in order (`ROUND_SHAPE`, `CATEGORY_BY_QUESTION`, `CATEGORIES`) and `LEVELS`: plain data, so the stats code and tests can use them without a database |
| `server/kshsaa/tournament-game.js` | Checks a tournament sheet typed into the entry grid and builds the stored game: the other team's points by question, not on the sheet, or a chair, rounds of up to 40 questions, and playoff stages (`STAGES`) |
| `server/kshsaa/game-stats.js` | Reading stored games: who played and for how long, celerity, month/level filters, and a tournament game's result (`resultOf`) and how its other side was kept (`opponentModeOf`) |
| `server/kshsaa/room-model.js` | Player strengths adjusted for who else was in the room and how hard each level, and each tournament, plays, and which games varsity held back in; Insights and the Stats page's Adjusted column use it |
| `server/kshsaa/squad-plan.js` | Reads and writes the Roster tab's squad plan: squads, pools, and which pools fill each squad's rotating spots |
| `server/kshsaa/nav.js` | The bar across every KSHSAA page (logo, sections, QBReader link) and the favicon; `client/kshsaa/logo.svg` is the mark |
| `import-kshsaa.js`, `import-beginner.js`, `import-jv.js`, `import-varsity.js`, `import-current-events.js` | Operator scripts that load questions into MongoDB; run by hand with `MONGODB_URI` set. All but the first share `server/kshsaa/qbreader-import.js` |
| `tools/seed-generated-questions.js`, `tools/seed-year-in-review.js` | Load the question bank's review queue: computed math and science, and hand-written Year in Review by level. Dry run unless `--write` |
| `tools/repair-kshsaa-questions.js` | Repairs the archive questions the packet parser broke, and corrects the answer keys the packets got wrong (`WRONG_KEYS`), saving each record to `kshsaa_repair_backup` first. Dry run unless `--write`; `--undo --write` puts everything back |

Round structure follows the official KSHSAA manual, verified against 117 real
packets: 1 World Language, 3 Language Arts, 3 Science/Health, 3 Social Studies,
3 Mathematics, 2 Fine Arts, 1 Year in Review.

### Question sources and levels

Every question the pages use carries `kshsaaImport: true`; the **set name
prefix** says where it came from: `QB Converted` (varsity quizbowl rewritten
for scholars bowl), `SJA Generated` (question bank), `QB Beginner`
(`import-beginner.js`), `QB JV` (`import-jv.js`), `QB Varsity`
(`import-varsity.js`), `QB Current Events` (`import-current-events.js`, recent
Year in Review only), anything else real KSHSAA. `LEVELS` in `kshsaa-round.js` lists the pools each level draws from in
order of preference, ordered by how hard the clues are. Beginner reads the
giveaway lines of middle school quizbowl, JV the last two sentences of easy high
school quizbowl (the giveaway and the clue before it), and Varsity the last two
to four of regular high school quizbowl alongside converted quizbowl, then the
KSHSAA archive, which is past state and regional rounds and too hard for JV.
`lastSentencesOf` in `giveaway.js` builds the JV and Varsity pyramids, adding
clues back to front while each one is about the answer. Later pools fill slots
the earlier ones cannot (the giveaway and converted sets have no World Language
and next to no math, so those come from the archive at every level). Approved question bank questions sit alongside the archive at every
level; there is no switch for them.

Math and World Language are sorted into tiers at round-building time, and each
level reads its own (`math` and `language` in `LEVELS`; the reader's math menu
can override `math`). `math-tier.js` goes by wording and time limit: anything
given 45 seconds or more takes several steps and is never basic.
`language-tier.js` goes by the Spanish sentence: up to 5 words basic, 6 to 8
intermediate, 9 or more advanced, with stacked object pronouns and the
compound or subjunctive forms of haber pushing a sentence up. A level short of
its tiers takes from the others and says so in the round's notes. KSHSAA math
is mostly computation: `isComputation` in `math-tier.js` tells it from theory
(names, terms, definitions), and wherever theory would be more than about one
math question in six, `pickMath` holds it to that. The archive runs about 3%
theory, so there it changes nothing.

`difficultyOf` in `kshsaa-round.js` puts every question at the level it suits
(math and World Language by tier, Year in Review by `kshsaa_level`, the rest by
source; question bank questions outside those three at any level). The
question bank's table, review queue filter, and "counts as" label all use it. Question bank text
already starts with its "[45 sec]", so rounds do not add a second one, and
rounds correct the "2th"-style ordinals the first generated batch was written
with.

Until a level's import (`import-beginner.js`, `import-jv.js`,
`import-varsity.js`) has been run, its rounds fall back to the other pools and
say so in the round's notes. `import-kshsaa.js` wipes
every `kshsaaImport` set except the `QB Beginner`, `QB JV`, `QB Varsity`, and
`QB Current Events` ones, so a new giveaway import needs adding to that
exception too.

The packet parser behind `import-kshsaa.js` damaged about 1,050 archive
questions. Some packets print every question as "2 Question? Answer: answer",
and there it ran questions together, answers and all, or left the answer at
the end of the question text with the answer line blank, so a moderator reading
straight through read the answer aloud. It also kept page headers, footers,
and page numbers ("Round: Replacement 04", "Page 27 of 68", "schizophrenia 3").
Some of the quizbowl the other imports bring in carries the footer of the
packets qbreader.org got it from ("SCOP B Round 11 Page 4 of 4"), and the tool
takes those off too, leaving the rest of that quizbowl alone.
`tools/repair-kshsaa-questions.js` repairs them in place with `splitRecord`
(`server/kshsaa/split-answers.js`): a record keeps its first question, and the
rest become new questions in its packet, counted as read if it was. Math and
science answers keep a trailing number, since it may be theirs.
`import-kshsaa.js` runs `splitRecord` on every parsed question, but only the
tool rejoins the one question split across records ("...has the following
three uses:"), so run it again after a re-import. Rounds skip any question
with no answer (`ANSWERED` in `kshsaa-round.js`): before the repair that is
every one whose answer is still in its question text, and after it the 33
whose answer is nowhere in the data.

A few keys are wrong in the packets themselves: KSHSAA 2004-2005 State keys
a 3 volt battery across 36 ohms as 108 amperes, where the current is 1/12 of
an amp. The tool's `WRONG_KEYS` list corrects these the same way, finding each
by set and question so a re-import is caught again. To fix another, work the
answer out, add it to the list, and run the tool.

Year in Review uses only questions written this calendar year or last. The year
comes from the set name (the spring year of a `24-25` season, else the latest
year in the name), because imported sets store a placeholder `set.year`; only
question-bank tossups (`sjaGenerated`) are trusted to carry a real one. A set
whose name has no year is never used for Year in Review.

Year in Review is also matched to the level. `tools/seed-year-in-review.js`
holds hand-written, fact-checked questions, each with the level it was written
for and the month its story happened, and loads them into the review queue
(`level`, `year`, and the source as the card's "Check" line). Approving one
stores `kshsaa_level` on the tossup and the story's year as `set.year`, so a
story leaves rounds two Januaries after it happened, not after it was approved.
A round reads Year in Review at its own level plus anything with no
`kshsaa_level` (every qbreader import). The review card and "Write your own"
both let the level be changed. `import-current-events.js` skips the qbreader
giveaway lines listed in `NOT_CURRENT` (general knowledge, or no longer true);
add to it when a re-import brings in more.

Rounds avoid repeats through `kshsaa_question_usage` (one document per question
used, keyed by the tossup id as a string): unread questions first, then the ones
read longest ago. A question counts as used as soon as a round is generated, and
builds run one at a time so simultaneous rooms cannot draw the same question.
`import-kshsaa.js` re-creates tossup ids, so re-running it resets this history.

No answer comes up twice in a round either, even from two different questions.
The same answer is written many ways across the sources, so `same-answer.js`
counts two answer lines as one when every word of one is among the other's:
"Faulkner", "(William) Faulkner", and "William Cuthbert Faulkner" are one
answer. It reads a line up to its square brackets or a parenthesis of
alternatives ("(accept ...)", "(prompt on ...)"); other parentheses are part
of the answer, and World Language's "Translation:" label is not. It also counts
"Kansas" and "Kansas City" as one, which only costs a pick. Rounds, practice
sets (so the arcade's questions from them), replacements, and NAQT rounds all
use it; a bonus's own parts are not checked against each other. An empty
answer matches nothing.

The reader's "Replace question" throws out the question on screen and reads
another of its category in its place, at the same number, for when a question
is broken, already heard, or misread. Its buzzes come off, so both teams hear
the replacement fresh. A KSHSAA replacement comes from
`/kshsaa-round/replacement`, which builds one slot of a round that avoids every
question the round has had (`avoid`, the thrown-out ones included) and their
answers, and counts its pick as read. Once a game is saved its questions stay
as they are.

Every page puts `${KSHSAA_HEAD}` in its `<head>` and `${kshsaaNav('/kshsaa-…')}`
at the top of the body; change the bar there, not in a page. The Spanish and
math practice pages are static files and keep their own copies, and the QBReader
navbar's KSHSAA menu (`client/ssi/nav.html`) lists the same sections. The bar has
five sections (Read a round, Stats, Spanish practice, Math practice, Anki
leaderboard); the other pages are tabs inside one, and pass that section's path
to `kshsaaNav`. Download packet (`/kshsaa-round`) is a tab under Read a round
(`readTabs()` from `nav.js`), and Insights, Tournaments, and the question bank
are tabs under Stats, whose tab lists are written out in each of those
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
  Everyone the moderator lists starts: JV and Beginner practice puts seven on a
  team, and a benched player cannot be credited with a buzz until subbed in.
- MODAQ takes any number of teams: scoring, the buzz menu, the scoreboard, and
  the QBJ export all loop over `teamNames` (the order teams' players were
  given). Fridays run "octopus" games, three or more teams on one lockout
  system; the reader and the stats game editor both take up to eight
  (`MAX_TEAMS` in each file). MODAQ gives only the first wrong answer on a
  tossup the −5; any later team's wrong answer is saved as 0.
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
- A replaced question reaches MODAQ as a new `packet` prop. ModaqControl loads
  a changed packet without touching the game, provided `players`, `gameFormat`,
  and `customExport` stay the same objects (`modaqProps`). Taking the buzzes off
  needs MODAQ's store, which it never hands out: `modaqStore()` finds it as the
  `appState` prop below the React root, and is the only thing that reaches into
  MODAQ's internals. MODAQ's own Actions > Throw out tossup reads the next
  tossup in the packet instead and shifts every later one, which breaks a
  KSHSAA round's order and its per-question stats, so moderators use Replace
  question.

### Octopus Arcade

Last Team Standing, Bounty Hunter, Lightning Round, Chaos Mode, and Quizbowl,
for two to eight teams. It does not use MODAQ: MODAQ has no callbacks, saves every wrong
answer after the first as 0, and owns its buzz menu, so it can neither count
lives nor shut an eliminated team out. Nothing here talks to buzzer hardware
either, because the lockout boxes are standalone. Each team gets a key (1 to 8
by default, changeable for a USB buzzer system that types keys), which the
moderator presses when that team's light comes on. `whyNoBuzz` in `engine.js`
refuses a key while the game is paused, after another team's buzz, from a team
that already missed the question, or from a team that is out. It refuses an
eliminated team even though its buzzer is still plugged in, except on a
Resurrection question.

Unlike the other pages, the game is real client files, not a template literal,
so the backslash trap above does not apply and lint reads it as code. A game is
its setup plus a list of events; `replay()` rebuilds lives, points, and who may
buzz from them, and undo drops the last one. Only `act()` adds events, and a
power-up drawn for a question is stored in that question's event, so replays
always agree. The clocks and pause are not events: they sit on the game as
`{ limit, left, since }`. To add a mode, write a file in `modes/` and list it
in `modes/index.js`. Its `correct` and `wrong` change the teams only through
`ops`, which applies shields and the lives cap. Power-ups are hooks in
`modifiers.js`.

Games live in this browser only: `localStorage` by game id, with the tab's own
game in `sessionStorage`. A refresh or a closed tab leaves the game paused with
its clocks stopped. The projector shows the game through the scoreboard window
(below). Questions come from `/kshsaa-round/generate` with `drill` repeated once
per category (`count` is per category). Like practice sets they are not counted
as read, and arcade games are never saved to stats. Never call it with no
KSHSAA category in the drill: it then reads a whole round, which does count.

Sports and Pop Culture (`EXTRA_CATEGORIES` in `qbreader.js`) are arcade-only
categories, and Quizbowl reads every category, straight from qbreader.org's
public API in the browser (it allows any site, 20 requests a second): standard
sets only, at difficulty 1, 2, or 3 for Beginner, JV, or Varsity, with Sports
and Pop Culture from the last eight years and Year in Review from the last
two. The other modes cut Sports and Pop Culture to the level's length with
`questionForLevel` in `giveaway.js`, the same cut the imports use. Nothing from
qbreader.org is stored in the database, so it needs the internet at practice
and never counts as read.

Quizbowl is scored as NAQT scores it: 15 for a power (before the `(*)`), 10
after, −5 for a neg (a wrong answer that interrupted), 0 for a wrong answer
once the question is finished. The moderator tells them apart: `F` power, `C`
correct, `W` neg, `X` wrong at the end, so team keys cannot be `f` or `x` in
Quizbowl. Each question can carry a three-part `bonus`, handed out after the
questions are picked so none is wasted on a tossup left out. A right answer
on one starts the bonus (`state.bonus`): no team may buzz, `C` and `W` rule on
each part (`part` events), and the question only counts as settled, and Next
only works, once every part has a ruling. A mode turns this on with
`quizbowl: true` and scores parts in `bonusPart`.

### NAQT rounds

The reader's Format switch reads a KSHSAA round or a NAQT one. A NAQT round is
24 tossups and 24 three-part bonuses, plus two tossups that only come up to
break a tie, built in the browser by `naqtRound` in `client/kshsaa/naqt.js`
from qbreader.org's public API: standard sets at difficulty 1, 2, or 3 for
Beginner, JV, or Varsity, as in the arcade. `DISTRIBUTION` holds NAQT's high
school distribution (naqt.com/hs/distribution.jsp) as averages per packet.
`apportion` rounds each one up or down to whole questions, as NAQT's packets
do, groups first and then their parts, and `spread` orders the questions so
no two in a row share a group when that can be helped. A part qbreader.org
cannot fill (Current Events at Beginner, often) is filled from any category,
and the round's notes say so. qbreader matches an alternate subcategory to
questions that have none, so the Math part asks for more and keeps only Math.
Each tossup keeps its `part`, so `naqtReplacement` takes a replacement from the
same part, with an answer new to the round, bonuses included. Bonuses have no
Replace: MODAQ's own Throw out bonus reads the next bonus in the packet, which
works because bonuses are not tied to a question number (only a game that
uses all 24 then runs one short).

MODAQ scores it with `NAQT_FORMAT` in the reader: 15 before the `(*)`, 10
after, -5 for a neg, and bonuses that never bounce back, taken in order by
whichever team answers a tossup. MODAQ prints any tag but `<b>`, `<u>`,
`<em>`, `<sub>`, `<sup>`, and `<req>` as text, so `modaqText` turns qbreader's
`<i>` into `<em>`. A bonus goes to MODAQ as `parts`, `answers`, and `values`
side by side, never as part objects, or the packet does not load.

NAQT rounds are practice only. Nothing goes through this site's server, so
they are never counted as read; there is no "Save to team stats" (MODAQ's own
Export menu instead), and the note button, the hold-back checkbox, and the
math menu are hidden for them. "Next round with these teams" keeps the format,
and the scoreboard window counts to 24, past it only for a tiebreaker.

### Scoreboard window

`/kshsaa-scoreboard` is a second screen for the projector, opened by the
"Scoreboard window" button in the reader's round bar or the arcade console. It
follows the tab that opened it and shows whatever that tab is running: a normal
round's scores, question, category, and answer clock, with a World Language
question while it is held up and Final once the game is saved, or an arcade
game. Each tab has a channel in `sessionStorage`, so the window keeps following
through a reload, "Next round with these teams", and a move from the reader to
the arcade tab. The tab writes what to show to `localStorage`
(`kshsaa-screen:<channel>`, through `second-screen.js`), and the window redraws
on the `storage` event. That event only reaches windows of the same browser, so
the scoreboard has to run on the same computer, typically a laptop with the
projector as a second display.

Whenever the question moves forward (not back), the window flashes a big card
with its number and category for about two seconds (`announce` in `tiles.js`),
since the line along the top is too small to notice from the back of a room. A
Quizbowl bonus gets one too. The card animates only in a window that is showing:
a background browser tab holds the animation, so test it in a tab brought to
the front.

The reader's scores come off MODAQ's page through the same reading the clock
uses to notice a neg (`watchReader`). `publishScreen` writes them out only when
something on the screen changes, and a reading that misses a team keeps its
last score rather than flashing a zero. The reader loads `second-screen.js` with
a dynamic `import()` whose failure is ignored, so nothing about the scoreboard
can stop a round from being read. An arcade tab points its channel at a game id
only after saving that game, and the window loads the game from the arcade's
own storage.

To test it in Claude's built-in browser pane, note that the pane opens
`window.open` in the same tab, which in the reader throws away the round. Open
`/kshsaa-scoreboard?channel=` plus the tab's
`sessionStorage['kshsaa-screen-channel']` in a second tab instead. Background
tabs tick their timers once a second, so a clock in the background tab can lag
the other one by that much. MODAQ's buzz menu opens a player's Correct and
Wrong on hover, which scripted clicks do not do; focus the player's menu item
and send it ArrowRight.

### Math practice

`/kshsaa-math/` is a static page like Spanish practice: no server code, no
build, and progress in the browser's `localStorage` (export and import move
it). Its files are real browser modules, so the template-literal trap above
does not apply and lint reads them as code. KaTeX draws the math, imported from
jsdelivr; without it the TeX shows as written.

Every problem is made fresh from a seeded random generator, and its answer is
computed, never looked up. A skill in `client/kshsaa-math/drills/` returns
`{ prompt, answer, steps, data }`: text with TeX between double square brackets
(`tex.js`; double brackets so a template's `${}` never collides with them), an
exact answer, and the numbers it was built from. `npm test` makes 250 problems
of every skill and works each answer out a second way from `data` (counting,
brute force, coordinates, numeric calculus), so a new skill needs an entry in
`SECOND_WAY` in `test/kshsaa-math.test.js` or the tests fail. Each skill's
`seconds` is the time KSHSAA would give a question like it (checked against the
archive's 1,220 math questions: 10, 30, 45, 60, 90).

`exact.js` keeps answers as (n/d)·√r·π^k in lowest terms, so 6/8, 0.75, √12,
and 2√3 compare as they should, and reads what people type: "9 sqrt 3",
"9 radical 3", "3 1/5", "negative 1/32", "(2, -5)", units and all. A decimal
counts when it is right to the places typed (two or more). An answer asked for
as a fraction carries `form: 'fraction'`, and a decimal for it is turned back
rather than marked wrong.

Physics (`drills/physics.js`, five topics named "Physics: …") has its own mode,
like speed tricks, and stays out of the math drills; its formulas are on the
same sheet. It is written the way the archive's 240 numeric physics questions
are: each one says which g to use, 9.8 or 10 m/s², and most get 30 seconds. Its
answers are still exact (9.8 is 49/5) but shown as decimals (`decimal: true`,
which `skills.js` adds to every physics problem): 137.2 N, not 686/5, and one
that never ends with its value to three figures beside it. Typed units come off
before an answer is read, compound ones whole, so "14 m/s" is never m divided
by s. A box at rest on a ramp has friction mg sin θ, not μN; the ramp drill
teaches exactly that.

### Anki leaderboard

Players install the add-on from AnkiWeb and paste a code. In Anki they choose
Tools > Add-ons > Get Add-ons and paste the number in `ANKIWEB_ID`
(`routes/kshsaa-anki.js`). The add-on is listed as "Automatic Card Counts" at
https://ankiweb.net/shared/info/1953309465, so a new version reaches players as
an Anki update. `/kshsaa-anki/addon` builds the same add-on as a file: an
`.ankiaddon` zip, built per download, with the addresses it sends to written
into its `config.json` (`servers`). The page offers the file as a fallback,
and it is also the file uploaded to AnkiWeb.

Where it sends: `servers` lists `ALWAYS_AWAKE` first, then the address the file
was downloaded from (`syncServers`). `ALWAYS_AWAKE` is the Northflank copy of
the site, which shares the database. Render's free plan sleeps after 15
minutes without visitors and takes about a minute to wake, so Render comes
second.

How a send goes (`client.py`):
- **Waits:** it waits 15 seconds on the first site and 75 on the rest.
- **Refusals:** a 400, 401, or 403 stops the send, since every site shares one
  board.
- **Anything else:** an unreachable site, a slow one, or any other error passes
  the counts to the next site.

When no site takes them, `__init__.py` tries again after 2, 10, then 30
minutes. While Anki stays open, it also checks every 30 minutes and sends only
if the counts changed, which they do once a day as the 60-day window moves.
Sends run on a daemon thread, so Anki never waits for one when it closes. The
add-on never syncs Anki itself: phone reviews count once the computer's Anki
syncs, and the page tells players who leave Anki open to press Sync now and
then.

To release a change to the add-on:
1. Bump `VERSION` in `client.py`, then merge and deploy.
2. Download `/kshsaa-anki/addon` from the main site's address, so the main
   site is in its `servers` behind the always-awake one.
3. Upload it to the AnkiWeb listing as a new version. That takes the AnkiWeb
   account it was first uploaded from.

Keep AnkiWeb's minimum version at 2.1.50, like the page.

Anki keeps a player's saved settings (`meta.json`) over a new default.
Version 1.0 saved its address along with the code, so since 1.1 the add-on
reads its addresses from its own `config.json` every time and saves only the
code. An update can change the addresses for everyone.

Updates come from AnkiWeb when Anki starts, so a player who never closes Anki
gets one on the next restart, or through Tools > Add-ons > Check for Updates.

The add-on counts each Anki day from the review log: a review is any
answer, counted every time, which is what Anki shows as "studied N cards
today", and rescheduling by hand is not one. It sends the last 60 days when
Anki opens, after studying, after each sync, and on its half-hourly check, so
a missed send fills itself in and phone reviews count once the computer's Anki
syncs them. The server
takes the days with reviews, deletes any other stored day in the window the
add-on looked at (`from`), and ranks by reviews, ties sharing a rank. Weeks run
Monday to Sunday and days are the player's own Anki days, labeled with the date
they began.

Codes are 12 characters from an alphabet without 0, O, 1, or I, stored only as
SHA-256 hashes: a lost code is replaced (the old one stops working, in the
add-on and on the board), never looked up.

One code works on any number of computers. Each send replaces the player's
days in the window it covers, so the board shows whichever computer sent last.
Computers that sync the same Anki collection agree once they have synced, and
the page tells players to use one code on each computer.

The board is not public: a player
signs in with their code, or anyone with a stats or reader sign-in sees it, and
only the stats password manages players and prizes. The add-on's "Open the
leaderboard" passes the code after the `#`, which never reaches the server's
logs, and the page signs in with it and takes it out of the address. Wrong codes
are capped per address and sends per player.

Every Anki name the add-on uses was checked to exist in Anki 26.5's own files:
- its hooks (`profile_did_open`, `profile_will_close`, `sync_did_finish`,
  `reviewer_will_end`)
- `QueryOp`, `day_cutoff`, and `taskman.run_on_main`
- `addonConfigDefaults` and `addonFromModule`
- the Tools menu

Older versions were not checked, and the page asks for 2.1.50 or newer.

Test with `python -m unittest test_stats test_client test_addon` in
`server/kshsaa/anki-addon/`:
- **`test_stats`:** the counting, against a real SQLite review log.
- **`test_client`:** which site takes the counts, against local web servers
  playing awake, asleep, broken, refusing, and gone.
- **`test_addon`:** runs `__init__.py` against a stand-in for `aqt`. It covers
  timers, retries, skipping unchanged counts, and saving the code.

The download leaves `test_` files out. Delete any `__pycache__` the tests
leave, since AnkiWeb refuses a zip that has one.
The add-on cannot be run outside Anki, so try a change in a throwaway profile
(`anki -b <empty folder>`), never in a player's own.

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

That document is a squad plan (`server/kshsaa/squad-plan.js`): `list` (squads
and pools, in order), `pools`, and `spots` (`{ squad: [{ count, from: [pool] }] }`).
The Roster tab writes it one line per entry, `Varsity Crimson: 2 from Rotating
Varsity Pool; 1 from JV Rotating Pool or JV Crimson Rotators`, with `Name (pool)`
for a pool. A player's `squad` can be a pool; nobody is `permanent` on a pool.
For a squad with spots, the team builder starts its permanent players and fills
exactly its spots from those pools (`lineupWithSpots`, a small bipartite
matching in `fits`); a squad without spots fills from everyone, as before.
"Put these players on these squads" leaves pool players in their pool.
`getSquads()` still returns the whole `list`, pools included.

`/kshsaa-round?drill=<category>&level=<level>` builds a practice set of one
category. Practice sets are not recorded in `kshsaa_question_usage`, so
studying never uses up questions for rounds.

### Stats

Celerity is accumulated **only on correct buzzes**, matching qbreader's
`celerity.correct.average`. That makes it a poor ranking metric on its own — one
lucky early buzz tops the board — so the players table defaults to points per
question.

Celerity also leaves out **rebounds**: right answers given after every other
team had already missed (`reboundsIn` in `server/kshsaa/rebounds.js`). Under
KSHSAA rules a team that interrupts and misses loses 5 and the question goes to
the other team, which then has no reason to interrupt and waits for the end, so
where that answer came says nothing about how early the player knew it. With
three or more teams, an answer after only some of them missed was still a race
and counts. The rule is the same for the Stats table, Insights' "late" habit,
and the question difficulty table's buzz point, and either order of stored
buzzes works (the reader stores the right answer first, the tournament grid
the wrong one).

A player is credited with a game, and its questions heard, for being on a
team's list with tossups heard — buzzing is not required. Every wrong answer
counts against buzz accuracy, the 0-point ones included; `negs` counts only −5s.
Months are bucketed in `America/Chicago`, and the school year starts in August.
Games store `level` (a `LEVELS` key or null), which the game editor can change
along with the name, teams, and buzzes. Games saved from the reader also store
`questionIds`, the tossup read at each number, which the question difficulty
table needs.

Insights and the Stats page's Adjusted column use the room model
(`room-model.js`), a Luce choice model: a tossup goes to player p with chance
s_p / (D + the room's strengths added up), and to nobody with chance D over the
same, s being a player's strength in the category and D how hard the level
plays (Varsity's D is 1). So answering less next to varsity players does not
count against a JV player, and every level's games count toward one strength.
Strengths come from correct answers only; a −5 still costs half an answer,
through each player's worth, (correct − ½·negs) / correct, which scales what
their answers count for. Strengths are pulled toward the player's overall
and that toward the team's, both by 32 questions' worth, fitted by predicting
each saved game from all the others. Team strength is how many of a round's 16
questions the starters would answer with nobody else buzzing, at the level the
team builder's "On questions at" names. A category is flagged "work on" when
the player got at most 60% of the answers their own usual level would have in
those rooms, at least 1.5 short, and is below the team there, so players weak
everywhere do not get arbitrary flags.

D is set by whatever decides how hard the questions were: the level, for
practice games (each level reads its own pools), and the tournament itself,
for tournament games, since a tournament's writers set its difficulty whatever
level it was entered as. A tournament is the same name at the same level in the
same school year (`tournamentOf`). Its D is fitted the same way as a level's,
from how often nobody answered given who was in the room, plus `EVENT_PRIOR`
(16) questions as hard as its label's typical tournament (that label's
tournaments taken together). Our players' strengths come from practice as well,
which is what puts a tournament's D on the same scale, so a player who swept an
easy tournament does not come out stronger for it. D = 1 is varsity practice;
with no practice games in the filters it is the typical varsity tournament
(`referencePractice`), and then JV and varsity tournaments cannot be compared,
having no players in common. Insights lists each tournament's D and how many
of 16 the team's average player would answer alone there. With no tournament
games stored, every number is what it was before this rule: comparing the two
versions on the real games (2026-11-17) changed none of 5,978 numbers.
`EVENT_PRIOR` was picked by simulating seasons of tournaments over the real
practice games; refit it by predicting each tournament game from the others
once ten or so tournaments are in.

A school we play starts out, by `OPPONENT_PRIOR` (8) questions' worth, as
strong as the lineup we sent against it: the sum of their strengths on each
tossup, never less than one average player. Before 2026-11-19 it started as
our team's average player times the lineup's size, which assumed a varsity
school against a JV lineup. In simulated seasons that rated the players in
tournaments 17 to 28% too strong, against about 1% with the lineup.

Some tournament sheets leave out the other team's points (`opponentMode:
'unrecorded'`). Our answers there count as usual. A tossup we did not answer
went to the other school or to nobody, and the sheet cannot say which, so each
round of the fit splits it between them in proportion, s_o / (s_o + D) to the
school and D / (s_o + D) to nobody, and counts those shares where a full sheet
would have counted the answer (expectation-maximization). Our players'
exposure is the same either way, so their strengths use these games in full.
The school and the tournament's D only learn their sum from such a game. When
every game of a tournament is unrecorded, nothing separates hard questions
from a strong school: the school stays as strong as our lineup and D takes the
rest, so Insights marks that difficulty with a ≈ as a guess. A game against a
chair (`opponentMode: 'chair'`) has no other school in the room at all.

Simulated seasons over the real practice games (2026-11-19) give these
results:
- **Blank sheets:** typing a missing side in as blank, which is what a blank
  meant before, made tournaments look 2 to 3 times too hard.
- **The split:** it kept our players' strengths within about 3% of full sheets.
- **Left out:** dropping those games instead moved them more, and could not
  measure those tournaments at all.

On the Overview, squad chips toggle, so several can be on at once, and a
checkbox on each player adds anyone to the group or takes them off a picked
squad (`GROUP`: squads, players added, players removed). The card above the
players table adds up whoever is in the group, and its Team strength is the
team builder's formula over their room-model strengths (`room` on each player
row, `roomWeights` and `roomDifficulty` in `/kshsaa-stats/data`) at the
Adjusted column's level, so a group of one is that player's Adjusted. A
search looks through every squad, so a player from another squad can be
added; picked squads list their whole roster, ticked or not.

Varsity players hold back (do not interrupt) when they play with JV or
Beginner players. A practice game's `holdBack` says whether they did; when it is
missing, they did if the level is JV or Beginner. "Varsity" means a roster squad
or pool with "varsity" in its name. In a game where they held back, Insights
leaves the game out for them entirely, takes them out of the room for everyone
else, and skips any tossup one of them answered, since a JV player who knew it
would have been racing them at the end. The reader's setup and the game editor
both have the checkbox; the raw Stats tables still count every game.

Roster entries can carry a coach `rating` (1–10 in halves, shown as "Past
rating x/10"; null is N/A, for anyone not yet seen play) and `permanent` (stays
on their squad). The team builder blends a rating with
stats, stats counting for rounds ÷ (rounds + N) with N = 6 by default
(adjustable on the page), mapping ratings onto the stats' scale by rank among
measured players; a rated player with no games is placed on the rating alone.
Permanent players are only ever placed on their own squad. The first squad
takes the strongest individuals and the rest maximize category coverage,
unless that checkbox is cleared.

The roster paste box takes, after a name, any of grade, squad or pool, email, a past
rating written as `7/10`, `N/A` (clears it), initials in capitals (`GG2`),
`captain` (or `(Capt)` after the name), `permanent`, and `coach`. Pasting a name already
on the roster changes only what that line gives. Its "whole roster" checkbox
(`replace`) instead takes squad, permanent, captain, and initials from each line
outright and deletes every non-coach not listed; the page's confirm lists who
goes and flags near-miss spellings, since a rename keeps game history and a
delete-and-add does not. A rename (`renameInGames`) changes the name in every
game's buzzes, team lists, questions-heard counts, and notes, and in a
tournament game's `lineup`. A lineup left with the old name would list nobody
the game's answers are credited to, and editing that game would break. A
`coach` entry is on the
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
`player: null`**. Code that walks buzzes for player stats must skip those.

Coaches' sheets are not always complete, so a game stores how the other team's
side was kept (`opponentMode`, read with `opponentModeOf`; games without one
are `'recorded'`):
- **`recorded`:** their +10s and −5s are on the sheet, question by question.
- **`unrecorded`:** only our side is typed in. Their team's `score` is their
  final score when the sheet has it, else null. `result` comes from that score,
  else from the "Who won" box, else it is null.
- **`chair`:** we played a chair. There is no other team (`opponent` is null
  and `teams` holds ours alone), and the game counts as neither a win nor a
  loss.

`result` ('win', 'loss', 'tie', or null) is stored with every new game. Read it
with `resultOf`, which also covers older games from their scores. Rounds can
run past 16 questions, up to `MAX_QUESTIONS` (40): the grid's buttons add and
remove questions, and an added question's subject starts the round's own order
over. The next game typed in keeps the last mode that was not a chair, and
editing a game does not change it.

Not every tournament reads its subjects in the regular order. A question's
subject is one of `SUBJECTS` in `tournament-game.js`: the KSHSAA subjects plus
`Other`, which sheets call Misc. An Other question counts in points, buzzes,
and the score, but toward no subject. The room model skips any question outside
`CATEGORIES`, so Insights leaves it out, the same as practice games' Other
questions.

The picker above the grid offers the regular order and the `SUBJECT_ORDERS`
that leave out World Language: a 4th Language Arts, a 3rd Fine Arts at
questions 13 to 15, or Misc at 15 before Year in Review. In each, every subject
after the change moves up a row. Any row's subject can also be changed by hand.
- **Carried over:** once the name, level, and date say which tournament it is
  (keyed like `tournamentOf`), a new round starts with the subjects most of its
  saved rounds used (`knownOrder`). This happens after every save too, so a
  one-off round does not carry on. A round whose subjects were changed by hand
  (`TOUCHED`) keeps them.
- **Other rounds:** saving a round whose subjects were changed by hand returns
  `differing`, the tournament's other rounds whose subjects are not the same.
  The page then offers to change them (`POST /kshsaa-tournaments/subjects`,
  `withSubjects`). They change question by question as far as both rounds go,
  and their buzzes keep their points and follow their questions.

Some sheets have nothing but the final scores, and the form's "only the final
scores" box takes them (`scoresOnly`, built by `scoresOnlyGame`). Such a game
stores both scores, or one and who won, plus who played if anyone knows.
- **Not stored:** questions, subs' questions, buzzes, and notes.
- **Player stats:** its players heard no questions, so `playersInGame` leaves
  them out of every player stat.
- **Model and Insights:** the room model skips the game (`scoresOnly` in
  `game-stats.js`), since reading it as 16 tossups nobody answered would make
  its tournament look impossibly hard. Insights leaves it out too.
- **Where it counts:** in the record and how far the team went. On the
  Tournaments tab's season table it counts only in each player's Tournaments
  number, and Per tournament divides by the tournaments with buzzes.
- **Subjects:** changing a tournament's subjects passes it by.

A playoff game stores its `stage`, one of the `STAGES` keys: quarterfinal,
semifinal, third, or final. A regular round stores null, and a chair is always
one.
- **Labels:** a playoff game is labeled by its stage ("Hays Invitational,
  semifinal vs Hays") and lists after the regular rounds, in bracket order.
- **How far:** each tournament's line on the Tournaments tab adds how far the
  team went, from its furthest playoff game and its result: champion,
  runner-up, third or fourth place, semifinalist, or quarterfinalist.
- **Next game:** winning a quarterfinal or semifinal sets the next game's
  stage to the round after.

The
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
eyeballing a screenshot. On a network that inspects TLS, MongoDB fails with
"unable to verify the first certificate"; add `--use-system-ca` to `node`, as
`npm run dev:local` does.

## How to Approach a Task

1. **Locate by URL.** Given a page or endpoint, the file is where the URL says it is: `/api/query` → `routes/api/query.js`; `/play/tossups` → `client/play/tossups/`.
2. **Trace the layer boundary.** Route → validator → database function, or client → room message → client handler. Make your change at the correct layer.
3. **Check `shared/` impact.** If your change touches anything in `shared/`, it affects solo play, multiplayer, and possibly the server simultaneously.
4. **Keep diffs minimal and idiomatic.** Small files, small functions, house naming. A change that requires reformatting unrelated code is a smell.
5. **Build, run, click through it, lint.** Then you're done — not before.
