// The Octopus Arcade's moderator page: the setup form, then the console that
// runs a game. The rules are engine.js and modes/; this file turns keys and
// clicks into actions, keeps the clocks, and draws the state. The scoreboard
// window (scoreboard/page.js, through second-screen.js) shows the game this
// page saves.

import { MODES } from './modes/index.js';
import { MODIFIERS } from './modifiers.js';
import {
  ArcadeError, MAX_TEAMS, act, answerLimit, eligibleTeams, newGame, replay, standings, whyNoBuzz, winners
} from './engine.js';
import { perCategory, pickQuestions, questionsUrl } from './questions.js';
import { addTime, clockLeft, formatClock, newClock, startClock, stopClock } from './clock.js';
import * as store from './store.js';
import { openScreen, screenUrl, showOnScreen } from '../second-screen.js';

const $ = id => document.getElementById(id);
// team names are free text and reach innerHTML below
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// keys the console answers to itself, so no team's buzzer may use them
const CONTROL_KEYS = { c: 'Correct', w: 'Wrong', n: 'Next', z: 'Undo', p: 'Pause', s: 'Question on scoreboard' };
const DEFAULT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];
// Lightning Round's pause between one question and the next
const AUTO_NEXT_MS = 1500;
const MORE_QUESTIONS = 10;
const COMING_UP = '<span class="small text-secondary">Next question coming up...</span>';
const OVER_TEXT = {
  'last-standing': 'Last team standing.',
  questions: 'Out of questions: the standings decide it.',
  time: 'Time is up.',
  moderator: 'Ended by the moderator: the standings decide it.'
};

let GAME = null;
let STATE = null;
// the question the clock and the scoreboard's question text were set up for
let shownQuestion = null;
let ticker = null;
let autoNext = null;
let toastTimer = null;
let lineups = [];
const adjusting = new Set();

// ---------- setup ----------

function renderModes () {
  $('modes').innerHTML = Object.values(MODES).map(m =>
    '<div class="col-sm-6 col-lg-3"><label class="mode-card d-block h-100">' +
    '<input type="radio" name="mode" value="' + m.id + '">' +
    '<div class="card h-100"><div class="card-body py-2 px-3">' +
    '<div class="fw-semibold">' + esc(m.name) + '</div>' +
    '<div class="small text-secondary">' + esc(m.summary) + '</div></div></div></label></div>').join('');
  for (const input of document.querySelectorAll('input[name="mode"]')) {
    input.addEventListener('change', () => modeChanged(true));
  }
}

function renderModifiers () {
  $('modifierBox').innerHTML = Object.values(MODIFIERS).map(m =>
    '<div class="form-check" id="modrow-' + m.id + '">' +
    '<input class="form-check-input mod" type="checkbox" id="mod-' + m.id + '" value="' + m.id + '" checked>' +
    '<label class="form-check-label" for="mod-' + m.id + '"><span class="me-1">' + m.icon + '</span>' +
    '<strong class="mod-label" data-mod="' + m.id + '"></strong> ' +
    '<span class="text-secondary mod-blurb" data-mod="' + m.id + '"></span></label></div>').join('');
}

const modeInputs = () => Array.from(document.querySelectorAll('input[name="mode"]'));
const selectedMode = () => MODES[(modeInputs().find(i => i.checked) || modeInputs()[0]).value];

function modeChanged (useDefaults) {
  const mode = selectedMode();
  $('livesBox').classList.toggle('d-none', !mode.lives);
  $('minutesBox').classList.toggle('d-none', !mode.timed);
  $('powerUps').disabled = mode.powerUps !== 'optional';
  if (mode.powerUps === 'always') $('powerUps').checked = true;
  if (mode.powerUps === 'off') $('powerUps').checked = false;
  $('powerUpsHint').textContent = mode.powerUps === 'always' ? '(always on in ' + mode.name + ')' : '';
  if (useDefaults) {
    $('powerUps').checked = mode.powerUps === 'always';
    $('questionCount').value = mode.defaults.questions;
    if (mode.timed) $('minutes').value = mode.defaults.minutes;
  }
  for (const m of Object.values(MODIFIERS)) {
    const usable = !m.livesOnly || mode.lives;
    document.querySelector('.mod-label[data-mod="' + m.id + '"]').textContent = m.label(mode.lives);
    document.querySelector('.mod-blurb[data-mod="' + m.id + '"]').textContent = usable ? m.blurb(mode.lives) : '(needs lives)';
    $('mod-' + m.id).disabled = !usable;
    $('modrow-' + m.id).classList.toggle('mod-off', !usable);
  }
  $('modifierBox').classList.toggle('d-none', !$('powerUps').checked);
  showRules();
}

