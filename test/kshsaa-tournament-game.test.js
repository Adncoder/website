// Tournament sheets as coaches actually keep them: the other team's points by
// question, not at all, or no other team (a chair), and rounds longer than 16.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { opponentModeOf, resultOf } from '../server/kshsaa/game-stats.js';
import { CATEGORY_BY_QUESTION } from '../server/kshsaa/round-shape.js';
import { MAX_QUESTIONS, tournamentGame } from '../server/kshsaa/tournament-game.js';

const same = name => name;
// Avery gets questions 1-3 and Blake loses 5 on 4 (25 for us); they get 5 and
// lose 5 on 6 (5 for them)
const sheet = (extra = {}, count = 16) => ({
  tournament: 'Hays Invitational',
  date: '2026-11-14',
  level: 'varsity',
  round: '3',
  team: 'SJA',
  opponent: 'Hays',
  players: [{ name: 'Avery' }, { name: 'Blake' }],
  questions: Array.from({ length: count }, (_, i) => ({
    category: CATEGORY_BY_QUESTION[i % 16],
    us: i < 3 ? { player: 'Avery', value: 10 } : i === 3 ? { player: 'Blake', value: -5 } : null,
    them: i === 4 ? 10 : i === 5 ? -5 : null
  })),
  ...extra
});
const theirs = g => g.teams.find(t => t.opponent);

test('a full sheet scores both sides and finds the winner', () => {
  const g = tournamentGame(sheet(), same);
  assert.equal(g.opponentMode, 'recorded');
  assert.equal(g.teams[0].score, 25);
  assert.equal(theirs(g).score, 5);
  assert.equal(g.result, 'win');
  assert.equal(g.buzzes.filter(b => !b.player).length, 2);
  assert.equal(g.label, 'Hays Invitational, round 3 vs Hays');
});

test('a sheet without their points keeps our side and leaves theirs blank', () => {
  // whatever their column held, a sheet marked unrecorded never stores it
  const g = tournamentGame(sheet({ opponentMode: 'unrecorded' }), same);
  assert.equal(g.opponentMode, 'unrecorded');
  assert.equal(g.teams[0].score, 25);
  assert.equal(theirs(g).score, null);
  assert.equal(g.result, null);
  assert.equal(resultOf(g), null);
  assert.deepEqual(g.buzzes.map(b => b.player), ['Avery', 'Avery', 'Avery', 'Blake']);
});

test('their final score, when the sheet has it, decides who won', () => {
  const lost = tournamentGame(sheet({ opponentMode: 'unrecorded', opponentScore: '40', result: 'win' }), same);
  assert.equal(theirs(lost).score, 40);
  assert.equal(lost.result, 'loss');
  const tied = tournamentGame(sheet({ opponentMode: 'unrecorded', opponentScore: 25 }), same);
  assert.equal(tied.result, 'tie');
  assert.throws(() => tournamentGame(sheet({ opponentMode: 'unrecorded', opponentScore: '12.5' }), same), /whole number/);
});

test('without a final score, who won can still be given', () => {
  assert.equal(tournamentGame(sheet({ opponentMode: 'unrecorded', result: 'win' }), same).result, 'win');
  assert.equal(tournamentGame(sheet({ opponentMode: 'unrecorded', result: 'loss' }), same).result, 'loss');
  assert.equal(tournamentGame(sheet({ opponentMode: 'unrecorded', result: 'forfeit' }), same).result, null);
  // and a full sheet's result is always its score
  assert.equal(tournamentGame(sheet({ result: 'loss' }), same).result, 'win');
});

test('a chair has no other team and is neither a win nor a loss', () => {
  const g = tournamentGame(sheet({ opponentMode: 'chair', opponent: '' }), same);
  assert.equal(g.opponent, null);
  assert.equal(g.teams.length, 1);
  assert.equal(g.result, null);
  assert.equal(resultOf(g), 'chair');
  assert.equal(g.label, 'Hays Invitational, round 3 (chair)');
  assert.equal(g.buzzes.filter(b => !b.player).length, 0);
  assert.equal(g.teams[0].score, 25);
});

test('a sheet needs an opponent unless it was a chair', () => {
  assert.throws(() => tournamentGame(sheet({ opponent: '' }), same), /who was the opponent/);
  assert.throws(() => tournamentGame(sheet({ opponent: '', opponentMode: 'unrecorded' }), same), /who was the opponent/);
});

test('rounds run past 16, the extra subjects starting the order over', () => {
  const long = sheet({}, 20);
  for (const q of long.questions.slice(16)) delete q.category;
  const g = tournamentGame(long, same);
  assert.equal(g.tossupsRead, 20);
  assert.deepEqual(g.categories.slice(16), CATEGORY_BY_QUESTION.slice(0, 4));
  assert.equal(g.heardByPlayer['SJA|Avery'], 20);
  assert.throws(() => tournamentGame(sheet({}, MAX_QUESTIONS + 1), same), /1 to 40 questions/);
});

test('games saved before sheets could say count as fully recorded', () => {
  const old = {
    kind: 'tournament',
    teams: [{ name: 'SJA', players: [], score: 120 }, { name: 'Hays', players: [], score: 120, opponent: true }]
  };
  assert.equal(opponentModeOf(old), 'recorded');
  assert.equal(resultOf(old), 'tie');
  old.teams[1].score = 90;
  assert.equal(resultOf(old), 'win');
});
