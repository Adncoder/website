// Self-serve KSHSAA round generator page for your qbreader fork.
//
// INSTALL (2 steps):
//   1. Save this file as   routes/kshsaa-round.js   in your website folder.
//   2. In app.js, add these two lines (next to the other route imports/uses):
//        import kshsaaRoundRouter from './routes/kshsaa-round.js';
//        app.use('/kshsaa-round', kshsaaRoundRouter);
//
// Then anyone visits  <your-site>/kshsaa-round  , clicks a button, and gets a
// fresh randomized 16-question KSHSAA round: viewable answer key on screen and
// a MODAQ file to download. No terminal, no database access, no accounts.
//
// No `npm run build` needed - the page is plain HTML/JS served by this route.

import { Router } from 'express';
import { tossups } from '../database/qbreader/collections.js';

const router = Router();

// [label, count, filter] - official KSHSAA round shape, 16 questions
const DISTRIBUTION = [
  ['Foreign Language', 1, { $or: [
    { kshsaa_category: { $regex: 'foreign language|world language', $options: 'i' } },
    { question: { $regex: '\\b(FRENCH|GERMAN|SPANISH|LATIN)\\b' } }
  ] }],
  ['Language Arts', 3, { category: 'Literature' }],
  ['Science & Health', 3, { category: 'Science', alternate_subcategory: { $ne: 'Math' } }],
  ['Social Science', 3, { category: 'Social Science' }],
  ['Mathematics', 3, { alternate_subcategory: 'Math' }],
  ['Fine Arts', 2, { category: 'Fine Arts' }],
  ['Year in Review', 1, { category: 'Current Events' }]
];

async function buildRound (includeConverted) {
  const picked = [];
  const round = [];
  for (const [label, count, filter] of DISTRIBUTION) {
    const match = { kshsaaImport: true, ...filter, _id: { $nin: picked } };
    if (!includeConverted) {
      match['set.name'] = { $not: { $regex: '^QB Converted' } };
    }
    const docs = await tossups
      .aggregate([{ $match: match }, { $sample: { size: count } }])
      .toArray();
    for (const d of docs) {
      picked.push(d._id);
      const secs = d.timed_seconds || (label === 'Mathematics' ? 30 : null);
      round.push({
        category: label,
        question: (secs ? `[${secs} sec] ` : '') + d.question,
        answer: d.answer,
        source: `${d.set?.name ?? '?'} ${d.packet?.name ?? ''}`.trim()
      });
    }
  }
  return round;
}

router.get('/generate', async (req, res) => {
  try {
    const round = await buildRound(req.query.converted === '1');
    res.json({ round });
  } catch (e) {
    console.error('kshsaa-round error', e);
    res.status(500).json({ error: String(e) });
  }
});

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KSHSAA Round Generator</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
</head><body class="bg-light">
<div class="container py-4" style="max-width:900px">
  <h1 class="h3">KSHSAA round generator</h1>
  <p class="text-secondary">Builds a fresh, randomized 16-question round in official KSHSAA order
  (1 foreign language, 3 language arts, 3 science &amp; health, 3 social science, 3 math, 2 fine arts,
  1 year in review) drawn from the full question archive.</p>

  <div class="card mb-3"><div class="card-body">
    <div class="form-check mb-3">
      <input class="form-check-input" type="checkbox" id="conv">
      <label class="form-check-label" for="conv">
        Include converted quizbowl questions (bigger pool, slightly rougher wording)
      </label>
    </div>
    <button class="btn btn-primary" id="go">Generate a round</button>
    <button class="btn btn-outline-secondary" id="dl" disabled>Download for MODAQ</button>
    <button class="btn btn-outline-secondary" id="pr" disabled>Print answer key</button>
    <span class="ms-2 text-secondary" id="status"></span>
  </div></div>

  <div id="out"></div>

  <hr>
  <p class="small text-secondary mb-1"><strong>How to run the round:</strong> download the MODAQ file, open
  <a href="https://www.quizbowlreader.com/demo.html" target="_blank" rel="noopener">quizbowlreader.com</a>, start a new game,
  and load the file as the packet. Scoring per the KSHSAA manual: 10 points for a correct answer, no bonuses;
  &minus;5 only for the first team's wrong answer on an interruption (a second-team interruption miss carries no penalty).
  Teams get 10 seconds to buzz, 30&ndash;120 on computation questions as marked.</p>
</div>

<script>
let current = null;
const $ = id => document.getElementById(id);

$('go').onclick = async () => {
  $('status').textContent = 'building...';
  $('go').disabled = true;
  try {
    const r = await fetch('/kshsaa-round/generate?converted=' + ($('conv').checked ? '1' : '0'));
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    current = data.round;
    render(current);
    $('dl').disabled = false;
    $('pr').disabled = false;
    $('status').textContent = current.length + ' questions';
  } catch (e) {
    $('status').textContent = 'error: ' + e.message;
  }
  $('go').disabled = false;
};

function render (round) {
  const rows = round.map((q, i) =>
    '<tr><td class="text-secondary">' + (i + 1) + '</td>' +
    '<td class="small text-nowrap text-secondary">' + q.category + '</td>' +
    '<td>' + escapeHtml(q.question) +
    '<div class="small text-success mt-1">ANSWER: ' + escapeHtml(q.answer) + '</div>' +
    '<div class="small text-secondary">' + escapeHtml(q.source) + '</div></td></tr>').join('');
  $('out').innerHTML =
    '<div class="card"><div class="card-body p-0"><table class="table table-sm mb-0 align-top">' +
    '<thead><tr><th>#</th><th>Category</th><th>Question &amp; answer</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div>';
}

function escapeHtml (s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

$('dl').onclick = () => {
  const packet = { tossups: current.map(q => ({ question: q.question, answer: q.answer })), bonuses: [] };
  const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'KSHSAA round ' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
};

$('pr').onclick = () => window.print();
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.type('html').send(PAGE);
});

export default router;