function showRules () {
  const config = { lives: Number($('lives').value), minutes: Number($('minutes').value) };
  $('modeRules').innerHTML = selectedMode().rules(config).map(r => '<li>' + esc(r) + '</li>').join('');
}

const teamRows = () => Array.from(document.querySelectorAll('#teamRows .team-row'));

function freeKey () {
  const used = teamRows().map(r => r.querySelector('.tkey').value.toLowerCase());
  return DEFAULT_KEYS.find(k => !used.includes(k)) || '';
}

function renumberTeams () {
  const rows = teamRows();
  rows.forEach((row, i) => {
    row.querySelector('.tnum').textContent = i + 1;
    row.querySelector('.tname').placeholder = 'Team ' + (i + 1);
    row.querySelector('.tname').setAttribute('aria-label', 'Team ' + (i + 1) + ' name');
    row.querySelector('.tkey').setAttribute('aria-label', 'Team ' + (i + 1) + ' buzzer key');
    row.querySelector('.tdel').disabled = rows.length <= 2;
  });
  $('addTeam').disabled = rows.length >= MAX_TEAMS;
}

function addTeamRow (name = '', key = '') {
  if (teamRows().length >= MAX_TEAMS) return null;
  const row = document.createElement('div');
  row.className = 'team-row input-group input-group-sm mb-1';
  row.innerHTML = '<span class="input-group-text tnum"></span>' +
    '<input class="form-control tname" maxlength="40">' +
    '<span class="input-group-text">Key</span>' +
    '<input class="form-control tkey" maxlength="1" autocomplete="off">' +
    '<button type="button" class="btn btn-outline-secondary tdel" title="Remove this team">&times;</button>';
  row.querySelector('.tname').value = name;
  row.querySelector('.tkey').value = key || freeKey();
  row.querySelector('.tdel').onclick = () => {
    if (teamRows().length <= 2) return;
    row.remove();
    renumberTeams();
  };
  // Enter moves down the list of names, then on to the start button
  row.querySelector('.tname').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = teamRows()[teamRows().indexOf(row) + 1];
    (next ? next.querySelector('.tname') : $('start')).focus();
  });
  $('teamRows').appendChild(row);
  renumberTeams();
  return row;
}

function setTeams (teams) {
  $('teamRows').innerHTML = '';
  for (const t of teams.slice(0, MAX_TEAMS)) addTeamRow(t.name || '', t.key || '');
  while (teamRows().length < 2) addTeamRow();
}

// team names from a recent game, for anyone signed in to the reader
function loadLineups () {
  fetch('/kshsaa-stats/me').then(r => r.json()).then(me => {
    if (!me.reader) return null;
    return fetch('/kshsaa-stats/lineups').then(r => r.ok ? r.json() : null);
  }).then(d => {
    lineups = ((d && d.games) || []).filter(g => g.teams.length >= 2);
    if (!lineups.length) return;
    const select = $('lineupGame');
    select.innerHTML = '<option value="">Team names from a recent game&hellip;</option>' + lineups.map((g, i) =>
      '<option value="' + i + '">' + esc(g.teams.map(t => t.name).join(' · ')) + ' (' + esc(g.label) + ')</option>').join('');
    select.classList.remove('d-none');
    select.onchange = () => {
      const game = lineups[Number(select.value)];
      if (game && select.value !== '') setTeams(game.teams.map(t => ({ name: t.name })));
      select.value = '';
    };
  }).catch(() => {});
}

function readSetup () {
  const mode = selectedMode();
  return {
    mode: mode.id,
    teams: teamRows().map((row, i) => ({
      name: row.querySelector('.tname').value.trim() || 'Team ' + (i + 1),
      key: row.querySelector('.tkey').value.trim().toLowerCase()
    })),
    lives: Number($('lives').value),
    questions: Math.max(5, Math.min(100, Number($('questionCount').value) || mode.defaults.questions)),
    minutes: Number($('minutes').value),
    powerUps: $('powerUps').checked,
    modifiers: Array.from(document.querySelectorAll('.mod:checked')).map(i => i.value),
    rebounds: $('rebounds').checked,
    showAnswers: $('showAnswers').checked,
    level: document.querySelector('input[name="level"]:checked').value,
    math: $('mathTier').value,
    categories: Array.from(document.querySelectorAll('.cat:checked')).map(i => i.value)
  };
}

