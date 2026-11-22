// Tournament stats, typed in afterwards from the paper scoresheet: KSHSAA does
// not allow phones or computers during a competition round, so nothing can be
// recorded live. The printed scoresheet and the entry grid share one layout --
// a row per question, our players written as numbers -- so copying one into
// the other is a click or a keystroke per question.
//
// Games are stored with the practice games (kshsaa_games, kind: 'tournament');
// server/kshsaa/game-stats.js describes how the other school's buzzes are kept.
// Stats password only.
//
// INSTALL: in app.js, below cookieSession like the stats route:
//   import kshsaaTournamentsRouter from './routes/kshsaa-tournaments.js';
//   app.use('/kshsaa-tournaments', kshsaaTournamentsRouter);

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { qbreader } from '../database/databases.js';
import { CATEGORY_BY_QUESTION, LEVELS } from './kshsaa-round.js';
import { getSquads, nameCanonicalizer, requireAuth } from './kshsaa-stats.js';
import { kindOf, monthKeyOf, monthLabel, opponentModeOf, resultOf, seasonStartKey } from '../server/kshsaa/game-stats.js';
import { tournamentOf } from '../server/kshsaa/room-model.js';
import { MAX_QUESTIONS, SLOTS, STAGES, SUBJECT_ORDERS, SUBJECTS, tournamentGame, withSubjects } from '../server/kshsaa/tournament-game.js';
import { NAME_AUTOCOMPLETE } from '../server/kshsaa/name-autocomplete.js';
import { KSHSAA_HEAD, kshsaaNav } from '../server/kshsaa/nav.js';

const router = Router();
const games = qbreader.collection('kshsaa_games');
const roster = qbreader.collection('kshsaa_roster');

const ours = g => (g.teams || []).find(t => !t.opponent) || { name: '', players: [], score: 0 };
// a chair game has no other team, and an unrecorded sheet may not have their score
const theirs = g => (g.teams || []).find(t => t.opponent) || { name: g.opponent || '', score: null };

// the other rounds of a game's tournament, which share its subjects: the same
// name at the same level in the same school year, as the room model groups them
async function otherRounds (game, id) {
  const key = tournamentOf(game).key;
  return (await games.find({ kind: 'tournament' }).toArray())
    .filter(g => String(g._id) !== String(id) && tournamentOf(g).key === key);
}

