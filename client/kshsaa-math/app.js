/* global localStorage, Blob, FileReader, Element */
// The math practice page. Everything runs in the browser and nothing is sent
// anywhere: drills from skills.js, the Pascal's triangle trainer, flash
// anzan, speed tricks, the formula sheet and its flashcards, missed problems,
// and progress, which progress.js keeps in this browser.

import { ANZAN_COUNTS, ANZAN_DIGITS, ANZAN_SECONDS, anzanRun } from './anzan.js';
import { answerTex, check } from './exact.js';
import { FORMULAS, FORMULA_TOPICS } from './formulas.js';
import { cleanRecord, loadRecord, saveRecord } from './progress.js';
import { makeRng } from './rng.js';
import { PHYSICS_TOPICS, SKILLS, TOPICS, TRICKS, skillById } from './skills.js';

// KaTeX draws the math. Without it (offline, say) the TeX shows as written.
const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs';
let katex = null;
const katexReady = Promise.race([
  import(KATEX).then(m => { katex = m.default; }, () => {}),
  new Promise(resolve => setTimeout(resolve, 6000))
]);

const SETTINGS_KEY = 'math-bowl-settings-v1';
// speed tricks and physics have modes of their own
const DRILL_TOPICS = TOPICS.filter(t => t !== TRICKS && !PHYSICS_TOPICS.includes(t));
const DRILLS = SKILLS.filter(s => DRILL_TOPICS.includes(s.topic));
const TRICK_SKILLS = SKILLS.filter(s => s.topic === TRICKS);
const PHYSICS_SKILLS = SKILLS.filter(s => PHYSICS_TOPICS.includes(s.topic));
// how a unit reads after an answer
const UNIT_TEX = {
  '°': '^\\circ',
  '%': '\\%',
  'm/s²': '\\ \\text{m/s}^2',
  'kg·m/s': '\\ \\text{kg}{\\cdot}\\text{m/s}',
  N·s: '\\ \\text{N}{\\cdot}\\text{s}',
  Ω: '\\ \\Omega',
  '°C': '\\ {}^\\circ\\text{C}',
  '°F': '\\ {}^\\circ\\text{F}',
  'g/cm³': '\\ \\text{g/cm}^3'
};
const unitTex = unit => (unit ? UNIT_TEX[unit] ?? '\\ \\text{' + unit + '}' : '');
const MODES = {
  mixed: ['MIXED DRILLS', 'Drills'],
  pascal: ['COMBINATIONS', "Pascal's triangle"],
  anzan: ['MENTAL ADDITION', 'Flash anzan'],
  tricks: ['VEDIC AND MENTAL MATH', 'Speed tricks'],
  physics: ['PHYSICS BY THE NUMBERS', 'Physics'],
  formulas: ['REFERENCE', 'Formula sheet'],
  cards: ['MEMORY', 'Flashcards'],
  missed: ['REVIEW', 'Missed problems'],
  progress: ['THIS BROWSER', 'Your progress']
};
const CARD_HTML = `<div class="card-top"><span class="kicker"></span><span class="clock"></span></div>
<div class="clockbar"><span></span></div>
<div class="prompt"></div>
<form class="answer-row" autocomplete="off">
<input type="text" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Your answer" placeholder="Your answer">
<span class="unit"></span>
<span class="keys"><button type="button" class="ghost" data-insert="√" title="Square root">√</button><button type="button" class="ghost" data-insert="π" title="Pi">π</button></span>
<button class="primary" type="submit">Check <kbd>↵</kbd></button>
<button class="ghost hint-toggle" type="button">Formula</button>
<button class="ghost reveal" type="button">Show answer</button>
<button class="ghost skip" type="button">Skip</button>
</form>
<p class="tip">Fractions as 3/8, roots as 9√3 or 9 sqrt 3, pi as π or pi, a point as (2, -5). Units are optional. A decimal counts when it is right to the places you type.</p>
<div class="hint" hidden></div>
<div class="result" hidden><p class="verdict" role="status"></p><div class="steps"></div><button class="primary next" type="button">Next <kbd>↵</kbd></button></div>`;