function applySetup (setup) {
  const modeInput = modeInputs().find(i => i.value === setup.mode) || modeInputs()[0];
  modeInput.checked = true;
  setTeams(setup.teams && setup.teams.length ? setup.teams : [{}, {}, {}, {}]);
  if (setup.lives) $('lives').value = setup.lives;
  if (setup.questions) $('questionCount').value = setup.questions;
  if (setup.minutes) $('minutes').value = setup.minutes;
  if (typeof setup.powerUps === 'boolean') $('powerUps').checked = setup.powerUps;
  if (Array.isArray(setup.modifiers)) {
    for (const input of document.querySelectorAll('.mod')) input.checked = setup.modifiers.includes(input.value);
  }
  if (typeof setup.rebounds === 'boolean') $('rebounds').checked = setup.rebounds;
  if (typeof setup.showAnswers === 'boolean') $('showAnswers').checked = setup.showAnswers;
  const level = Array.from(document.querySelectorAll('input[name="level"]')).find(i => i.value === setup.level);
  if (level) level.checked = true;
  if (setup.math && Array.from($('mathTier').options).some(o => o.value === setup.math)) $('mathTier').value = setup.math;
  if (Array.isArray(setup.categories)) {
    for (const input of document.querySelectorAll('.cat')) input.checked = setup.categories.includes(input.value);
  }
  modeChanged(false);
}

/** What is wrong with a setup, in words, or null. */
function setupProblem (setup) {
  const seen = {};
  for (const t of setup.teams) {
    const name = t.name.toLowerCase();
    if (seen[name]) return 'Two teams are both called ' + t.name + '.';
    seen[name] = true;
  }
  const keys = {};
  for (const t of setup.teams) {
    if (t.key.length !== 1) return t.name + ' needs a buzzer key: one letter or digit.';
    if (CONTROL_KEYS[t.key]) return '"' + t.key.toUpperCase() + '" is the console\'s ' + CONTROL_KEYS[t.key] + ' key. Give ' + t.name + ' another.';
    if (keys[t.key]) return keys[t.key] + ' and ' + t.name + ' have the same key.';
    keys[t.key] = t.name;
  }
  if (!setup.categories.length) return 'Pick at least one category.';
  const mode = MODES[setup.mode];
  const usable = setup.modifiers.filter(id => !MODIFIERS[id].livesOnly || mode.lives);
  if (setup.powerUps && mode.powerUps !== 'off' && !usable.length) return 'Pick at least one power-up, or turn them off.';
  return null;
}

function status (text, isError) {
  $('status').textContent = text;
  $('status').className = 'ms-2 small' + (isError ? ' text-danger' : ' text-secondary');
}

const newId = () => window.crypto && window.crypto.randomUUID
  ? window.crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * @param {string} modeId
 * @param {{level: string, math: string, categories: string[]}} config
 * @param {number} wanted
 * @param {string[]} [exclude] - ids the game already has
 */
