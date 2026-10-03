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
import { CATEGORIES, CATEGORY_BY_QUESTION, LEVELS } from './kshsaa-round.js';
import { getSquads, nameCanonicalizer, requireAuth } from './kshsaa-stats.js';
import { cleanNotes, kindOf, monthKeyOf, monthLabel, seasonStartKey } from '../server/kshsaa/game-stats.js';
import { NAME_AUTOCOMPLETE } from '../server/kshsaa/name-autocomplete.js';
import { KSHSAA_HEAD, kshsaaNav } from '../server/kshsaa/nav.js';

const router = Router();
const games = qbreader.collection('kshsaa_games');
const roster = qbreader.collection('kshsaa_roster');

// player slots on the scoresheet: five starters and a sub
const SLOTS = 6;

const text = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * A game from the entry grid, checked and turned into the stored shape. Throws
 * with a message for whoever is typing it in.
 * @param {object} body - { tournament, date, level, round, team, opponent,
 *   players: [{name, from, to}], questions: [{category, us: {player, value} | null, them: 10 | -5 | null}],
 *   notes: [{questionNumber, player, text}] }
 * @param {function(string): string} fix - name canonicalizer
 */
function tournamentGame (body, fix) {
  const tournament = text(body.tournament, 80);
  if (!tournament) throw new Error('which tournament was it?');
  const date = String(body.date || '');
  // midday in Kansas, so the game files under the right day and month
  const playedAt = new Date(date + 'T18:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(playedAt.getTime())) throw new Error('the tournament needs a date');
  const team = text(body.team, 60) || 'SJA';
  const opponent = text(body.opponent, 60);
  if (!opponent) throw new Error('who was the opponent?');
  if (opponent.toLowerCase() === team.toLowerCase()) throw new Error('the opponent needs a different name from our team');

  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!questions.length || questions.length > 30) throw new Error('a game has 1 to 30 questions');
  const read = questions.length;

  // who played, and for which questions: a sub who came in at question 9
  // heard 8 of them
  const lineup = [];
  const span = {};
  for (const p of (Array.isArray(body.players) ? body.players : []).slice(0, SLOTS + 4)) {
    const name = fix(text(p?.name, 60));
    if (!name) continue;
    if (span[name]) throw new Error(name + ' is listed twice');
    const from = p.from == null || p.from === '' ? 1 : Number(p.from);
    const to = p.to == null || p.to === '' ? read : Number(p.to);
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 1 && from <= to && to <= read)) {
      throw new Error(name + ' has to be in for questions somewhere from 1 to ' + read);
    }
    span[name] = [from, to];
    lineup.push({ name, from, to });
  }
  if (!lineup.length) throw new Error('list who played');

  const buzzes = [];
  const categories = questions.map((q, i) => {
    const n = i + 1;
    const category = CATEGORIES.includes(q?.category) ? q.category : (CATEGORY_BY_QUESTION[i] || 'Other');
    const us = q?.us?.player ? { player: fix(text(q.us.player, 60)), value: Number(q.us.value) } : null;
    const them = q?.them == null || q.them === '' ? null : Number(q.them);
    if (us) {
      if (!span[us.player]) throw new Error('question ' + n + ' is credited to ' + us.player + ', who is not listed as playing');
      if (n < span[us.player][0] || n > span[us.player][1]) throw new Error(us.player + ' was not in for question ' + n);
      if (us.value !== 10 && us.value !== -5) throw new Error('question ' + n + ': our answer counts +10 or -5');
    }
    if (them != null && them !== 10 && them !== -5) throw new Error('question ' + n + ': their answer counts +10 or -5');
    // one team answers a question correctly, and only the first team to
    // interrupt can lose points on it
    if (us && them != null && us.value === them) {
      throw new Error('question ' + n + ': both teams cannot ' + (them > 0 ? 'get it right' : 'lose 5 points'));
    }
    const entry = (player, teamName, value) => ({
      player, team: teamName, questionNumber: n, category, value, wordIndex: null, wordCount: null, charCount: null
    });
    const both = [];
    if (us) both.push(entry(us.player, team, us.value));
    if (them != null) both.push(entry(null, opponent, them));
    // the wrong answer came first
    buzzes.push(...both.sort((a, b) => a.value - b.value));
    return category;
  });

  const score = name => buzzes.reduce((s, b) => s + (b.team === name ? b.value : 0), 0);
  const round = text(body.round, 20);
  return {
    kind: 'tournament',
    tournament,
    round,
    opponent,
    label: tournament + (round ? ', round ' + round : '') + ' vs ' + opponent,
    playedAt,
    level: LEVELS[body.level] ? body.level : null,
    tossupsRead: read,
    categories,
    wordCounts: null,
    charCounts: null,
    lineup,
    teams: [
      { name: team, players: lineup.map(p => p.name), score: score(team) },
      { name: opponent, players: [], score: score(opponent), opponent: true }
    ],
    heardByPlayer: Object.fromEntries(lineup.map(p => [team + '|' + p.name, p.to - p.from + 1])),
    buzzes,
    notes: cleanNotes(body.notes, n => Boolean(span[n]), fix)
  };
}

