// One-click KSHSAA round reader: generates a fresh round and opens it inside
// MODAQ with KSHSAA scoring preloaded, then saves the game to team stats.
//
// INSTALL
//   1. Save as   routes/kshsaa-play.js
//   2. In app.js:
//        import kshsaaPlayRouter from './routes/kshsaa-play.js';
//        app.use('/kshsaa-play', kshsaaPlayRouter);     // above app.use(indexRouter)
//
// Requires routes/kshsaa-round.js (questions) and routes/kshsaa-stats.js (saving
// and player-name autocomplete).

import { Router } from 'express';
import { levelControls } from './kshsaa-round.js';
import { NAME_AUTOCOMPLETE } from '../server/kshsaa/name-autocomplete.js';
import { KSHSAA_HEAD, kshsaaNav, readTabs } from '../server/kshsaa/nav.js';

const router = Router();

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Read a round</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
${KSHSAA_HEAD}
<style>
 #modaq{margin-top:1rem}.setup{max-width:820px;margin:0 auto}
 /* The clock rides inside MODAQ's own "Previous / Question # / Next" row so the
    moderator's pointer never leaves that cluster. React rebuilds that row on
    every question change, so the bar is inserted into it and re-inserted when
    dropped, rather than positioned against coordinates that go stale.

    It is taken out of flow with left:100%, which resolves against the nav row's
    own width. That leaves the row measuring exactly what MODAQ put in it, so
    the parent still centres Previous / Question # / Next on the page and the
    clock hangs off its right edge - no widths measured in JS, and nothing to
    recompute when the row moves.
    Controls match MODAQ's Fluent UI: 32px tall, 2px corners, #8a8886 border. */
 /* top:0, not top:50% - the row box is a few px taller than its buttons
    (inline descender space below them), so centring on the box sits low;
    the buttons and this bar are both 32px flush to the row's top edge */
 #timerBar{position:absolute;left:100%;top:0;margin-left:10px;
   display:inline-flex;align-items:center;flex-wrap:nowrap;gap:.3rem;
   user-select:none;font-family:'Segoe UI',system-ui,sans-serif}
 .tb-clock{font-size:1.3rem;font-weight:600;font-variant-numeric:tabular-nums;color:#201f1e;
   min-width:2.9rem;text-align:right;line-height:32px}
 .tb-clock.low{color:#a4500f}
 .tb-clock.done{color:#a4262c}
 .tb-clock.flash{animation:tpflash .45s ease-in-out 3}
 @keyframes tpflash{0%,100%{opacity:1}50%{opacity:.25}}
 .tb-btn{box-sizing:border-box;height:32px;border:1px solid #8a8886;
   background:#fff;color:#323130;border-radius:2px;font-size:13px;font-weight:600;
   font-family:inherit;padding:0 8px;display:inline-flex;align-items:center;
   justify-content:center;-webkit-font-smoothing:antialiased;white-space:nowrap}
 .tb-btn:hover{background:#f3f2f1}
 .tb-btn:active{background:#edebe9}
 .tb-btn-primary{background:#0078d4;border-color:#0078d4;color:#fff;min-width:56px}
 .tb-btn-primary:hover{background:#106ebe;border-color:#106ebe;color:#fff}
 .tb-durations{display:inline-flex;gap:4px}
 .tb-durations button{box-sizing:border-box;height:32px;border:1px solid #8a8886;
   background:#fff;color:#323130;border-radius:2px;font-size:13px;font-weight:600;
   font-family:inherit;padding:0 5px;min-width:34px;display:inline-flex;align-items:center;
   justify-content:center;-webkit-font-smoothing:antialiased}
 .tb-durations button:hover{background:#f3f2f1}
 .tb-durations button.active{background:#edebe9;border-color:#323130}
 /* World Language questions are held up for the players to read and translate,
    not read aloud, so they get the whole screen at the largest size that fits. */
 #langShow{position:fixed;inset:0;z-index:2000;background:#fff;display:none;
   flex-direction:column;padding:2vmin 3vmin;font-family:Georgia,'Times New Roman',serif}
 #langShow.on{display:flex}
 #langFit{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;
   gap:1.5vmin;overflow:hidden}
 .lang-line{display:flex;align-items:baseline;gap:.6em;line-height:1.15}
 .lang-tag{flex:0 0 auto;font-family:'Segoe UI',system-ui,sans-serif;font-weight:700;
   color:#8a8886;font-size:.32em;letter-spacing:.08em}
 .lang-text{flex:1 1 auto;color:#111}
 #langFoot{flex:0 0 auto;display:flex;align-items:center;gap:1rem;padding-top:1.5vmin;
   border-top:1px solid #e1dfdd;font-family:'Segoe UI',system-ui,sans-serif}
 #langClock{font-size:2.6rem;font-weight:600;font-variant-numeric:tabular-nums;
   min-width:5rem;text-align:right}
 #langClock.low{color:#a4500f}
 #langClock.done{color:#a4262c}
 #langHint{flex:1 1 auto;font-size:.95rem;color:#605e5c}
 /* the only thing we impose on MODAQ's row: a positioning context for the clock */
 .kshsaa-cycle-row{position:relative}
 /* Fallback for windows too narrow to hold the clock beside a centred nav row:
    back into the flow, where the whole cluster centres together and wraps
    rather than running under MODAQ's event pane. Applied by measurement, not a
    guessed breakpoint - how much room there is depends on MODAQ's own layout. */
 #timerBar.tb-inflow{left:auto;right:0;margin-left:0}
 /* a note on the current question: a small card in the corner, so the
    question underneath stays readable while the moderator types */
 #notePanel{position:fixed;right:1rem;bottom:1rem;z-index:1500;width:min(340px,calc(100vw - 2rem));
   background:#fff;border:1px solid #c8c6c4;border-radius:.4rem;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:.75rem}
 /* reserve the row the clock now sits in, so it cannot cover the question */
</style>
</head><body>

${kshsaaNav('/kshsaa-play', 1100)}

<div class="container-fluid pb-3">
  <div id="readHead" class="setup">
    <h1 class="h4">Read a round</h1>
    ${readTabs('/kshsaa-play')}
  </div>

  <div id="gate" class="setup d-none">
    <div class="card" style="max-width:420px"><div class="card-body">
      <label class="form-label" for="gatePw">Reader password</label>
      <input type="password" class="form-control mb-2" id="gatePw">
      <button class="btn btn-primary" id="gateBtn">Enter</button>
      <div class="small text-danger mt-2" id="gateErr"></div>
    </div></div>
  </div>

  <div id="setup" class="setup d-none">
    <div class="mb-3">
      <label class="form-label fw-semibold" for="label">Game name</label>
      <input class="form-control" id="label" placeholder="Tuesday practice, game 2">
    </div>

    <div class="mb-3 d-none" id="lineupBox">
      <label class="form-label fw-semibold">Reuse a lineup</label>
      <select class="form-select form-select-sm mb-2" id="lineupGame"></select>
      <div id="lineupTeams"></div>
    </div>

    <div class="mb-3">
      <div class="form-label fw-semibold mb-1">Format</div>
      <div class="btn-group" role="group" aria-label="Round format">
        <input type="radio" class="btn-check" name="format" id="format-kshsaa" value="kshsaa" checked>
        <label class="btn btn-outline-primary btn-sm" for="format-kshsaa">KSHSAA</label>
        <input type="radio" class="btn-check" name="format" id="format-naqt" value="naqt">
        <label class="btn btn-outline-primary btn-sm" for="format-naqt">NAQT</label>
      </div>
      <div class="form-text" id="formatNote"></div>
    </div>
    <div class="mb-3">${levelControls()}</div>
    <div class="form-check mb-3" id="holdBackBox">
      <input class="form-check-input" type="checkbox" id="holdBack">
      <label class="form-check-label" for="holdBack">Varsity players are holding back (not interrupting)</label>
      <div class="form-text">On by default for JV and Beginner. Their answers then stay out of their Insights numbers,
        and the JV players are not rated against them.</div>
    </div>

    <div class="row g-4" id="teams"></div>
    <div class="mt-3">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="addTeam"
        title="For an octopus: three or more teams buzzing on one system">+ Add a team</button>
    </div>

    <div id="nameCheck" class="alert alert-warning mt-3 d-none"></div>

    <button class="btn btn-primary mt-3" id="go">Generate round &amp; start reading</button>
    <span class="ms-2 small text-secondary" id="status"></span>
  </div>

  <div id="timerBar" class="d-none">
    <span id="tpClock" class="tb-clock">10.0</span>
    <button type="button" class="tb-btn tb-btn-primary" id="tpToggle"
      title="Start or stop the clock (spacebar)">Start</button>
    <button type="button" class="tb-btn" id="tpOther"
      title="Wrong answer with no interruption: the other team gets the time left plus five seconds">+5s</button>
    <button type="button" class="tb-btn" id="tpReset"
      title="Put the clock back to this question's full limit">Reset</button>
    <button type="button" class="tb-btn" id="tpDisplay"
      title="Hold this question up full screen (D)">Enlarge</button>
    <span class="tb-durations" id="tpDurations"
      title="Time limit for this question - set automatically, override here"></span>
  </div>

  <div id="langShow">
    <div id="langFit"></div>
    <div id="langFoot">
      <span id="langClock">10.0</span>
      <span id="langHint">Spacebar starts and stops the clock. Escape or D exits.</span>
      <button type="button" class="tb-btn" id="langClose">Exit</button>
    </div>
  </div>

  <div id="roundBar" class="d-none d-flex flex-wrap align-items-center gap-2 small mb-2">
    <span id="roundInfo" class="text-secondary"></span>
    <span id="saveState" class="badge text-bg-light border">not saved yet</span>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="noteBtn"
      title="Write down something about this question, for a player or the team">Note on this question</button>
    <button type="button" class="btn btn-sm btn-outline-secondary d-none" id="screenBtn"
      title="A second window for the projector: the scores, the question, the clock, and anything held up">Scoreboard window</button>
    <button type="button" class="btn btn-sm btn-outline-primary ms-auto" id="nextRound"
      title="Start a fresh round with the same teams, then change whoever swapped out">Next round with these teams &rarr;</button>
  </div>
  <div id="roundWarn" class="alert alert-warning py-2 small d-none"></div>
  <div id="notePanel" class="d-none" role="dialog" aria-labelledby="npTitle">
    <div class="fw-semibold small mb-2" id="npTitle">Note on question <span id="npQ"></span></div>
    <select class="form-select form-select-sm mb-2" id="npWho" aria-label="Who the note is about"></select>
    <textarea class="form-control form-control-sm mb-2" id="npText" rows="3" maxlength="500"
      placeholder="Great early buzz on this one" aria-label="Note"></textarea>
    <div class="d-flex align-items-center gap-2">
      <button type="button" class="btn btn-sm btn-primary" id="npSave">Save note</button>
      <button type="button" class="btn btn-sm btn-link" id="npCancel">Cancel</button>
      <span class="small ms-auto" id="npMsg"></span>
    </div>
  </div>

  <div id="modaq"></div>
</div>

${NAME_AUTOCOMPLETE}
<script type="module">
const $ = id => document.getElementById(id);
// player names reach innerHTML in several places below, and a name is free text
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const REACT = 'https://esm.sh/react@18.3.1';
const REACTDOM = 'https://esm.sh/react-dom@18.3.1/client';
// mobx is pinned to 6 as well: modaq asks for ^6.5.0, but left unpinned esm.sh
// resolves the "latest" tag and hands it mobx 7, which throws during a round
const MODAQ = 'https://esm.sh/modaq@1.41.1?deps=react@18.3.1,react-dom@18.3.1,mobx@6.16.1';

const KSHSAA_FORMAT = {
  displayName: 'KSHSAA Scholars Bowl',
  negValue: -5,
  powers: [],
  bonusesBounceBack: false,
  minimumOvertimeQuestionCount: 1,
  overtimeIncludesBonuses: false,
  pronunciationGuideMarkers: ['(', ')'],
  timeoutsAllowed: 0,
  version: '2'
};
// NAQT rounds come from qbreader.org (/kshsaa/naqt.js): 15 for a buzz before
// the (*), 10 after, -5 for a neg, and a bonus for the team that answered,
// never bouncing back. Two tossups past the 24 break a tie.
const NAQT_FORMAT = {
  displayName: 'NAQT',
  negValue: -5,
  powers: [{ marker: '(*)', points: 15 }],
  bonusesBounceBack: false,
  minimumOvertimeQuestionCount: 1,
  overtimeIncludesBonuses: false,
  pairTossupsBonuses: false,
  pronunciationGuideMarkers: ['("', '")'],
  regulationTossupCount: 24,
  timeoutsAllowed: 1,
  version: '2'
};
const FORMAT_NOTES = {
  kshsaa: '16 questions at 10 points, saved to team stats.',
  naqt: '24 tossups and 24 bonuses from qbreader.org in NAQT\\'s high school mix: 15 for a buzz before the (*), ' +
    '10 after, \\u22125 for a neg, and a three-part bonus for the team that answers. Practice only: not saved to stats.'
};

let KNOWN = [];
// a game saves to stats exactly once
let SAVED = false;
let SAVING = false;
// notes written during the round: sent with the game when it saves, or added
// to the saved game when written after that
const NOTES = [];
let ROUND_ID = null;
// Fridays run octopus games: three or more teams on one lockout system
const MAX_TEAMS = 8;
// The scoreboard window, a second screen for the projector, gets this round's
// scores, question, clock, and anything held up (publishScreen). Its module
// loads on the side, so nothing about it can stop a round from being read.
let SCREEN = null;
// the round as the second screen needs it, from the moment it starts
let MATCH = null;
let LIVE_SCORES = null;
let HELD_UP = null;
let lastPublished = '';

function renumber (box) {
  Array.from(box.querySelectorAll('.pname')).forEach((input, i) => {
    input.placeholder = 'Player ' + (i + 1);
  });
}

function addPlayerBox (box) {
  const wrap = document.createElement('div');
  wrap.className = 'input-group input-group-sm mb-1';

  const input = document.createElement('input');
  input.className = 'form-control pname';
  input.placeholder = 'Player ' + (box.querySelectorAll('.pname').length + 1);
  attachNameAutocomplete(input, {
    names: () => KNOWN,
    taken: self => allNameInputs().filter(i => i !== self).map(i => i.value),
    onPick: self => focusAfter(self)
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-outline-secondary';
  remove.title = 'Remove this player';
  remove.textContent = '\\u00d7';
  remove.onclick = () => {
    if (box.querySelectorAll('.pname').length <= 1) { input.value = ''; return; }
    wrap.remove();
    renumber(box);
  };

  wrap.appendChild(input);
  wrap.appendChild(remove);
  box.appendChild(wrap);
  return input;
}

const teamCols = () => Array.from(document.querySelectorAll('#teams .team'));
const allNameInputs = () => Array.from(document.querySelectorAll('#teams .pname'));
const typedNames = col => Array.from(col.querySelectorAll('.pname')).map(i => i.value.trim()).filter(Boolean);

// Enter moves down the lineup, then on to the next team, then to the button
function focusAfter (input) {
  const all = allNameInputs();
  const next = all[all.indexOf(input) + 1];
  (next || $('go')).focus();
}

// numbers the teams by position, and lets one go only while two would remain
function renumberTeams () {
  const cols = teamCols();
  cols.forEach((col, i) => {
    const name = col.querySelector('.tname');
    name.placeholder = 'Team ' + (i + 1);
    name.setAttribute('aria-label', 'Team ' + (i + 1) + ' name');
    col.querySelector('.tdel').classList.toggle('d-none', cols.length <= 2);
  });
  $('addTeam').classList.toggle('d-none', cols.length >= MAX_TEAMS);
  renderLineupChoices();
}

function addTeam () {
  const col = document.createElement('div');
  col.className = 'col-md-6 team';

  const head = document.createElement('div');
  head.className = 'input-group mb-2';
  const name = document.createElement('input');
  name.className = 'form-control fw-semibold tname';
  // Enter on a team name goes to that team's first player
  name.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = col.querySelector('.pname');
    if (first) first.focus();
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-outline-secondary tdel';
  del.title = 'Remove this team';
  del.textContent = '\\u00d7';
  del.onclick = () => {
    if (teamCols().length <= 2) return;
    const label = name.value.trim() || name.placeholder;
    if (typedNames(col).length && !window.confirm('Remove ' + label + ' and its players?')) return;
    col.remove();
    renumberTeams();
  };
  head.appendChild(name);
  head.appendChild(del);

  const box = document.createElement('div');
  box.className = 'pbox';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn-sm btn-outline-secondary mt-1';
  add.textContent = '+ Add player';
  add.onclick = () => addPlayerBox(box).focus();

  col.appendChild(head);
  col.appendChild(box);
  col.appendChild(add);
  $('teams').appendChild(col);
  for (let i = 0; i < 5; i++) addPlayerBox(box);
  renumberTeams();
  return col;
}

// adds or drops teams from the end until there are n, never fewer than two
function setTeamCount (n) {
  const want = Math.max(2, Math.min(MAX_TEAMS, n));
  while (teamCols().length < want) addTeam();
  while (teamCols().length > want) teamCols().pop().remove();
  renumberTeams();
}

let LINEUPS = [];

// replace one team's roster wholesale, keeping a few blank rows to add to
function fillTeam (col, teamName, playerNames) {
  col.querySelector('.tname').value = teamName || '';
  const box = col.querySelector('.pbox');
  box.innerHTML = '';
  for (const name of playerNames.slice(0, 12)) { addPlayerBox(box).value = name; }
  while (box.querySelectorAll('.pname').length < 5) { addPlayerBox(box); }
  renumber(box);
}

function renderLineupChoices () {
  const game = LINEUPS[Number($('lineupGame').value)];
  const box = $('lineupTeams');
  if (!game) { box.innerHTML = ''; return; }
  const count = teamCols().length;
  // past two teams the buttons drop the word "Team" so a row still fits
  const target = k => count > 2 ? String(k) : 'Team ' + k;
  let h = '';
  game.teams.forEach((t, i) => {
    h += '<div class="d-flex align-items-center gap-2 mb-1">' +
      '<span class="small flex-grow-1"><strong>' + esc(t.name) + '</strong> &mdash; ' +
      esc(t.players.join(', ')) + '</span>';
    for (let k = 1; k <= count; k++) {
      h += '<button type="button" class="btn btn-sm btn-outline-secondary loadSide" data-team="' + i +
        '" data-side="' + k + '" title="Put this lineup in as Team ' + k + '">&rarr; ' + target(k) + '</button>';
    }
    h += '</div>';
  });
  if (game.teams.length >= 2) {
    h += '<button type="button" class="btn btn-sm btn-outline-primary mt-1" id="loadBoth">' +
      (game.teams.length === 2 ? 'Load both sides' : 'Load all ' + game.teams.length + ' teams') + '</button>';
  }
  box.innerHTML = h;

  Array.from(box.querySelectorAll('.loadSide')).forEach(btn => {
    btn.onclick = () => {
      const t = game.teams[Number(btn.dataset.team)];
      fillTeam(teamCols()[Number(btn.dataset.side) - 1], t.name, t.players);
    };
  });
  const both = box.querySelector('#loadBoth');
  if (both) {
    both.onclick = () => {
      setTeamCount(game.teams.length);
      teamCols().forEach((col, i) => {
        const t = game.teams[i];
        if (t) fillTeam(col, t.name, t.players);
      });
    };
  }
}

function loadLineups () {
  fetch('/kshsaa-stats/lineups').then(r => r.ok ? r.json() : null).then(d => {
    LINEUPS = (d && d.games) || [];
    if (!LINEUPS.length) return;
    $('lineupGame').innerHTML = LINEUPS.map((g, i) =>
      '<option value="' + i + '">' + esc(g.label) + ' — ' +
      new Date(g.playedAt).toLocaleDateString() + '</option>').join('');
    $('lineupGame').onchange = renderLineupChoices;
    renderLineupChoices();
    $('lineupBox').classList.remove('d-none');
  }).catch(() => {});
}

// login gate: names must be loaded before a round starts, so duplicates can't slip in
function startApp () {
  $('gate').classList.add('d-none');
  $('setup').classList.remove('d-none');
  while (teamCols().length < 2) addTeam();
  // a round started before the roster arrives would flag every player as new,
  // so hold the button until the fetch settles either way
  $('go').disabled = true;
  $('status').textContent = 'loading player names...';
  fetch('/kshsaa-stats/names').then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.names) return;
    KNOWN = d.names;
  }).catch(() => {}).finally(() => {
    $('go').disabled = false;
    if ($('status').textContent === 'loading player names...') $('status').textContent = '';
  });
  loadLineups();
  holdBackForLevel();
  restoreNextRound();
  applyFormat();
}

// varsity players hold back in a JV or Beginner round unless the moderator
// says otherwise, the same default the stats use for older games
function holdBackForLevel () {
  const level = document.querySelector('input[name="level"]:checked').value;
  $('holdBack').checked = level === 'jv' || level === 'beginner';
}

const selectedFormat = () => document.querySelector('input[name="format"]:checked').value;

// a NAQT round is practice only and takes its math from qbreader.org, so
// holding back and the math menu have nothing to say about it
function applyFormat () {
  const naqt = selectedFormat() === 'naqt';
  $('formatNote').textContent = FORMAT_NOTES[selectedFormat()];
  $('holdBackBox').classList.toggle('d-none', naqt);
  $('mathTier').parentElement.classList.toggle('d-none', naqt);
}

// ---------- next round ----------
// Carrying the setup through a reload, rather than tearing MODAQ down in place,
// gives the next round a clean reader. sessionStorage is per tab, so rooms
// running side by side in different tabs keep their own lineups.
const NEXT_KEY = 'kshsaa-next-round';

// "Tuesday tryouts, game 2" -> "Tuesday tryouts, game 3"
function nextLabel (label) {
  let i = label.length;
  while (i > 0 && label.charAt(i - 1) >= '0' && label.charAt(i - 1) <= '9') i--;
  return i === label.length ? label : label.slice(0, i) + (Number(label.slice(i)) + 1);
}

function currentSetup () {
  return {
    label: $('label').value.trim(),
    format: selectedFormat(),
    level: document.querySelector('input[name="level"]:checked').value,
    holdBack: $('holdBack').checked,
    math: $('mathTier').value,
    teams: teamCols().map(col => ({ name: col.querySelector('.tname').value.trim(), players: typedNames(col) }))
  };
}

function restoreNextRound () {
  let setup = null;
  try {
    setup = JSON.parse(sessionStorage.getItem(NEXT_KEY) || 'null');
    sessionStorage.removeItem(NEXT_KEY);
  } catch (e) {}
  if (!setup) return;
  $('label').value = nextLabel(setup.label || '');
  const radio = document.querySelector('input[name="level"][value="' + setup.level + '"]');
  if (radio) radio.checked = true;
  const format = document.querySelector('input[name="format"][value="' + setup.format + '"]');
  if (format) format.checked = true;
  if (typeof setup.holdBack === 'boolean') $('holdBack').checked = setup.holdBack;
  if (setup.math) $('mathTier').value = setup.math;
  const teams = setup.teams || [];
  setTeamCount(teams.length);
  teamCols().forEach((col, i) => {
    if (teams[i]) fillTeam(col, teams[i].name, teams[i].players || []);
  });
}

// either password works here: the reader one only loads names and saves games
fetch('/kshsaa-stats/me').then(r => r.json()).then(d => {
  if (d.reader) startApp();
  else $('gate').classList.remove('d-none');
}).catch(() => $('gate').classList.remove('d-none'));

$('gateBtn').onclick = async () => {
  const r = await fetch('/kshsaa-stats/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: $('gatePw').value })
  });
  if (r.ok) startApp();
  else {
    const d = await r.json().catch(() => ({}));
    $('gateErr').textContent = d.error || 'wrong password';
  }
};
$('gatePw').onkeydown = e => { if (e.key === 'Enter') $('gateBtn').click(); };
document.querySelectorAll('input[name="level"]').forEach(r => r.addEventListener('change', holdBackForLevel));
document.querySelectorAll('input[name="format"]').forEach(r => r.addEventListener('change', applyFormat));
$('addTeam').onclick = () => {
  if (teamCols().length < MAX_TEAMS) addTeam().querySelector('.tname').focus();
};
$('screenBtn').onclick = () => {
  if (SCREEN && !SCREEN.openScreen()) {
    window.alert('The browser blocked the window. Allow pop-ups for this site, or open ' +
      window.location.origin + SCREEN.screenUrl() + ' in a new window.');
  }
};
import('/kshsaa/second-screen.js').then(m => {
  SCREEN = m;
  $('screenBtn').classList.remove('d-none');
  publishScreen();
}).catch(() => {});

function lev (a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i - 1] === a[j - 1]
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

function suggestionsFor (name) {
  const n = name.toLowerCase();
  return KNOWN.filter(k => {
    const kk = k.toLowerCase();
    if (kk === n) return false;
    if (kk.startsWith(n) || n.startsWith(kk)) return true;
    // edit distance is never smaller than the length gap, so this skips the
    // quadratic work for names that cannot possibly be within two edits
    return Math.abs(kk.length - n.length) <= 2 && lev(kk, n) <= 2;
  }).slice(0, 4);
}

function nameInputs () {
  return teamCols().flatMap((col, i) => {
    const team = col.querySelector('.tname').value.trim() || 'Team ' + (i + 1);
    return Array.from(col.querySelectorAll('.pname')).map(input => ({ input, team, col: i }));
  }).filter(e => e.input.value.trim());
}

// returns players array, or null if the moderator still has names to resolve
function validatedPlayers () {
  const warn = $('nameCheck');
  const entries = nameInputs();

  // MODAQ tells teams apart by name alone, so two with one name would merge
  const colOf = {};
  for (const e of entries) {
    const key = e.team.toLowerCase();
    if (key in colOf && colOf[key] !== e.col) {
      warn.className = 'alert alert-danger mt-3';
      warn.innerHTML = 'Two teams are both called <strong>' + esc(e.team) + '</strong>. Give each team its own name.';
      return null;
    }
    colOf[key] = e.col;
  }

  // snap to existing capitalization so "max" can never become a second "Max"
  entries.forEach(e => {
    const v = e.input.value.trim();
    const match = KNOWN.find(k => k.toLowerCase() === v.toLowerCase());
    e.input.value = match || v;
  });

  const seen = {};
  for (const e of entries) {
    const v = e.input.value.trim().toLowerCase();
    if (seen[v]) {
      warn.className = 'alert alert-danger mt-3';
      warn.innerHTML = '<strong>' + esc(e.input.value) + '</strong> is entered twice. Each player can only be on one team, once.';
      return null;
    }
    seen[v] = true;
  }

  const unknown = entries.filter(e => !KNOWN.some(k => k === e.input.value.trim()));
  if (unknown.length) {
    let h = '<strong>New names detected.</strong> Pick the existing player if this is the same person &mdash; ' +
      'otherwise confirm they are new, so stats do not get split across spellings.<div class="mt-2">';
    unknown.forEach((e, idx) => {
      const typed = e.input.value.trim();
      const sugg = suggestionsFor(typed);
      h += '<div class="row g-2 align-items-center mb-1"><div class="col-sm-4"><code>' + esc(typed) + '</code></div>' +
        '<div class="col-sm-8"><select class="form-select form-select-sm resolve" data-idx="' + idx + '">';
      sugg.forEach(s => { h += '<option value="' + esc(s) + '">use existing: ' + esc(s) + '</option>'; });
      h += '<option value="__new__">add "' + esc(typed) + '" as a new player</option></select></div></div>';
    });
    h += '</div><button class="btn btn-sm btn-primary mt-2" id="resolveBtn">Confirm names</button>';
    warn.className = 'alert alert-warning mt-3';
    warn.innerHTML = h;
    document.getElementById('resolveBtn').onclick = () => {
      document.querySelectorAll('.resolve').forEach(sel => {
        const e = unknown[Number(sel.getAttribute('data-idx'))];
        if (sel.value !== '__new__') e.input.value = sel.value;
        else if (!KNOWN.includes(e.input.value.trim())) KNOWN.push(e.input.value.trim());
      });
      warn.classList.add('d-none');
      $('go').click();
    };
    return null;
  }

  warn.classList.add('d-none');
  // everyone listed plays: JV and Beginner practice put seven on a team, and
  // MODAQ's buzz menu leaves out anyone who is not a starter
  return entries.map(e => ({ name: e.input.value.trim(), teamName: e.team, isStarter: true }));
}

// ---------- World Language display ----------
// Per the manual these carry the same expression in French, German and Spanish,
// in that order, and the moderator holds the text up rather than reading it.
let ROUND = [];
let CURRENT_QUESTION = 1;

const DISPLAY_CATEGORIES = ['World Language', 'Foreign Language'];
const LANG_TAGS = ['FRENCH', 'GERMAN', 'SPANISH', 'LATIN'];

/**
 * Splits "FRENCH ... GERMAN ... SPANISH ..." into labelled lines.
 * @param {string} text
 * @returns {{tag: ?string, text: string}[]} one entry per language, or a single
 * unlabelled entry when the markers are missing -- 43 of the 653 in the archive
 * are mis-tagged and are really ordinary questions.
 */
function splitLanguages (text) {
  // strip a leading [30 sec] marker without a regex: backslashes inside this
  // page's template literal collapse before the browser ever sees them
  const trimmed = text.trim();
  const close = trimmed.indexOf(']');
  const clean = (trimmed.charAt(0) === '[' && close !== -1 ? trimmed.slice(close + 1) : trimmed).trim();
  const found = [];
  for (const tag of LANG_TAGS) {
    const at = clean.toUpperCase().indexOf(tag);
    if (at !== -1) { found.push({ tag, at }); }
  }
  if (found.length < 2) { return [{ tag: null, text: clean }]; }
  found.sort((a, b) => a.at - b.at);
  return found.map((f, i) => {
    const from = f.at + f.tag.length;
    const to = i + 1 < found.length ? found[i + 1].at : clean.length;
    return { tag: f.tag, text: clean.slice(from, to).trim() };
  }).filter(l => l.text);
}

/** Grows the text to the largest size that still fits the box. */
function fitText (box) {
  let lo = 12;
  let hi = 260;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    box.style.fontSize = mid + 'px';
    const fits = box.scrollHeight <= box.clientHeight && box.scrollWidth <= box.clientWidth;
    if (fits) { lo = mid; } else { hi = mid; }
  }
  box.style.fontSize = lo + 'px';
}

function showLanguage (question) {
  const lines = splitLanguages(question);
  $('langFit').innerHTML = lines.map(l =>
    '<div class="lang-line">' +
    (l.tag ? '<span class="lang-tag">' + esc(l.tag) + '</span>' : '') +
    '<span class="lang-text">' + esc(l.text) + '</span></div>').join('');
  $('langShow').classList.add('on');
  fitText($('langFit'));
  HELD_UP = lines;
  publishScreen();
}

function hideLanguage () {
  $('langShow').classList.remove('on');
  HELD_UP = null;
  publishScreen();
}

const languageShowing = () => $('langShow').classList.contains('on');

// ---------- answer clock (KSHSAA timing) ----------
// startedAt and startedLeft (wall-clock ms, seconds left) are for the second
// screen, which runs its own copy of the clock from when it last started
const TIMER = { duration: 10, remaining: 10, running: false, handle: null, last: 0, startedAt: 0, startedLeft: 0 };
const DURATIONS = [10, 30, 45, 60, 120];
const DEFAULT_SECONDS = 10;
// seconds allowed on each question of this round, read off the [30 sec] markers
let LIMITS = [];

function tpRender () {
  for (const id of ['tpClock', 'langClock']) {
    const el = $(id);
    if (!el) { continue; }
    el.textContent = TIMER.remaining.toFixed(1);
    el.classList.toggle('low', TIMER.remaining <= 3 && TIMER.remaining > 0);
    el.classList.toggle('done', TIMER.remaining <= 0);
  }
}

function tpTick () {
  const now = performance.now();
  TIMER.remaining = Math.max(0, TIMER.remaining - (now - TIMER.last) / 1000);
  TIMER.last = now;
  tpRender();
  if (TIMER.remaining <= 0) {
    tpStop();
    const el = $('tpClock');
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
  }
}

function tpSyncToggle () {
  const b = $('tpToggle');
  if (b) b.textContent = TIMER.running ? 'Stop' : 'Start';
}

function tpStart () {
  if (TIMER.running) return;
  if (TIMER.remaining <= 0) TIMER.remaining = TIMER.duration;
  TIMER.running = true;
  TIMER.last = performance.now();
  TIMER.handle = setInterval(tpTick, 100);
  TIMER.startedAt = Date.now();
  TIMER.startedLeft = TIMER.remaining;
  tpSyncToggle();
  publishScreen();
}

function tpStop () {
  TIMER.running = false;
  if (TIMER.handle) clearInterval(TIMER.handle);
  TIMER.handle = null;
  tpSyncToggle();
  publishScreen();
}

// no interruption, wrong answer: opponents get the time left plus five seconds
function tpAddFive () {
  tpStop();
  TIMER.remaining = TIMER.remaining + 5;
  tpRender();
  tpStart();
}

// interruption, wrong answer (-5): the question is reread in full, so the
// other team starts again from the whole time limit
function tpRereadReset () {
  tpStop();
  TIMER.remaining = TIMER.duration;
  tpRender();
  publishScreen();
}

// a new question means a fresh clock, at whatever limit that question carries.
// The number itself is not echoed anywhere here - MODAQ's own nav row and its
// event pane both already show it.
function tpForQuestion (n) {
  CURRENT_QUESTION = n;
  tpSet(LIMITS[n - 1] || DEFAULT_SECONDS, false);
  // never opens on its own - the moderator presses Enlarge when they are ready
  // to hold the question up. Close it on a question change so it cannot linger
  // over the next one.
  hideLanguage();
  markDisplayButton(n);
}

// a World Language question is the one that gets held up rather than read, so
// make the button obvious on those without forcing the panel open
function markDisplayButton (n) {
  const q = ROUND[n - 1];
  const wanted = Boolean(q) && DISPLAY_CATEGORIES.indexOf(q.category) !== -1;
  const btn = $('tpDisplay');
  if (!btn) { return; }
  btn.classList.toggle('tb-btn-primary', wanted);
  btn.title = wanted
    ? 'This one is held up for the players to read, not read aloud (D)'
    : 'Hold this question up full screen (D)';
}

// MODAQ exposes no callbacks, so read its DOM instead. Two things matter: the
// question number (which limit applies) and a team score going down, meaning a
// neg was scored - under KSHSAA the question is then reread in full, so the
// clock goes back to the top rather than carrying the remainder over.
// The clock lives outside #modaq, so updating it cannot retrigger the observer.
function watchReader (teamNames) {
  const root = $('modaq');
  const bar = $('timerBar');
  let scoreEl = null;
  let lastScores = null;
  let lastQuestion = null;
  let queued = false;

  // MODAQ's nav row, found by role rather than by generated class name (those
  // change between MODAQ builds). Note it is not always both buttons: Next is
  // gone on the last question of the round, so climb until the candidate holds
  // whichever nav buttons exist plus the "Question #" label.
  const findCycleRow = () => {
    const nav = [...root.querySelectorAll('button')].filter(b => {
      const t = b.textContent || '';
      return t.indexOf('Previous') !== -1 || t.indexOf('Next') !== -1;
    });
    if (!nav.length) return null;
    let row = nav[0].parentElement;
    while (row && row !== root &&
           !(nav.every(b => row.contains(b)) && /Question\\s*#/i.test(row.textContent))) {
      row = row.parentElement;
    }
    return row && row !== root ? row : null;
  };

  // Hanging off the right of a centred row only works while there is room to
  // the right of it. Ask the layout rather than guessing a breakpoint: try the
  // hung position, and if the bar would run past the row's container - where
  // MODAQ's event pane begins - drop back into the flow.
  const fitToRow = row => {
    bar.classList.remove('tb-inflow');
    row.style.minHeight = '';
    const host = row.parentElement;
    if (!host) return;
    host.style.height = '';
    const fits = bar.getBoundingClientRect().right <= host.getBoundingClientRect().right;
    bar.classList.toggle('tb-inflow', !fits);
    // The row itself computes to a few pixels tall and lets the nav buttons
    // overflow it, so neither top:100% nor its own height clears them. Measure
    // how far down the buttons actually reach.
    const top = row.getBoundingClientRect().top;
    let bottom = top;
    for (const node of row.querySelectorAll('*')) {
      if (node === bar || bar.contains(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.height > 0 && r.bottom > bottom) bottom = r.bottom;
    }
    if (fits) {
      bar.style.top = '';
      return;
    }
    const offset = Math.round(bottom - top) + 6;
    bar.style.top = offset + 'px';
    // The bar is absolutely positioned, so the row has to grow to contain it
    // or the question card renders underneath. Size from the bar's own offset
    // rather than the row's height, which MODAQ keeps changing under us.
    const height = Math.round(bar.getBoundingClientRect().height);
    row.style.minHeight = (offset + height + 12) + 'px';
    // MODAQ pins the chooser to a fixed height, so the taller row alone would
    // not move the question card down
    host.style.height = 'auto';
  };

  // React owns that row and rebuilds it, so treat placement as something to
  // restore continuously rather than to do once
  const anchor = () => {
    const row = findCycleRow();
    if (!row) return;
    if (bar.parentElement !== row) {
      row.classList.add('kshsaa-cycle-row');
      row.appendChild(bar);
    }
    fitToRow(row);
  };

  window.addEventListener('resize', anchor);

  // matching on the real team names rather than the literal word "Team" keeps
  // this working once the moderator renames the teams. The length cap keeps
  // out containers holding the whole reader, and grows with the names, since
  // an octopus scoreboard lists every team.
  const looksLikeScoreboard = t =>
    t.length < 200 + teamNames.join('').length && /\\d/.test(t) && teamNames.every(n => t.indexOf(n) !== -1);

  const findScoreEl = () => {
    let best = null;
    root.querySelectorAll('*').forEach(node => {
      if (node.children.length > 3 || bar.contains(node)) return;
      const t = (node.textContent || '').trim();
      if (looksLikeScoreboard(t) && (!best || t.length < best.textContent.trim().length)) best = node;
    });
    return best;
  };

  // MODAQ lists the teams in the order their players were given, so read them
  // in that order, each after the last: "JV Crimson: 10, Crimson: 5" would
  // otherwise give Crimson JV Crimson's score
  const scoresFrom = text => {
    let from = 0;
    return teamNames.map(n => {
      const at = text.indexOf(n, from);
      if (at === -1) return null;
      from = at + n.length;
      const m = text.slice(from).match(/-?\\d+/);
      return m ? Number(m[0]) : null;
    });
  };

  const scan = () => {
    queued = false;
    anchor();

    // read the number off the nav row once anchored: it is a few dozen
    // characters rather than the whole reader, and cannot pick up a
    // "Question #" that belongs to some other part of MODAQ's UI
    const row = bar.parentElement;
    const navText = (row && row !== root ? row.textContent : root.textContent) || '';
    const qm = navText.match(/Question\\s*#\\s*(\\d+)/i);
    const q = qm ? Number(qm[1]) : null;
    if (q && q !== lastQuestion) {
      lastQuestion = q;
      tpForQuestion(q);
    }

    if (!scoreEl || !root.contains(scoreEl)) {
      scoreEl = findScoreEl();
      lastScores = scoreEl ? scoresFrom(scoreEl.textContent) : null;
      showScores(lastScores);
      return;
    }
    const now = scoresFrom(scoreEl.textContent);
    if (lastScores) {
      for (let i = 0; i < now.length; i++) {
        if (now[i] != null && lastScores[i] != null && now[i] < lastScores[i]) { tpRereadReset(); break; }
      }
    }
    lastScores = now;
    showScores(now);
  };

  // React re-renders in bursts; one debounced pass per burst beats polling.
  // The bar now lives inside root, so its own ticking clock would otherwise
  // wake this ten times a second - ignore bursts that are entirely our own.
  new MutationObserver(records => {
    if (records.every(r => bar.contains(r.target))) return;
    if (queued) return;
    queued = true;
    setTimeout(scan, 150);
  }).observe(root, { childList: true, subtree: true, characterData: true });
  scan();
}

function tpSet (seconds, alsoStart) {
  tpStop();
  TIMER.duration = seconds;
  TIMER.remaining = seconds;
  tpRender();
  Array.from($('tpDurations').children).forEach(b => {
    b.classList.toggle('active', Number(b.dataset.secs) === seconds);
  });
  if (alsoStart) tpStart();
  publishScreen();
}

function setupTimer (round, teamNames) {
  ROUND = round;
  // KSHSAA gives longer limits on computation questions; the generator tags them
  LIMITS = round.map(q => {
    const m = q.question.match(/^\\[(\\d+)\\s*sec\\]/i);
    return m ? Number(m[1]) : DEFAULT_SECONDS;
  });

  // the override list has to include any limit this round actually uses, or
  // tpSet could not highlight the value it just applied
  // only the limits this round actually uses, so the bar stays narrow enough to
  // sit beside the nav row instead of being pushed under it
  const choices = [...new Set([DEFAULT_SECONDS, ...LIMITS])].sort((a, b) => a - b);
  $('tpDurations').innerHTML = choices
    .map(s => '<button type="button" data-secs="' + s + '">' + s + 's</button>').join('');
  Array.from($('tpDurations').children).forEach(b => {
    b.onclick = () => tpSet(Number(b.dataset.secs), false);
  });

  const timed = LIMITS
    .map((s, i) => s === DEFAULT_SECONDS ? null : 'Q' + (i + 1) + ': ' + s + 's')
    .filter(Boolean);
  // explanation lives in a tooltip so the bar stays compact inside the reader
  $('timerBar').title = '10s to buzz by default, set automatically per question. ' +
    '"+5s" gives the opponents the time left plus five seconds after a wrong answer with no ' +
    'interruption; on an interruption the question is reread and the clock resets on its own.' +
    (timed.length ? ' Longer limits this round: ' + timed.join(', ') + '.' : '');

  $('langClose').onclick = hideLanguage;
  $('langShow').onclick = e => { if (e.target === $('langShow')) { hideLanguage(); } };
  window.addEventListener('resize', () => { if (languageShowing()) { fitText($('langFit')); } });

  $('tpDisplay').onclick = () => {
    if (languageShowing()) { hideLanguage(); return; }
    const q = ROUND[(CURRENT_QUESTION || 1) - 1];
    // a NAQT tossup is formatted for MODAQ; hold up its plain text
    if (q) { showLanguage(q.display || q.question); }
  };

  $('tpToggle').onclick = () => { TIMER.running ? tpStop() : tpStart(); };
  $('tpReset').onclick = () => tpSet(TIMER.duration, false);
  $('tpOther').onclick = tpAddFive;

  document.addEventListener('keydown', e => {
    const t = e.target;
    const tag = (t && t.tagName ? t.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) { return; }
    if (e.key === 'Escape' && languageShowing()) { hideLanguage(); e.preventDefault(); return; }
    if (e.key === 'd' || e.key === 'D') { $('tpDisplay').click(); e.preventDefault(); }
  });

  // spacebar starts/stops the clock, unless the moderator is typing somewhere
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    const tag = (t && t.tagName ? t.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (tag === 'button') t.blur();   // stop space from re-firing the focused button
    e.preventDefault();
    TIMER.running ? tpStop() : tpStart();
  });
  tpForQuestion(1);
  $('timerBar').classList.remove('d-none');
  watchReader(teamNames);
}

// ---------- second screen ----------
// Scores as read off MODAQ. A reading that misses a team keeps that team's
// last score, so a re-render never flashes a zero onto the projector.
function showScores (scores) {
  if (!scores) return;
  LIVE_SCORES = scores.map((s, i) => s != null ? s : (LIVE_SCORES ? LIVE_SCORES[i] : null));
  publishScreen();
}

// What the scoreboard window shows of this round (scoreboard/match.js reads
// it). Written out only when something on it changes, since the window
// redraws on every write.
function publishScreen () {
  if (!SCREEN || !MATCH) return;
  const q = CURRENT_QUESTION || 1;
  const view = {
    kind: 'match',
    roundId: MATCH.roundId,
    label: MATCH.label,
    level: MATCH.level,
    teams: MATCH.teams.map((name, i) => ({ name, score: (LIVE_SCORES && LIVE_SCORES[i]) || 0 })),
    question: q,
    total: Math.max(q, MATCH.total || ROUND.length),
    category: ROUND[q - 1] ? ROUND[q - 1].category : '',
    clock: {
      limit: TIMER.duration * 1000,
      left: Math.round((TIMER.running ? TIMER.startedLeft : TIMER.remaining) * 1000),
      since: TIMER.running ? TIMER.startedAt : null
    },
    display: HELD_UP,
    final: SAVED
  };
  const text = JSON.stringify(view);
  if (text === lastPublished) return;
  lastPublished = text;
  SCREEN.showOnScreen(view);
}

function showNoteCount () {
  $('noteBtn').textContent = 'Note on this question' + (NOTES.length ? ' (' + NOTES.length + ' so far)' : '');
}

function openNote (teams) {
  $('npQ').textContent = CURRENT_QUESTION || 1;
  $('npWho').innerHTML = '<option value="">No one in particular</option>' + teams.map(t =>
    '<optgroup label="' + esc(t.name) + '">' + t.players.map(n => '<option>' + esc(n) + '</option>').join('') + '</optgroup>').join('');
  $('npText').value = '';
  $('npMsg').textContent = '';
  $('notePanel').classList.remove('d-none');
  $('npText').focus();
}

async function saveNote () {
  const text = $('npText').value.trim();
  if (!text) { $('npMsg').textContent = 'write something first'; return; }
  // a save in flight has already sent its notes
  if (SAVING) { $('npMsg').textContent = 'the game is saving, try again in a moment'; return; }
  const note = { questionNumber: CURRENT_QUESTION || 1, player: $('npWho').value || null, text };
  if (SAVED) {
    const r = await fetch('/kshsaa-stats/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: ROUND_ID, notes: [note] })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { $('npMsg').innerHTML = '<span class="text-danger">' + esc(d.error || 'could not save') + '</span>'; return; }
  }
  NOTES.push(note);
  showNoteCount();
  $('notePanel').classList.add('d-none');
}

$('go').onclick = async () => {
  const players = validatedPlayers();
  if (!players) return;
  if (new Set(players.map(p => p.teamName)).size < 2) {
    $('status').textContent = 'add players to at least two teams';
    return;
  }

  $('go').disabled = true;
  $('status').textContent = 'building round...';
  const naqt = selectedFormat() === 'naqt';
  try {
    // kept for "Next round with these teams"
    const setup = currentSetup();
    let data;
    if (naqt) {
      // straight from qbreader.org in this browser: nothing passes through
      // this site, so the round is never counted as read
      $('status').textContent = 'getting questions from qbreader.org...';
      const { naqtRound } = await import('/kshsaa/naqt.js');
      data = { ...await naqtRound({ level: setup.level }), level: setup.level, roundId: 'naqt-' + Date.now() };
    } else {
      const res = await fetch('/kshsaa-round/generate?' + levelQuery());
      data = await res.json();
      if (data.error) throw new Error(data.error);
    }

    // metadata is MODAQ's own per-question field: it renders it as <Social Studies>
    // beside the answer, so the moderator can see which subject they are reading.
    const packet = {
      tossups: data.round.map(q => ({ question: q.question, answer: q.answer, metadata: q.category })),
      bonuses: (data.bonuses || []).map(b => ({ leadin: b.leadin, parts: b.parts, answers: b.answers, values: b.values, metadata: b.metadata }))
    };
    const label = $('label').value.trim() || 'Practice';
    // sent with the game so stats read the real category of each question
    // instead of inferring it from the slot number
    const categories = data.round.map(q => q.category);

    const teamNames = [...new Set(players.map(p => p.teamName))];
    ROUND_ID = data.roundId;
    const noteTeams = teamNames.map(name => ({ name, players: players.filter(p => p.teamName === name).map(p => p.name) }));
    $('noteBtn').onclick = () => openNote(noteTeams);
    // notes go out with the saved game, and a NAQT game is never saved
    $('noteBtn').classList.toggle('d-none', naqt);
    if (naqt) $('saveState').textContent = 'practice, not saved';
    $('npSave').onclick = saveNote;
    $('npCancel').onclick = () => $('notePanel').classList.add('d-none');
    $('npText').onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(); }
      if (e.key === 'Escape') { $('notePanel').classList.add('d-none'); }
    };
    // MODAQ listens for its shortcuts across the whole page, so letters typed
    // into a note would otherwise move it to the next question
    for (const type of ['keydown', 'keypress', 'keyup']) {
      $('notePanel').addEventListener(type, e => e.stopPropagation());
    }

    $('status').textContent = 'loading reader...';
    const [React, ReactDOM, Modaq] = await Promise.all([
      import(REACT), import(REACTDOM), import(MODAQ)
    ]);

    // Celerity needs a denominator. MODAQ reports a buzz as an index into the
    // question's BUZZABLE words -- a pronunciation guide is skipped -- so count
    // the same way, with MODAQ's own tokeniser. This has to come after the
    // import above: Modaq is const, so touching it earlier hits the temporal
    // dead zone and the round never builds.
    const buzzableWords = (text) => {
      const tokens = Modaq.splitFormattedTextIntoWords(text)
        .map(w => Array.prototype.reduce.call(w, (acc, s) => acc + s.text, ''));
      let depth = 0;
      let count = 0;
      for (const token of tokens) {
        const opens = token.split('(').length - 1;
        const closes = token.split(')').length - 1;
        const insideGuide = depth > 0 || opens > 0;
        depth = Math.max(0, depth + opens - closes);
        if (!insideGuide) { count++; }
      }
      return count;
    };
    const wordCounts = data.round.map(q => buzzableWords(q.question));
    const charCounts = data.round.map(q => q.question.length);

    $('setup').style.display = 'none';
    $('readHead').style.display = 'none';
    const warnings = (data.short && data.short.length
      ? ['This round is ' + data.round.length + ' questions, not 16 - the archive ran short on ' +
        data.short.join(', ') + '.']
      : []).concat(data.notes || []);
    if (warnings.length) {
      $('roundWarn').innerHTML = warnings.map(esc).join('<br>');
      $('roundWarn').classList.remove('d-none');
    }
    const levelName = document.querySelector('label[for="level-' + data.level + '"]');
    const levelText = (levelName ? levelName.textContent : data.level) + (naqt ? ' · NAQT' : '');
    $('roundInfo').textContent = label + ' · ' + levelText;
    // a NAQT round's two tiebreakers do not count toward "Question 3 of 24"
    MATCH = { roundId: data.roundId, label, level: levelText, teams: teamNames, total: naqt ? NAQT_FORMAT.regulationTossupCount : null };
    $('roundBar').classList.remove('d-none');
    $('nextRound').onclick = () => {
      if (!naqt && !SAVED && !window.confirm('This game has not been saved to team stats. Start the next round anyway?')) return;
      try { sessionStorage.setItem(NEXT_KEY, JSON.stringify(setup)); } catch (e) {}
      window.location.reload();
    };
    setupTimer(data.round, teamNames);
    ReactDOM.createRoot($('modaq')).render(
      React.createElement(Modaq.ModaqControl, {
        packet,
        players,
        gameFormat: naqt ? NAQT_FORMAT : KSHSAA_FORMAT,
        persistState: false,
        storeName: 'kshsaa-modaq',
        customExport: naqt ? undefined : {
          label: 'Save to team stats',
          type: 'QBJ',
          // MODAQ shows the returned { isError, status }: an error's status in
          // its dialog, and a fixed "Export succeeded." otherwise. It calls this
          // from its menu and again from the prompt after the last question,
          // which is how a game used to get saved twice: only the first save
          // counts, and the server refuses a repeat as well.
          onExport: async (match) => {
            if (SAVED) {
              return { isError: true, status: 'this game is already saved to team stats, and a game only saves once. Fix mistakes on the Stats page' };
            }
            if (SAVING) return { isError: true, status: 'this game is still being saved' };
            const post = () => fetch('/kshsaa-stats/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                game: match,
                label,
                level: data.level,
                holdBack: setup.holdBack,
                roundId: data.roundId,
                questionIds: data.round.map(q => q.id),
                categories,
                wordCounts,
                charCounts,
                notes: NOTES
              })
            });
            SAVING = true;
            try {
              let r = await post();
              if (r.status === 401) {
                const pw = window.prompt('Reader password (to save this game):');
                if (!pw) {
                  return { isError: true, status: 'not saved. Click "Save to team stats" again when ready' };
                }
                const login = await fetch('/kshsaa-stats/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: pw })
                });
                if (!login.ok) {
                  return { isError: true, status: 'wrong password, so nothing was saved. Click save again to retry' };
                }
                r = await post();
              }
              const d = await r.json().catch(() => ({}));
              if (r.ok || r.status === 409) {
                SAVED = true;
                $('saveState').textContent = 'saved to stats';
                $('saveState').className = 'badge text-bg-success';
                publishScreen();
              }
              if (r.ok) {
                return { isError: false, status: 'Saved to team stats (' + (d.buzzes || 0) + ' buzzes recorded).' };
              }
              if (r.status === 409) return { isError: true, status: d.error };
              return { isError: true, status: 'could not save: ' + (d.error || r.status) };
            } catch (e) {
              return { isError: true, status: 'could not save: ' + e.message };
            } finally {
              SAVING = false;
            }
          }
        }
      })
    );
  } catch (e) {
    $('status').innerHTML = '<span class="text-danger">error: ' + esc(e.message) +
      (naqt ? '' : ' &mdash; <a href="/kshsaa-round">use the download page instead</a>') + '</span>';
    $('go').disabled = false;
  }
};
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
