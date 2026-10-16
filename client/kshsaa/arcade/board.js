// The Octopus Arcade scoreboard: a second window for the projector. It shows
// whichever game its console tab has open, replaying the same saved event list
// so it can never disagree with the console, and redraws whenever the console
// saves. Its animations come from comparing each state with the one before.

import { MODES } from './modes/index.js';
import { MODIFIERS } from './modifiers.js';
import { replay, standings, winners } from './engine.js';
import { clockLeft, formatClock } from './clock.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const channel = new URLSearchParams(window.location.search).get('channel') || '';
const OVER_TEXT = {
  'last-standing': 'Last team standing',
  questions: 'Out of questions',
  time: 'Time is up',
  moderator: 'Final standings'
};
const CONFETTI_COLORS = ['#ffc933', '#ff4f63', '#38d98a', '#58a6ff', '#b98cff', '#ffffff'];

let GAME = null;
let STATE = null;
let tiles = [];

function show (game) {
  let state = null;
  try {
    state = game && MODES[game.mode] ? replay(game) : null;
  } catch (e) {}
  if (!state) {
    GAME = null;
    STATE = null;
    empty('No game yet. Start one on the Octopus Arcade page and it appears here by itself.');
    return;
  }
  // animate only from the same game's last state, never across games
  const prev = GAME && GAME.id === game.id ? STATE : null;
  GAME = game;
  if (!prev) buildTiles();
  draw(state, prev);
  STATE = state;
}

function empty (text) {
  for (const id of ['bMode', 'bProgress', 'bStatus', 'bClock', 'bRound']) $(id).textContent = '';
  for (const id of ['bMod', 'bFoot', 'overlay', 'bRound']) $(id).classList.add('hidden');
  $('tiles').innerHTML = '<div class="empty">' + esc(text) + '</div>';
  tiles = [];
}

// Columns that make the tiles as big as they can be at a comfortable shape on
// whatever screen this is: four teams sit two by two on a 16:9 projector
// rather than as four tall strips.
function layoutTiles () {
  const n = tiles.length;
  if (!n) return;
  const { width, height } = $('tiles').getBoundingClientRect();
  let best = 1;
  let bestSize = 0;
  for (let cols = 1; cols <= n; cols++) {
    const size = Math.min(width / cols / 1.2, height / Math.ceil(n / cols));
    if (size > bestSize) [best, bestSize] = [cols, size];
  }
  $('tiles').style.setProperty('--cols', best);
}

function buildTiles () {
  const box = $('tiles');
  box.className = MODES[GAME.mode].lives ? 'lives-mode' : 'points-mode';
  box.innerHTML = '';
  tiles = GAME.teams.map(() => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = '<div class="t-key"></div><div class="t-tag"></div><div class="t-name"></div>' +
      '<div class="t-lives"></div><div class="t-points"></div><div class="stamp">OUT</div>';
    box.appendChild(el);
    return el;
  });
  layoutTiles();
}

/** Restarts a CSS animation on an element. */
function animate (el, name, ms = 1600) {
  el.classList.remove(name);
  // reading the layout restarts the animation
  el.getBoundingClientRect();
  el.classList.add(name);
  setTimeout(() => el.classList.remove(name), ms);
}

function float (el, text, kind) {
  const f = document.createElement('div');
  f.className = 'float ' + kind;
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 2000);
}

const signed = n => (n > 0 ? '+' : '−') + Math.abs(n);

function drawTile (i, state, prev, won) {
  const el = tiles[i];
  const team = GAME.teams[i];
  const t = state.teams[i];
  const was = prev && prev.teams[i];
  const lives = MODES[GAME.mode].lives;
  el.querySelector('.t-key').textContent = team.key.toUpperCase();
  el.querySelector('.t-name').textContent = team.name;
  el.querySelector('.t-lives').innerHTML = lives
    ? '♥'.repeat(t.lives) + '<span class="gone">' + '♥'.repeat(Math.max(0, GAME.config.lives - t.lives)) + '</span>'
    : '';
  el.querySelector('.t-points').textContent = t.points + (lives ? ' pts' : '');
  const buzzed = state.buzz === i && !state.over;
  const right = state.settled === 'correct' && state.answeredBy === i;
  const missed = state.locked.includes(i) && !t.out;
  el.classList.toggle('buzzed', buzzed);
  el.classList.toggle('right', right);
  el.classList.toggle('locked', missed && !state.settled);
  el.classList.toggle('out', t.out);
  el.classList.toggle('shielded', t.shield);
  el.classList.toggle('winner', won.includes(i));
  el.querySelector('.t-tag').textContent = buzzed ? 'BUZZ!' : right ? '✓' : missed ? '✗' : t.shield ? '🛡️' : '';

  if (!was) return;
  if (buzzed && prev.buzz !== i) animate(el, 'buzzpop', 400);
  if (t.out && !was.out) animate(el, 'knockout', 1500);
  else if (!t.out && was.out) animate(el, 'revive', 1200);
  else if (t.lives < was.lives) animate(el, 'hit', 700);
  else if (t.lives > was.lives) animate(el, 'heal', 1000);
  const parts = [];
  let good = 0;
  if (lives && t.lives !== was.lives && !(t.out && !was.out)) {
    parts.push(signed(t.lives - was.lives) + ' ♥');
    good += t.lives - was.lives;
  }
  if (t.points !== was.points) {
    parts.push(signed(t.points - was.points));
    good += Math.sign(t.points - was.points);
  }
  if (parts.length) float(el, parts.join('  '), good >= 0 ? 'good' : 'bad');
  else if (was.shield && !t.shield && !t.out) float(el, 'Shield blocked it!', 'info');
  else if (!was.shield && t.shield) float(el, '+ Shield', 'info');
}

