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

const router = Router();

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Read a round</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
 #modaq{margin-top:1rem}.setup{max-width:820px;margin:0 auto}
 .kshsaa-bar{background:#eef1f7;border-bottom:1px solid #d9e0ec}
 .kshsaa-bar a{color:#4a5b7d;text-decoration:none;margin:0 .85rem;font-size:.9rem}
 .kshsaa-bar a:hover{color:#1f3864;text-decoration:underline}
 .kshsaa-bar a.active{color:#1f3864;font-weight:600}
</style>
</head><body>

<div class="kshsaa-bar py-2 mb-3">
  <div class="container text-center" style="max-width:1100px">
    <a href="/kshsaa-play" class="active">Read a round</a>
    <a href="/kshsaa-round">Download packet</a>
    <a href="/kshsaa-stats">Practice stats</a>
  </div>
</div>

<div class="container-fluid pb-3">
  <div id="gate" class="setup d-none">
    <h1 class="h4">Read a round</h1>
    <p class="text-secondary small">Log in with the team password so player names autocomplete
    and the game can save itself to your stats when it ends.</p>
    <div class="card" style="max-width:420px"><div class="card-body">
      <label class="form-label">Team password</label>
      <input type="password" class="form-control mb-2" id="gatePw">
      <button class="btn btn-primary" id="gateBtn">Enter</button>
      <div class="small text-danger mt-2" id="gateErr"></div>
    </div></div>
  </div>

  <div id="setup" class="setup d-none">
    <h1 class="h4">Read a round</h1>
    <p class="text-secondary small mb-3">Generates a fresh randomized 16-question round
    (1 foreign language, 3 language arts, 3 science &amp; health, 3 social science, 3 math,
    2 fine arts, 1 year in review) and opens it in MODAQ with KSHSAA scoring already set:
    10 points per tossup, no powers, no bonuses, &minus;5 on a wrong interruption.</p>

    <datalist id="knownPlayers"></datalist>

    <div class="mb-3">
      <label class="form-label fw-semibold">Practice label</label>
      <input class="form-control" id="label" placeholder="Tuesday practice, game 2">
      <div class="form-text">Saved with the stats so you can find this game later.</div>
    </div>

    <div class="row g-4">
      <div class="col-md-6">
        <label class="form-label fw-semibold">Team 1</label>
        <input class="form-control mb-2" id="t1" value="Team 1">
        <div id="p1"></div>
        <button class="btn btn-sm btn-outline-secondary mt-1" data-add="p1">+ Add player</button>
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">Team 2</label>
        <input class="form-control mb-2" id="t2" value="Team 2">
        <div id="p2"></div>
        <button class="btn btn-sm btn-outline-secondary mt-1" data-add="p2">+ Add player</button>
      </div>
    </div>
    <div class="form-text mt-1">Start typing a name and pick the suggestion if the player already
    has stats &mdash; spelling has to match for their history to line up.</div>

    <div class="form-check mt-3">
      <input class="form-check-input" type="checkbox" id="conv">
      <label class="form-check-label small" for="conv">Include converted quizbowl questions (~Varsity difficulty)</label>
    </div>

    <div id="nameCheck" class="alert alert-warning mt-3 d-none"></div>

    <button class="btn btn-primary mt-3" id="go">Generate round &amp; start reading</button>
    <span class="ms-2 small text-secondary" id="status"></span>

    <p class="small text-secondary mt-3 mb-0">When the game ends, click &ldquo;Save to team stats&rdquo; in the
    reader&rsquo;s menu. On the KSHSAA neg rule: MODAQ applies &minus;5 to any wrong interruption, but per the
    manual a <em>second</em> team that interrupts and misses takes no penalty &mdash; don&rsquo;t record the neg then.</p>
    <p class="small mt-2"><a href="/kshsaa-round">Prefer a file to download instead?</a></p>
  </div>

  <div id="modaq"></div>
</div>

<script type="module">
const $ = id => document.getElementById(id);
const REACT = 'https://esm.sh/react@18.3.1';
const REACTDOM = 'https://esm.sh/react-dom@18.3.1/client';
const MODAQ = 'https://esm.sh/modaq@1.41.1?deps=react@18.3.1,react-dom@18.3.1';

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

let KNOWN = [];

function renumber (boxId) {
  Array.from($(boxId).querySelectorAll('.pname')).forEach((input, i) => {
    input.placeholder = 'Player ' + (i + 1);
  });
}

function addPlayerBox (boxId) {
  const wrap = document.createElement('div');
  wrap.className = 'input-group input-group-sm mb-1';

  const input = document.createElement('input');
  input.className = 'form-control pname';
  input.setAttribute('list', 'knownPlayers');
  input.placeholder = 'Player ' + ($(boxId).querySelectorAll('.pname').length + 1);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-outline-secondary';
  remove.title = 'Remove this player';
  remove.textContent = '\\u00d7';
  remove.onclick = () => {
    if ($(boxId).querySelectorAll('.pname').length <= 1) { input.value = ''; return; }
    wrap.remove();
    renumber(boxId);
  };

  wrap.appendChild(input);
  wrap.appendChild(remove);
  $(boxId).appendChild(wrap);
  return input;
}

document.querySelectorAll('[data-add]').forEach(btn => {
  btn.onclick = () => addPlayerBox(btn.getAttribute('data-add')).focus();
});

// login gate: names must be loaded before a round starts, so duplicates can't slip in
function startApp () {
  $('gate').classList.add('d-none');
  $('setup').classList.remove('d-none');
  for (const box of ['p1', 'p2']) {
    if (!$(box).querySelectorAll('.pname').length) {
      for (let i = 0; i < 5; i++) addPlayerBox(box);
    }
  }
  fetch('/kshsaa-stats/names').then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.names) return;
    KNOWN = d.names;
    $('knownPlayers').innerHTML = KNOWN.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '">').join('');
  }).catch(() => {});
}

