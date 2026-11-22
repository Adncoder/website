// Tournament sheets as coaches actually keep them: the other team's points by
// question, not at all, or no other team (a chair), rounds longer than 16, and
// playoff rounds. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { opponentModeOf, resultOf } from '../server/kshsaa/game-stats.js';
import { CATEGORY_BY_QUESTION } from '../server/kshsaa/round-shape.js';
import { MAX_QUESTIONS, SUBJECT_ORDERS, SUBJECTS, tournamentGame, withSubjects } from '../server/kshsaa/tournament-game.js';

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

test('a playoff game goes by its stage', () => {
  const g = tournamentGame(sheet({ round: '7', stage: 'semifinal' }), same);
  assert.equal(g.stage, 'semifinal');
  assert.equal(g.round, '7');
  assert.equal(g.label, 'Hays Invitational, semifinal vs Hays');
  const third = tournamentGame(sheet({ round: '', stage: 'third' }), same);
  assert.equal(third.label, 'Hays Invitational, third-place game vs Hays');
});

test('a regular round has no stage, and an unknown one counts as regular', () => {
  assert.equal(tournamentGame(sheet(), same).stage, null);
  assert.equal(tournamentGame(sheet({ stage: '' }), same).stage, null);
  assert.equal(tournamentGame(sheet({ stage: 'grand final' }), same).stage, null);
  assert.equal(tournamentGame(sheet({ stage: 'toString' }), same).stage, null);
});

test('a chair cannot be a playoff game', () => {
  assert.throws(() => tournamentGame(sheet({ opponentMode: 'chair', opponent: '', stage: 'final' }), same), /playoff game has an opponent/);
});

const order = key => SUBJECT_ORDERS.find(o => o.key === key).order;
// question n's subject in an order, 1 first
const at = (key, n) => order(key)[n - 1];

test('the orders some tournaments read are full rounds without World Language', () => {
  assert.deepEqual(order('regular'), CATEGORY_BY_QUESTION);
  for (const o of SUBJECT_ORDERS) {
    assert.equal(o.order.length, 16, o.key);
    assert.ok(o.order.every(s => SUBJECTS.includes(s)), o.key);
    if (o.key !== 'regular') assert.ok(!o.order.includes('World Language'), o.key);
  }
  // another Language Arts: Language Arts takes questions 1 to 4
  assert.deepEqual([1, 2, 3, 4, 5].map(n => at('language-arts', n)), ['Language Arts', 'Language Arts', 'Language Arts', 'Language Arts', 'Science/Health']);
  // another Fine Arts: everything moves up a row, three Fine Arts, Year in Review last
  assert.deepEqual([1, 4, 12, 13, 15, 16].map(n => at('fine-arts', n)),
    ['Language Arts', 'Science/Health', 'Mathematics', 'Fine Arts', 'Fine Arts', 'Year in Review']);
  // Misc after Fine Arts, before Year in Review
  assert.deepEqual([13, 14, 15, 16].map(n => at('misc', n)), ['Fine Arts', 'Fine Arts', 'Other', 'Year in Review']);
});

test('a sheet keeps the subjects it gives, Misc included', () => {
  const s = sheet();
  s.questions[0].category = 'Language Arts';
  s.questions[14].category = 'Other';
  s.questions[14].us = { player: 'Avery', value: 10 };
  s.questions[15].category = 'Underwater Basketweaving';
  const g = tournamentGame(s, same);
  assert.equal(g.categories[0], 'Language Arts');
  assert.equal(g.categories[14], 'Other');
  // a subject the site does not know is the question's regular one
  assert.equal(g.categories[15], 'Year in Review');
  // a Misc answer counts in the score like any other
  assert.equal(g.teams[0].score, 35);
  assert.equal(g.buzzes.find(b => b.questionNumber === 15).category, 'Other');
});

test('another round changed to these subjects keeps its points', () => {
  const g = tournamentGame(sheet(), same);
  const changed = withSubjects(g, order('fine-arts'));
  assert.deepEqual(changed.categories, order('fine-arts'));
  // Avery's question 1 was World Language and is now Language Arts; Blake's
  // -5 on 4 is now Science/Health; their buzzes on 5 and 6 follow too
  assert.deepEqual(changed.buzzes.map(b => [b.questionNumber, b.category, b.value]), [
    [1, 'Language Arts', 10], [2, 'Language Arts', 10], [3, 'Language Arts', 10], [4, 'Science/Health', -5],
    [5, 'Science/Health', 10], [6, 'Science/Health', -5]
  ]);
  assert.deepEqual(changed.buzzes.map(b => b.player), g.buzzes.map(b => b.player));
  // the game itself is left alone until it is saved
  assert.equal(g.categories[0], 'World Language');
  assert.equal(withSubjects(g, CATEGORY_BY_QUESTION), null);
});

test('subjects change only as far as both rounds go', () => {
  const long = sheet({}, 20);
  for (const q of long.questions.slice(16)) q.category = 'Other';
  const g = tournamentGame(long, same);
  const changed = withSubjects(g, order('misc'));
  assert.deepEqual(changed.categories.slice(0, 16), order('misc'));
  // a special round's extra questions keep their own subjects
  assert.deepEqual(changed.categories.slice(16), ['Other', 'Other', 'Other', 'Other']);
  // and a short round takes only the subjects it has questions for
  const short = tournamentGame(sheet({}, 12), same);
  assert.deepEqual(withSubjects(short, order('language-arts')).categories, order('language-arts').slice(0, 12));
  // a subject the site does not know leaves the question as it was
  assert.equal(withSubjects(g, ['Underwater Basketweaving']), null);
});