const $ = id => document.getElementById(id);
const rng = () => makeRng(window.crypto.getRandomValues(new Uint32Array(1))[0]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const now = () => window.performance.now();
const sum = list => list.reduce((a, b) => a + b, 0);
const percent = (a, b) => (b ? Math.round(100 * a / b) + '%' : '—');
const format = n => n.toLocaleString('en-US');

let record = loadRecord();
record.missed = record.missed.filter(m => skillById(m.skill));
const settings = readSettings();
const session = { done: 0, right: 0, streak: 0 };
let mode = 'mixed';
let lastSkill = null;
let trick = TRICK_SKILLS.some(s => s.id === settings.trick) ? settings.trick : 'all';
const pascalStats = { asked: 0, right: 0 };
let anzanId = 0;
let anzanCurrent = null;
let flash = null;

// ---------- small helpers ----------

function el (tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function readSettings () {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function saveSettings () {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function mathNode (tex, display) {
  const node = el(display ? 'div' : 'span', display ? 'math display' : 'math');
  if (katex) {
    try {
      katex.render(tex, node, { displayMode: display, throwOnError: false });
      return node;
    } catch {}
  }
  node.textContent = tex;
  node.classList.add('raw');
  return node;
}

/** Text with TeX between double square brackets, drawn into a node. */
function renderText (node, text) {
  node.replaceChildren();
  String(text).split(/\[\[([\s\S]+?)\]\]/).forEach((part, i) => {
    if (i % 2) node.append(mathNode(part, false));
    else if (part) node.append(part);
  });
  return node;
}

function weighted (list, weight) {
  const weights = list.map(weight);
  let x = Math.random() * sum(weights);
  for (let i = 0; i < list.length; i++) {
    x -= weights[i];
    if (x < 0) return list[i];
  }
  return list[list.length - 1];
}

function fill (select, values, chosen, label = String) {
  select.replaceChildren(...values.map(v => {
    const option = el('option', null, label(v));
    option.value = String(v);
    option.selected = String(v) === String(chosen);
    return option;
  }));
}

function insertAt (input, text) {
  if (input.readOnly) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.focus();
  input.setSelectionRange(start + text.length, start + text.length);
}

// ---------- progress ----------

function persist () {
  const saved = saveRecord(record);
  $('saveNote').textContent = saved
    ? 'Progress stays in this browser.'
    : 'This browser is not saving progress (a private window?). It lasts until the tab closes.';
  $('missedCount').textContent = record.missed.length || '';
}

function drawSession () {
  $('sDone').textContent = session.done;
  $('sAcc').textContent = percent(session.right, session.done);
  $('sStreak').textContent = session.streak;
}

function countAnswer (ok) {
  session.done++;
  if (ok) { session.right++; session.streak++; } else session.streak = 0;
  drawSession();
}

function makeProblem (skill, options) {
  return { ...skill.make(rng(), options), skill: skill.id };
}

/** A drill answered: its tally, the session, and the missed list. */
function recordDrill (problem, ok, ms) {
  const t = record.skills[problem.skill] ||= { seen: 0, right: 0, ms: 0 };
  t.seen++;
  if (ok) { t.right++; t.ms += Math.round(Math.min(ms, 120000)); }
  const at = record.missed.findIndex(m => m.prompt === problem.prompt);
  if (at !== -1) record.missed.splice(at, 1);
  if (!ok) {
    record.missed.push({ skill: problem.skill, prompt: problem.prompt, answer: problem.answer, steps: problem.steps, unit: problem.unit || '' });
  }
  countAnswer(ok);
  persist();
}

// ---------- a problem on screen ----------

class ProblemCard {
  /**
   * @param {HTMLElement} root
   * @param {{next: function(): ?object, empty?: string, after?: function(object, boolean, number): void,
   *   skip?: function(object): void}} options - next hands over the next problem, or null for none
   */
  constructor (root, { next, empty = '', after = () => {}, skip = () => {} }) {
    Object.assign(this, { root, source: next, emptyText: empty, after, onSkip: skip, problem: null, done: false });
    root.className = 'card problem';
    root.innerHTML = CARD_HTML;
    const q = selector => root.querySelector(selector);
    Object.assign(this, {
      kicker: q('.kicker'),
      clock: q('.clock'),
      bar: q('.clockbar'),
      prompt: q('.prompt'),
      form: q('form'),
      input: q('input'),
      unit: q('.unit'),
      tip: q('.tip'),
      hint: q('.hint'),
      result: q('.result'),
      verdict: q('.verdict'),
      steps: q('.steps'),
      nextButton: q('.next')
    });
    this.form.addEventListener('submit', e => { e.preventDefault(); this.submit(); });
    q('.reveal').addEventListener('click', () => this.finish(false, { revealed: true }));
    q('.skip').addEventListener('click', () => { if (this.problem && !this.done) this.onSkip(this.problem); this.next(); });
    q('.hint-toggle').addEventListener('click', () => { this.hint.hidden = !this.hint.hidden; this.input.focus(); });
    this.nextButton.addEventListener('click', () => this.next());
    root.querySelectorAll('[data-insert]').forEach(b => b.addEventListener('click', () => insertAt(this.input, b.dataset.insert)));
  }

  next () {
    this.pause();
    this.problem = this.source();
    this.done = false;
    this.input.value = '';
    this.input.readOnly = false;
    this.result.hidden = true;
    this.hint.hidden = true;
    const p = this.problem;
    this.form.hidden = !p;
    this.tip.hidden = !p;
    this.bar.hidden = !p;
    if (!p) {
      this.kicker.textContent = '';
      this.clock.textContent = '';
      this.prompt.replaceChildren(el('p', 'empty', this.emptyText));
      return;
    }
    const skill = skillById(p.skill);
    this.kicker.textContent = skill.topic + ' · ' + skill.name;
    renderText(this.prompt, p.prompt);
    this.unit.textContent = p.unit || '';
    renderText(this.hint, skill.hint);
    this.limit = skill.seconds;
    this.started = now();
    this.startClock();
    this.input.focus({ preventScroll: true });
  }

  /** Leaving the mode: stop the clock. */
  pause () {
    clearInterval(this.tick);
    clearTimeout(this.auto);
  }

  /** Back to the mode: the same problem with a fresh clock, or a new one. */
  resume () {
    if (!this.problem || this.done) { this.next(); return; }
    this.started = now();
    this.startClock();
    this.input.focus({ preventScroll: true });
  }

  startClock () {
    clearInterval(this.tick);
    const on = $('timer').checked;
    const fill = this.bar.firstElementChild;
    this.bar.hidden = !on;
    this.bar.classList.remove('over');
    this.clock.classList.remove('over');
    this.clock.textContent = on ? this.limit + 's' : '';
    fill.style.width = '0';
    if (!on) return;
    this.tick = setInterval(() => {
      const used = (now() - this.started) / 1000;
      const over = used >= this.limit;
      fill.style.width = Math.min(100, 100 * used / this.limit) + '%';
      this.clock.textContent = over ? 'Time' : Math.ceil(this.limit - used) + 's';
      this.clock.classList.toggle('over', over);
      this.bar.classList.toggle('over', over);
    }, 100);
  }

  submit () {
    if (!this.problem) return;
    if (this.done) { this.next(); return; }
    const typed = this.input.value;
    if (!typed.trim()) { this.note('Type an answer first, or press Show answer.'); return; }
    const result = check(this.problem.answer, typed);
    if (result.form === 'fraction') { this.note('Right value, but give it as a fraction.'); return; }
    this.finish(result.ok, { close: result.close });
  }

  /** A message that does not end the problem. */
  note (text) {
    this.result.hidden = false;
    this.nextButton.hidden = true;
    this.verdict.className = 'verdict note';
    this.verdict.textContent = text;
    this.steps.replaceChildren();
    this.input.focus();
  }

  finish (ok, { close = false, revealed = false } = {}) {
    if (!this.problem || this.done) return;
    this.done = true;
    this.pause();
    const p = this.problem;
    const ms = now() - this.started;
    const late = $('timer').checked && ms / 1000 > this.limit;
    const answer = '[[' + answerTex(p.answer, { decimal: p.decimal }) + unitTex(p.unit) + ']]';
    this.input.readOnly = true;
    this.result.hidden = false;
    this.nextButton.hidden = false;
    this.verdict.className = 'verdict ' + (ok ? 'good' : 'bad');
    renderText(this.verdict, ok
      ? 'Right' + (close ? '. Exactly, it is ' + answer : '') + (late ? ', but over the ' + this.limit + '-second limit' : '') + '.'
      : (revealed ? 'The answer is ' : 'Not quite. The answer is ') + answer + '.');
    renderText(this.steps, p.steps);
    this.after(p, ok, ms);
    if (ok && $('autoNext').checked) this.auto = setTimeout(() => this.next(), close || late ? 2600 : 1200);
    this.input.focus({ preventScroll: true });
  }
}

// ---------- drills ----------

/** A skill from the pool, leaning toward the ones missed most and never the same twice in a row. */
function pickSkill (pool) {
  const weight = s => {
    if (!$('weak').checked) return 1;
    const t = record.skills[s.id];
    return !t || !t.seen ? 2 : 1 + 3 * (t.seen - t.right) / t.seen;
  };
  const choices = pool.length > 1 ? pool.filter(s => s !== lastSkill) : pool;
  lastSkill = weighted(choices, weight);
  return lastSkill;
}

/**
 * Drills over a set of topics, the ones picked kept in settings[key], or one
 * skill alone (the formula sheet's Practice button). Drills and Physics are
 * each one. `prefix` is the start of its element ids: Grid, Summary, Chip,
 * Name, Clear, All, None, Card.
 */
class TopicDrill {
  constructor ({ topics, key, prefix, label = t => t }) {
    Object.assign(this, { topics, key, prefix, label, focus: null });
    this.skills = SKILLS.filter(s => topics.includes(s.topic));
    this.card = new ProblemCard($(prefix + 'Card'), {
      empty: 'Pick at least one topic above.',
      next: () => {
        const pool = this.focus ? [skillById(this.focus)] : this.skills.filter(s => this.chosen().includes(s.topic));
        return pool.length ? makeProblem(pickSkill(pool)) : null;
      },
      after: recordDrill
    });
    $(prefix + 'All').addEventListener('click', () => this.set(topics.slice()));
    $(prefix + 'None').addEventListener('click', () => this.set([]));
    $(prefix + 'Clear').addEventListener('click', () => {
      this.focus = null;
      $(prefix + 'Chip').hidden = true;
      this.card.next();
    });
  }

  chosen () {
    const saved = settings[this.key];
    return Array.isArray(saved) ? saved.filter(t => this.topics.includes(t)) : this.topics;
  }

  draw () {
    const grid = $(this.prefix + 'Grid');
    grid.replaceChildren();
    for (const topic of this.topics) {
      const label = el('label', 'check');
      const box = el('input');
      box.type = 'checkbox';
      box.value = topic;
      box.checked = this.chosen().includes(topic);
      box.addEventListener('change', () => this.set([...grid.querySelectorAll('input:checked')].map(b => b.value)));
      label.append(box, this.label(topic) + ' ', el('span', 'muted', '(' + this.skills.filter(s => s.topic === topic).length + ')'));
      grid.append(label);
    }
    const n = this.chosen().length;
    $(this.prefix + 'Summary').textContent = 'Topics: ' + (n === this.topics.length ? 'all ' + n : n + ' of ' + this.topics.length);
  }

  set (topics) {
    settings[this.key] = topics;
    saveSettings();
    this.draw();
    this.card.next();
  }

  practice (id) {
    this.focus = id;
    $(this.prefix + 'Name').textContent = 'Only: ' + skillById(id).name;
    $(this.prefix + 'Chip').hidden = false;
  }
}

const drills = new TopicDrill({ topics: DRILL_TOPICS, key: 'topics', prefix: 'topics' });
const physics = new TopicDrill({
  topics: PHYSICS_TOPICS,
  key: 'physicsTopics',
  prefix: 'physics',
  // "Physics: motion" is just "Motion" inside the Physics mode
  label: t => t.slice(t.indexOf(':') + 2, t.indexOf(':') + 3).toUpperCase() + t.slice(t.indexOf(':') + 3)
});

/** Drill one skill, from the formula sheet's Practice button. */
function practiceSkill (id) {
  const skill = skillById(id);
  if (skill.topic === TRICKS) {
    trick = id;
    drawTricks();
    showMode('tricks');
    tricksCard.next();
    return;
  }
  const where = PHYSICS_TOPICS.includes(skill.topic) ? 'physics' : 'mixed';
  const drill = where === 'physics' ? physics : drills;
  drill.practice(id);
  showMode(where);
  drill.card.next();
}

// ---------- Pascal's triangle ----------

const pascalCard = new ProblemCard($('pascalCard'), {
  next: () => {
    const p = makeProblem(skillById($('pKind').value), { maxRow: Number($('pMax').value), edges: $('pEdges').checked });
    $('pNum').textContent = pascalStats.asked + 1;
    $('pNK').textContent = '(' + p.data.n + ', ' + (p.data.k ?? '–') + ')';
    drawTriangle(p, false);
    return p;
  },
  after: (p, ok, ms) => {
    pascalStats.asked++;
    if (ok) pascalStats.right++;
    $('pRight').textContent = pascalStats.right;
    $('pAcc').textContent = percent(pascalStats.right, pascalStats.asked);
    recordDrill(p, ok, ms);
    drawTriangle(p, true);
  }
});

function drawTriangle (p, answered) {
  const box = $('triangle');
  const maxRow = Math.max(Number($('pMax').value), p ? p.data.n : 0);
  $('triTitle').textContent = "Pascal's triangle, rows 0–" + maxRow;
  box.replaceChildren();
  if (!answered && !$('pShow').checked) {
    box.append(el('p', 'tri-hidden', 'Hidden until you answer.'));
    return;
  }
  const triangle = el('div', 'triangle');
  let row = [1];
  for (let n = 0; n <= maxRow; n++) {
    const line = el('div', 'tri-row' + (p && p.data.n === n ? ' on' : ''));
    line.append(el('span', 'n', String(n)));
    row.forEach((value, k) => {
      const cell = el('span', 'cell', String(value));
      cell.title = 'C(' + n + ', ' + k + ') = ' + value;
      if (answered && p.data.n === n && p.data.k === k) cell.classList.add('hit');
      line.append(cell);
    });
    triangle.append(line);
    row = [1, ...row.slice(1).map((v, i) => v + row[i]), 1];
  }
  box.append(triangle);
}

// ---------- flash anzan ----------

function anzanKey () {
  const digits = Number($('aDigits').value);
  return digits + (digits === 1 ? ' digit' : ' digits') + ', ' + $('aCount').value + ' numbers, ' +
    Number($('aSpeed').value).toFixed(1) + ' s each' + ($('aMinus').checked ? ', some subtracted' : '');
}

async function startAnzan () {
  const id = ++anzanId;
  const speed = Number($('aSpeed').value);
  anzanCurrent = {
    ...anzanRun(rng(), { digits: Number($('aDigits').value), count: Number($('aCount').value), subtract: $('aMinus').checked }),
    key: anzanKey()
  };
  const screen = $('aScreen');
  $('aStart').hidden = true;
  $('aStop').hidden = false;
  $('aForm').hidden = true;
  $('aVerdict').textContent = '';
  $('aSequence').textContent = '';
  screen.className = 'anzan-screen count';
  for (const n of ['3', '2', '1']) {
    screen.textContent = n;
    await sleep(500);
    if (id !== anzanId) return;
  }
  screen.className = 'anzan-screen';
  screen.textContent = '';
  await sleep(350);
  // a short blank between numbers, so the same digits twice still read as two
  const shown = speed * 1000 * (speed >= 0.5 ? 0.8 : 0.7);
  for (const n of anzanCurrent.numbers) {
    if (id !== anzanId) return;
    screen.classList.toggle('minus', n < 0);
    screen.textContent = n < 0 ? '−' + format(-n) : format(n);
    await sleep(shown);
    screen.textContent = '';
    await sleep(speed * 1000 - shown);
  }
  if (id !== anzanId) return;
  screen.className = 'anzan-screen small';
  screen.textContent = 'What was the total?';
  $('aStop').hidden = true;
  $('aForm').hidden = false;
  $('aInput').value = '';
  $('aInput').focus();
}

function stopAnzan () {
  anzanId++;
  anzanCurrent = null;
  $('aScreen').className = 'anzan-screen small';
  $('aScreen').textContent = 'Numbers flash one at a time. Keep a running total in your head, then type it.';
  $('aStart').hidden = false;
  $('aStop').hidden = true;
  $('aForm').hidden = true;
}

function checkAnzan () {
  if (!anzanCurrent) return;
  const typed = $('aInput').value.replace(/[,\s]/g, '').replace('−', '-');
  if (!typed) return;
  const { numbers, total, key } = anzanCurrent;
  const ok = Number(typed) === total;
  const t = record.anzan[key] ||= { seen: 0, right: 0 };
  t.seen++;
  if (ok) t.right++;
  countAnswer(ok);
  persist();
  anzanCurrent = null;
  $('aVerdict').className = 'verdict ' + (ok ? 'good' : 'bad');
  $('aVerdict').textContent = ok ? 'Right: ' + format(total) + '.' : 'The total was ' + format(total) + ', not ' + typed + '.';
  $('aSequence').textContent = numbers.map((n, i) => (i === 0 ? format(n) : (n < 0 ? '− ' : '+ ') + format(Math.abs(n)))).join(' ') + ' = ' + format(total);
  $('aScreen').className = 'anzan-screen small';
  $('aScreen').textContent = ok ? 'Right. Press space for another.' : 'Press space to try again.';
  $('aForm').hidden = true;
  $('aStart').hidden = false;
  $('aStart').focus();
}

// ---------- speed tricks ----------

const tricksCard = new ProblemCard($('tricksCard'), {
  next: () => makeProblem(trick === 'all' ? pickSkill(TRICK_SKILLS) : skillById(trick)),
  after: recordDrill
});

function drawTricks () {
  const list = $('trickList');
  list.replaceChildren();
  for (const [id, name] of [['all', 'All tricks'], ...TRICK_SKILLS.map(s => [s.id, s.name])]) {
    const button = el('button', id === trick ? 'on' : '', name);
    button.type = 'button';
    button.addEventListener('click', () => {
      trick = id;
      settings.trick = id;
      saveSettings();
      drawTricks();
      tricksCard.next();
    });
    list.append(button);
  }
  const lesson = $('lesson');
  lesson.replaceChildren();
  if (trick === 'all') {
    lesson.append(el('h2', null, 'Every trick, mixed'));
    lesson.append(el('p', null, 'Ten seconds a problem, the time KSHSAA gives the quick ones. Pick a trick above to learn how it works.'));
    return;
  }
  const skill = skillById(trick);
  lesson.append(el('h2', null, skill.name));
  lesson.append(renderText(el('p'), skill.lesson));
}

// ---------- formula sheet and flashcards ----------

function drawFormulas () {
  const search = $('fSearch').value.trim().toLowerCase();
  const topic = $('fTopic').value;
  const list = $('formulaList');
  list.replaceChildren();
  let shown = 0;
  for (const t of FORMULA_TOPICS) {
    if (topic !== 'all' && topic !== t) continue;
    const items = FORMULAS.filter(f => f.topic === t && (!search || (f.name + ' ' + f.note + ' ' + f.topic).toLowerCase().includes(search)));
    if (!items.length) continue;
    list.append(el('h2', null, t));
    for (const f of items) {
      const item = el('article', 'formula');
      item.append(el('h3', null, f.name));
      if (f.skill) {
        const button = el('button', 'ghost', 'Practice');
        button.type = 'button';
        button.addEventListener('click', () => practiceSkill(f.skill));
        item.append(button);
      } else {
        item.append(el('span'));
      }
      item.append(mathNode(f.tex, true));
      if (f.note) item.append(el('p', 'note', f.note));
      list.append(item);
      shown++;
    }
  }
  $('fCount').textContent = shown + ' of ' + FORMULAS.length;
  if (!shown) list.append(el('p', 'muted', 'Nothing matches that.'));
}

const cardKey = f => f.topic + '|' + f.name;

function nextCard () {
  const topic = $('cTopic').value;
  const pool = FORMULAS.filter(f => topic === 'all' || f.topic === topic);
  const choices = pool.length > 1 ? pool.filter(f => f !== flash) : pool;
  flash = weighted(choices, f => {
    const t = record.cards[cardKey(f)];
    return !t || !t.seen ? 3 : 1 + 4 * (t.seen - t.right) / t.seen;
  });
  const known = pool.filter(f => record.cards[cardKey(f)]?.right).length;
  $('cCount').textContent = known + ' of ' + pool.length + ' known at least once';
  $('cKicker').textContent = flash.topic.toUpperCase();
  $('cFront').textContent = flash.name;
  $('cBack').hidden = true;
  $('cShow').hidden = false;
  $('cMiss').hidden = true;
  $('cGot').hidden = true;
  $('cShow').focus({ preventScroll: true });
}

function flipCard () {
  const back = $('cBack');
  back.replaceChildren(mathNode(flash.tex, true));
  if (flash.note) back.append(el('p', 'note', flash.note));
  back.hidden = false;
  $('cShow').hidden = true;
  $('cMiss').hidden = false;
  $('cGot').hidden = false;
  $('cGot').focus({ preventScroll: true });
}

function gradeCard (ok) {
  const t = record.cards[cardKey(flash)] ||= { seen: 0, right: 0 };
  t.seen++;
  if (ok) t.right++;
  persist();
  nextCard();
}

// ---------- missed problems ----------

const missedCard = new ProblemCard($('missedCard'), {
  empty: 'Nothing to redo. Problems you miss in the drills come here until you get them right.',
  next: () => (record.missed.length ? { ...record.missed[0] } : null),
  after: recordDrill,
  // to the back of the line
  skip: p => {
    const at = record.missed.findIndex(m => m.prompt === p.prompt);
    if (at !== -1) record.missed.push(...record.missed.splice(at, 1));
    persist();
  }
});

// ---------- progress ----------

function table (headers, rows) {
  const node = el('table');
  const head = el('tr');
  headers.forEach(h => head.append(el('th', /^(Answered|Right|Runs|Seen|Average)/.test(h) ? 'num' : null, h)));
  node.append(el('thead'));
  node.firstChild.append(head);
  const body = el('tbody');
  for (const row of rows) body.append(row);
  node.append(body);
  return node;
}

function meter (right, seen) {
  const cell = el('td');
  const bar = el('div', 'meter');
  const fill = el('span');
  fill.style.width = (seen ? 100 * right / seen : 0) + '%';
  bar.append(fill);
  cell.append(bar);
  return cell;
}

function drawProgress () {
  const skills = Object.values(record.skills);
  const seen = sum(skills.map(t => t.seen));
  const right = sum(skills.map(t => t.right));
  const runs = Object.values(record.anzan);
  const cards = Object.values(record.cards);
  const summary = $('summary');
  summary.replaceChildren();
  for (const [value, label] of [
    [format(seen), 'problems answered'], [percent(right, seen), 'right'],
    [Object.keys(record.skills).filter(id => skillById(id)).length + ' of ' + SKILLS.length, 'drills tried'],
    [record.missed.length, 'to redo'], [sum(runs.map(t => t.seen)), 'anzan runs'], [sum(cards.map(t => t.seen)), 'flashcards']
  ]) {
    const tile = el('div');
    tile.append(el('strong', null, String(value)), el('span', null, label));
    summary.append(tile);
  }

  const rows = [];
  for (const topic of TOPICS) {
    const tried = SKILLS.filter(s => s.topic === topic && record.skills[s.id]?.seen);
    if (!tried.length) continue;
    const head = el('tr', 'topic-row');
    const name = el('td', null, topic);
    name.colSpan = 6;
    head.append(name);
    rows.push(head);
    for (const s of tried) {
      const t = record.skills[s.id];
      const row = el('tr');
      row.append(el('td', null, s.name), el('td', 'num', format(t.seen)), el('td', 'num', format(t.right)), el('td', 'num', percent(t.right, t.seen)),
        meter(t.right, t.seen), el('td', 'num', t.right ? (t.ms / t.right / 1000).toFixed(1) + ' s' : '—'));
      rows.push(row);
    }
  }
  $('skillTable').replaceChildren(rows.length
    ? table(['Drill', 'Answered', 'Right', 'Accuracy', '', 'Average time when right'], rows)
    : el('p', 'muted', 'Nothing yet. Answer a few drills.'));

  const anzanRows = Object.entries(record.anzan).sort((a, b) => b[1].seen - a[1].seen).map(([key, t]) => {
    const row = el('tr');
    row.append(el('td', null, key), el('td', 'num', format(t.seen)), el('td', 'num', format(t.right)), el('td', 'num', percent(t.right, t.seen)), meter(t.right, t.seen));
    return row;
  });
  $('anzanTable').replaceChildren(anzanRows.length ? table(['Setting', 'Runs', 'Right', 'Accuracy', ''], anzanRows) : el('p', 'muted', 'No runs yet.'));

  const cardRows = FORMULA_TOPICS.map(topic => {
    const tallies = FORMULAS.filter(f => f.topic === topic).map(f => record.cards[cardKey(f)]).filter(Boolean);
    if (!tallies.length) return null;
    const [s, r] = [sum(tallies.map(t => t.seen)), sum(tallies.map(t => t.right))];
    const row = el('tr');
    row.append(el('td', null, topic), el('td', 'num', format(s)), el('td', 'num', format(r)), el('td', 'num', percent(r, s)), meter(r, s));
    return row;
  }).filter(Boolean);
  $('cardTable').replaceChildren(cardRows.length ? table(['Topic', 'Seen', 'Right', 'Accuracy', ''], cardRows) : el('p', 'muted', 'No flashcards yet.'));
}

function exportProgress () {
  const blob = new Blob([JSON.stringify({ format: 'math-bowl-backup', version: 1, record })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = 'math-bowl-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importProgress () {
  const file = $('importFile').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.format !== 'math-bowl-backup') throw new Error('it is not a Math Bowl progress file');
      record = cleanRecord(data.record);
      record.missed = record.missed.filter(m => skillById(m.skill));
      persist();
      drawProgress();
      $('transferNote').textContent = 'Imported.';
    } catch (e) {
      $('transferNote').textContent = 'That file could not be imported: ' + e.message + '.';
    }
    $('importFile').value = '';
  };
  reader.readAsText(file);
}

// ---------- modes ----------

const CARDS = { mixed: drills.card, pascal: pascalCard, tricks: tricksCard, physics: physics.card, missed: missedCard };

function badge () {
  if (mode === 'mixed') return DRILLS.length + ' drills in ' + DRILL_TOPICS.length + ' topics';
  if (mode === 'pascal') return 'Rows 0 to 14';
  if (mode === 'anzan') return '1 to 5 digits, up to 100 numbers';
  if (mode === 'tricks') return TRICK_SKILLS.length + ' tricks';
  if (mode === 'physics') return PHYSICS_SKILLS.length + ' problems in ' + PHYSICS_TOPICS.length + ' topics';
  if (mode === 'formulas' || mode === 'cards') return FORMULAS.length + ' formulas';
  if (mode === 'missed') return record.missed.length + ' to redo';
  return '';
}

function showMode (next) {
  if (CARDS[mode]) CARDS[mode].pause();
  if (mode === 'anzan' && next !== 'anzan') stopAnzan();
  mode = next;
  document.querySelectorAll('.mode').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
    b.setAttribute('aria-current', b.dataset.mode === mode ? 'page' : 'false');
  });
  document.querySelectorAll('.panel').forEach(panel => { panel.hidden = panel.id !== mode; });
  $('kicker').textContent = MODES[mode][0];
  $('title').textContent = MODES[mode][1];
  $('badge').textContent = badge();
  if (CARDS[mode]) CARDS[mode].resume();
  if (mode === 'formulas') drawFormulas();
  if (mode === 'cards' && !flash) nextCard();
  if (mode === 'progress') drawProgress();
  try { window.history.replaceState(null, '', '#' + mode); } catch {}
}

// ---------- events ----------

document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => showMode(b.dataset.mode)));