fetch('/kshsaa-stats/me').then(r => r.json()).then(d => {
  if (d.authed) startApp();
  else $('gate').classList.remove('d-none');
});

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
    return lev(kk, n) <= 2 || kk.startsWith(n) || n.startsWith(kk);
  }).slice(0, 4);
}

function nameInputs () {
  return [
    ...Array.from($('p1').querySelectorAll('.pname')).map(i => ({ input: i, team: $('t1').value.trim() || 'Team 1' })),
    ...Array.from($('p2').querySelectorAll('.pname')).map(i => ({ input: i, team: $('t2').value.trim() || 'Team 2' }))
  ].filter(e => e.input.value.trim());
}

// returns players array, or null if the moderator still has names to resolve
function validatedPlayers () {
  const warn = $('nameCheck');
  const entries = nameInputs();

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
      warn.innerHTML = '<strong>' + e.input.value + '</strong> is entered twice. Each player can only be on one team, once.';
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
      h += '<div class="row g-2 align-items-center mb-1"><div class="col-sm-4"><code>' + typed + '</code></div>' +
        '<div class="col-sm-8"><select class="form-select form-select-sm resolve" data-idx="' + idx + '">';
      sugg.forEach(s => { h += '<option value="' + s.replace(/"/g, '&quot;') + '">use existing: ' + s + '</option>'; });
      h += '<option value="__new__">add "' + typed + '" as a new player</option></select></div></div>';
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
  const players = entries.map((e, i) => ({ name: e.input.value.trim(), teamName: e.team, isStarter: true }));
  // starters: first four listed per team
  const perTeam = {};
  players.forEach(p => {
    perTeam[p.teamName] = (perTeam[p.teamName] || 0) + 1;
    p.isStarter = perTeam[p.teamName] <= 4;
  });
  return players;
}

$('go').onclick = async () => {
  const players = validatedPlayers();
  if (!players) return;
  if (players.length < 2) { $('status').textContent = 'add at least one player per team'; return; }

  $('go').disabled = true;
  $('status').textContent = 'building round...';
  try {
    const res = await fetch('/kshsaa-round/generate?converted=' + ($('conv').checked ? '1' : '0'));
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const packet = {
      tossups: data.round.map(q => ({ question: q.question, answer: q.answer })),
      bonuses: []
    };
    const label = $('label').value.trim() || 'Practice';

    $('status').textContent = 'loading reader...';
    const [React, ReactDOM, Modaq] = await Promise.all([
      import(REACT), import(REACTDOM), import(MODAQ)
    ]);

    $('setup').style.display = 'none';
    ReactDOM.createRoot($('modaq')).render(
      React.createElement(Modaq.ModaqControl, {
        packet,
        players,
        gameFormat: KSHSAA_FORMAT,
        persistState: false,
        storeName: 'kshsaa-modaq',
        customExport: {
          label: 'Save to team stats',
          type: 'QBJ',
          // MODAQ reads the returned object, so always return {isError, message}
          onExport: async (match) => {
            const post = () => fetch('/kshsaa-stats/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ game: match, label })
            });
            try {
              let r = await post();
              if (r.status === 401) {
                const pw = window.prompt('Team stats password (to save this game):');
                if (!pw) {
                  return { isError: true, message: 'Not saved. Click "Save to team stats" again when ready.' };
                }
                const login = await fetch('/kshsaa-stats/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: pw })
                });
                if (!login.ok) {
                  return { isError: true, message: 'Wrong password - nothing was saved. Click save again to retry.' };
                }
                r = await post();
              }
              const d = await r.json().catch(() => ({}));
              if (r.ok) {
                return { isError: false, message: 'Saved to team stats (' + (d.buzzes || 0) + ' buzzes recorded).' };
              }
              return { isError: true, message: 'Could not save: ' + (d.error || r.status) };
            } catch (e) {
              return { isError: true, message: 'Could not save: ' + e.message };
            }
          }
        }
      })
    );
  } catch (e) {
    $('status').innerHTML = '<span class="text-danger">error: ' + e.message +
      ' &mdash; <a href="/kshsaa-round">use the download page instead</a></span>';
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
