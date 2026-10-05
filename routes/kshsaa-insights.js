// Insights: what the stats say to do next. Builds teams of five
// starters and a sub, lists what each player should work on (with a message to
// send them and a practice set for the category), and shows how hard each
// level's questions really played. Stats password only.
//
// INSTALL: in app.js, below cookieSession like the stats route:
//   import kshsaaInsightsRouter from './routes/kshsaa-insights.js';
//   app.use('/kshsaa-insights', kshsaaInsightsRouter);
//
// The numbers come from server/kshsaa/insights.js; this file reads the
// database and serves the page.

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { qbreader } from '../database/databases.js';
import { tossups } from '../database/qbreader/collections.js';
import { CATEGORIES, LEVELS, sourceOf } from './kshsaa-round.js';
import { getSquads, requireAuth } from './kshsaa-stats.js';
import { monthKeyOf, monthLabel, readFilters } from '../server/kshsaa/game-stats.js';
import { computeInsights } from '../server/kshsaa/insights.js';
import { KSHSAA_HEAD, kshsaaNav } from '../server/kshsaa/nav.js';

const router = Router();
const games = qbreader.collection('kshsaa_games');
const roster = qbreader.collection('kshsaa_roster');

router.get('/data', requireAuth, async (req, res) => {
  try {
    const filters = readFilters(req.query);
    const [everything, rosterList, squads] = await Promise.all([
      games.find({}).sort({ playedAt: 1 }).toArray(),
      roster.find({}).toArray(),
      getSquads()
    ]);
    const all = everything.filter(filters.inKind);

    // what each recorded question was, for the difficulty table
    const ids = new Set();
    for (const g of all) for (const id of g.questionIds || []) if (/^[0-9a-f]{24}$/i.test(String(id))) ids.add(String(id));
    const docs = ids.size
      ? await tossups.find({ _id: { $in: [...ids].map(id => new ObjectId(id)) } },
        { projection: { set: 1, question: 1, answer: 1 } }).toArray()
      : [];
    const questionInfo = new Map(docs.map(d => [String(d._id), {
      source: sourceOf(d.set?.name),
      question: d.question,
      answer: d.answer
    }]));

    const insights = computeInsights(all, filters, questionInfo);
    const byName = {};
    for (const r of rosterList) byName[r.name.trim().toLowerCase()] = r;
    // coaches who joined a practice game still count as being in the room for
    // the numbers above, but are never offered as players
    insights.players = insights.players.filter(p => !byName[p.name.trim().toLowerCase()]?.coach);
    for (const p of insights.players) {
      const r = byName[p.name.trim().toLowerCase()];
      p.squad = r?.squad || null;
      p.grade = r?.grade ?? null;
    }

    res.json({
      ...insights,
      filters: { month: filters.month, level: filters.level },
      seasonStart: monthLabel(filters.season),
      months: [...new Set(all.map(g => monthKeyOf(g.playedAt)))].sort().reverse().map(key => ({ key, label: monthLabel(key) })),
      levels: Object.keys(LEVELS).map(key => ({ key, label: LEVELS[key].label })),
      categories: CATEGORIES,
      squads,
      // everyone on the roster, so the team builder can place rated players
      // who have no games yet and keep permanent players on their squads
      roster: rosterList.filter(r => !r.coach).map(r => ({
        name: r.name,
        grade: r.grade ?? null,
        squad: r.squad || null,
        rating: r.rating ?? null,
        permanent: Boolean(r.permanent && r.squad),
        email: r.email || null
      }))
    });
  } catch (e) {
    console.error('kshsaa-insights error', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Insights</title>
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
 th,td{padding:.4rem .6rem !important;vertical-align:middle}
 .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 .form-label{font-size:.85rem;font-weight:600;color:#4b5563}
 .pick{display:inline-flex;align-items:center;gap:.3rem;margin:0 .35rem .35rem 0;padding:.2rem .55rem;
   border:1px solid #d9e0ec;border-radius:1rem;background:#fff;font-size:.85rem;cursor:pointer;user-select:none}
 .pick input{margin:0}
 .pick.few{color:#9ca3af}
 .bar{height:.5rem;background:#eef1f7;border-radius:.25rem;overflow:hidden}
 .bar span{display:block;height:100%;background:#4a7bd0}
 .bar.low span{background:#c9573d}
 .chip{display:inline-block;padding:.08rem .45rem;border-radius:.3rem;font-size:.8rem;margin:0 .25rem .2rem 0}
 .chip-good{background:#e6f2ea;color:#1d6b40}
 .chip-bad{background:#fbe9e5;color:#9b3a24}
 .chip-habit{background:#fbf1de;color:#8a6116}
 .up{color:#1d6b40}.down{color:#9b3a24}
 textarea.msg{font-size:.88rem}
 /* the printed focus sheet: only it prints, and only from its button */
 #printSheet{display:none}
 @media print{
   body.printing-focus > *:not(#printSheet){display:none !important}
   body.printing-focus #printSheet{display:block}
   #printSheet{font-size:10pt;color:#000}
   #printSheet h1{font-size:15pt;margin:0 0 2pt}
   #printSheet table{width:100%;border-collapse:collapse}
   #printSheet th,#printSheet td{border:1px solid #999;padding:3pt 5pt !important;vertical-align:top}
   #printSheet tr{break-inside:avoid}
   #printSheet .sub{font-size:8.5pt;color:#444}
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
      <li class="nav-item"><a class="nav-link active" href="/kshsaa-insights">Insights</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-stats#roster">Roster</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-tournaments">Tournaments</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-questions">Question bank</a></li>
    </ul>

    <div class="d-flex flex-wrap gap-3 align-items-end mt-3">
      <div><label class="form-label mb-1" for="fMonth">Games from</label>
        <select class="form-select form-select-sm" id="fMonth"></select></div>
      <div><label class="form-label mb-1" for="fLevel">Level</label>
        <select class="form-select form-select-sm" id="fLevel"></select></div>
      <div><label class="form-label mb-1" for="fKind">Games</label>
        <select class="form-select form-select-sm" id="fKind"><option value="all">Practice and tournaments</option>
          <option value="practice">Practice only</option><option value="tournament">Tournaments only</option></select></div>
      <div class="note mb-1" id="filterNote"></div>
    </div>

    <h2>Build teams</h2>
    <div class="card"><div class="card-body">
      <div class="d-flex flex-wrap gap-3 align-items-end mb-3">
        <div><label class="form-label mb-1" for="mode">Make</label>
          <select class="form-select form-select-sm" id="mode">
            <option value="strong">Strongest teams</option>
            <option value="even">Even teams</option>
          </select></div>
        <div><label class="form-label mb-1" for="teamCount">Teams</label>
          <select class="form-select form-select-sm" id="teamCount"></select></div>
        <button type="button" class="btn btn-primary btn-sm" id="build">Build</button>
      </div>
      <div class="d-flex flex-wrap gap-3 align-items-center mb-3 small">
        <label class="d-flex align-items-center gap-1" id="firstOverallLabel"><input type="checkbox" id="firstOverall" checked>
          First squad takes the strongest players overall; the others cover every category</label>
        <label class="d-flex align-items-center gap-1">Stats count as much as ratings after
          <input type="number" class="form-control form-control-sm" id="equalRounds" min="1" max="40" value="6" style="width:4.2rem">
          rounds</label>
        <span class="text-secondary" id="weightNote"></span>
      </div>
      <div class="small text-secondary mb-1">Available:
        <a href="#" id="selAll">everyone</a> &middot; <a href="#" id="selNone">no one</a></div>
      <div id="pool"></div>
      <div id="teams" class="row g-3 mt-1"></div>
      <div class="mt-3 d-none" id="assignRow">
        <button type="button" class="btn btn-outline-primary btn-sm" id="assign">Put these players on these squads</button>
        <span class="small ms-2" id="assignMsg"></span>
      </div>
      <div class="note" id="unplaced"></div>
      <p class="note">"Knows about" is how many of a round&rsquo;s 16 questions at least one starter would likely know.
      Each player blends their stats with your past rating from the roster (&#9733;, out of 10); permanent players stay on
      their squad. Grayed names have under two rounds of games and no rating.</p>
    </div></div>

    <div class="d-flex justify-content-between align-items-end">
      <h2>Player focus</h2>
      <button type="button" class="btn btn-sm btn-outline-secondary mb-2" id="printFocus">Print focus sheet</button>
    </div>
    <div class="card"><div class="card-body p-0"><div class="table-responsive">
      <table class="table table-sm align-middle mb-0"><thead><tr>
        <th>Player</th><th class="num">Games</th><th class="num">Points/question</th><th>Trend</th>
        <th>Strong</th><th>Work on</th><th>Habits</th><th></th></tr></thead>
      <tbody id="focus"></tbody></table>
    </div></div></div>

    <h2>Question difficulty</h2>
    <div class="card"><div class="card-body p-0"><div class="table-responsive">
      <table class="table table-sm align-middle mb-0"><thead><tr>
        <th>Level</th><th>Questions from</th><th class="num">Read</th><th class="num">Answered</th>
        <th class="num">Drew a &minus;5</th><th class="num">Buzz point</th><th class="num">Spread</th></tr></thead>
      <tbody id="difficulty"></tbody></table>
    </div></div></div>
    <p class="note">Buzz point: how much of the question was left when the right answer came (1.00 is the first word).
    Spread: how much that varied &mdash; a high spread means questions swing between easy and hard.</p>
    <div id="dead"></div>
  </div>
</div>

<div id="printSheet"></div>

<script>
var $ = function (id) { return document.getElementById(id); };
var DATA = null;
var FILTER = { month: 'season', level: 'all', kind: 'all' };
var AVAILABLE = {};
var TEAMS = [];
var HABITS = {
  early: ['buzzes early', 'You are buzzing early a lot, and some of those turn into \\u22125s. Waiting for one more clue usually pays off.'],
  late: ['buzzes late', 'You are getting these right, so trust yourself and buzz sooner.'],
  quiet: ['rarely buzzes', 'Do not be afraid to buzz when you have a good guess. A wrong answer at the end of a question costs nothing.']
};
var SOURCES = {
  kshsaa: 'KSHSAA archive', converted: 'Converted quizbowl', beginner: 'Middle school', jv: 'Easy high school',
  current: 'Current events', generated: 'Question bank', unknown: 'Unknown'
};

function esc (s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function postJson (url, body) {
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); });
}
function list (items) {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

// ---------- sign-in and loading ----------

function show (ok) {
  $('login').classList.toggle('d-none', ok);
  $('app').classList.toggle('d-none', !ok);
  if (ok) load();
}
fetch('/kshsaa-stats/me').then(function (r) { return r.json(); }).then(function (d) { show(d.authed); });
$('loginBtn').onclick = function () {
  postJson('/kshsaa-stats/login', { password: $('pw').value }).then(function (res) {
    if (!res.ok) { $('loginErr').textContent = res.d.error || 'failed'; return; }
    if (res.d.role !== 'stats') { $('loginErr').textContent = 'That is the reader password. Insights need the stats password.'; return; }
    show(true);
  });
};
$('pw').onkeydown = function (e) { if (e.key === 'Enter') $('loginBtn').click(); };

function load () {
  fetch('/kshsaa-insights/data?month=' + encodeURIComponent(FILTER.month) + '&level=' + encodeURIComponent(FILTER.level) +
    '&kind=' + encodeURIComponent(FILTER.kind))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { $('filterNote').textContent = d.error; return; }
      DATA = d;
      fillFilters(d);
      buildCandidates();
      renderPool();
      renderFocus();
      renderDifficulty();
      TEAMS = [];
      renderTeams();
    });
}

function fillFilters (d) {
  $('fMonth').innerHTML = '<option value="season">This school year (since ' + esc(d.seasonStart) + ')</option>' +
    '<option value="all">All time</option>' +
    d.months.map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + '</option>'; }).join('');
  $('fMonth').value = FILTER.month;
  $('fLevel').innerHTML = '<option value="all">All levels</option>' +
    d.levels.map(function (l) { return '<option value="' + l.key + '">' + esc(l.label) + '</option>'; }).join('') +
    '<option value="untagged">Untagged</option>';
  $('fLevel').value = FILTER.level;
  $('filterNote').textContent = d.gamesUsed + ' games';
}
$('fMonth').onchange = function () { FILTER.month = $('fMonth').value; load(); };
$('fLevel').onchange = function () { FILTER.level = $('fLevel').value; load(); };
$('fKind').onchange = function () { FILTER.kind = $('fKind').value; load(); };

// ---------- team building ----------
// A team's strength is how many of a round's 16 questions at least one of its
// five starters would likely know: per category, one minus the chance that
// every starter misses, weighted by how many questions the category gets.
//
// Each player's chances blend their stats with the coach's 1-10 rating from
// the roster. Stats count for rounds / (rounds + N) of the blend, so a rating
// carries a player who has barely played and fades as their games pile up.

var EQUAL_ROUNDS_KEY = 'kshsaa-equal-rounds';
var CANDIDATES = [];
var UNPLACED = [];

function strength (members) {
  var total = 0;
  DATA.categories.forEach(function (c) {
    var miss = 1;
    members.forEach(function (p) { miss *= 1 - (p.know[c] || 0); });
    total += DATA.weights[c] * (1 - miss);
  });
  return total;
}

// how many of a round's questions the player would likely know on their own
function levelOf (know) {
  var total = 0;
  DATA.categories.forEach(function (c) { total += DATA.weights[c] * (know[c] || 0); });
  return total;
}

function scaled (know, factor) {
  var out = {};
  DATA.categories.forEach(function (c) { out[c] = Math.min(0.95, (know[c] || 0) * factor); });
  return out;
}

function equalRounds () {
  var n = Number($('equalRounds').value);
  return n >= 1 ? n : 6;
}

// Ratings go onto the stats' scale by rank: a 10 sits with the best measured
// player on the team and a 1 with the weakest. Someone with no games gets the
// team's average mix of categories at that level.
function ratingScale () {
  var measured = DATA.players.filter(function (p) { return p.heard >= 32; });
  var levels = measured.map(function (p) { return levelOf(p.know); }).sort(function (a, b) { return a - b; });
  var profile = {};
  DATA.categories.forEach(function (c) {
    var sum = 0;
    measured.forEach(function (p) { sum += p.know[c] || 0; });
    profile[c] = measured.length ? sum / measured.length : 0.3;
  });
  var unit = levelOf(profile) || 1;
  DATA.categories.forEach(function (c) { profile[c] /= unit; });
  return {
    profile: profile,
    level: function (rating) {
      if (!levels.length) return rating / 10 * 8;
      var q = (rating - 1) / 9 * (levels.length - 1);
      var lo = Math.floor(q);
      var hi = Math.min(levels.length - 1, lo + 1);
      return levels[lo] + (levels[hi] - levels[lo]) * (q - lo);
    }
  };
}

function buildCandidates () {
  var rosterBy = {};
  DATA.roster.forEach(function (r) { rosterBy[r.name.toLowerCase()] = r; });
  var scale = ratingScale();
  var n = equalRounds();
  var list = DATA.players.map(function (p) {
    var r = rosterBy[p.name.toLowerCase()] || {};
    return { name: p.name, games: p.games, heard: p.heard, statsKnow: p.know, rating: r.rating ?? null, squad: r.squad || null, permanent: Boolean(r.permanent) };
  });
  var seen = {};
  list.forEach(function (c) { seen[c.name.toLowerCase()] = true; });
  DATA.roster.forEach(function (r) {
    if (!seen[r.name.toLowerCase()] && r.rating != null) {
      list.push({ name: r.name, games: 0, heard: 0, statsKnow: null, rating: r.rating, squad: r.squad || null, permanent: Boolean(r.permanent) });
    }
  });
  list.forEach(function (c) {
    if (c.rating == null) {
      c.know = c.statsKnow;
      c.statsShare = 1;
    } else if (!c.heard) {
      c.know = scaled(scale.profile, scale.level(c.rating));
      c.statsShare = 0;
    } else {
      var rounds = c.heard / 16;
      c.statsShare = rounds / (rounds + n);
      var fromStats = levelOf(c.statsKnow);
      var target = c.statsShare * fromStats + (1 - c.statsShare) * scale.level(c.rating);
      c.know = fromStats > 0 ? scaled(c.statsKnow, target / fromStats) : scaled(scale.profile, target);
    }
    c.level = levelOf(c.know);
  });
  CANDIDATES = list.sort(function (a, b) { return a.name.localeCompare(b.name); });
  $('weightNote').textContent = '(four rounds of games: ' + Math.round(100 * 4 / (4 + n)) + '% stats)';
}

var byLevel = function (a, b) { return b.level - a.level; };

// every way to add k of the pool to the base, best first
function bestSubset (pool, k, base) {
  var best = null;
  var bestScore = -1;
  var pick = [];
  (function walk (start) {
    if (pick.length === k) {
      var s = strength(base.concat(pick));
      if (s > bestScore) { bestScore = s; best = pick.slice(); }
      return;
    }
    for (var i = start; i <= pool.length - (k - pick.length); i++) {
      pick.push(pool[i]);
      walk(i + 1);
      pick.pop();
    }
  })(0);
  return best || pool.slice(0, k);
}

// five starters around whoever is fixed: either the strongest individuals or
// whoever covers the categories best
function lineup (fixed, players, overall) {
  var mine = fixed.slice().sort(byLevel);
  var starters = mine.slice(0, 5);
  var pool = players.filter(function (p) { return fixed.indexOf(p) === -1; }).sort(byLevel);
  var need = Math.min(5 - starters.length, pool.length);
  // past about 30 the search gets slow; the weakest never make a top five
  var chosen = overall ? pool.slice(0, need) : bestSubset(pool.slice(0, 30), need, starters);
  return {
    starters: starters.concat(chosen),
    bench: pool.filter(function (p) { return chosen.indexOf(p) === -1; }),
    extra: mine.slice(5)
  };
}

// the bench, best replacement for any starter first
function benchOrder (starters, bench) {
  return bench.map(function (p) {
    var best = 0;
    starters.forEach(function (s) {
      best = Math.max(best, strength(starters.filter(function (x) { return x !== s; }).concat(p)));
    });
    return { p: p, value: best };
  }).sort(function (a, b) { return b.value - a.value; }).map(function (x) { return x.p; });
}

function buildStrongest (players, count) {
  var overallFirst = $('firstOverall').checked;
  // permanent players are kept for their own squad and never placed elsewhere
  var reserved = {};
  players.forEach(function (p) { if (p.permanent && p.squad) (reserved[p.squad] = reserved[p.squad] || []).push(p); });
  var left = players.filter(function (p) { return !(p.permanent && p.squad); });
  var teams = [];
  for (var t = 0; t < count; t++) {
    var squad = DATA.squads[t] || '';
    var fixed = reserved[squad] || [];
    if (!fixed.length && !left.length) break;
    var overall = overallFirst && t === 0;
    var l = lineup(fixed, left, overall);
    var subs = l.extra.length ? l.extra : (overall ? l.bench : benchOrder(l.starters, l.bench)).slice(0, 1);
    var members = l.starters.concat(subs);
    left = left.filter(function (p) { return members.indexOf(p) === -1; });
    teams.push({ starters: l.starters, subs: subs, squad: squad, fixed: fixed });
  }
  var built = teams.map(function (tm) { return tm.squad; });
  UNPLACED = Object.keys(reserved).filter(function (sq) { return built.indexOf(sq) === -1; }).map(function (sq) {
    return reserved[sq].map(function (p) { return p.name; }).join(', ') + ' (permanent on ' + sq + ')';
  });
  return teams;
}

function buildEven (players, count) {
  // snake draft by individual strength, then swap players between teams while
  // that narrows the gap between the strongest and weakest team
  var sorted = players.slice().sort(byLevel);
  var groups = [];
  for (var i = 0; i < count; i++) groups.push([]);
  sorted.forEach(function (p, i) {
    var round = Math.floor(i / count);
    var slot = i % count;
    groups[round % 2 ? count - 1 - slot : slot].push(p);
  });
  var scoreOf = function (g) { return strength(lineup([], g, false).starters); };
  var gap = function () {
    var s = groups.map(scoreOf);
    return Math.max.apply(null, s) - Math.min.apply(null, s);
  };
  for (var pass = 0; pass < 30; pass++) {
    var current = gap();
    var improved = false;
    for (var a = 0; a < count && !improved; a++) {
      for (var b = a + 1; b < count && !improved; b++) {
        for (var x = 0; x < groups[a].length && !improved; x++) {
          for (var y = 0; y < groups[b].length && !improved; y++) {
            var px = groups[a][x];
            var py = groups[b][y];
            groups[a][x] = py; groups[b][y] = px;
            if (gap() < current - 0.001) { improved = true; } else { groups[a][x] = px; groups[b][y] = py; }
          }
        }
      }
    }
    if (!improved) break;
  }
  UNPLACED = [];
  return groups.map(function (g) {
    var l = lineup([], g, false);
    return { starters: l.starters, subs: benchOrder(l.starters, l.bench), squad: '', fixed: [] };
  });
}

function bestCategory (p) {
  var best = null;
  DATA.categories.forEach(function (c) { if (!best || p.know[c] > p.know[best]) best = c; });
  return best;
}

// the same three things for every player on a team card. A best category
// needs two rounds of games: before that a player's mix of categories is the
// team's average, not theirs.
function playerCells (p) {
  return '<td class="small text-nowrap">' + (p.rating != null ? '&#9733; ' + p.rating + '/10' : '<span class="text-secondary">N/A</span>') + '</td>' +
    '<td class="small text-secondary num">' + p.games + '</td>' +
    '<td class="small text-secondary">' + (p.heard >= 32 ? esc(bestCategory(p)) : '<span title="Under two rounds of games">&ndash;</span>') + '</td>';
}

function renderPool () {
  var names = CANDIDATES.map(function (p) { return p.name; });
  Object.keys(AVAILABLE).forEach(function (n) { if (names.indexOf(n) === -1) delete AVAILABLE[n]; });
  CANDIDATES.forEach(function (p) { if (!(p.name in AVAILABLE)) AVAILABLE[p.name] = true; });
  $('pool').innerHTML = CANDIDATES.map(function (p) {
    var title = p.games + ' games' + (p.rating != null ? ', past rating ' + p.rating + '/10, stats ' + Math.round(p.statsShare * 100) + '%' : '') +
      (p.permanent ? ', permanent on ' + p.squad : '');
    return '<label class="pick' + (p.heard < 32 && p.rating == null ? ' few' : '') + '" title="' + esc(title) + '">' +
      '<input type="checkbox" class="avail" value="' + esc(p.name) + '"' + (AVAILABLE[p.name] ? ' checked' : '') + '>' +
      esc(p.name) + (p.rating != null ? ' <span class="text-secondary">&#9733;' + p.rating + '</span>' : '') + '</label>';
  }).join('') || '<p class="note">No games in these filters, and no one on the roster has a rating.</p>';
  Array.prototype.forEach.call(document.querySelectorAll('.avail'), function (box) {
    box.onchange = function () { AVAILABLE[box.value] = box.checked; fillTeamCount(); };
  });
  fillTeamCount();
}

function availablePlayers () {
  return CANDIDATES.filter(function (p) { return AVAILABLE[p.name]; });
}

function fillTeamCount () {
  var n = availablePlayers().length;
  var max = Math.max(1, Math.floor(n / 5));
  var keep = Number($('teamCount').value) || 2;
  var h = '';
  for (var i = 1; i <= max; i++) h += '<option' + (i === Math.min(keep, max) ? ' selected' : '') + '>' + i + '</option>';
  $('teamCount').innerHTML = h;
}

$('selAll').onclick = function (e) { e.preventDefault(); CANDIDATES.forEach(function (p) { AVAILABLE[p.name] = true; }); renderPool(); };
$('selNone').onclick = function (e) { e.preventDefault(); CANDIDATES.forEach(function (p) { AVAILABLE[p.name] = false; }); renderPool(); };

try { var savedRounds = localStorage.getItem(EQUAL_ROUNDS_KEY); if (savedRounds) $('equalRounds').value = savedRounds; } catch (e) {}
$('equalRounds').onchange = function () {
  try { localStorage.setItem(EQUAL_ROUNDS_KEY, String(equalRounds())); } catch (e) {}
  if (!DATA) return;
  buildCandidates();
  renderPool();
  if (TEAMS.length) $('build').click();
};
$('firstOverall').onchange = function () { if (TEAMS.length) $('build').click(); };
// squads and permanent players only mean something when making the real teams
$('mode').onchange = function () {
  $('firstOverallLabel').classList.toggle('d-none', $('mode').value === 'even');
};

$('build').onclick = function () {
  var players = availablePlayers();
  var count = Number($('teamCount').value) || 1;
  if (!players.length) return;
  TEAMS = $('mode').value === 'even' ? buildEven(players, count) : buildStrongest(players, count);
  renderTeams();
};

function renderTeams () {
  $('assignRow').classList.toggle('d-none', !TEAMS.length);
  $('assignMsg').textContent = '';
  $('unplaced').textContent = UNPLACED.length ? 'Not placed, because their squad was not built: ' + UNPLACED.join('; ') + '.' : '';
  $('teams').innerHTML = TEAMS.map(function (t, i) {
    var knows = strength(t.starters);
    var h = '<div class="col-md-6"><div class="card h-100"><div class="card-body">' +
      '<div class="d-flex justify-content-between align-items-center gap-2 mb-2">' +
      '<select class="form-select form-select-sm w-auto tsquad" data-t="' + i + '">' +
      '<option value="">Team ' + (i + 1) + ' (no squad)</option>' +
      DATA.squads.map(function (s) {
        return '<option' + (s === t.squad ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('') + '</select>' +
      '<span class="fw-semibold text-nowrap">knows about ' + knows.toFixed(1) + ' of 16</span></div>' +
      '<table class="table table-sm mb-2"><thead><tr><th class="small">Player</th><th class="small">Past rating</th>' +
      '<th class="small num">Games</th><th class="small">Best at</th></tr></thead><tbody>';
    var row = function (p, sub) {
      var tags = (sub ? ' <span class="small">(sub)</span>' : '') +
        (t.fixed.indexOf(p) !== -1 ? ' <span class="small text-secondary">permanent</span>' : '');
      return '<tr><td' + (sub ? ' class="text-secondary"' : '') + '>' + esc(p.name) + tags + '</td>' + playerCells(p) + '</tr>';
    };
    t.starters.forEach(function (p) { h += row(p, false); });
    t.subs.forEach(function (p) { h += row(p, true); });
    h += '</tbody></table>';
    DATA.categories.forEach(function (c) {
      var miss = 1;
      t.starters.forEach(function (p) { miss *= 1 - (p.know[c] || 0); });
      var cover = 1 - miss;
      var low = cover < 0.5;
      var lead = t.starters.concat(t.subs).slice().sort(function (a, b) { return b.know[c] - a.know[c]; })[0];
      h += '<div class="d-flex align-items-center gap-2 small mb-1"><span style="width:7.5rem">' + esc(c) + '</span>' +
        '<div class="bar flex-grow-1' + (low ? ' low' : '') + '"><span style="width:' + Math.round(cover * 100) + '%"></span></div>' +
        '<span class="num" style="width:2.5rem">' + Math.round(cover * 100) + '%</span></div>' +
        (low && lead ? '<div class="small text-secondary mb-1" style="margin-left:7.9rem">study: ' + esc(lead.name) + '</div>' : '');
    });
    return h + '</div></div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.tsquad'), function (sel) {
    sel.onchange = function () { TEAMS[Number(sel.getAttribute('data-t'))].squad = sel.value; };
  });
}

$('assign').onclick = function () {
  var assignments = [];
  TEAMS.forEach(function (t) {
    if (!t.squad) return;
    t.starters.concat(t.subs).forEach(function (p) { assignments.push({ name: p.name, squad: t.squad }); });
  });
  if (!assignments.length) { $('assignMsg').textContent = 'Pick a squad for at least one team first.'; return; }
  if (!confirm('Set the squad on the roster for these ' + assignments.length + ' players?')) return;
  postJson('/kshsaa-stats/roster/assign', { assignments: assignments }).then(function (res) {
    $('assignMsg').innerHTML = res.ok
      ? '<span class="text-success">Done. Squads are updated on the roster.</span>'
      : '<span class="text-danger">' + esc(res.d.error || 'could not save') + '</span>';
  });
};

// ---------- player focus ----------

function drillLevel (p) {
  if (p.squad && p.squad.toLowerCase().indexOf('varsity') === 0) return 'varsity';
  return FILTER.level === 'varsity' || FILTER.level === 'beginner' ? FILTER.level : 'jv';
}

function practiceLink (p) {
  return location.origin + '/kshsaa-round?drill=' + encodeURIComponent(p.weak[0]) + '&level=' + drillLevel(p);
}

function emailOf (name) {
  var hit = DATA.roster.filter(function (r) { return r.name.toLowerCase() === name.toLowerCase(); })[0];
  return hit ? hit.email : null;
}

function message (p) {
  var first = p.name.split(' ')[0];
  var lines = ['Hi ' + first + '!'];
  if (p.strong.length) lines.push('You have been great on ' + list(p.strong) + '.');
  if (p.weak.length) {
    lines.push('One thing to work on: ' + p.weak[0] + '. Here is a practice set for it: ' + practiceLink(p));
  }
  p.habits.forEach(function (h) { lines.push(HABITS[h][1]); });
  if (lines.length === 1) lines.push('Nice work at practice. Keep it up!');
  return lines.join(' ');
}

function renderFocus () {
  var rows = DATA.players.slice().sort(function (a, b) {
    var fa = a.weak.length + a.habits.length;
    var fb = b.weak.length + b.habits.length;
    return fb - fa || a.name.localeCompare(b.name);
  });
  $('focus').innerHTML = rows.map(function (p, i) {
    var few = p.heard < 32;
    var trend = !p.trend || !p.trend.change
      ? '<span class="text-secondary">' + (p.trend ? 'steady' : '-') + '</span>'
      : '<span class="' + (p.trend.change > 0 ? 'up' : 'down') + '" title="points per question, ' +
        esc(p.trend.from) + ' to ' + esc(p.trend.to) + '">' + (p.trend.change > 0 ? '&#9650; +' : '&#9660; ') +
        p.trend.change + '</span>';
    return '<tr><td>' + esc(p.name) + (p.squad ? '<div class="small text-secondary">' + esc(p.squad) + '</div>' : '') + '</td>' +
      '<td class="num">' + p.games + '</td><td class="num">' + (p.ppq == null ? '-' : p.ppq) + '</td><td class="text-nowrap">' + trend + '</td>' +
      (few
        ? '<td colspan="3" class="small text-secondary">Only ' + p.games + ' game' + (p.games === 1 ? '' : 's') + ' &mdash; too early to tell</td>'
        : '<td>' + p.strong.map(function (c) { return '<span class="chip chip-good">' + esc(c) + '</span>'; }).join('') + '</td>' +
          '<td>' + p.weak.map(function (c) { return '<span class="chip chip-bad">' + esc(c) + '</span>'; }).join('') + '</td>' +
          '<td>' + p.habits.map(function (h) { return '<span class="chip chip-habit">' + HABITS[h][0] + '</span>'; }).join('') + '</td>') +
      '<td class="text-end"><button type="button" class="btn btn-sm btn-link p-0 draft" data-i="' + i + '">message</button></td></tr>' +
      '<tr class="d-none" id="msg' + i + '"><td colspan="8"><textarea class="form-control msg mb-1" rows="3"></textarea>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary copy" data-i="' + i + '">Copy</button> ' +
      (emailOf(p.name)
        ? '<button type="button" class="btn btn-sm btn-outline-primary mail" data-i="' + i + '">Email ' + esc(emailOf(p.name)) + '</button> '
        : '<span class="small text-secondary">No email on the roster for ' + esc(p.name.split(' ')[0]) + '. Add one on the Roster tab to email from here.</span> ') +
      '<span class="small text-success copied"></span></td></tr>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.draft'), function (btn) {
    btn.onclick = function () {
      var i = Number(btn.getAttribute('data-i'));
      var row = $('msg' + i);
      if (row.classList.contains('d-none')) row.querySelector('textarea').value = message(rows[i]);
      row.classList.toggle('d-none');
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('.copy'), function (btn) {
    btn.onclick = function () {
      var row = $('msg' + btn.getAttribute('data-i'));
      var text = row.querySelector('textarea');
      var done = function () { row.querySelector('.copied').textContent = 'copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(text.value).then(done, function () { text.select(); });
      else { text.select(); document.execCommand('copy'); done(); }
    };
  });
  // opens the viewer's own email app with the message as edited above
  Array.prototype.forEach.call(document.querySelectorAll('.mail'), function (btn) {
    btn.onclick = function () {
      var i = Number(btn.getAttribute('data-i'));
      var body = $('msg' + i).querySelector('textarea').value;
      window.location.href = 'mailto:' + emailOf(rows[i].name) + '?subject=' + encodeURIComponent('Scholars Bowl practice') +
        '&body=' + encodeURIComponent(body);
    };
  });
}

// A sheet to have in hand at practice: everyone in the current filters, by
// squad, with what to say to them and room for notes.
function printFocus () {
  var squadRank = function (p) {
    var at = p.squad ? DATA.squads.indexOf(p.squad) : -1;
    return at === -1 ? DATA.squads.length : at;
  };
  var rows = DATA.players.slice().sort(function (a, b) {
    return squadRank(a) - squadRank(b) || a.name.localeCompare(b.name);
  });
  var month = $('fMonth').options[$('fMonth').selectedIndex].text;
  var level = $('fLevel').options[$('fLevel').selectedIndex].text;
  $('printSheet').innerHTML = '<h1>Player focus</h1><p>' + esc(month) + ' &middot; ' + esc(level) +
    ' &middot; printed ' + new Date().toLocaleDateString() + '</p>' +
    '<table><thead><tr><th style="width:24%">Player</th><th>Strong</th><th>Work on</th><th>Habits</th><th style="width:24%">Notes</th></tr></thead><tbody>' +
    rows.map(function (p) {
      var who = '<strong>' + esc(p.name) + '</strong><div class="sub">' + (p.squad ? esc(p.squad) + ' &middot; ' : '') +
        p.games + ' games &middot; ' + (p.ppq == null ? '-' : p.ppq) + ' pts/q</div>';
      if (p.heard < 32) return '<tr><td>' + who + '</td><td colspan="3">Too early to tell</td><td></td></tr>';
      return '<tr><td>' + who + '</td><td>' + esc(p.strong.join(', ')) + '</td><td>' + esc(p.weak.join(', ')) + '</td>' +
        '<td>' + p.habits.map(function (h) { return HABITS[h][0]; }).join(', ') + '</td><td></td></tr>';
    }).join('') + '</tbody></table>';
  document.body.classList.add('printing-focus');
  window.print();
}
window.addEventListener('afterprint', function () { document.body.classList.remove('printing-focus'); });
$('printFocus').onclick = printFocus;

// ---------- question difficulty ----------

function levelName (key) {
  var hit = DATA.levels.filter(function (l) { return l.key === key; })[0];
  return hit ? hit.label : 'Untagged';
}

function renderDifficulty () {
  var rows = DATA.questions.rows;
  $('difficulty').innerHTML = rows.length
    ? rows.map(function (r) {
      return '<tr><td>' + esc(levelName(r.level)) + '</td><td>' + esc(SOURCES[r.source] || r.source) + '</td>' +
        '<td class="num">' + r.read + '</td><td class="num">' + r.answered + '%</td><td class="num">' + r.negged + '%</td>' +
        '<td class="num">' + (r.buzzPoint == null ? '-' : r.buzzPoint.toFixed(2)) + '</td>' +
        '<td class="num">' + (r.spread == null ? '-' : r.spread.toFixed(2)) + '</td></tr>';
    }).join('')
    : '<tr><td colspan="7" class="text-secondary small">No games in these filters recorded their questions yet.</td></tr>';
  var dead = DATA.questions.dead;
  $('dead').innerHTML = dead.length
    ? '<h2>Questions nobody answered</h2><div class="card"><div class="card-body p-0"><div class="table-responsive">' +
      '<table class="table table-sm align-middle mb-0"><thead><tr><th>Question</th><th>Answer</th><th>From</th>' +
      '<th class="num">Read</th></tr></thead><tbody>' +
      dead.map(function (q) {
        var text = String(q.question || '(question no longer in the database)');
        return '<tr><td class="small">' + esc(text.length > 160 ? text.slice(0, 160) + '...' : text) + '</td>' +
          '<td class="small">' + esc(q.answer || '') + '</td><td class="small text-secondary">' + esc(SOURCES[q.source] || '') + '</td>' +
          '<td class="num">' + q.read + '</td></tr>';
      }).join('') + '</tbody></table></div></div></div>'
    : '';
}
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