for (const id of ['timer', 'autoNext', 'weak']) {
  $(id).addEventListener('change', () => {
    settings[id] = $(id).checked;
    saveSettings();
    if (id === 'timer' && CARDS[mode]?.problem && !CARDS[mode].done) CARDS[mode].startClock();
  });
}

for (const id of ['pKind', 'pMax', 'pEdges']) {
  $(id).addEventListener('change', () => {
    settings[id] = id === 'pEdges' ? $(id).checked : $(id).value;
    saveSettings();
    pascalCard.next();
  });
}
$('pShow').addEventListener('change', () => {
  settings.pShow = $('pShow').checked;
  saveSettings();
  drawTriangle(pascalCard.problem, pascalCard.done);
});

for (const id of ['aDigits', 'aSpeed', 'aCount', 'aMinus']) {
  $(id).addEventListener('change', () => {
    settings[id] = id === 'aMinus' ? $(id).checked : $(id).value;
    saveSettings();
  });
}
$('aStart').addEventListener('click', startAnzan);
$('aStop').addEventListener('click', stopAnzan);
$('aForm').addEventListener('submit', e => { e.preventDefault(); checkAnzan(); });

$('fSearch').addEventListener('input', drawFormulas);
$('fTopic').addEventListener('change', drawFormulas);
$('cTopic').addEventListener('change', () => { settings.cTopic = $('cTopic').value; saveSettings(); nextCard(); });
$('cShow').addEventListener('click', flipCard);
$('cMiss').addEventListener('click', () => gradeCard(false));
$('cGot').addEventListener('click', () => gradeCard(true));

