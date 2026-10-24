// A normal round on the scoreboard window: the teams and their scores as the
// reader reads them off MODAQ, the question and its category, the answer
// clock, and a World Language question while the moderator holds it up.

import { clockLeft, formatClock } from '../arcade/clock.js';
import { $, animate, announce, buildTiles, esc, fitFoot, float, hideFoot, signed, tileAt } from './tiles.js';

/**
 * What the reader writes out (publishScreen in routes/kshsaa-play.js).
 * @typedef {object} MatchView
 * @property {'match'} kind
 * @property {string} roundId
 * @property {string} label
 * @property {string} level
 * @property {{name: string, score: number}[]} teams - in MODAQ's order
 * @property {number} question
 * @property {number} total
 * @property {string} category
 * @property {import('../arcade/clock.js').Clock} clock
 * @property {?{tag: ?string, text: string}[]} display - a question held up, one line per language
 * @property {boolean} final - saved to stats
 */

/** @type {?MatchView} */
let VIEW = null;

function drawDisplay () {
  if (!VIEW.display) {
    hideFoot();
    return;
  }
  fitFoot(VIEW.display.map(l => '<div class="lang-line">' +
    (l.tag ? '<span class="lang-tag">' + esc(l.tag) + '</span>' : '') +
    '<span>' + esc(l.text) + '</span></div>').join(''), 0.62, 160);
}

/**
 * @param {MatchView} view
 * @param {boolean} same - the screen already shows this round
 */
export function showMatch (view, same) {
  const prev = same && VIEW && VIEW.teams.length === view.teams.length ? VIEW : null;
  VIEW = view;
  if (!prev) buildTiles(view.teams.length, 'points-mode');
  document.title = (view.label || 'Round') + ' - Scoreboard';
  $('bMode').textContent = view.level || 'Scholars Bowl';
  // past the last question is MODAQ's tiebreaker
  const tiebreaker = view.question > view.total;
  $('bProgress').textContent = tiebreaker ? 'Tiebreaker' : 'Question ' + view.question + ' of ' + view.total;
  $('bStatus').textContent = view.final ? 'Final' : tiebreaker ? '' : view.category;
  // forward only: going back a question to fix a score is not a new question
  if (prev && view.question > prev.question && !view.final) {
    announce(tiebreaker ? 'Tiebreaker' : 'Question ' + view.question, tiebreaker ? '' : view.category);
  }
  $('bStatus').className = view.final ? 'right' : '';
  const top = Math.max(...view.teams.map(t => t.score));
  view.teams.forEach((team, i) => {
    const el = tileAt(i);
    const lead = view.final && team.score === top;
    el.querySelector('.t-name').textContent = team.name;
    el.querySelector('.t-points').textContent = team.score;
    el.querySelector('.t-tag').textContent = lead ? '🏆' : '';
    el.classList.toggle('winner', lead);
    const was = prev && prev.teams[i];
    if (was && was.score !== team.score) {
      const change = team.score - was.score;
      animate(el, change > 0 ? 'heal' : 'hit', change > 0 ? 1000 : 700);
      float(el, signed(change), change > 0 ? 'good' : 'bad');
    }
  });
  drawDisplay();
  tickMatch();
}

/** The answer clock, ten times a second. */
export function tickMatch () {
  if (!VIEW) return;
  const clock = $('bClock');
  const left = clockLeft(VIEW.clock);
  clock.textContent = VIEW.final ? '' : formatClock(left);
  clock.classList.toggle('low', left > 0 && left <= 3000);
  clock.classList.toggle('done', left <= 0);
}

/** After the window changes size. */
export function refitMatch () {
  if (VIEW) drawDisplay();
}