router.get('/data', requireAuth, async (req, res) => {
  try {
    const [list, rosterList, squads] = await Promise.all([
      games.find({ kind: 'tournament' }).sort({ playedAt: 1 }).toArray(),
      roster.find({}).toArray(),
      getSquads()
    ]);
    res.json({
      squads,
      seasonStart: seasonStartKey(),
      seasonLabel: monthLabel(seasonStartKey()),
      levels: Object.keys(LEVELS).map(key => ({ key, label: LEVELS[key].label })),
      // a question's subject, Other being a sheet's Misc, and the orders
      // some tournaments read their rounds in
      subjects: SUBJECTS,
      order: CATEGORY_BY_QUESTION,
      orders: SUBJECT_ORDERS,
      // playoff rounds, in bracket order
      stages: Object.entries(STAGES).map(([key, label]) => ({ key, label })),
      roster: rosterList.filter(r => !r.coach).map(r => ({ name: r.name, squad: r.squad || null })),
      games: list.map(g => ({
        id: String(g._id),
        tournament: g.tournament,
        // which tournament it was (room-model.js), and its subjects, so the
        // next round typed in starts with them
        event: tournamentOf(g).key,
        categories: g.categories || null,
        round: g.round || '',
        stage: g.stage || null,
        opponent: theirs(g).name,
        team: ours(g).name,
        level: g.level || null,
        playedAt: g.playedAt,
        month: monthKeyOf(g.playedAt),
        score: ours(g).score,
        opponentScore: theirs(g).score ?? null,
        // how the other side was kept, and how the game came out (game-stats.js)
        mode: opponentModeOf(g),
        result: resultOf(g),
        notes: (g.notes || []).length,
        players: ours(g).players.map(name => {
          const mine = (g.buzzes || []).filter(b => b.player === name);
          return {
            name,
            heard: g.heardByPlayer?.[ours(g).name + '|' + name] ?? g.tossupsRead,
            correct: mine.filter(b => b.value > 0).length,
            negs: mine.filter(b => b.value < 0).length,
            points: mine.reduce((s, b) => s + b.value, 0)
          };
        })
      }))
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// what the page says once a game is saved, with the tournament's other rounds
// whose subjects are not the same, which the page offers to change to match
const saved = async (doc, id) => ({
  label: doc.label,
  score: ours(doc).score,
  opponentScore: theirs(doc).score ?? null,
  mode: doc.opponentMode,
  result: resultOf(doc),
  differing: (await otherRounds(doc, id)).filter(g => withSubjects(g, doc.categories)).map(g => ({ id: String(g._id), label: g.label }))
});

router.post('/save', requireAuth, async (req, res) => {
  try {
    const doc = tournamentGame(req.body || {}, await nameCanonicalizer());
    const id = req.body?.id ? new ObjectId(String(req.body.id)) : null;
    if (id) {
      const old = await games.findOne({ _id: id });
      if (!old || kindOf(old) !== 'tournament') return res.status(404).json({ error: 'that tournament game is gone' });
      await games.updateOne({ _id: id }, { $set: { ...doc, editedAt: new Date() } });
      return res.json({ ok: true, id: String(id), ...await saved(doc, id) });
    }
    // the same sheet typed in twice
    const same = (await games.find({ kind: 'tournament', tournament: doc.tournament }).toArray()).find(g =>
      monthKeyOf(g.playedAt) === monthKeyOf(doc.playedAt) && new Date(g.playedAt).getUTCDate() === doc.playedAt.getUTCDate() &&
      (g.round || '') === doc.round && (g.stage || null) === doc.stage &&
      (theirs(g).name || '').toLowerCase() === (doc.opponent || '').toLowerCase() &&
      ours(g).name.toLowerCase() === doc.teams[0].name.toLowerCase());
    if (same) return res.status(409).json({ error: 'that game is already entered - find it in the list below to change it' });
    const r = await games.insertOne({ ...doc, enteredAt: new Date() });
    res.json({ ok: true, id: String(r.insertedId), ...await saved(doc, r.insertedId) });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// The tournament's other rounds changed to one round's subjects, after they
// were changed on that round: a tournament reads every round the same way.
// Their buzzes keep their points and follow their questions' new subjects.
router.post('/subjects', requireAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(String(req.body?.id || ''))) return res.status(400).json({ error: 'which game?' });
    const id = new ObjectId(String(req.body.id));
    const game = await games.findOne({ _id: id });
    if (!game || kindOf(game) !== 'tournament') return res.status(404).json({ error: 'that tournament game is gone' });
    let changed = 0;
    for (const g of await otherRounds(game, id)) {
      const next = withSubjects(g, game.categories || []);
      if (!next) continue;
      await games.updateOne({ _id: g._id }, { $set: { ...next, editedAt: new Date() } });
      changed++;
    }
    res.json({ ok: true, changed });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---------- page ----------
// No backslashes in the page below: it is a template literal (see AGENTS.md).

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tournaments</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
${KSHSAA_HEAD}
<style>
 body{background:#f6f7f9;color:#1f2733;font-size:15px}
 h1{font-size:1.35rem;font-weight:600}
 h2{font-size:1.05rem;font-weight:600;color:#33415c;margin:2rem 0 .65rem}
 .card{border:1px solid #e4e8ee;border-radius:.5rem;box-shadow:none}
 .note{font-size:.83rem;color:#6b7280;margin:.5rem 0 0}
 table{font-size:.9rem;margin-bottom:0}
 thead th{font-weight:600;color:#4b5563;white-space:nowrap}
 th,td{padding:.35rem .5rem !important;vertical-align:middle}
 .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 .form-label{font-size:.85rem;font-weight:600;color:#4b5563;margin-bottom:.2rem}
 .slot{display:inline-flex;align-items:center;justify-content:center;width:1.7rem;font-weight:700;color:#4a5b7d}
 /* the entry grid: one row per question, a button per player */
 #grid tr.on td{background:#eef4ff}
 #grid tr:focus{outline:none}
 .pk{min-width:2rem;padding:.1rem .35rem;margin:0 .15rem .1rem 0;border:1px solid #c9d2e3;border-radius:.3rem;
   background:#fff;font-size:.82rem;font-weight:600;color:#33415c}
 .pk:disabled{opacity:.3}
 .pk.yes{background:#2d8c5a;border-color:#2d8c5a;color:#fff}
 .pk.neg{background:#c9573d;border-color:#c9573d;color:#fff}
 .them.yes{background:#5b6475;border-color:#5b6475;color:#fff}
 .them.neg{background:#c9573d;border-color:#c9573d;color:#fff}
 .qcat{max-width:11rem}
 .keys kbd{background:#eef1f7;color:#33415c;border:1px solid #d9e0ec;font-size:.75rem;padding:.05rem .3rem}
 .res-win{color:#1d6b40;font-weight:600}
 .res-loss{color:#6b7280}
 .res-tie{color:#8a6100;font-weight:600}
 .res-unknown{color:#6b7280;font-style:italic}
 /* printed scoresheets: two games to a page, nothing else prints */
 #printSheet{display:none}
 @media print{
   @page{size:letter;margin:.4in}
   body.printing > *:not(#printSheet){display:none !important}
   body.printing #printSheet{display:block}
   body.printing{background:#fff}
   .sheet{height:4.95in;overflow:hidden;font-size:8.5pt;color:#000;font-family:Arial,Helvetica,sans-serif}
   .sheet + .sheet{border-top:1px dashed #999;padding-top:.12in}
   .sheet.pagebreak{break-after:page}
   .sh-title{font-size:11pt;font-weight:700;margin-bottom:3pt}
   .sh-line{display:flex;gap:10pt;flex-wrap:wrap;margin-bottom:3pt}
   .sh-line span{white-space:nowrap}
   .blank{display:inline-block;border-bottom:1px solid #000;min-width:1.1in;height:10pt;vertical-align:bottom}
   .blank.short{min-width:.45in}
   /* the screen rule table{font-size:.9rem} would make every row too tall to fit 16 */
   .sheet table{width:100%;border-collapse:collapse;margin-top:3pt;font-size:8pt;line-height:1.15}
   .sheet th,.sheet td{border:1px solid #555;padding:1pt 4pt !important;height:15pt}
   .sheet th{font-size:7.5pt;background:#eee;height:auto}
   .sheet td.q{width:.3in;text-align:center;font-weight:700;font-size:9pt}
   .sheet td.subj{width:1.15in;font-size:7.5pt}
 }
</style>
</head><body>

${kshsaaNav('/kshsaa-stats', 1100)}

<div class="container pb-5" style="max-width:1100px">
  <h1 class="h4 mb-0">Stats</h1>

  <div id="login" class="card mt-3 d-none" style="max-width:420px"><div class="card-body">
    <label class="form-label" for="pw">Stats password</label>
    <input type="password" class="form-control mb-2" id="pw">
    <button class="btn btn-primary" id="loginBtn">Enter</button>
    <div class="small text-danger mt-2" id="loginErr"></div>
  </div></div>

  <div id="app" class="d-none">
    <ul class="nav nav-tabs mt-3">
      <li class="nav-item"><a class="nav-link" href="/kshsaa-stats">Overview</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-insights">Insights</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-stats#roster">Roster</a></li>
      <li class="nav-item"><a class="nav-link active" href="/kshsaa-tournaments">Tournaments</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-questions">Question bank</a></li>
    </ul>

    <h2>Scoresheets to print</h2>
    <div class="card"><div class="card-body">
      <p class="note mt-0 mb-2">Two games to a page, laid out like the entry form below: write the player's number
      on each question. Fill in the names from a squad, or leave them blank to write in.</p>
      <div class="d-flex flex-wrap gap-2 align-items-end">
        <div><label class="form-label" for="psSquad">Names</label>
          <select class="form-select form-select-sm" id="psSquad"></select></div>
        <div><label class="form-label" for="psCount">Games</label>
          <select class="form-select form-select-sm" id="psCount">
            <option>2</option><option>4</option><option selected>6</option><option>8</option><option>10</option></select></div>
        <button type="button" class="btn btn-sm btn-outline-primary" id="psPrint">Print scoresheets</button>
      </div>
    </div></div>

    <h2 id="formTitle">Enter a game</h2>
    <div class="card"><div class="card-body">
      <div class="row g-2">
        <div class="col-md-3"><label class="form-label" for="fTourney">Tournament</label>
          <input class="form-control form-control-sm" id="fTourney" list="tourneyList" placeholder="Hays Invitational">
          <datalist id="tourneyList"></datalist></div>
        <div class="col-md-2"><label class="form-label" for="fDate">Date</label>
          <input class="form-control form-control-sm" type="date" id="fDate"></div>
        <div class="col-md-2"><label class="form-label" for="fLevel">Level</label>
          <select class="form-select form-select-sm" id="fLevel"></select></div>
        <div class="col-md-1"><label class="form-label" for="fRound">Round</label>
          <input class="form-control form-control-sm" id="fRound" placeholder="1"></div>
        <div class="col-md-2"><label class="form-label" for="fStage">Stage</label>
          <select class="form-select form-select-sm" id="fStage"></select></div>
        <div class="col-md-2"><label class="form-label" for="fTeam">Our team</label>
          <input class="form-control form-control-sm" id="fTeam" list="squadList" placeholder="Varsity Blue">
          <datalist id="squadList"></datalist></div>
        <div class="col-md-4"><label class="form-label" for="fOpp">Opponent</label>
          <input class="form-control form-control-sm" id="fOpp" placeholder="Hays"></div>
        <div class="col-md-3"><label class="form-label" for="fMode">Their points</label>
          <select class="form-select form-select-sm" id="fMode">
            <option value="recorded">On the sheet, by question</option>
            <option value="unrecorded">Not on the sheet</option>
            <option value="chair">None: we played a chair</option>
          </select></div>
        <div class="col-md-2 d-none" id="finalBox"><label class="form-label" for="fFinal">Their final score</label>
          <input class="form-control form-control-sm" id="fFinal" inputmode="numeric" placeholder="if written"></div>
        <div class="col-md-3 d-none" id="resultBox"><label class="form-label" for="fResult">Who won</label>
          <select class="form-select form-select-sm" id="fResult">
            <option value="">Not written down</option><option value="win">We won</option>
            <option value="loss">We lost</option><option value="tie">Tied</option></select></div>
      </div>
      <p class="note d-none" id="modeNote"></p>

      <div class="form-label mt-3">Players, by their number on the sheet</div>
      <div id="slots" class="row g-1"></div>
      <p class="note">A sub who came in partway: set the questions they were in for, and the player they replaced's.</p>

      <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mt-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="form-label mb-0">Questions</div>
          <select class="form-select form-select-sm w-auto" id="fOrder" aria-label="The round's subjects"
            title="The order this tournament reads its subjects in. Any one question's subject can also be changed in its row."></select>
          <span class="note mt-0" id="orderNote"></span>
        </div>
        <div class="small text-secondary keys">Click a row, then type: <kbd>1</kbd>&ndash;<kbd>6</kbd> our player got it,
          <kbd>-</kbd> then a number for our &minus;5, <kbd>o</kbd> they got it, <kbd>x</kbd> their &minus;5,
          <kbd>Enter</kbd> nobody, <kbd>Delete</kbd> clears.</div>
      </div>
      <div class="table-responsive"><table class="table table-sm align-middle mb-0">
        <thead><tr><th style="width:2.5rem">Q</th><th>Subject</th><th>We got it</th><th>We lost 5</th><th>They</th>
          <th class="num">Score</th></tr></thead>
        <tbody id="grid"></tbody>
      </table></div>
      <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="addQ">+ Add a question</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="dropQ">Remove the last question</button>
        <span class="note mt-0" id="qCount"></span>
      </div>

      <div class="form-label mt-3">Notes</div>
      <div id="notes"></div>
      <button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="addNote">+ Add a note</button>

      <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
        <button type="button" class="btn btn-primary" id="save">Save game</button>
        <button type="button" class="btn btn-link d-none" id="cancelEdit">Stop editing</button>
        <span class="fw-semibold" id="total"></span>
        <span class="small" id="saveMsg"></span>
      </div>
    </div></div>

    <h2>This season</h2>
    <div class="d-flex flex-wrap gap-2 align-items-end mb-2">
      <select class="form-select form-select-sm w-auto" id="seasonWhen"></select>
      <select class="form-select form-select-sm w-auto" id="seasonLevel"></select>
    </div>
    <div id="season"></div>

    <h2>Tournament games</h2>
    <div id="games"></div>
  </div>
</div>

<div id="printSheet"></div>

${NAME_AUTOCOMPLETE}
<script>
var $ = function (id) { return document.getElementById(id); };
var esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
};
var SLOTS = ${SLOTS};
var MAX_QUESTIONS = ${MAX_QUESTIONS};
var DATA = null;
// how the other team's side of the sheet was kept: 'recorded' by question,
// 'unrecorded', or 'chair' (no other team), and the last one that was not a
// chair, which the next game goes back to
var MODE = 'recorded';
var LAST_MODE = 'recorded';
var RESULT_WORDS = { win: 'we won', loss: 'we lost', tie: 'tied' };
var KNOWN_NAMES = [];
// the form: who is in which slot, and what happened on each question
var PLAYERS = [];
var QUESTIONS = [];
var NOTES = [];
var EDITING = null;
var CURRENT = 0;
var NEG_NEXT = false;
// The subjects of a round's 16 questions, which questions past 16 start over:
// the regular order, one of DATA.orders, or what the tournament's other rounds
// used. TOUCHED: changed by hand since the form was last set up, which the
// tournament's own subjects then leave alone, and which Save then offers to
// copy to the tournament's other rounds.
var BASE = [];
var TOUCHED = false;
var SUBJECT_WORDS = { Other: 'Other (misc)' };
var SAME_AS_OTHERS = "The same subjects as this tournament's other rounds.";

function postJson (url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
}

// ---------- sign-in ----------

function show (authed) {
  $('login').classList.toggle('d-none', authed);
  $('app').classList.toggle('d-none', !authed);
  if (authed) {
    load();
    fetch('/kshsaa-stats/names').then(function (r) { return r.json(); }).then(function (d) { KNOWN_NAMES = d.names || []; });
  }
}
fetch('/kshsaa-stats/me').then(function (r) { return r.json(); }).then(function (d) { show(d.authed && d.role === 'stats'); });
$('loginBtn').onclick = function () {
  postJson('/kshsaa-stats/login', { password: $('pw').value }).then(function (res) {
    if (!res.ok) { $('loginErr').textContent = res.d.error || 'failed'; return; }
    if (res.d.role !== 'stats') { $('loginErr').textContent = 'That is the reader password. Stats need the stats password.'; return; }
    show(true);
  });
};
$('pw').onkeydown = function (e) { if (e.key === 'Enter') $('loginBtn').click(); };

function load (then) {
  fetch('/kshsaa-tournaments/data').then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { $('games').innerHTML = '<p class="text-danger">' + esc(d.error) + '</p>'; return; }
    var first = !DATA;
    DATA = d;
    if (first) setUp();
    renderSeason();
    renderGames();
    if (then) then();
  });
}

function setUp () {
  $('psSquad').innerHTML = '<option value="">Blank, to write in</option>' +
    DATA.squads.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
  $('fLevel').innerHTML = DATA.levels.map(function (l) { return '<option value="' + l.key + '">' + esc(l.label) + '</option>'; }).join('');
  $('fStage').innerHTML = '<option value="">Regular round</option>' +
    DATA.stages.map(function (s) { return '<option value="' + s.key + '">' + esc(s.label) + '</option>'; }).join('');
  $('fOrder').innerHTML = DATA.orders.map(function (o) { return '<option value="' + o.key + '">' + esc(o.label) + '</option>'; }).join('') +
    '<option value="custom" hidden>Changed by hand</option>';
  $('squadList').innerHTML = DATA.squads.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
  $('seasonWhen').innerHTML = '<option value="season">This school year (since ' + esc(DATA.seasonLabel) + ')</option><option value="all">All time</option>';
  $('seasonLevel').innerHTML = '<option value="all">All levels</option>' +
    DATA.levels.map(function (l) { return '<option value="' + l.key + '">' + esc(l.label) + '</option>'; }).join('');
  $('seasonWhen').onchange = renderSeason;
  $('seasonLevel').onchange = renderSeason;
  $('fDate').value = new Date().toISOString().slice(0, 10);
  resetForm(false);
  var hash = location.hash.indexOf('#game=') === 0 ? location.hash.slice(6) : '';
  if (hash) editGame(hash);
}

// ---------- the form ----------

function resetForm (keepSetup) {
  if (!keepSetup) {
    PLAYERS = [];
    for (var i = 0; i < SLOTS; i++) PLAYERS.push({ name: '', from: '', to: '' });
  }
  // the next round of a tournament starts with the last one's subjects, and
  // with its usual ones once the list reloads (followTournament)
  if (!keepSetup || !BASE.length) BASE = DATA.order.slice();
  QUESTIONS = BASE.map(function (c) { return { category: c, us: null, them: null }; });
  TOUCHED = false;
  $('orderNote').textContent = sameOrder(BASE, DATA.order) ? '' : SAME_AS_OTHERS;
  NOTES = [];
  CURRENT = 0;
  NEG_NEXT = false;
  $('fFinal').value = '';
  $('fResult').value = '';
  setMode(keepSetup ? LAST_MODE : 'recorded', true);
  renderSlots();
  renderGrid();
  renderNotes();
}

// the other team's side of the sheet: their buttons on every question, their
// final score and who won, or nothing at all for a chair
function setMode (mode, quiet) {
  MODE = mode;
  if (mode !== 'chair') LAST_MODE = mode;
  $('fMode').value = mode;
  $('fOpp').disabled = mode === 'chair';
  $('fOpp').placeholder = mode === 'chair' ? 'no opponent' : 'Hays';
  $('finalBox').classList.toggle('d-none', mode !== 'unrecorded');
  $('resultBox').classList.toggle('d-none', mode !== 'unrecorded');
  $('modeNote').classList.toggle('d-none', mode === 'recorded');
  $('modeNote').textContent = mode === 'chair'
    ? 'A chair: nobody to play, so the game counts in the stats but is neither a win nor a loss.'
    : mode === 'unrecorded'
      ? 'Type in our side only. Add their final score if the sheet has it, or else who won, if anyone knows.'
      : '';
  if (!quiet) renderGrid();
}
$('fMode').onchange = function () { setMode(this.value); };
$('fFinal').oninput = function () { renderScores(); };
$('fResult').onchange = function () { renderScores(); };

// a question past the last one: the round's own subjects, starting over
function categoryFor (n) { return BASE[(n - 1) % BASE.length]; }

// ---------- subjects ----------

function sameOrder (a, b) { return a.join('|') === b.join('|'); }

// the tournament the form is on, named the way the server's tournamentOf
// names it: the same name at the same level in the same school year
function formKey () {
  var name = $('fTourney').value.split(' ').filter(Boolean).join(' ').toLowerCase();
  var d = $('fDate').value;
  var y = Number(d.slice(0, 4));
  var m = Number(d.slice(5, 7));
  var season = (m >= 8 ? y : y - 1) + '-' + String((m >= 8 ? y + 1 : y) % 100).padStart(2, '0');
  return [name, $('fLevel').value || 'untagged', season].join('|');
}

// the subjects most of a tournament's saved rounds used, or null for a
// tournament not entered yet; a round that ended early cannot say
function knownOrder (key) {
  var count = {};
  var best = null;
  DATA.games.forEach(function (g) {
    if (g.event !== key || !g.categories || g.categories.length < DATA.order.length) return;
    var k = g.categories.slice(0, DATA.order.length).join('|');
    count[k] = (count[k] || 0) + 1;
    if (!best || count[k] >= count[best]) best = k;
  });
  return best ? best.split('|') : null;
}

// which of the orders the grid's subjects follow, or "changed by hand"
function renderOrder () {
  var match = DATA.orders.filter(function (o) {
    return QUESTIONS.every(function (q, i) { return q.category === o.order[i % o.order.length]; });
  })[0];
  $('fOrder').value = match ? match.key : 'custom';
}

// every question's subject from one order, keeping what happened on them
function useBase (order, note) {
  BASE = order.slice();
  QUESTIONS.forEach(function (q, i) { q.category = BASE[i % BASE.length]; });
  $('orderNote').textContent = note || '';
  renderGrid();
}

$('fOrder').onchange = function () {
  var o = DATA.orders.filter(function (x) { return x.key === $('fOrder').value; })[0];
  if (!o) return;
  TOUCHED = true;
  useBase(o.order, '');
};

// A tournament's next round starts with the subjects its other rounds used,
// once its name, level, and date say which one it is, unless this round's
// were already changed by hand. Not on change: typing only redraws the grid.
function followTournament () {
  if (EDITING || TOUCHED || !DATA) return;
  var known = knownOrder(formKey());
  var order = known || DATA.order;
  if (sameOrder(order, BASE)) return;
  useBase(order, sameOrder(order, DATA.order) ? '' : SAME_AS_OTHERS);
}
$('fTourney').addEventListener('input', followTournament);
$('fLevel').addEventListener('change', followTournament);
$('fDate').addEventListener('change', followTournament);

// special rounds run past 16 questions, and a round can end early
$('addQ').onclick = function () {
  if (QUESTIONS.length >= MAX_QUESTIONS) return;
  QUESTIONS.push({ category: categoryFor(QUESTIONS.length + 1), us: null, them: null });
  renderGrid();
  focusRow(QUESTIONS.length - 1);
};
$('dropQ').onclick = function () {
  if (QUESTIONS.length <= 1) return;
  var last = QUESTIONS[QUESTIONS.length - 1];
  if ((last.us || last.them != null) && !confirm('Question ' + QUESTIONS.length + ' has points on it. Remove it anyway?')) return;
  QUESTIONS.pop();
  renderGrid();
  focusRow(Math.min(CURRENT, QUESTIONS.length - 1));
};

function filledSlots () {
  var out = [];
  PLAYERS.forEach(function (p, i) { if (p.name.trim()) out.push(i + 1); });
  return out;
}

function inFor (k, n) {
  var p = PLAYERS[k - 1];
  if (!p || !p.name.trim()) return false;
  var from = p.from === '' ? 1 : Number(p.from);
  var to = p.to === '' ? QUESTIONS.length : Number(p.to);
  return n >= from && n <= to;
}

function renderSlots () {
  $('slots').innerHTML = PLAYERS.map(function (p, i) {
    return '<div class="col-md-6 col-lg-4"><div class="input-group input-group-sm">' +
      '<span class="input-group-text slot">' + (i + 1) + '</span>' +
      '<input class="form-control sname" data-k="' + (i + 1) + '" value="' + esc(p.name) + '" placeholder="' + (i < 5 ? 'starter' : 'sub') + '">' +
      '<span class="input-group-text">Q</span>' +
      '<input class="form-control sfrom" style="max-width:3.2rem" data-k="' + (i + 1) + '" value="' + esc(p.from) + '" placeholder="1" inputmode="numeric">' +
      '<span class="input-group-text">to</span>' +
      '<input class="form-control sto" style="max-width:3.2rem" data-k="' + (i + 1) + '" value="' + esc(p.to) + '" placeholder="' + QUESTIONS.length + '" inputmode="numeric">' +
      '</div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.sname'), function (input) {
    attachNameAutocomplete(input, {
      names: function () { return KNOWN_NAMES; },
      taken: function (self) {
        return Array.prototype.filter.call(document.querySelectorAll('.sname'), function (x) { return x !== self; })
          .map(function (x) { return x.value; });
      },
      onPick: function (self) {
        PLAYERS[Number(self.getAttribute('data-k')) - 1].name = self.value.trim();
        var next = document.querySelector('.sname[data-k="' + (Number(self.getAttribute('data-k')) + 1) + '"]');
        if (next) next.focus();
        renderGrid(); renderNotes();
      }
    });
  });
}

// The grid follows the lineup as it is typed. Redrawing it on "change"
// instead would happen as a name box loses focus -- that is, in the middle of
// the click on a grid row, which then lands on a row that no longer exists.
$('slots').addEventListener('input', function (e) {
  var el = e.target;
  var p = PLAYERS[Number(el.getAttribute('data-k')) - 1];
  if (!p) return;
  if (el.classList.contains('sname')) p.name = el.value.trim();
  if (el.classList.contains('sfrom')) p.from = el.value.trim();
  if (el.classList.contains('sto')) p.to = el.value.trim();
  renderGrid();
  renderNotes();
});

function chip (n, k, value) {
  var q = QUESTIONS[n - 1];
  var on = q.us && q.us.k === k && q.us.value === value;
  var name = PLAYERS[k - 1].name;
  return '<button type="button" class="pk' + (on ? (value > 0 ? ' yes' : ' neg') : '') + '" data-n="' + n + '" data-k="' + k +
    '" data-v="' + value + '" title="' + esc(name) + '"' + (inFor(k, n) ? '' : ' disabled') + '>' + k + '</button>';
}

function rowHtml (n) {
  var q = QUESTIONS[n - 1];
  var slots = filledSlots();
  var cats = DATA.subjects.map(function (c) {
    return '<option value="' + esc(c) + '"' + (c === q.category ? ' selected' : '') + '>' + esc(SUBJECT_WORDS[c] || c) + '</option>';
  }).join('');
  return '<td class="fw-semibold">' + n + '</td>' +
    '<td><select class="form-select form-select-sm qcat" data-n="' + n + '">' + cats + '</select></td>' +
    '<td>' + (slots.length ? slots.map(function (k) { return chip(n, k, 10); }).join('') : '<span class="note">add players</span>') + '</td>' +
    '<td>' + slots.map(function (k) { return chip(n, k, -5); }).join('') + '</td>' +
    '<td>' + (MODE === 'recorded'
      ? '<button type="button" class="pk them' + (q.them === 10 ? ' yes' : '') + '" data-n="' + n + '" data-them="10" title="They got it">+10</button>' +
        '<button type="button" class="pk them' + (q.them === -5 ? ' neg' : '') + '" data-n="' + n + '" data-them="-5" title="They lost 5">&minus;5</button>'
      : '<span class="note mt-0">' + (MODE === 'chair' ? 'no opponent' : 'not recorded') + '</span>') + '</td>' +
    '<td class="num score"></td>';
}

function renderGrid () {
  $('grid').innerHTML = QUESTIONS.map(function (q, i) {
    return '<tr tabindex="0" data-row="' + (i + 1) + '"' + (i === CURRENT ? ' class="on"' : '') + '>' + rowHtml(i + 1) + '</tr>';
  }).join('');
  var n = QUESTIONS.length;
  $('qCount').textContent = n + ' question' + (n === 1 ? '' : 's') + (n === DATA.order.length ? '' : ' (a regular round has ' + DATA.order.length + ')');
  $('addQ').disabled = n >= MAX_QUESTIONS;
  $('dropQ').disabled = n <= 1;
  Array.prototype.forEach.call(document.querySelectorAll('.sto'), function (el) { el.placeholder = n; });
  renderOrder();
  renderScores();
}

function renderRow (n) {
  var tr = document.querySelector('#grid tr[data-row="' + n + '"]');
  if (tr) tr.innerHTML = rowHtml(n);
  renderScores();
}

function renderScores () {
  var us = 0;
  var them = 0;
  var both = MODE === 'recorded';
  QUESTIONS.forEach(function (q, i) {
    if (q.us) us += q.us.value;
    if (both && q.them != null) them += q.them;
    var cell = document.querySelector('#grid tr[data-row="' + (i + 1) + '"] .score');
    if (cell) cell.textContent = both ? us + ' – ' + them : String(us);
  });
  var name = $('fTeam').value.trim() || 'Us';
  var opp = $('fOpp').value.trim() || 'them';
  var final = $('fFinal').value.trim();
  var known = final !== '' && !isNaN(Number(final));
  // who won only matters when the sheet has no final score for them
  $('fResult').disabled = MODE === 'unrecorded' && known;
  if (MODE === 'chair') { $('total').textContent = name + ' ' + us + ', against a chair'; return; }
  if (both) { $('total').textContent = name + ' ' + us + ', ' + opp + ' ' + them; return; }
  var result = known ? (us > Number(final) ? 'win' : us < Number(final) ? 'loss' : 'tie') : $('fResult').value;
  $('total').textContent = name + ' ' + us + ', ' + opp + ' ' + (known ? final : '?') + ' (' + (RESULT_WORDS[result] || 'who won not written down') + ')';
}
$('fTeam').oninput = renderScores;
$('fOpp').oninput = renderScores;

// one team gets a question right, and only the first to interrupt loses 5
function setUs (n, k, value) {
  var q = QUESTIONS[n - 1];
  q.us = q.us && q.us.k === k && q.us.value === value ? null : { k: k, value: value };
  if (q.us && q.them === value) q.them = null;
  renderRow(n);
}
function setThem (n, value) {
  if (MODE !== 'recorded') return;
  var q = QUESTIONS[n - 1];
  q.them = q.them === value ? null : value;
  if (q.us && q.them === q.us.value) q.us = null;
  renderRow(n);
}

function focusRow (i) {
  CURRENT = Math.max(0, Math.min(QUESTIONS.length - 1, i));
  NEG_NEXT = false;
  Array.prototype.forEach.call(document.querySelectorAll('#grid tr'), function (tr, j) { tr.classList.toggle('on', j === CURRENT); });
  var tr = document.querySelector('#grid tr[data-row="' + (CURRENT + 1) + '"]');
  if (tr) tr.focus();
}

$('grid').addEventListener('click', function (e) {
  var tr = e.target.closest('tr');
  if (!tr) return;
  var b = e.target.closest('button');
  if (!e.target.closest('select')) focusRow(Number(tr.getAttribute('data-row')) - 1);
  if (!b) return;
  var n = Number(b.getAttribute('data-n'));
  if (b.hasAttribute('data-them')) setThem(n, Number(b.getAttribute('data-them')));
  else setUs(n, Number(b.getAttribute('data-k')), Number(b.getAttribute('data-v')));
  focusRow(n - 1);
});
$('grid').addEventListener('change', function (e) {
  if (!e.target.classList.contains('qcat')) return;
  var n = Number(e.target.getAttribute('data-n'));
  QUESTIONS[n - 1].category = e.target.value;
  // part of the round's own order, which a question added past its end follows
  if (n <= BASE.length) BASE[n - 1] = e.target.value;
  TOUCHED = true;
  $('orderNote').textContent = '';
  renderOrder();
});

// typing a sheet in: a key per question, and the row moves on once someone got it
$('grid').addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  var n = CURRENT + 1;
  var q = QUESTIONS[CURRENT];
  // a key with no name would match '123456789' at the start, as player 1
  var digit = e.key.length === 1 ? '123456789'.indexOf(e.key) + 1 : 0;
  if (digit && digit <= SLOTS) {
    if (!inFor(digit, n)) { $('saveMsg').textContent = 'no player ' + digit + ' in for question ' + n; return; }
    var value = NEG_NEXT ? -5 : 10;
    setUs(n, digit, value);
    NEG_NEXT = false;
    if (value > 0 && q.us) focusRow(CURRENT + 1); else focusRow(CURRENT);
  } else if (e.key === '-') {
    NEG_NEXT = true;
    $('saveMsg').textContent = 'our -5 on question ' + n + ': which player?';
    return;
  } else if (MODE !== 'recorded' && 'oOxX'.indexOf(e.key) !== -1) {
    e.preventDefault();
    $('saveMsg').textContent = 'their points are set to ' + (MODE === 'chair' ? 'none: a chair' : 'not on the sheet');
    return;
  } else if (e.key === 'o' || e.key === 'O') {
    setThem(n, 10);
    if (q.them === 10) focusRow(CURRENT + 1); else focusRow(CURRENT);
  } else if (e.key === 'x' || e.key === 'X') {
    setThem(n, -5);
    focusRow(CURRENT);
  } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
    focusRow(CURRENT + 1);
  } else if (e.key === 'ArrowUp') {
    focusRow(CURRENT - 1);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    q.us = null; q.them = null; renderRow(n); focusRow(CURRENT);
  } else {
    return;
  }
  e.preventDefault();
  $('saveMsg').textContent = '';
});

// ---------- notes ----------

function renderNotes () {
  var who = function (selected) {
    return '<option value="">no one in particular</option>' + PLAYERS.filter(function (p) { return p.name.trim(); }).map(function (p) {
      return '<option' + (p.name === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  };
  $('notes').innerHTML = NOTES.map(function (n, i) {
    return '<div class="input-group input-group-sm mb-1">' +
      '<span class="input-group-text">Q</span><input class="form-control nq" style="max-width:3.5rem" data-i="' + i + '" value="' + (n.questionNumber || '') + '">' +
      '<select class="form-select nwho" style="max-width:14rem" data-i="' + i + '">' + who(n.player) + '</select>' +
      '<input class="form-control ntext" data-i="' + i + '" maxlength="500" value="' + esc(n.text) + '" placeholder="What happened">' +
      '<button type="button" class="btn btn-outline-danger ndel" data-i="' + i + '" title="Remove">&times;</button></div>';
  }).join('');
}
$('addNote').onclick = function () {
  NOTES.push({ questionNumber: CURRENT + 1, player: null, text: '' });
  renderNotes();
  var boxes = document.querySelectorAll('#notes .ntext');
  boxes[boxes.length - 1].focus();
};
$('notes').addEventListener('input', function (e) {
  var n = NOTES[Number(e.target.getAttribute('data-i'))];
  if (!n) return;
  if (e.target.classList.contains('ntext')) n.text = e.target.value;
  if (e.target.classList.contains('nq')) n.questionNumber = e.target.value === '' ? null : Number(e.target.value);
});
$('notes').addEventListener('change', function (e) {
  if (e.target.classList.contains('nwho')) NOTES[Number(e.target.getAttribute('data-i'))].player = e.target.value || null;
});
$('notes').addEventListener('click', function (e) {
  if (!e.target.classList.contains('ndel')) return;
  NOTES.splice(Number(e.target.getAttribute('data-i')), 1);
  renderNotes();
});

// ---------- saving and editing ----------

$('save').onclick = function () {
  var body = {
    id: EDITING,
    tournament: $('fTourney').value,
    date: $('fDate').value,
    level: $('fLevel').value,
    round: $('fRound').value,
    stage: $('fStage').value,
    team: $('fTeam').value,
    opponent: MODE === 'chair' ? '' : $('fOpp').value,
    opponentMode: MODE,
    opponentScore: MODE === 'unrecorded' ? $('fFinal').value : '',
    result: MODE === 'unrecorded' ? $('fResult').value : '',
    players: PLAYERS.filter(function (p) { return p.name.trim(); }),
    questions: QUESTIONS.map(function (q) {
      return { category: q.category, us: q.us ? { player: PLAYERS[q.us.k - 1].name, value: q.us.value } : null, them: MODE === 'recorded' ? q.them : null };
    }),
    notes: NOTES
  };
  // subjects changed on this round may be how the whole tournament went
  var touched = TOUCHED;
  $('save').disabled = true;
  postJson('/kshsaa-tournaments/save', body).then(function (res) {
    $('save').disabled = false;
    if (!res.ok) { $('saveMsg').innerHTML = '<span class="text-danger">' + esc(res.d.error || 'could not save') + '</span>'; return; }
    $('saveMsg').innerHTML = '<span class="text-success">Saved ' + esc(res.d.label) + ' (' + scoreText(res.d) + ')</span>';
    var others = touched ? (res.d.differing || []) : [];
    var copy = others.length > 0 && confirm('These other rounds of ' + body.tournament.trim() + ' have different subjects: ' +
      others.map(function (g) { return g.label; }).join('; ') + '. Change them to match this one? Their points stay as they are.');
    if (EDITING) {
      stopEditing();
    } else {
      // the next game is usually the same tournament and lineup
      var round = Number($('fRound').value);
      $('fRound').value = round ? round + 1 : '';
      // win a quarterfinal or semifinal and the next game is the round after
      var next = { quarterfinal: 'semifinal', semifinal: 'final' }[body.stage];
      $('fStage').value = next && res.d.result === 'win' ? next : '';
      $('fOpp').value = '';
      resetForm(true);
      $('fOpp').focus();
    }
    // once the list is back, the next round takes the subjects most of the
    // tournament's rounds have, so a one-off round's do not carry on
    if (!copy) { load(followTournament); return; }
    postJson('/kshsaa-tournaments/subjects', { id: res.d.id }).then(function (r) {
      var n = r.d.changed;
      $('saveMsg').innerHTML += r.ok
        ? ' <span class="text-success">and changed the subjects on ' + n + ' other round' + (n === 1 ? '' : 's') + '</span>'
        : ' <span class="text-danger">but could not change the other rounds: ' + esc(r.d.error || 'try again') + '</span>';
      load(followTournament);
    });
  });
};

function stopEditing () {
  EDITING = null;
  $('formTitle').textContent = 'Enter a game';
  $('cancelEdit').classList.add('d-none');
  $('save').textContent = 'Save game';
  if (location.hash) history.replaceState(null, '', location.pathname);
  resetForm(true);
}
$('cancelEdit').onclick = function () { stopEditing(); $('saveMsg').textContent = ''; };

function editGame (id) {
  fetch('/kshsaa-stats/game/' + id).then(function (r) { return r.json(); }).then(function (g) {
    if (g.error || g.kind !== 'tournament') { $('saveMsg').textContent = g.error || 'not a tournament game'; return; }
    EDITING = id;
    var us = (g.teams || []).filter(function (t) { return !t.opponent; })[0] || { name: '', players: [] };
    var lineup = g.lineup || us.players.map(function (name) { return { name: name, from: 1, to: g.tossupsRead }; });
    PLAYERS = [];
    for (var i = 0; i < Math.max(SLOTS, lineup.length); i++) {
      var p = lineup[i];
      PLAYERS.push(p
        ? { name: p.name, from: p.from === 1 ? '' : String(p.from), to: p.to === g.tossupsRead ? '' : String(p.to) }
        : { name: '', from: '', to: '' });
    }
    var slotOf = function (name) {
      for (var j = 0; j < PLAYERS.length; j++) if (PLAYERS[j].name === name) return j + 1;
      return null;
    };
    var cats = g.categories || DATA.order;
    QUESTIONS = cats.map(function (c) { return { category: c, us: null, them: null }; });
    // a question added back follows this round's own subjects
    BASE = cats.slice(0, DATA.order.length).concat(DATA.order.slice(cats.length));
    TOUCHED = false;
    $('orderNote').textContent = '';
    (g.buzzes || []).forEach(function (b) {
      var q = QUESTIONS[b.questionNumber - 1];
      if (!q) return;
      if (b.player) q.us = { k: slotOf(b.player), value: b.value };
      else q.them = b.value;
    });
    NOTES = (g.notes || []).map(function (n) { return { questionNumber: n.questionNumber, player: n.player, text: n.text }; });
    $('fTourney').value = g.tournament || '';
    $('fDate').value = new Date(g.playedAt).toISOString().slice(0, 10);
    $('fLevel').value = g.level || DATA.levels[0].key;
    $('fRound').value = g.round || '';
    $('fStage').value = g.stage || '';
    $('fTeam').value = us.name;
    $('fOpp').value = g.opponent || '';
    var them = (g.teams || []).filter(function (t) { return t.opponent; })[0];
    var mode = g.opponentMode || 'recorded';
    var final = mode === 'unrecorded' && them && them.score != null ? String(them.score) : '';
    $('fFinal').value = final;
    $('fResult').value = mode === 'unrecorded' && !final ? (g.result || '') : '';
    // the next new game still starts the way the last one entered did
    var keep = LAST_MODE;
    setMode(mode, true);
    LAST_MODE = keep;
    $('formTitle').textContent = 'Editing ' + g.label;
    $('cancelEdit').classList.remove('d-none');
    $('save').textContent = 'Save changes';
    CURRENT = 0;
    renderSlots(); renderGrid(); renderNotes();
    $('formTitle').scrollIntoView();
  });
}

// ---------- the season and the list ----------

function seasonGames () {
  return DATA.games.filter(function (g) {
    return ($('seasonWhen').value !== 'season' || g.month >= DATA.seasonStart) &&
      ($('seasonLevel').value === 'all' || g.level === $('seasonLevel').value);
  });
}

// the same columns as the paper season sheet, plus what the grid adds
function renderSeason () {
  var list = seasonGames();
  if (!list.length) { $('season').innerHTML = '<p class="note">No tournament games entered for these filters yet.</p>'; return; }
  var by = {};
  list.forEach(function (g) {
    var key = g.tournament + '|' + new Date(g.playedAt).toISOString().slice(0, 10);
    g.players.forEach(function (p) {
      var t = by[p.name] || (by[p.name] = { name: p.name, tourneys: {}, games: 0, points: 0, correct: 0, negs: 0, heard: 0 });
      t.tourneys[key] = true;
      t.games++;
      t.points += p.points; t.correct += p.correct; t.negs += p.negs; t.heard += p.heard;
    });
  });
  var rows = Object.keys(by).map(function (k) { var t = by[k]; t.attended = Object.keys(t.tourneys).length; return t; })
    .sort(function (a, b) { return b.points - a.points || a.name.localeCompare(b.name); });
  $('season').innerHTML = '<div class="card"><div class="card-body p-0"><div class="table-responsive"><table class="table table-sm mb-0">' +
    '<thead><tr><th>Player</th><th class="num">Tournaments</th><th class="num">Games</th><th class="num">Points</th>' +
    '<th class="num">Per tournament</th><th class="num">Correct</th><th class="num">&minus;5s</th><th class="num">Points/question</th></tr></thead><tbody>' +
    rows.map(function (t) {
      return '<tr><td>' + esc(t.name) + '</td><td class="num">' + t.attended + '</td><td class="num">' + t.games + '</td>' +
        '<td class="num fw-semibold">' + t.points + '</td><td class="num">' + Math.round(t.points / t.attended) + '</td>' +
        '<td class="num">' + t.correct + '</td><td class="num">' + t.negs + '</td>' +
        '<td class="num">' + (t.heard ? (t.points / t.heard).toFixed(2) : '-') + '</td></tr>';
    }).join('') + '</tbody></table></div></div></div>';
}

// a game's score, as far as the sheet has it: 220-180, 220-? and who won, or
// just ours against a chair (its label and row already say so)
function scoreText (g) {
  if (g.mode === 'chair') return String(g.score);
  if (g.opponentScore != null) return g.score + '&ndash;' + g.opponentScore;
  return g.score + '&ndash;?, ' + (RESULT_WORDS[g.result] || 'who won not written down');
}

// a tournament's record: wins and losses, then ties, games nobody wrote the
// result of, and chairs, which are neither
function recordText (list) {
  var n = { win: 0, loss: 0, tie: 0, unknown: 0, chair: 0 };
  list.forEach(function (g) { n[g.result || 'unknown']++; });
  var text = n.win + '&ndash;' + n.loss;
  if (n.tie) text += ', ' + n.tie + ' tied';
  if (n.unknown) text += ', ' + n.unknown + ' not written down';
  if (n.chair) text += ', ' + n.chair + ' chair' + (n.chair === 1 ? '' : 's');
  return text;
}

// playoff rounds: where each lists (regular rounds first) and what it is called
function stageRank (key) {
  for (var i = 0; i < DATA.stages.length; i++) if (DATA.stages[i].key === key) return i + 1;
  return 0;
}
function stageLabel (key) { return DATA.stages[stageRank(key) - 1].label; }

// how far the team went: the furthest playoff round it played, and whether it
// won there
function finishText (list) {
  var at = {};
  list.forEach(function (g) { if (g.stage) at[g.stage] = g.result; });
  if ('final' in at) return at.final === 'win' ? 'champion' : at.final === 'loss' ? 'runner-up' : 'made the final';
  if ('third' in at) return at.third === 'win' ? 'third place' : at.third === 'loss' ? 'fourth place' : 'played for third';
  if ('semifinal' in at) return at.semifinal === 'win' ? 'made the final' : 'semifinalist';
  if ('quarterfinal' in at) return at.quarterfinal === 'win' ? 'made the semifinals' : 'quarterfinalist';
  return '';
}

function renderGames () {
  var names = {};
  DATA.games.forEach(function (g) { names[g.tournament] = true; });
  $('tourneyList').innerHTML = Object.keys(names).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  if (!DATA.games.length) { $('games').innerHTML = '<p class="note">Nothing entered yet.</p>'; return; }
  var groups = [];
  DATA.games.slice().reverse().forEach(function (g) {
    var key = g.tournament + '|' + new Date(g.playedAt).toISOString().slice(0, 10);
    var grp = groups.filter(function (x) { return x.key === key; })[0];
    if (!grp) groups.push(grp = { key: key, name: g.tournament, date: g.playedAt, games: [] });
    grp.games.push(g);
  });
  $('games').innerHTML = groups.map(function (grp) {
    return '<div class="card mb-2"><div class="card-body p-0"><div class="px-3 pt-2 fw-semibold">' + esc(grp.name) +
      ' <span class="text-secondary fw-normal small">' + new Date(grp.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) +
      ' &middot; ' + recordText(grp.games) + (finishText(grp.games) ? ' &middot; ' + finishText(grp.games) : '') + '</span></div>' +
      '<div class="table-responsive"><table class="table table-sm mb-0"><tbody>' +
      grp.games.slice().sort(function (a, b) {
        return stageRank(a.stage) - stageRank(b.stage) || String(a.round).localeCompare(String(b.round), undefined, { numeric: true });
      }).map(function (g) {
        var cls = { win: 'res-win', loss: 'res-loss', tie: 'res-tie' }[g.result] || 'res-unknown';
        return '<tr><td style="width:7.5rem">' + (g.stage ? esc(stageLabel(g.stage)) : g.round ? 'Round ' + esc(g.round) : '') + '</td>' +
          '<td>' + esc(g.team) + (g.mode === 'chair' ? ' vs a chair' : ' vs ' + esc(g.opponent)) +
          (g.notes ? ' <span class="small text-secondary">&#9998; ' + g.notes + '</span>' : '') + '</td>' +
          '<td class="num ' + cls + '">' + scoreText(g) + '</td>' +
          '<td class="small text-secondary">' + g.players.filter(function (p) { return p.points; }).map(function (p) {
            return esc(p.name.split(' ')[0]) + ' ' + p.points;
          }).join(', ') + '</td>' +
          '<td class="text-end text-nowrap"><button type="button" class="btn btn-sm btn-link p-0 me-2 gedit" data-id="' + g.id + '">edit</button>' +
          '<button type="button" class="btn btn-sm btn-link text-danger p-0 gdel" data-id="' + g.id + '">delete</button></td></tr>';
      }).join('') + '</tbody></table></div></div></div>';
  }).join('');
}
$('games').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  var id = b.getAttribute('data-id');
  if (b.classList.contains('gedit')) editGame(id);
  if (b.classList.contains('gdel') && confirm('Delete this game and its stats?')) {
    postJson('/kshsaa-stats/delete', { id: id }).then(function () { if (EDITING === id) stopEditing(); load(); });
  }
});

// ---------- printed scoresheets ----------

function sheetHtml (names, last) {
  var blank = function (cls) { return '<span class="blank' + (cls ? ' ' + cls : '') + '"></span>'; };
  var players = '';
  for (var i = 0; i < SLOTS; i++) {
    players += '<span><b>' + (i + 1) + '</b> ' + (names[i] ? esc(names[i]) : blank()) + '</span>';
  }
  var rows = DATA.order.map(function (c, i) {
    return '<tr><td class="q">' + (i + 1) + '</td><td class="subj">' + esc(c) + '</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  }).join('');
  return '<div class="sheet' + (last ? ' pagebreak' : '') + '">' +
    '<div class="sh-title">Scholars Bowl scoresheet</div>' +
    '<div class="sh-line"><span>Tournament ' + blank() + '</span><span>Date ' + blank('short') + '</span>' +
    '<span>Round ' + blank('short') + '</span><span>Opponent ' + blank() + '</span><span>Varsity / JV</span></div>' +
    '<div class="sh-line">' + players + '</div>' +
    '<div class="sh-line"><span>Sub: ' + blank('short') + ' in for ' + blank('short') + ' at question ' + blank('short') + '</span></div>' +
    '<table><thead><tr><th>Q</th><th>Subject</th><th>We got it (player #)</th><th>We lost 5 (player #)</th>' +
    '<th>They got it</th><th>They lost 5</th><th>Us</th><th>Them</th></tr></thead><tbody>' + rows +
    '<tr><td colspan="6" style="text-align:right"><b>Final</b></td><td></td><td></td></tr></tbody></table></div>';
}

$('psPrint').onclick = function () {
  var squad = $('psSquad').value;
  var names = squad ? DATA.roster.filter(function (r) { return r.squad === squad; }).map(function (r) { return r.name; }).slice(0, SLOTS) : [];
  var count = Number($('psCount').value);
  var h = '';
  for (var i = 0; i < count; i++) h += sheetHtml(names, i % 2 === 1 && i < count - 1);
  $('printSheet').innerHTML = h;
  document.body.classList.add('printing');
  window.print();
};
window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); });
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
