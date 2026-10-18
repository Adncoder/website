// An Octopus Arcade game on the scoreboard window (scoreboard/page.js). It
// replays the same saved event list as the console, so the two can never
// disagree, and its animations come from comparing each state with the one
// before.

import { MODES } from './modes/index.js';
import { MODIFIERS } from './modifiers.js';
import { replay, standings, winners } from './engine.js';
import { clockLeft, formatClock } from './clock.js';
import { $, animate, buildTiles, esc, fitFoot, float, hideFoot, signed, tileAt } from '../scoreboard/tiles.js';

const OVER_TEXT = {
  'last-standing': 'Last team standing',
  questions: 'Out of questions',
  time: 'Time is up',
  moderator: 'Final standings'
};
const CONFETTI_COLORS = ['#ffc933', '#ff4f63', '#38d98a', '#58a6ff', '#b98cff', '#ffffff'];

let GAME = null;
let STATE = null;

function drawTile (i, state, prev, won) {
  const el = tileAt(i);
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

// the question when the moderator puts it up, and the answer once it is done:
// a question gets about a third of the screen, an answer alone a strip, so the
// teams stay the biggest thing on it
function drawFoot (state) {
  const q = GAME.questions[state.q];
  const showAnswer = GAME.config.showAnswers && Boolean(state.settled);
  if (!GAME.projectQuestion && !showAnswer) {
    hideFoot();
    return;
  }
  fitFoot((GAME.projectQuestion ? '<div class="f-q">' + esc(q.question) + '</div>' : '') +
    (showAnswer ? '<div class="f-a"><span class="f-label">ANSWER</span>' + esc(q.answer) + '</div>' : ''),
  GAME.projectQuestion ? 0.36 : 0.15, GAME.projectQuestion ? 72 : 52);
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
  tickArcade(state);
}

/**
 * Draws a game, animating from the last drawing when it is the same game.
 * @param {import('./engine.js').Game} game
 * @param {boolean} same - the screen already shows this game
 * @returns {boolean} false if the game could not be read
 */
export function showArcade (game, same) {
  let state;
  try {
    state = replay(game);
  } catch (e) {
    return false;
  }
  const prev = same && GAME && GAME.id === game.id && STATE && STATE.teams.length === state.teams.length ? STATE : null;
  GAME = game;
  if (!prev) buildTiles(game.teams.length, MODES[game.mode].lives ? 'lives-mode' : 'points-mode');
  draw(state, prev);
  STATE = state;
  return true;
}

/** The clocks, ten times a second. */
export function tickArcade (state = STATE) {
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

/** After the window changes size. */
export function refitArcade () {
  if (GAME && STATE) drawFoot(STATE);
}
