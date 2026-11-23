// Insights' tournament tables: the schools we played, and who got each
// subject's questions. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeInsights, schoolOf } from '../server/kshsaa/insights.js';
import { CATEGORY_BY_QUESTION } from '../server/kshsaa/round-shape.js';
import { tournamentGame } from '../server/kshsaa/tournament-game.js';

const same = name => name;
const everything = { inMonth: () => true, inLevel: () => true };
const nobodyVarsity = () => false;

// A round typed in from a sheet. us: question number -> [player, +10 or -5];
// them: question number -> +10 or -5. The regular order reads World
// Language at 1, Language Arts at 2-4, and Science/Health at 5-7.
function round (opponent, { us = {}, them = {}, mode = 'recorded', level = 'jv', n = '1', tournament = 'Hays Invitational', theirScore = '' } = {}) {
  return tournamentGame({
    tournament,
    date: '2026-11-14',
    level,
    round: n,
    team: 'SJA',
    opponent,
    opponentMode: mode,
    opponentScore: theirScore,
    players: [{ name: 'Avery' }, { name: 'Blake' }, { name: 'Casey' }],
    questions: CATEGORY_BY_QUESTION.map((category, i) => ({
      category,
      us: us[i + 1] ? { player: us[i + 1][0], value: us[i + 1][1] } : null,
      them: them[i + 1] ?? null
    }))
  }, same);
}

test('a school is one school however its name was typed, at one level in one school year', () => {
  const g = (opponent, level = 'jv', date = '2026-11-14') => ({ kind: 'tournament', tournament: 'Hays', opponent, level, playedAt: new Date(date + 'T18:00:00Z') });
  assert.equal(schoolOf(g('Spring Hill')), schoolOf(g('Springhill')));
  assert.equal(schoolOf(g('De Soto')), schoolOf(g('desoto')));
  // a school's JV and varsity are different teams, and so is next year's
  assert.notEqual(schoolOf(g('Spring Hill')), schoolOf(g('Spring Hill', 'varsity')));
  assert.notEqual(schoolOf(g('Spring Hill')), schoolOf(g('Spring Hill', 'jv', '2027-11-13')));
  assert.equal(schoolOf(g('Unknown')), null);
  assert.equal(schoolOf(g('')), null);
  assert.equal(schoolOf({ kind: 'practice', opponent: 'Hays', playedAt: new Date('2026-11-14T18:00:00Z') }), null);
});

test('where we lose questions counts who got each subject, from sheets with both sides', () => {
  const games = [
    // they get World Language, and Science/Health at 5 after Avery's -5
    round('Hays', { us: { 2: ['Avery', 10], 3: ['Blake', 10], 5: ['Avery', -5] }, them: { 1: 10, 5: 10 } }),
    // a sheet without their side, and a chair, say nothing about who beat us
    round('Hays', { n: '2', mode: 'unrecorded', us: { 1: ['Casey', 10] } }),
    round('', { n: '3', mode: 'chair', us: { 1: ['Casey', 10] } }),
    round('Olathe West', { level: 'varsity', tournament: 'Big Varsity', us: { 1: ['Avery', 10] } })
  ];
  const { losing } = computeInsights(games, everything, new Map(), nobodyVarsity);
  const row = (level, category) => losing.find(r => r.level === level && r.category === category);
  assert.deepEqual(row('jv', 'World Language'), { level: 'jv', category: 'World Language', read: 1, us: 0, them: 1, nobody: 0, ourNegs: 0 });
  assert.deepEqual(row('jv', 'Language Arts'), { level: 'jv', category: 'Language Arts', read: 3, us: 2, them: 0, nobody: 1, ourNegs: 0 });
  assert.deepEqual(row('jv', 'Science/Health'), { level: 'jv', category: 'Science/Health', read: 3, us: 0, them: 1, nobody: 2, ourNegs: 1 });
  assert.equal(row('varsity', 'World Language').us, 1);
  // JV first, each level in the round's order
  assert.deepEqual(losing.slice(0, 2).map(r => r.category), ['World Language', 'Language Arts']);
  assert.equal(losing.filter(r => r.level === 'jv').reduce((s, r) => s + r.read, 0), 16);
});

test('each school we played has our record against it and its strength', () => {
  const games = [
    round('Spring Hill', { us: { 1: ['Avery', 10], 2: ['Avery', 10], 3: ['Blake', 10] }, them: { 5: 10 } }),
    round('Springhill', { n: '2', us: { 1: ['Avery', 10] }, them: { 2: 10, 3: 10, 4: 10 } }),
    round('Hays', { n: '3', mode: 'unrecorded', us: { 2: ['Avery', 10] }, theirScore: '40' }),
    round('Unknown', { n: '4', us: { 2: ['Blake', 10] } }),
    round('Spring Hill', { level: 'varsity', tournament: 'Big Varsity', us: { 1: ['Casey', 10] }, them: { 2: 10 } })
  ];
  const { schools } = computeInsights(games, everything, new Map(), nobodyVarsity);
  const spring = schools.find(s => s.name === 'Spring Hill' && s.level === 'jv');
  assert.deepEqual(spring.alsoTyped, ['Springhill']);
  assert.deepEqual([spring.games, spring.win, spring.loss, spring.tie], [2, 1, 1, 0]);
  assert.deepEqual([spring.ours, spring.theirs], [20, 20]);
  assert.ok(spring.alone > 0 && spring.alone < 16 && spring.oursAlone > 0, JSON.stringify(spring));
  assert.equal(spring.guess, false);
  // never on a sheet with their side: a guess, and only one score known
  const hays = schools.find(s => s.name === 'Hays');
  assert.deepEqual([hays.games, hays.loss, hays.guess, hays.ours, hays.theirs], [1, 1, true, 10, 40]);
  assert.equal(schools.some(s => s.name === 'Unknown'), false);
  // the varsity team is a school of its own, after the JV ones
  assert.equal(schools[schools.length - 1].level, 'varsity');
  assert.equal(schools.filter(s => s.name === 'Spring Hill').length, 2);
});