$('exportBtn').addEventListener('click', exportProgress);
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', importProgress);
$('resetBtn').addEventListener('click', () => {
  if (!window.confirm('Delete all the math progress saved in this browser?')) return;
  record = cleanRecord(null);
  persist();
  drawProgress();
});

// a link or Back to another mode's #address
window.addEventListener('hashchange', () => {
  const asked = window.location.hash.slice(1);
  if (MODES[asked] && asked !== mode) showMode(asked);
});

document.addEventListener('keydown', e => {
  const target = e.target instanceof Element ? e.target : document.body;
  if (target.closest('input, select, textarea')) return;
  // a focused button already answers space and Enter by itself
  if ((e.key === ' ' || e.key === 'Enter') && target.closest('button')) return;
  if (mode === 'anzan' && e.key === ' ' && !$('aStart').hidden) { e.preventDefault(); startAnzan(); }
  if (mode === 'cards') {
    if (e.key === ' ' && !$('cShow').hidden) { e.preventDefault(); flipCard(); } else if (e.key === '1' && !$('cMiss').hidden) gradeCard(false);
    else if (e.key === '2' && !$('cGot').hidden) gradeCard(true);
  }
  if (e.key === 'Enter' && CARDS[mode]?.done) CARDS[mode].next();
});

// ---------- start ----------

