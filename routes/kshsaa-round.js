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
import { randomUUID } from 'crypto';
import { qbreader } from '../database/databases.js';
import { tossups } from '../database/qbreader/collections.js';
import mathTierOf, { MATH_TIERS } from '../server/kshsaa/math-tier.js';

const router = Router();

// One document per question that has been put in a round: { _id: tossup id as a
// string, lastUsed, count }. Round building reads it to avoid repeats.
const usage = qbreader.collection('kshsaa_question_usage');

// A World Language question is the same expression written in all three
// languages, so its text always names all three. 43 of the 653 questions tagged
// as World Language in the archive are actually Language Arts -- Emerson,
// Dickens, subjunctive mood -- and 8 real language questions are tagged as Fine
// Arts or Social Studies. Matching on the text as well as the tag keeps a
// literature question out of slot 1 and a translation out of the other slots,
// without waiting on the data being re-tagged.
const THREE_LANGUAGES = [
  { question: { $regex: 'FRENCH', $options: 'i' } },
  { question: { $regex: 'GERMAN', $options: 'i' } },
  { question: { $regex: 'SPANISH', $options: 'i' } }
];
const IS_LANGUAGE_QUESTION = { $and: THREE_LANGUAGES };
const NOT_A_LANGUAGE_QUESTION = { $nor: [{ $and: THREE_LANGUAGES }] };

// [label, count, filter] - official KSHSAA round shape, 16 questions
const DISTRIBUTION = [
  ['World Language', 1, {
    kshsaa_category: { $regex: 'foreign language|world language', $options: 'i' },
    ...IS_LANGUAGE_QUESTION
  }],
  ['Language Arts', 3, { category: 'Literature', ...NOT_A_LANGUAGE_QUESTION }],
  ['Science/Health', 3, { category: 'Science', alternate_subcategory: { $ne: 'Math' }, ...NOT_A_LANGUAGE_QUESTION }],
  ['Social Studies', 3, { category: 'Social Science', ...NOT_A_LANGUAGE_QUESTION }],
  ['Mathematics', 3, { alternate_subcategory: 'Math', ...NOT_A_LANGUAGE_QUESTION }],
  ['Fine Arts', 2, { category: 'Fine Arts', ...NOT_A_LANGUAGE_QUESTION }],
  ['Year in Review', 1, { category: 'Current Events', ...NOT_A_LANGUAGE_QUESTION }]
];

/** Category label of every slot in a full round, in reading order. */
export const CATEGORY_BY_QUESTION = DISTRIBUTION.flatMap(([label, count]) => Array(count).fill(label));
/** Category labels in reading order, deduplicated. */
export const CATEGORIES = DISTRIBUTION.map(([label]) => label);

// Every question these pages use was imported with kshsaaImport: true, and its
// set name says where it came from. Anything without one of these prefixes is
// a real KSHSAA question.
const SET_PREFIX = {
  converted: 'QB Converted',
  generated: 'SJA Generated',
  beginner: 'QB Beginner',
  current: 'QB Current Events'
};

/**
 * @param {string} [setName]
 * @returns {'kshsaa'|'converted'|'generated'|'beginner'|'current'}
 */
function sourceOf (setName) {
  const name = String(setName || '');
  return Object.keys(SET_PREFIX).find(key => name.startsWith(SET_PREFIX[key])) || 'kshsaa';
}

// Question pools for each level, most preferred first. A later pool is used
// only once the earlier ones have nothing unread left in a category -- the
// converted quizbowl sets have no World Language or math at all, and the
// Beginner set has no Year in Review, so those slots always come from further
// down the list. The current-events import (import-current-events.js) holds
// nothing but recent Year in Review questions, so every level reads it first.
export const LEVELS = {
  varsity: { label: 'Varsity', pools: [['kshsaa', 'converted', 'current']], math: ['basic', 'intermediate', 'advanced'] },
  jv: { label: 'JV', pools: [['converted', 'current'], ['kshsaa']], math: ['basic', 'intermediate'] },
  beginner: { label: 'Beginner', pools: [['beginner', 'current'], ['converted'], ['kshsaa']], math: ['basic'] }
};

// Current events go stale: Year in Review uses only questions written this year
// or last year, so the cutoff moves forward on its own every January.
const yearInReviewFrom = () => new Date().getFullYear() - 1;

