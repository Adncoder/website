// Which right answers celerity leaves out: the ones given after every other
// team had already missed, when nobody was left to race.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reboundsIn } from '../server/kshsaa/rebounds.js';

const buzz = (questionNumber, team, value, player = team + ' player') => ({ questionNumber, team, value, player });
const game = (teamNames, buzzes) => ({ teams: teamNames.map(name => ({ name, players: [] })), buzzes });
const questionsOf = set => [...set].map(b => b.questionNumber).sort((a, b) => a - b);

test('a right answer after the other team missed is a rebound', () => {
  const g = game(['Crimson', 'Gold'], [
    buzz(1, 'Crimson', 10),
    buzz(2, 'Gold', 10), buzz(2, 'Crimson', -5),
    buzz(3, 'Crimson', 10), buzz(3, 'Gold', 0),
    buzz(4, 'Gold', -5)
  ]);
  assert.deepEqual(questionsOf(reboundsIn(g)), [2, 3]);
});

test('the wrong answer counts whichever order the buzzes were stored in', () => {
  // the reader stores the right answer first, the tournament grid the wrong one
  const g = game(['SJA', 'Other School'], [
    buzz(5, 'Other School', -5, null), buzz(5, 'SJA', 10),
    buzz(6, 'SJA', -5), buzz(6, 'Other School', 10, null)
  ]);
  assert.deepEqual(questionsOf(reboundsIn(g)), [5, 6]);
});

test('with three teams, two still racing is not a rebound', () => {
  const g = game(['A', 'B', 'C'], [
    buzz(1, 'A', -5), buzz(1, 'B', 10),
    buzz(2, 'A', -5), buzz(2, 'C', 0), buzz(2, 'B', 10)
  ]);
  assert.deepEqual(questionsOf(reboundsIn(g)), [2]);
});

test('a team that only shows up in the buzzes still counts as a team', () => {
  const g = { teams: [{ name: 'A', players: [] }], buzzes: [buzz(1, 'B', -5), buzz(1, 'A', 10), buzz(2, 'A', 10)] };
  assert.deepEqual(questionsOf(reboundsIn(g)), [1]);
});

test('one team alone, or a game with no buzzes, has no rebounds', () => {
  assert.equal(reboundsIn(game(['A'], [buzz(1, 'A', 10)])).size, 0);
  assert.equal(reboundsIn({}).size, 0);
});

test('a miss by the answering team itself does not make a rebound', () => {
  const g = game(['A', 'B'], [buzz(1, 'A', 0), buzz(1, 'A', 10)]);
  assert.equal(reboundsIn(g).size, 0);
});