async function start () {
  await katexReady;
  for (const id of ['timer', 'autoNext', 'weak']) if (typeof settings[id] === 'boolean') $(id).checked = settings[id];
  fill($('pMax'), Array.from({ length: 13 }, (_, i) => i + 2), settings.pMax ?? 10);
  if (settings.pKind && skillById(settings.pKind)) $('pKind').value = settings.pKind;
  $('pEdges').checked = Boolean(settings.pEdges);
  $('pShow').checked = settings.pShow !== false;
  fill($('aDigits'), ANZAN_DIGITS, settings.aDigits ?? 1);
  fill($('aSpeed'), ANZAN_SECONDS, settings.aSpeed ?? 1, v => v.toFixed(1) + ' s');
  fill($('aCount'), ANZAN_COUNTS, settings.aCount ?? 10);
  $('aMinus').checked = Boolean(settings.aMinus);
  fill($('fTopic'), ['all', ...FORMULA_TOPICS], 'all', v => (v === 'all' ? 'All topics' : v));
  fill($('cTopic'), ['all', ...FORMULA_TOPICS], FORMULA_TOPICS.includes(settings.cTopic) ? settings.cTopic : 'all', v => (v === 'all' ? 'All topics' : v));
  drills.draw();
  physics.draw();
  drawTricks();
  persist();
  drawSession();
  const asked = window.location.hash.slice(1);
  showMode(MODES[asked] ? asked : 'mixed');
}

start();