/**
 * The year a question was written for. A season name ("24-25 Regional",
 * "2024-25 State") gives its spring year, when the packets were played;
 * otherwise the latest year in the set name. Imported sets store a placeholder
 * year when their name has none, so the stored year is trusted only for
 * question-bank questions, which record the year they were written.
 * @param {{set?: {name?: string, year?: number}, sjaGenerated?: boolean}} doc
 * @returns {?number}
 */
function questionYear (doc) {
  const name = String(doc.set?.name || '');
  const season = name.match(/\b(?:20)?(\d{2})\s*[-\u2013]\s*(?:20)?(\d{2})\b/);
  if (season && (Number(season[1]) + 1) % 100 === Number(season[2])) { return 2000 + Number(season[2]); }
  const years = name.match(/\b20\d{2}\b/g);
  if (years) { return Math.max(...years.map(Number)); }
  return doc.sjaGenerated ? doc.set?.year ?? null : null;
}

// the math dropdown: 'auto' follows the level
const MATH_CHOICES = {
  basic: ['basic'],
  'basic-intermediate': ['basic', 'intermediate'],
  intermediate: ['intermediate'],
  advanced: ['advanced'],
  any: MATH_TIERS
};

/**
 * Limits a query to the sets the given sources live in.
 * @param {string[]} sources
 * @returns {object} a filter on set.name, or {} for everything
 */
function setFilterFor (sources) {
  if (sources.includes('kshsaa')) {
    const unwanted = Object.keys(SET_PREFIX).filter(s => !sources.includes(s)).map(s => SET_PREFIX[s]);
    return unwanted.length ? { 'set.name': { $not: new RegExp('^(' + unwanted.join('|') + ')') } } : {};
  }
  return { 'set.name': { $regex: '^(' + sources.map(s => SET_PREFIX[s]).join('|') + ')' } };
}