async function fetchQuestions (modeId, config, wanted, exclude = []) {
  const short = Boolean(MODES[modeId].shortQuestions);
  const count = perCategory(wanted + exclude.length, config.categories.length, short);
  const r = await fetch(questionsUrl({ level: config.level, math: config.math, categories: config.categories, count }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error('Could not get questions: ' + (data.error || 'the server answered ' + r.status));
  return { questions: pickQuestions(data.round || [], { wanted, short, exclude }), notes: data.notes || [] };
}

async function startGame () {
  const setup = readSetup();
  const problem = setupProblem(setup);
  if (problem) {
    status(problem, true);
    return;
  }
  store.saveSetup(setup);
  $('start').disabled = true;
  status('Picking questions...');
  try {
    const { questions, notes } = await fetchQuestions(setup.mode, setup, setup.questions);
    const game = newGame({ id: newId(), mode: setup.mode, teams: setup.teams, config: setup, questions });
    if (questions.length < setup.questions) {
      notes.push('Only ' + questions.length + ' questions came back for those categories. "Add 10 more questions" in the More menu finds others.');
    }
    status('');
    openGame(game, notes);
  } catch (e) {
    status(e.message, true);
  } finally {
    $('start').disabled = false;
  }
}

function renderResume () {
  const games = store.savedGames().filter(g => g.version === 1 && MODES[g.mode]).slice(0, 5);
  const rows = [];
  for (const g of games) {
    let state;
    try { state = replay(g); } catch (e) { continue; }
    const where = state.over ? 'finished' : 'question ' + (state.q + 1) + ' of ' + g.questions.length;
    const when = new Date(g.updatedAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    rows.push('<div class="d-flex flex-wrap align-items-center gap-2 small mb-1"><span class="flex-grow-1">' +
      '<strong>' + esc(MODES[g.mode].name) + '</strong> &middot; ' + esc(g.teams.map(t => t.name).join(', ')) +
      ' <span class="text-secondary">(' + where + ', ' + esc(when) + ')</span></span>' +
      '<button type="button" class="btn btn-sm btn-primary" data-resume="' + esc(g.id) + '">' + (state.over ? 'Open' : 'Resume') + '</button>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-forget="' + esc(g.id) + '" title="Delete this saved game">&times;</button></div>');
  }
  $('resumeBox').innerHTML = rows.length ? '<div class="fw-semibold small mb-1">Games saved in this browser</div>' + rows.join('') : '';
  $('resumeBox').classList.toggle('d-none', !rows.length);
}

// ---------- the game ----------

/** A game coming back after a refresh or from the saved list: paused, clocks stopped. */
function settle (game) {
  const now = Date.now();
  return {
    ...game,
    paused: true,
    clock: game.clock ? stopClock(game.clock, now) : newClock(answerLimit(game, replay(game).q) * 1000),
    roundClock: game.roundClock ? stopClock(game.roundClock, now) : null
  };
}

function openGame (game, notes = []) {
  GAME = game;
  shownQuestion = replay(GAME).q;
  adjusting.clear();
  store.setMyGameId(GAME.id);
  $('setup').classList.add('d-none');
  $('readHead').classList.add('d-none');
  $('game').classList.remove('d-none');
  $('notes').innerHTML = notes.map(n => '<div class="alert alert-warning py-2 small mb-2">' + esc(n) + '</div>').join('');
  document.title = MODES[GAME.mode].name + ' - Octopus Arcade';
  changed();
  // after changed() has saved it, so the scoreboard window can load it
  showOnScreen({ kind: 'arcade', id: GAME.id });
}

function leaveGame () {
  clearInterval(ticker);
  clearTimeout(autoNext);
  ticker = null;
  autoNext = null;
  if (GAME) applySetup({ ...GAME.config, mode: GAME.mode, teams: GAME.teams, questions: GAME.questions.length });
  GAME = null;
  STATE = null;
  store.setMyGameId(null);
  $('game').classList.add('d-none');
  $('setup').classList.remove('d-none');
  $('readHead').classList.remove('d-none');
  document.title = 'Octopus Arcade';
  renderResume();
}

function save () {
  GAME.updatedAt = Date.now();
  $('saveWarn').classList.toggle('d-none', store.saveGame(GAME));
}

/** After anything changes: rebuild the state, follow it with the clocks, save, draw. */
function changed () {
  STATE = replay(GAME);
  if (STATE.q !== shownQuestion) {
    shownQuestion = STATE.q;
    GAME.clock = newClock(answerLimit(GAME, STATE.q) * 1000);
    // World Language is held up for the players to read, not read aloud
    GAME.projectQuestion = GAME.questions[STATE.q].category === 'World Language';
  }
  syncClocks();
  planAutoNext();
  save();
  render();
}

function syncClocks () {
  const now = Date.now();
  // the answer clock never runs through a buzz, a ruling, a pause, or the end
  if (GAME.paused || STATE.over || STATE.buzz !== null || STATE.settled) GAME.clock = stopClock(GAME.clock, now);
  if (GAME.roundClock) {
    const run = !GAME.paused && !STATE.over && clockLeft(GAME.roundClock, now) > 0;
    GAME.roundClock = run ? startClock(GAME.roundClock, now) : stopClock(GAME.roundClock, now);
  }
  const running = GAME.clock.since != null || Boolean(GAME.roundClock && GAME.roundClock.since != null);
  if (running && !ticker) ticker = setInterval(tick, 100);
  if (!running && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function tick () {
  if (!GAME) return;
  const now = Date.now();
  if (GAME.roundClock && GAME.roundClock.since != null && clockLeft(GAME.roundClock, now) <= 0) {
    GAME.roundClock = stopClock(GAME.roundClock, now);
    toast('Time is up!');
    dispatch({ type: 'end', reason: 'time' });
    return;
  }
  if (GAME.clock.since != null && clockLeft(GAME.clock, now) <= 0) {
    GAME.clock = stopClock(GAME.clock, now);
    $('clock').classList.add('flash');
    setTimeout(() => $('clock').classList.remove('flash'), 1400);
    syncClocks();
    save();
    // Lightning Round moves on when no one buzzes in time
    planAutoNext(true);
    renderRuling();
  }
  drawClocks();
}

function planAutoNext (timedOut = false) {
  clearTimeout(autoNext);
  autoNext = null;
  if (!MODES[GAME.mode].autoAdvance || GAME.paused || STATE.over || STATE.buzz !== null) return;
  if (!STATE.settled && !timedOut) return;
  const at = GAME.events.length;
  autoNext = setTimeout(() => {
    autoNext = null;
    if (GAME && GAME.events.length === at && !GAME.paused) dispatch({ type: 'next' });
  }, AUTO_NEXT_MS);
}

/** Runs an action through the engine; a refusal is shown, never thrown. */
function dispatch (action) {
  let next;
  try {
    next = act(GAME, action);
  } catch (e) {
    if (!(e instanceof ArcadeError)) throw e;
    toast(e.message);
    return false;
  }
  GAME = next;
  // a rebound starts the clock over for the teams still in
  if (action.type === 'wrong' && !replay(GAME).settled) GAME.clock = newClock(answerLimit(GAME, STATE.q) * 1000);
  changed();
  return true;
}

function buzz (team) {
  if (!GAME) return;
  const why = whyNoBuzz(GAME, STATE, team);
  if (why) {
    toast(why);
    const row = document.querySelector('.trow[data-team="' + team + '"]');
    if (row) {
      row.classList.remove('refused');
      // reading the layout restarts the animation
      row.getBoundingClientRect();
      row.classList.add('refused');
    }
    return;
  }
  dispatch({ type: 'buzz', team });
}

function togglePause () {
  if (STATE.over) {
    toast('The game is over.');
    return;
  }
  GAME.paused = !GAME.paused;
  if (!GAME.paused) GAME.started = true;
  changed();
}

function toggleClock () {
  if (GAME.paused) {
    toast(GAME.started ? 'Paused. Press P to go on.' : 'Press P to start the game first.');
    return;
  }
  if (STATE.over) return;
  if (STATE.buzz !== null) {
    toast('Rule on the buzz first.');
    return;
  }
  if (STATE.settled) {
    toast('This question is done. Press Next.');
    return;
  }
  GAME.clock = GAME.clock.since == null ? startClock(GAME.clock) : stopClock(GAME.clock);
  syncClocks();
  save();
  drawClocks();
}

function toggleProjection () {
  GAME.projectQuestion = !GAME.projectQuestion;
  save();
  render();
}

async function moreQuestions () {
  toast('Getting more questions...');
  try {
    const { questions } = await fetchQuestions(GAME.mode, GAME.config, MORE_QUESTIONS, GAME.questions.map(q => q.id));
    if (dispatch({ type: 'more', questions })) toast(questions.length + ' more questions added.');
  } catch (e) {
    toast(e.message);
  }
}

function addRoundTime () {
  // the clock ran out: take back the end it caused before adding time
  const last = GAME.events[GAME.events.length - 1];
  if (STATE.over === 'time' && last.t === 'end') GAME = act(GAME, { type: 'undo' });
  GAME.roundClock = addTime(GAME.roundClock, 30000);
  changed();
}

function openBoard () {
  if (!openScreen()) toast('The browser blocked the window. Allow pop-ups here, or open ' + screenUrl() + ' in a new window.');
}

const ACTIONS = {
  correct: () => dispatch({ type: 'correct' }),
  wrong: () => dispatch({ type: 'wrong' }),
  next: () => dispatch({ type: 'next' }),
  undo: () => dispatch({ type: 'undo' }),
  pause: togglePause,
  clock: toggleClock,
  plusfive: () => {
    GAME.clock = addTime(GAME.clock, 5000);
    save();
    drawClocks();
  },
  clockreset: () => {
    GAME.clock = newClock(answerLimit(GAME, STATE.q) * 1000);
    syncClocks();
    save();
    drawClocks();
  },
  addtime: addRoundTime,
  board: openBoard,
  more: moreQuestions,
  throwout: () => {
    if (window.confirm('Throw out this question? Its buzzes and rulings are taken back and the next question comes up.')) {
      dispatch({ type: 'throwout' });
    }
  },
  reset: () => {
    if (window.confirm('Put every team back to the start? Undo brings the scores back if this was a mistake.')) {
      dispatch({ type: 'reset' });
    }
  },
  end: () => {
    if (window.confirm('End the game now? The standings decide the winner.')) dispatch({ type: 'end' });
  },
  newgame: () => {
    if (STATE.over || window.confirm('Leave this game? It stays saved in this browser, and Resume brings it back.')) leaveGame();
  }
};

// ---------- drawing ----------

function hearts (n) {
  return '&hearts;'.repeat(n) + '<span class="gone">' + '&hearts;'.repeat(Math.max(0, GAME.config.lives - n)) + '</span>';
}

function drawClocks () {
  if (!GAME) return;
  const left = clockLeft(GAME.clock);
  const clock = $('clock');
  clock.textContent = formatClock(left);
  clock.classList.toggle('low', left > 0 && left <= 3000);
  clock.classList.toggle('done', left <= 0);
  $('clockBtn').textContent = (GAME.clock.since != null ? 'Stop' : 'Start') + ' clock (Space)';
  $('gRoundClock').classList.toggle('d-none', !GAME.roundClock);
  $('addTimeBtn').classList.toggle('d-none', !GAME.roundClock);
  if (GAME.roundClock) $('gRoundClock').textContent = '⏱ ' + formatClock(clockLeft(GAME.roundClock));
}

function render () {
  const mode = MODES[GAME.mode];
  const q = GAME.questions[STATE.q];
  const mod = MODIFIERS[STATE.modifier];
  const alive = STATE.teams.filter(t => !t.out).length;
  $('gMode').textContent = mode.name;
  $('gProgress').textContent = 'Question ' + (STATE.q + 1) + ' of ' + GAME.questions.length +
    (mode.lives ? ' · ' + alive + (alive === 1 ? ' team' : ' teams') + ' left' : '');
  $('qMeta').textContent = q.category + (q.tier ? ' · ' + q.tier : '');
  $('qSource').textContent = q.source || '';
  $('qText').textContent = q.question;
  $('qAnswer').textContent = q.answer;
  $('projectQ').checked = GAME.projectQuestion;

  $('modCard').classList.toggle('d-none', !mod);
  $('modCard').innerHTML = mod
    ? '<span class="mod-icon">' + mod.icon + '</span> <strong class="text-uppercase">' + esc(mod.label(mode.lives)) +
      '</strong> &mdash; ' + esc(mod.blurb(mode.lives)) + ' <span class="small opacity-75">Announce it before you read.</span>'
    : '';
  const choices = GAME.config.modifiers.filter(id => !MODIFIERS[id].livesOnly || mode.lives);
  const select = $('modSelect');
  select.classList.toggle('d-none', !GAME.config.powerUps);
  select.innerHTML = '<option value="">No power-up</option>' + choices.map(id =>
    '<option value="' + id + '">' + MODIFIERS[id].icon + ' ' + esc(MODIFIERS[id].label(mode.lives)) + '</option>').join('');
  select.value = STATE.modifier || '';
  select.disabled = Boolean(STATE.over || STATE.buzz !== null || STATE.locked.length || STATE.settled);

  $('pauseBtn').textContent = GAME.paused ? (GAME.started ? 'Resume (P)' : 'Start the game (P)') : 'Pause (P)';
  $('pauseBtn').className = 'btn btn-sm ' + (GAME.paused ? 'btn-primary' : 'btn-outline-primary');
  $('pauseBtn').disabled = Boolean(STATE.over);
  $('undoBtn').disabled = GAME.events.length <= 1;

  renderRuling();
  renderTeams();
  $('log').innerHTML = STATE.log.slice(-15).reverse().map(l => '<li>' + esc(l.text) + '</li>').join('');
  drawClocks();
}

function renderRuling () {
  const name = i => '<strong>' + esc(GAME.teams[i].name) + '</strong>';
  let h;
  if (STATE.over) {
    const won = winners(GAME, STATE);
    h = '<div class="big">&#127942; ' + (won.length === 1 ? name(won[0]) + ' wins!' : 'Tie: ' + won.map(name).join(' &amp; ')) + '</div>' +
      '<div class="small text-secondary mb-2">' + esc(OVER_TEXT[STATE.over] || '') + ' Undo takes back the last step.</div>' +
      (STATE.over === 'questions' ? '<button type="button" class="btn btn-sm btn-outline-primary me-1" data-do="more">Keep going: 10 more questions</button>' : '') +
      '<button type="button" class="btn btn-sm btn-primary" data-do="newgame">New game</button>';
  } else if (!GAME.started) {
    h = '<div class="big mb-1">Ready.</div><div class="small text-secondary mb-2">Open the scoreboard window, drag it to the ' +
      'projector, and make it full screen. Then start.</div>' +
      '<button type="button" class="btn btn-primary" data-do="pause">Start the game (P)</button>';
  } else if (STATE.buzz !== null) {
    const back = STATE.teams[STATE.buzz].out ? ' <span class="small text-secondary">(out: a right answer brings them back)</span>' : '';
    h = '<div class="big mb-2">' + name(STATE.buzz) + ' buzzed' + back + '</div>' +
      '<button type="button" class="btn btn-success me-1" data-do="correct">&check; Correct (C)</button>' +
      '<button type="button" class="btn btn-danger" data-do="wrong">&cross; Wrong (W)</button>';
  } else if (STATE.settled) {
    const next = '<button type="button" class="btn btn-primary" data-do="next">Next question (N)</button>';
    h = '<div class="big mb-2">' + (STATE.settled === 'correct' ? name(STATE.answeredBy) + ' got it.' : 'No one got it.') + '</div>' +
      (autoNext ? COMING_UP : next);
  } else {
    const open = eligibleTeams(GAME, STATE);
    const keys = open.map(i => '<kbd>' + esc(GAME.teams[i].key.toUpperCase()) + '</kbd> ' + esc(GAME.teams[i].name)).join(' &middot; ');
    const timedOut = clockLeft(GAME.clock) <= 0;
    const next = '<button type="button" class="btn btn-sm btn-outline-primary" data-do="next">' +
      (STATE.locked.length ? 'No one else: next question (N)' : 'Skip: next question (N)') + '</button>';
    h = '<div class="big mb-1">' + (STATE.locked.length ? 'Rebound' : 'Waiting for a buzz') + (timedOut ? ': time is up' : '') + '</div>' +
      '<div class="small text-secondary mb-2">May buzz: ' + keys + '</div>' + (autoNext ? COMING_UP : next);
  }
  if (GAME.paused && GAME.started && !STATE.over) {
    h = '<div class="alert alert-warning py-1 px-2 small mb-2">Paused: buzzes do not count. Press P to go on.</div>' + h;
  }
  $('ruling').innerHTML = h;
}

function renderTeams () {
  const mode = MODES[GAME.mode];
  const ranks = new Map(standings(GAME, STATE).map(s => [s.team, s.rank]));
  $('teamList').innerHTML = GAME.teams.map((team, i) => {
    const t = STATE.teams[i];
    const why = whyNoBuzz(GAME, STATE, i);
    let cls = '';
    let st = mode.lives ? '' : '#' + ranks.get(i);
    if (t.out) [cls, st] = ['out', 'Out'];
    if (STATE.locked.includes(i) && !t.out) [cls, st] = ['locked', 'Missed'];
    if (STATE.answeredBy === i && STATE.settled === 'correct') [cls, st] = ['right', 'Got it'];
    if (STATE.buzz === i) [cls, st] = ['buzzed', 'Buzzed'];
    const row = '<div class="trow ' + cls + '" data-team="' + i + '" title="' + esc(why || 'Buzz for ' + team.name) + '">' +
      '<span class="k">' + esc(team.key.toUpperCase()) + '</span>' +
      '<span class="n">' + esc(team.name) + (t.shield ? ' <span title="Shield">&#128737;&#65039;</span>' : '') + '</span>' +
      (mode.lives ? '<span class="h">' + hearts(t.lives) + '</span>' : '') +
      '<span class="p">' + t.points + '</span>' +
      '<span class="st">' + st + '</span>' +
      '<button type="button" class="btn btn-sm btn-link adj" data-adjust="' + i + '" title="Fix ' + esc(team.name) + ' by hand">&plusmn;</button>' +
      '</div>';
    if (!adjusting.has(i)) return row;
    const b = (label, attrs) => '<button type="button" class="btn btn-sm btn-outline-secondary" data-team="' + i + '" ' + attrs + '>' + label + '</button>';
    return row + '<div class="adjust">' +
      (mode.lives ? b('&minus;1 &hearts;', 'data-adj="lives" data-n="-1"') + b('+1 &hearts;', 'data-adj="lives" data-n="1"') : '') +
      b('&minus;10', 'data-adj="points" data-n="-10"') + b('+10', 'data-adj="points" data-n="10"') +
      b(t.shield ? 'Take shield' : 'Give shield', 'data-adj="shield" data-v="' + !t.shield + '"') +
      (mode.lives ? b(t.out ? 'Bring back' : 'Eliminate', 'data-adj="out" data-v="' + !t.out + '"') : '') +
      '</div>';
  }).join('');
}

function toast (text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

// ---------- events ----------

$('addTeam').onclick = () => {
  const row = addTeamRow();
  if (row) row.querySelector('.tname').focus();
};
$('powerUps').onchange = () => modeChanged(false);
$('lives').onchange = showRules;
$('minutes').onchange = showRules;
$('start').onclick = startGame;
$('projectQ').onchange = () => {
  if (GAME && GAME.projectQuestion !== $('projectQ').checked) toggleProjection();
};
$('modSelect').onchange = () => dispatch({ type: 'modifier', modifier: $('modSelect').value || null });

$('resumeBox').addEventListener('click', e => {
  const resume = e.target.closest('[data-resume]');
  const forget = e.target.closest('[data-forget]');
  if (resume) {
    const game = store.loadGame(resume.dataset.resume);
    if (game) openGame(settle(game));
    else renderResume();
  } else if (forget && window.confirm('Delete this saved game?')) {
    store.forgetGame(forget.dataset.forget);
    renderResume();
  }
});

$('teamList').addEventListener('click', e => {
  const adj = e.target.closest('[data-adj]');
  if (adj) {
    const action = { type: 'adjust', team: Number(adj.dataset.team) };
    const kind = adj.dataset.adj;
    action[kind] = kind === 'lives' || kind === 'points' ? Number(adj.dataset.n) : adj.dataset.v === 'true';
    dispatch(action);
    return;
  }
  const toggle = e.target.closest('[data-adjust]');
  if (toggle) {
    const i = Number(toggle.dataset.adjust);
    if (adjusting.has(i)) adjusting.delete(i);
    else adjusting.add(i);
    renderTeams();
    return;
  }
  const row = e.target.closest('.trow');
  if (row) buzz(Number(row.dataset.team));
});

document.addEventListener('click', e => {
  // the More menu closes on any click but the one opening it
  if (!e.target.closest('#moreMenu > summary')) $('moreMenu').open = false;
  const el = e.target.closest('[data-do]');
  if (el && GAME && ACTIONS[el.dataset.do]) ACTIONS[el.dataset.do]();
});

document.addEventListener('keydown', e => {
  if (!GAME || e.repeat || e.metaKey || e.altKey) return;
  const target = e.target;
  const tag = (target && target.tagName ? target.tagName : '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.ctrlKey) {
    if (key === 'z') {
      e.preventDefault();
      ACTIONS.undo();
    }
    return;
  }
  const team = GAME.teams.findIndex(t => t.key === key);
  const run = team !== -1
    ? () => buzz(team)
    : { c: ACTIONS.correct, w: ACTIONS.wrong, n: ACTIONS.next, z: ACTIONS.undo, p: ACTIONS.pause, s: toggleProjection, ' ': toggleClock }[key];
  if (!run) return;
  e.preventDefault();
  // a focused button would otherwise take the key as a click as well
  if (tag === 'button' || tag === 'summary') target.blur();
  run();
});

// a refresh or a closed tab leaves the game paused with its clocks stopped
window.addEventListener('pagehide', () => {
  if (!GAME) return;
  GAME = settle(GAME);
  save();
});

// ---------- start ----------

renderModes();
renderModifiers();
const savedSetup = store.loadSetup();
applySetup(savedSetup || {});
if (!savedSetup) modeChanged(true);
loadLineups();
const mine = store.myGameId() ? store.loadGame(store.myGameId()) : null;
if (mine && mine.version === 1 && MODES[mine.mode]) openGame(settle(mine));
else renderResume();
