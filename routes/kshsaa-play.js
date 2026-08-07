// One-click KSHSAA round reader: generates a fresh round and opens it inside
// MODAQ with KSHSAA scoring preloaded. No packet files, no format setup.
//
// INSTALL (same pattern as kshsaa-round.js):
//   1. Save as   routes/kshsaa-play.js
//   2. In app.js add, next to the other route lines:
//        import kshsaaPlayRouter from './routes/kshsaa-play.js';
//        app.use('/kshsaa-play', kshsaaPlayRouter);
//      (must be ABOVE app.use(indexRouter))
//
// Requires routes/kshsaa-round.js to be installed too - this page calls its
// /kshsaa-round/generate endpoint for questions.
//
// MODAQ loads from a CDN, so there is NO npm install and NO build step.

import { Router } from 'express';

const router = Router();

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Read a KSHSAA round</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<style>#modaq{margin-top:1rem}.setup{max-width:760px}</style>
</head><body>
<div class="container-fluid py-3">
  <div id="setup" class="setup">
    <h1 class="h4">Read a KSHSAA round</h1>
    <p class="text-secondary small mb-3">Generates a fresh randomized 16-question round
    (1 foreign language, 3 language arts, 3 science &amp; health, 3 social science, 3 math,
    2 fine arts, 1 year in review) and opens it in MODAQ with KSHSAA scoring already set:
    10 points per tossup, no powers, no bonuses, &minus;5 on a wrong interruption.</p>

    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold">Team 1 name</label>
        <input class="form-control mb-2" id="t1" value="Team 1">
        <label class="form-label small text-secondary">Players (one per line)</label>
        <textarea class="form-control" id="p1" rows="5">Player 1
Player 2
Player 3
Player 4
Player 5</textarea>
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">Team 2 name</label>
        <input class="form-control mb-2" id="t2" value="Team 2">
        <label class="form-label small text-secondary">Players (one per line)</label>
        <textarea class="form-control" id="p2" rows="5">Player 1
Player 2
Player 3
Player 4
Player 5</textarea>
      </div>
    </div>

    <div class="form-check mt-3">
      <input class="form-check-input" type="checkbox" id="conv">
      <label class="form-check-label small" for="conv">Include converted quizbowl questions (bigger pool)</label>
    </div>

    <button class="btn btn-primary mt-3" id="go">Generate round &amp; start reading</button>
    <span class="ms-2 small text-secondary" id="status"></span>

    <p class="small text-secondary mt-3 mb-0">Note on the KSHSAA neg rule: MODAQ applies &minus;5 to any wrong
    interruption. Per the manual, a <em>second</em> team that interrupts and misses takes no penalty &mdash;
    when that happens, mark the buzz wrong but don't record the neg.</p>
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

function playersFrom (boxId, teamName) {
  return $(boxId).value.split('\\n').map(s => s.trim()).filter(Boolean)
    .map((name, i) => ({ name, teamName, isStarter: i < 4 }));
}

$('go').onclick = async () => {
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
    const players = [
      ...playersFrom('p1', $('t1').value.trim() || 'Team 1'),
      ...playersFrom('p2', $('t2').value.trim() || 'Team 2')
    ];

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
        storeName: 'kshsaa-modaq'
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
  res.type('html').send(PAGE);
});

export default router;