function shuffle (list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Picks questions that have never been read if it can, walking the pools in
 * order of preference, and otherwise the ones read longest ago. That keeps any
 * question from coming back until everything else it competes with has been
 * used -- the longest gap the pool allows, rather than a fixed number of rounds.
 * @param {object[]} docs - candidates, already filtered to this slot
 * @param {number} count
 * @param {string[][]} pools - sources, most preferred first
 * @param {Map<string, Date>} lastUsed
 * @returns {{chosen: object[], repeats: number}}
 */
function pickLeastUsed (docs, count, pools, lastUsed) {
  const chosen = [];
  for (const sources of pools) {
    for (const d of shuffle(docs.filter(d => sources.includes(sourceOf(d.set?.name))))) {
      if (chosen.length >= count) { break; }
      if (!lastUsed.has(String(d._id))) { chosen.push(d); }
    }
  }
  const unread = chosen.length;
  if (chosen.length < count) {
    const read = shuffle(docs.filter(d => lastUsed.has(String(d._id))))
      .sort((a, b) => lastUsed.get(String(a._id)) - lastUsed.get(String(b._id)));
    chosen.push(...read.slice(0, count - chosen.length));
  }
  return { chosen, repeats: chosen.length - unread };
}

// Two tryout rooms generating at the same moment would otherwise both see the
// same questions as unread. Builds are quick, so run them one at a time.
let lastBuild = Promise.resolve();
function oneAtATime (task) {
  const run = lastBuild.then(task, task);
  lastBuild = run.catch(() => {});
  return run;
}

/**
 * @param {object} options
 * @param {keyof LEVELS} options.level
 * @param {string} options.math - a key of MATH_CHOICES, or 'auto'
 * @param {boolean} options.includeGenerated - whether to draw on the SJA Generated sets too
 * @returns {Promise<{round: object[], short: string[], notes: string[]}>} the
 * round, a label for each category the archive could not fill, and anything
 * else worth telling the moderator
 */
async function buildRound ({ level, math, includeGenerated }) {
  const { pools: basePools } = LEVELS[level];
  const mathTiers = MATH_CHOICES[math] || LEVELS[level].math;
  // generated questions sit alongside whatever each pool already holds
  const pools = includeGenerated ? basePools.map(p => p.concat('generated')) : basePools;
  const setFilter = setFilterFor([...new Set(pools.flat())]);

  const [candidates, usageDocs] = await Promise.all([
    Promise.all(DISTRIBUTION.map(([label, , filter]) => tossups
      .find({ kshsaaImport: true, ...filter, ...setFilter }, {
        projection: label === 'Mathematics'
          ? { 'set.name': 1, question: 1 }
          : label === 'Year in Review' ? { set: 1, sjaGenerated: 1 } : { 'set.name': 1 }
      })
      .toArray())),
    usage.find({}).toArray()
  ]);
  const lastUsed = new Map(usageDocs.map(u => [String(u._id), u.lastUsed]));

  // The filters can overlap (a foreign-language question may also be tagged
  // Literature), so drop anything an earlier slot already took.
  const picked = new Set();
  const plan = [];
  const recentFrom = yearInReviewFrom();
  const short = [];
  const notes = [];
  DISTRIBUTION.forEach(([label, count], i) => {
    const docs = candidates[i].filter(d => !picked.has(String(d._id)) &&
      (label !== 'Year in Review' || questionYear(d) >= recentFrom));
    let result;
    if (label === 'Mathematics') {
      const inTier = new Set(docs.filter(d => mathTiers.includes(mathTierOf(d.question))));
      result = pickLeastUsed([...inTier], count, pools, lastUsed);
      if (result.chosen.length < count) {
        // a thin tier should not leave the round a question short
        const extra = pickLeastUsed(docs.filter(d => !inTier.has(d)), count - result.chosen.length, pools, lastUsed);
        notes.push('Mathematics: only ' + result.chosen.length + ' ' + mathTiers.join('/') +
          ' question(s) available, so ' + extra.chosen.length + ' came from another tier.');
        result = { chosen: result.chosen.concat(extra.chosen), repeats: result.repeats + extra.repeats };
      }
    } else {
      result = pickLeastUsed(docs, count, pools, lastUsed);
    }
    for (const d of result.chosen) {
      picked.add(String(d._id));
      plan.push({ id: d._id, label });
    }
    if (result.repeats) {
      const what = label === 'Mathematics' ? mathTiers.join('/') + ' math' : label;
      notes.push(label + ': ' + result.repeats + ' question(s) repeated - every other ' + what +
        ' question at this level has already been read.');
    }
    if (result.chosen.length < count) {
      const which = label === 'Year in Review' ? `${label} from ${recentFrom} on` : label;
      short.push(`${which} (${result.chosen.length} of ${count})`);
    }
  });

  if (level === 'beginner' && !candidates.some(list => list.some(d => sourceOf(d.set?.name) === 'beginner'))) {
    notes.push('No Beginner questions have been imported yet, so this round used JV questions. ' +
      'Run "node import-beginner.js" from the website folder to add them.');
  }

  const full = await tossups.find({ _id: { $in: plan.map(p => p.id) } }).toArray();
  const byId = new Map(full.map(d => [String(d._id), d]));
  const round = plan.map(({ id, label }) => {
    const d = byId.get(String(id));
    const secs = d.timed_seconds || (label === 'Mathematics' ? 30 : null);
    return {
      id: String(d._id),
      category: label,
      question: (secs ? `[${secs} sec] ` : '') + d.question,
      answer: d.answer,
      source: `${d.set?.name ?? '?'} ${d.packet?.name ?? ''}`.trim(),
      ...(label === 'Mathematics' ? { tier: mathTierOf(d.question) } : {})
    };
  });

  // counted as read the moment the round exists: a second room generating a
  // minute later must not get the same questions
  if (round.length) {
    const now = new Date();
    await usage.bulkWrite(round.map(q => ({
      updateOne: { filter: { _id: q.id }, update: { $set: { lastUsed: now }, $inc: { count: 1 } }, upsert: true }
    })));
  }
  return { round, short, notes };
}

router.get('/generate', async (req, res) => {
  const level = Object.hasOwn(LEVELS, req.query.level) ? req.query.level : 'varsity';
  const math = Object.hasOwn(MATH_CHOICES, req.query.math) ? req.query.math : 'auto';
  try {
    const { round, short, notes } = await oneAtATime(() =>
      buildRound({ level, math, includeGenerated: req.query.generated === '1' }));
    // identifies this round when its game is saved, so a second save of the
    // same game can be refused rather than counted twice
    res.json({ roundId: randomUUID(), level, round, short, notes });
  } catch (e) {
    console.error('kshsaa-round error', e);
    res.status(500).json({ error: String(e) });
  }
});

/**
 * The level and math controls, shared by this page and the reader so both
 * build rounds the same way. Read them with levelQuery() in the page script.
 * @returns {string} HTML
 */
export function levelControls () {
  return `
    <div class="mb-2">
      <div class="form-label fw-semibold mb-1">Level</div>
      <div class="btn-group" role="group" aria-label="Question level">
        ${Object.keys(LEVELS).map((key, i) => `
        <input type="radio" class="btn-check" name="level" id="level-${key}" value="${key}"${i ? '' : ' checked'}>
        <label class="btn btn-outline-primary btn-sm" for="level-${key}">${LEVELS[key].label}</label>`).join('')}
      </div>
    </div>
    <div class="mb-2">
      <label class="form-label fw-semibold mb-1" for="mathTier">Math</label>
      <select class="form-select form-select-sm" id="mathTier" style="max-width:26rem">
        <option value="auto">Match the level</option>
        <option value="basic">Basic &mdash; arithmetic, fractions, percents</option>
        <option value="basic-intermediate">Basic + intermediate</option>
        <option value="intermediate">Intermediate &mdash; Algebra I, geometry</option>
        <option value="advanced">Advanced &mdash; Algebra II through calculus</option>
        <option value="any">Any</option>
      </select>
    </div>
    <script>
    function levelQuery () {
      return 'level=' + document.querySelector('input[name="level"]:checked').value +
        '&math=' + document.getElementById('mathTier').value;
    }
    </script>`;
}

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download a packet - SJA Scholars Bowl</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<style>
 .kshsaa-bar{background:#eef1f7;border-bottom:1px solid #d9e0ec}
 .kshsaa-bar a{color:#4a5b7d;text-decoration:none;margin:0 .85rem;font-size:.9rem}
 .kshsaa-bar a:hover{color:#1f3864;text-decoration:underline}
 .kshsaa-bar a.active{color:#1f3864;font-weight:600}
 /* three columns so the section links stay centred on the page no matter how
    wide the "back to QBReader" link on the left happens to be */
 .kshsaa-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.25rem}
 .kshsaa-nav .kshsaa-links{grid-column:2;display:flex;flex-wrap:wrap;justify-content:center;gap:.35rem 0}
 .kshsaa-home{justify-self:start;margin-left:0 !important;white-space:nowrap}
 @media (max-width:900px){
   .kshsaa-nav{grid-template-columns:1fr;justify-items:center;gap:.35rem}
   .kshsaa-nav .kshsaa-links{grid-column:1}
 }
 @media print{.kshsaa-bar,.no-print{display:none}}
</style>
</head><body class="bg-light">
<div class="kshsaa-bar py-2 mb-3">
  <div class="container kshsaa-nav" style="max-width:900px">
    <a class="kshsaa-home" href="/">&larr; QBReader</a>
    <span class="kshsaa-links">
      <a href="/kshsaa-play">Read a round</a>
      <a href="/kshsaa-round" class="active">Download packet</a>
      <a href="/kshsaa-stats">Practice stats</a>
      <a href="/kshsaa-questions">Question bank</a>
      <a href="/kshsaa-spanish/">Spanish Practice</a>
    </span>
  </div>
</div>
<div class="container pb-4" style="max-width:900px">
  <h1 class="h4">Download a packet</h1>
  <p class="text-secondary">Builds a fresh, randomized 16-question round in official KSHSAA order
  (1 world language, 3 language arts, 3 science/health, 3 social studies, 3 math, 2 fine arts,
  1 year in review) drawn from the full question archive. A question is not used again until every
  other question it competes with has been, whichever page built the round.</p>

  <div class="card mb-3 no-print"><div class="card-body">
    ${levelControls()}
    <div class="form-check mb-3">
      <input class="form-check-input" type="checkbox" id="gen">
      <label class="form-check-label" for="gen">
        Include generated questions (<a href="/kshsaa-questions">question bank</a>)
      </label>
    </div>
    <button class="btn btn-primary" id="go">Generate a round</button>
    <button class="btn btn-outline-secondary" id="pdf" disabled>Download PDF</button>
    <button class="btn btn-outline-secondary" id="txt" disabled>Download text</button>
    <button class="btn btn-outline-secondary" id="dl" disabled>Download for MODAQ</button>
    <button class="btn btn-outline-secondary" id="pr" disabled>Print</button>
    <span class="ms-2 text-secondary" id="status"></span>
  </div></div>

  <div id="notes"></div>
  <div id="out"></div>

  <hr>
  <p class="small text-secondary mb-1"><strong>How to run the round:</strong> download the MODAQ file, open
  <a href="https://www.quizbowlreader.com" target="_blank" rel="noopener">quizbowlreader.com</a>, start a new game,
  and load the file as the packet. Scoring per the KSHSAA manual: 10 points for a correct answer, no bonuses;
  &minus;5 only for the first team's wrong answer on an interruption (a second-team interruption miss carries no penalty).
  Teams get 10 seconds to buzz, 30&ndash;120 on computation questions as marked.</p>
</div>

<script>
// surface any script error on the page itself, so problems are visible
// without opening the browser console
window.onerror = function (msg, src, line) {
  var s = document.getElementById('status');
  if (s) s.innerHTML = '<span class="text-danger">script error: ' + msg + ' (line ' + line + ')</span>';
  return false;
};
</script>
<script>
let current = null;
const $ = id => document.getElementById(id);
document.getElementById('status').textContent = 'ready';

$('go').onclick = async () => {
  $('status').textContent = 'building...';
  $('go').disabled = true;
  try {
    const r = await fetch('/kshsaa-round/generate?' + levelQuery() +
      '&generated=' + ($('gen').checked ? '1' : '0'));
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    current = data.round;
    render(current);
    $('dl').disabled = false;
    $('pr').disabled = false;
    $('pdf').disabled = false;
    $('txt').disabled = false;
    if (data.short && data.short.length) {
      $('status').innerHTML = '<span class="text-warning-emphasis">' + current.length +
        ' questions - the archive ran short on ' + escapeHtml(data.short.join(', ')) + '</span>';
    } else {
      $('status').textContent = current.length + ' questions';
    }
    $('notes').innerHTML = (data.notes || []).map(n =>
      '<div class="alert alert-warning py-2 small mb-2">' + escapeHtml(n) + '</div>').join('');
  } catch (e) {
    $('status').textContent = 'error: ' + e.message;
  }
  $('go').disabled = false;
};

function render (round) {
  const rows = round.map((q, i) =>
    '<tr><td class="text-secondary">' + (i + 1) + '</td>' +
    '<td class="small text-nowrap text-secondary">' + q.category +
    (q.tier ? '<div>(' + q.tier + ')</div>' : '') + '</td>' +
    '<td>' + escapeHtml(q.question) +
    '<div class="small text-success mt-1">ANSWER: ' + escapeHtml(q.answer) + '</div>' +
    '<div class="small text-secondary">' + escapeHtml(q.source) + '</div></td></tr>').join('');
  $('out').innerHTML =
    '<div class="card"><div class="card-body p-0"><div class="table-responsive">' +
    '<table class="table table-sm mb-0 align-top">' +
    '<thead><tr><th>#</th><th>Category</th><th>Question &amp; answer</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></div></div>';
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

function stamp () { return new Date().toISOString().slice(0, 10); }

$('txt').onclick = () => {
  const NL = String.fromCharCode(13, 10);
  let out = 'KSHSAA PRACTICE ROUND - ' + stamp() + NL + NL;
  current.forEach((q, i) => {
    out += (i + 1) + '. [' + q.category + '] ' + q.question + NL;
    out += '   ANSWER: ' + q.answer + NL + NL;
  });
  const blob = new Blob([out], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'KSHSAA round ' + stamp() + '.txt';
  a.click();
};

$('pdf').onclick = () => {
  if (!window.jspdf) { alert('PDF library did not load - use Print and choose "Save as PDF" instead.'); return; }
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
  const M = 54;
  const W = doc.internal.pageSize.getWidth() - M * 2;
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  doc.setFont('helvetica', 'bold').setFontSize(14);
  doc.text('KSHSAA practice round', M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(stamp() + '   -   10 points per correct answer, -5 on a wrong interruption', M, y + 14);
  y += 36;

  current.forEach((q, i) => {
    const qLines = doc.splitTextToSize((i + 1) + '. ' + q.question, W - 10);
    const aLines = doc.splitTextToSize('ANSWER: ' + q.answer, W - 24);
    const needed = 12 + qLines.length * 13 + aLines.length * 12 + 12;
    if (y + needed > H - M) { doc.addPage(); y = M; }

    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110);
    doc.text(q.category.toUpperCase(), M, y);
    y += 12;

    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(0);
    doc.text(qLines, M, y);
    y += qLines.length * 13 + 3;

    doc.setFont('helvetica', 'bold').setFontSize(10);
    doc.text(aLines, M + 14, y);
    y += aLines.length * 12 + 14;
  });

  doc.save('KSHSAA round ' + stamp() + '.pdf');
};
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