function drawFoot (state) {
  const q = GAME.questions[state.q];
  const showAnswer = GAME.config.showAnswers && Boolean(state.settled);
  const foot = $('bFoot');
  if (!GAME.projectQuestion && !showAnswer) {
    foot.classList.add('hidden');
    layoutTiles();
    return;
  }
  $('bFit').innerHTML = (GAME.projectQuestion ? '<div class="f-q">' + esc(q.question) + '</div>' : '') +
    (showAnswer ? '<div class="f-a"><span class="f-label">ANSWER</span>' + esc(q.answer) + '</div>' : '');
  foot.classList.remove('hidden');
  // the largest text that fits: a question gets about a third of the screen,
  // an answer alone a strip, so the teams stay the biggest thing on it
  const most = window.innerHeight * (GAME.projectQuestion ? 0.36 : 0.15);
  let lo = 14;
  let hi = GAME.projectQuestion ? 72 : 52;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    $('bFit').style.fontSize = mid + 'px';
    if (foot.scrollHeight <= most) lo = mid;
    else hi = mid;
  }
  $('bFit').style.fontSize = lo + 'px';
  // the tiles just lost or gained room
  layoutTiles();
}

function confetti () {
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    c.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
    c.style.animationDelay = Math.random() * 1.2 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6500);
  }
}

function drawOverlay (state, prev, won) {
  const box = $('overlay');
  const mode = MODES[GAME.mode];
  if (state.over) {
    const names = won.map(i => esc(GAME.teams[i].name)).join(' &amp; ');
    const top = standings(GAME, state).slice(0, 5).map(s => {
      const t = state.teams[s.team];
      const score = mode.lives ? (t.out ? 'out' : '♥'.repeat(t.lives)) + ' · ' + t.points + ' pts' : t.points;
      return '<div><span class="o-rank">' + s.rank + '.</span>' + esc(GAME.teams[s.team].name) + ' &nbsp;<span class="o-small">' + score + '</span></div>';
    }).join('');
    box.innerHTML = '<div class="o-small">' + esc(OVER_TEXT[state.over] || '') + '</div>' +
      '<div class="o-trophy">🏆</div><div class="o-name">' + names + '</div>' +
      '<div class="o-small">' + (won.length > 1 ? 'tie!' : 'wins!') + '</div><div class="o-list">' + top + '</div>';
    box.classList.remove('hidden');
    if (!prev || !prev.over) confetti();
  } else if (GAME.paused) {
    box.innerHTML = GAME.started
      ? '<div class="o-big">PAUSED</div>'
      : '<div class="o-small">Get ready for</div><div class="o-big">' + esc(mode.name) + '</div>' +
        '<ul class="o-rules">' + mode.rules(GAME.config).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>';
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

function draw (state, prev) {
  const mode = MODES[GAME.mode];
  const won = winners(GAME, state);
  document.title = mode.name + ' - Scoreboard';
  $('bMode').textContent = mode.name;
  $('bProgress').textContent = 'Question ' + (state.q + 1) + (mode.timed ? '' : ' of ' + GAME.questions.length);

  const status = $('bStatus');
  const alive = state.teams.filter(t => !t.out).length;
  let text = mode.lives ? alive + (alive === 1 ? ' team' : ' teams') + ' left' : '';
  let kind = '';
  if (!state.over && state.buzz !== null) [text, kind] = [GAME.teams[state.buzz].name + ' buzzed', 'buzz'];
  else if (!state.over && state.settled === 'correct') [text, kind] = [GAME.teams[state.answeredBy].name + ' got it!', 'right'];
  else if (!state.over && state.settled === 'dead') text = 'No one got it';
  else if (!state.over && state.locked.length) [text, kind] = ['Rebound!', 'rebound'];
  status.textContent = text;
  status.className = kind;

  const mod = MODIFIERS[state.modifier];
  const banner = $('bMod');
  banner.classList.toggle('hidden', !mod || Boolean(state.over));
  if (mod) {
    banner.innerHTML = '<span class="m-icon">' + mod.icon + '</span><span class="m-label">' + esc(mod.label(mode.lives)) +
      '</span><span>' + esc(mod.blurb(mode.lives)) + '</span>';
    if (!prev || prev.q !== state.q || prev.modifier !== state.modifier) animate(banner, 'slam', 700);
  }

  GAME.teams.forEach((team, i) => drawTile(i, state, prev, won));
  drawFoot(state);
  drawOverlay(state, prev, won);
  drawClocks(state);
}

function drawClocks (state = STATE) {
  if (!GAME || !state) return;
  const clock = $('bClock');
  const open = !state.over && !state.settled && state.buzz === null;
  const left = clockLeft(GAME.clock);
  clock.textContent = open ? formatClock(left) : '';
  clock.classList.toggle('low', left > 0 && left <= 3000);
  clock.classList.toggle('done', left <= 0);
  const round = $('bRound');
  round.classList.toggle('hidden', !GAME.roundClock);
  if (GAME.roundClock) {
    const roundLeft = clockLeft(GAME.roundClock);
    round.textContent = '⏱ ' + formatClock(roundLeft);
    round.classList.toggle('low', roundLeft <= 15000);
  }
}

$('fsBtn').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
};
document.addEventListener('fullscreenchange', () => {
  $('fsBtn').classList.toggle('hidden', Boolean(document.fullscreenElement));
});
// the text that fits depends on the window, which changes going full screen
window.addEventListener('resize', () => {
  layoutTiles();
  if (GAME && STATE) drawFoot(STATE);
});

if (!channel) {
  empty('Open the scoreboard with the "Open scoreboard window" button on the Octopus Arcade page.');
} else {
  show(store.loadGame(store.channelGameId(channel)));
  store.watchChannel(channel, show);
  setInterval(() => drawClocks(), 100);
}