const ours = g => (g.teams || []).find(t => !t.opponent) || { name: '', players: [], score: 0 };
const theirs = g => (g.teams || []).find(t => t.opponent) || { name: g.opponent || '', score: 0 };

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
      categories: CATEGORIES,
      order: CATEGORY_BY_QUESTION,
      roster: rosterList.filter(r => !r.coach).map(r => ({ name: r.name, squad: r.squad || null })),
      games: list.map(g => ({
        id: String(g._id),
        tournament: g.tournament,
        round: g.round || '',
        opponent: theirs(g).name,
        team: ours(g).name,
        level: g.level || null,
        playedAt: g.playedAt,
        month: monthKeyOf(g.playedAt),
        score: ours(g).score,
        opponentScore: theirs(g).score,
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

router.post('/save', requireAuth, async (req, res) => {
  try {
    const doc = tournamentGame(req.body || {}, await nameCanonicalizer());
    const id = req.body?.id ? new ObjectId(String(req.body.id)) : null;
    if (id) {
      const old = await games.findOne({ _id: id });
      if (!old || kindOf(old) !== 'tournament') return res.status(404).json({ error: 'that tournament game is gone' });
      await games.updateOne({ _id: id }, { $set: { ...doc, editedAt: new Date() } });
      return res.json({ ok: true, id: String(id), label: doc.label, score: doc.teams[0].score, opponentScore: doc.teams[1].score });
    }
    // the same sheet typed in twice
    const same = (await games.find({ kind: 'tournament', tournament: doc.tournament }).toArray()).find(g =>
      monthKeyOf(g.playedAt) === monthKeyOf(doc.playedAt) && new Date(g.playedAt).getUTCDate() === doc.playedAt.getUTCDate() &&
      (g.round || '') === doc.round && theirs(g).name.toLowerCase() === doc.opponent.toLowerCase() &&
      ours(g).name.toLowerCase() === doc.teams[0].name.toLowerCase());
    if (same) return res.status(409).json({ error: 'that game is already entered - find it in the list below to change it' });
    const r = await games.insertOne({ ...doc, enteredAt: new Date() });
    res.json({ ok: true, id: String(r.insertedId), label: doc.label, score: doc.teams[0].score, opponentScore: doc.teams[1].score });
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
  <h1 class="h4 mb-0">Practice stats</h1>

  <div id="login" class="card mt-3 d-none" style="max-width:420px"><div class="card-body">
    <label class="form-label" for="pw">Stats password</label>
    <input type="password" class="form-control mb-2" id="pw">
    <button class="btn btn-primary" id="loginBtn">Enter</button>
    <div class="small text-danger mt-2" id="loginErr"></div>
  </div></div>

  <div id="app" class="d-none">
    <ul class="nav nav-tabs mt-3">
      <li class="nav-item"><a class="nav-link" href="/kshsaa-stats">Stats</a></li>
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
        <div class="col-md-4"><label class="form-label" for="fTourney">Tournament</label>
          <input class="form-control form-control-sm" id="fTourney" list="tourneyList" placeholder="Hays Invitational">
          <datalist id="tourneyList"></datalist></div>
        <div class="col-md-2"><label class="form-label" for="fDate">Date</label>
          <input class="form-control form-control-sm" type="date" id="fDate"></div>
        <div class="col-md-2"><label class="form-label" for="fLevel">Level</label>
          <select class="form-select form-select-sm" id="fLevel"></select></div>
        <div class="col-md-1"><label class="form-label" for="fRound">Round</label>
          <input class="form-control form-control-sm" id="fRound" placeholder="1"></div>
        <div class="col-md-3"><label class="form-label" for="fTeam">Our team</label>
          <input class="form-control form-control-sm" id="fTeam" list="squadList" placeholder="Varsity Blue">
          <datalist id="squadList"></datalist></div>
        <div class="col-md-4"><label class="form-label" for="fOpp">Opponent</label>
          <input class="form-control form-control-sm" id="fOpp" placeholder="Hays"></div>
      </div>

      <div class="form-label mt-3">Players, by their number on the sheet</div>
      <div id="slots" class="row g-1"></div>
      <p class="note">A sub who came in partway: set the questions they were in for, and the player they replaced's.</p>

      <div class="d-flex justify-content-between align-items-end mt-3">
        <div class="form-label mb-1">Questions</div>
        <div class="small text-secondary keys">Click a row, then type: <kbd>1</kbd>&ndash;<kbd>6</kbd> our player got it,
          <kbd>-</kbd> then a number for our &minus;5, <kbd>o</kbd> they got it, <kbd>x</kbd> their &minus;5,
          <kbd>Enter</kbd> nobody, <kbd>Delete</kbd> clears.</div>
      </div>
      <div class="table-responsive"><table class="table table-sm align-middle mb-0">
        <thead><tr><th style="width:2.5rem">Q</th><th>Subject</th><th>We got it</th><th>We lost 5</th><th>They</th>
          <th class="num">Score</th></tr></thead>
        <tbody id="grid"></tbody>
      </table></div>

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
var DATA = null;
var KNOWN_NAMES = [];
// the form: who is in which slot, and what happened on each question
var PLAYERS = [];
var QUESTIONS = [];
var NOTES = [];
var EDITING = null;
var CURRENT = 0;
var NEG_NEXT = false;

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
  QUESTIONS = DATA.order.map(function (c) { return { category: c, us: null, them: null }; });
  NOTES = [];
  CURRENT = 0;
  NEG_NEXT = false;
  renderSlots();
  renderGrid();
  renderNotes();
}

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
      '<input class="form-control sto" style="max-width:3.2rem" data-k="' + (i + 1) + '" value="' + esc(p.to) + '" placeholder="16" inputmode="numeric">' +
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
  var cats = DATA.categories.map(function (c) { return '<option' + (c === q.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  return '<td class="fw-semibold">' + n + '</td>' +
    '<td><select class="form-select form-select-sm qcat" data-n="' + n + '">' + cats + '</select></td>' +
    '<td>' + (slots.length ? slots.map(function (k) { return chip(n, k, 10); }).join('') : '<span class="note">add players</span>') + '</td>' +
    '<td>' + slots.map(function (k) { return chip(n, k, -5); }).join('') + '</td>' +
    '<td><button type="button" class="pk them' + (q.them === 10 ? ' yes' : '') + '" data-n="' + n + '" data-them="10" title="They got it">+10</button>' +
    '<button type="button" class="pk them' + (q.them === -5 ? ' neg' : '') + '" data-n="' + n + '" data-them="-5" title="They lost 5">&minus;5</button></td>' +
    '<td class="num score"></td>';
}

function renderGrid () {
  $('grid').innerHTML = QUESTIONS.map(function (q, i) {
    return '<tr tabindex="0" data-row="' + (i + 1) + '"' + (i === CURRENT ? ' class="on"' : '') + '>' + rowHtml(i + 1) + '</tr>';
  }).join('');
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
  QUESTIONS.forEach(function (q, i) {
    if (q.us) us += q.us.value;
    if (q.them != null) them += q.them;
    var cell = document.querySelector('#grid tr[data-row="' + (i + 1) + '"] .score');
    if (cell) cell.textContent = us + ' – ' + them;
  });
  $('total').textContent = ($('fTeam').value.trim() || 'Us') + ' ' + us + ', ' + ($('fOpp').value.trim() || 'them') + ' ' + them;
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
  if (e.target.classList.contains('qcat')) QUESTIONS[Number(e.target.getAttribute('data-n')) - 1].category = e.target.value;
});

// typing a sheet in: a key per question, and the row moves on once someone got it
$('grid').addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  var n = CURRENT + 1;
  var q = QUESTIONS[CURRENT];
  var digit = '123456789'.indexOf(e.key) + 1;
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
    team: $('fTeam').value,
    opponent: $('fOpp').value,
    players: PLAYERS.filter(function (p) { return p.name.trim(); }),
    questions: QUESTIONS.map(function (q) {
      return { category: q.category, us: q.us ? { player: PLAYERS[q.us.k - 1].name, value: q.us.value } : null, them: q.them };
    }),
    notes: NOTES
  };
  $('save').disabled = true;
  postJson('/kshsaa-tournaments/save', body).then(function (res) {
    $('save').disabled = false;
    if (!res.ok) { $('saveMsg').innerHTML = '<span class="text-danger">' + esc(res.d.error || 'could not save') + '</span>'; return; }
    $('saveMsg').innerHTML = '<span class="text-success">Saved ' + esc(res.d.label) + ' (' + res.d.score + '&ndash;' + res.d.opponentScore + ')</span>';
    if (EDITING) {
      stopEditing();
    } else {
      // the next game is usually the same tournament and lineup
      var round = Number($('fRound').value);
      $('fRound').value = round ? round + 1 : '';
      $('fOpp').value = '';
      resetForm(true);
      $('fOpp').focus();
    }
    load();
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
    QUESTIONS = (g.categories || DATA.order).map(function (c) { return { category: c, us: null, them: null }; });
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
    $('fTeam').value = us.name;
    $('fOpp').value = g.opponent || '';
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
    var won = grp.games.filter(function (g) { return g.score > g.opponentScore; }).length;
    return '<div class="card mb-2"><div class="card-body p-0"><div class="px-3 pt-2 fw-semibold">' + esc(grp.name) +
      ' <span class="text-secondary fw-normal small">' + new Date(grp.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) +
      ' &middot; ' + won + '&ndash;' + (grp.games.length - won) + '</span></div>' +
      '<div class="table-responsive"><table class="table table-sm mb-0"><tbody>' +
      grp.games.slice().sort(function (a, b) { return String(a.round).localeCompare(String(b.round), undefined, { numeric: true }); }).map(function (g) {
        var cls = g.score > g.opponentScore ? 'res-win' : 'res-loss';
        return '<tr><td style="width:5rem">' + (g.round ? 'Round ' + esc(g.round) : '') + '</td>' +
          '<td>' + esc(g.team) + ' vs ' + esc(g.opponent) + (g.notes ? ' <span class="small text-secondary">&#9998; ' + g.notes + '</span>' : '') + '</td>' +
          '<td class="num ' + cls + '">' + g.score + '&ndash;' + g.opponentScore + '</td>' +
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
