// Tournament sheets as coaches actually keep them: the other team's points by
// question, not at all, or no other team (a chair), rounds longer than 16, and
// playoff rounds. Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { opponentModeOf, playersInGame, resultOf } from '../server/kshsaa/game-stats.js';
import { CATEGORY_BY_QUESTION } from '../server/kshsaa/round-shape.js';
import { MAX_QUESTIONS, SUBJECT_ORDERS, SUBJECTS, boxOrder, satOut, tournamentGame, withSubjects } from '../server/kshsaa/tournament-game.js';

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

test('an answer whose player name was cleared is refused, not dropped', () => {
  const s = sheet();
  s.questions[0].us = { player: '', value: 10 };
  assert.throws(() => tournamentGame(s, same), /question 1 is credited to a player whose name was cleared/);
  s.questions[0].us = { player: '   ', value: 10 };
  assert.throws(() => tournamentGame(s, same), /name was cleared/);
  // a question nobody got is still fine: Avery's 2 and 3, Blake's -5 on 4
  s.questions[0].us = null;
  assert.equal(tournamentGame(s, same).teams[0].score, 15);
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

// a sheet with nothing but the final scores
const finalsOnly = extra => tournamentGame(sheet({ scoresOnly: true, questions: [], ...extra }), same);

test('a sheet with only the final scores keeps the record and who went, and no stats', () => {
  const g = finalsOnly({ ourScore: '150', opponentScore: 120, players: [{ name: 'Avery' }, { name: 'Blake', from: 5 }] });
  assert.equal(g.scoresOnly, true);
  assert.equal(g.result, 'win');
  assert.equal(resultOf(g), 'win');
  assert.deepEqual(g.teams.map(t => t.score), [150, 120]);
  assert.deepEqual(g.teams[0].players, ['Avery', 'Blake']);
  assert.equal(g.label, 'Hays Invitational, round 3 vs Hays');
  assert.deepEqual([g.buzzes, g.lineup, g.categories, g.tossupsRead], [[], [], [], 0]);
  // whoever went heard no questions, so no player's stats count the game
  assert.equal(playersInGame(g).size, 0);
  // and it has no questions to give subjects to
  assert.equal(withSubjects(g, order('fine-arts')), null);
});

test('a final-scores sheet needs both scores, or else who won', () => {
  assert.equal(finalsOnly({ ourScore: 90, result: 'loss' }).result, 'loss');
  assert.equal(finalsOnly({ opponentScore: 200, result: 'loss' }).teams[0].score, null);
  // both scores decide it, whatever else the form says
  assert.equal(finalsOnly({ ourScore: 90, opponentScore: 80, result: 'loss' }).result, 'win');
  assert.throws(() => finalsOnly({ ourScore: 90 }), /both of them, or else who won/);
  assert.throws(() => finalsOnly({ ourScore: '9.5', opponentScore: 80 }), /our final score has to be a whole number/);
  // nobody has to be listed
  assert.equal(finalsOnly({ ourScore: 90, opponentScore: 80, players: [] }).teams[0].players.length, 0);
  assert.throws(() => finalsOnly({ ourScore: 90, opponentScore: 80, players: [{ name: 'Avery' }, { name: 'Avery' }] }), /listed twice/);
  // a chair needs no score at all, and is neither a win nor a loss
  const chair = finalsOnly({ opponentMode: 'chair', opponent: '' });
  assert.equal(chair.result, null);
  assert.equal(resultOf(chair), 'chair');
  assert.equal(chair.teams.length, 1);
  // a playoff round still goes by its stage
  assert.equal(finalsOnly({ ourScore: 90, opponentScore: 80, stage: 'final' }).label, 'Hays Invitational, final vs Hays');
});

// a sheet with nothing but each player's points for the whole tournament
const totalsOnly = (players, extra = {}) =>
  tournamentGame({ tournament: 'Early Varsity', date: '2026-09-26', level: 'varsity', team: 'Varsity Blue', sheet: 'totals', players, ...extra }, same);

test("a sheet with only each player's total is one entry with their points", () => {
  const g = totalsOnly([{ name: 'Avery', points: '120' }, { name: 'Blake', points: 85 }, { name: '' }]);
  assert.equal(g.wholeTournament, true);
  assert.equal(g.scoresOnly, true);
  assert.deepEqual(g.playerTotals, [{ name: 'Avery', points: 120 }, { name: 'Blake', points: 85 }]);
  assert.deepEqual(g.teams, [{ name: 'Varsity Blue', players: ['Avery', 'Blake'], score: 205 }]);
  assert.equal(g.label, "Early Varsity, each player's total");
  // it is not a game: no opponent was needed, and there is no result
  assert.equal(g.opponent, null);
  assert.equal(g.result, null);
  assert.equal(resultOf(g), null);
  // no questions, so no player stats count it, and no subjects to change
  assert.equal(playersInGame(g).size, 0);
  assert.equal(withSubjects(g, order('fine-arts')), null);
  // whatever the rest of the form held
  assert.equal(totalsOnly([{ name: 'Avery', points: 10 }], { round: '4', stage: 'final', opponent: 'Hays' }).stage, null);
});

test('each player on a totals sheet needs their points', () => {
  assert.throws(() => totalsOnly([{ name: 'Avery' }]), /how many points did Avery score/);
  assert.throws(() => totalsOnly([{ name: 'Avery', points: '12.5' }]), /Avery's points has to be a whole number/);
  assert.throws(() => totalsOnly([]), /list each player and their points/);
  assert.throws(() => totalsOnly([{ name: 'Avery', points: 10 }, { name: 'Avery', points: 20 }]), /listed twice/);
  // more -5s than answers makes a negative total
  assert.equal(totalsOnly([{ name: 'Avery', points: -5 }]).playerTotals[0].points, -5);
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

// a round of the Hays Invitational that these players played, nobody scoring
const roundOf = (round, names, extra = {}) => tournamentGame(sheet({
  round,
  players: names.map(name => ({ name })),
  questions: CATEGORY_BY_QUESTION.map(category => ({ category, us: null, them: null })),
  ...extra
}), same);

test('who sat a round is the rest of the team that played the tournament', () => {
  const r1 = roundOf('1', ['Avery', 'Blake', 'Casey', 'Drew']);
  const r2 = roundOf('2', ['Avery', 'Erin', 'Casey', 'Finn']);
  // the best players in the semifinal: the rest sat it
  const semi = roundOf('3', ['Avery', 'Blake', 'Casey', 'Erin'], { stage: 'semifinal' });
  // another of our squads at the same tournament has a bench of its own
  const other = roundOf('1', ['Gus', 'Hal'], { team: 'JV Blue' });
  // a final-scores sheet that says who played counts; one that does not can't say
  const finals = finalsOnly({ round: '4', ourScore: 100, opponentScore: 90, players: [{ name: 'Blake' }, { name: 'Drew' }] });
  const unknown = finalsOnly({ round: '5', ourScore: 100, opponentScore: 90, players: [] });
  const total = totalsOnly([{ name: 'Avery', points: 50 }]);
  const practice = { kind: 'practice', teams: [{ name: 'A', players: ['Avery'] }] };
  const sat = satOut([r1, r2, semi, other, finals, unknown, total, practice]);
  assert.deepEqual(sat.get(r1), ['Erin', 'Finn']);
  assert.deepEqual(sat.get(r2), ['Blake', 'Drew']);
  assert.deepEqual(sat.get(semi), ['Drew', 'Finn']);
  assert.deepEqual(sat.get(other), []);
  assert.deepEqual(sat.get(finals), ['Avery', 'Casey', 'Erin', 'Finn']);
  assert.equal(sat.has(unknown), false);
  assert.equal(sat.has(total), false);
  assert.equal(sat.has(practice), false);
});

test('a player ticked as sitting is on the bench, and was there all day', () => {
  const r1 = roundOf('1', ['Avery', 'Blake'], { bench: ['Casey', 'Casey', ''] });
  const r2 = roundOf('2', ['Avery', 'Blake'], { bench: ['Casey'] });
  assert.deepEqual(r1.bench, ['Casey']);
  assert.deepEqual(r1.teams[0].players, ['Avery', 'Blake']);
  // sitting is in no stats: not on the team, and heard nothing
  assert.equal(playersInGame(r1).has('Casey'), false);
  assert.equal(r1.heardByPlayer['SJA|Casey'], undefined);
  // Casey sat every round, and still shows as there for each
  const sat = satOut([r1, r2]);
  assert.deepEqual(sat.get(r1), ['Casey']);
  assert.deepEqual(sat.get(r2), ['Casey']);
  assert.throws(() => roundOf('3', ['Avery', 'Blake'], { bench: ['Blake'] }), /Blake is marked as both playing and sitting/);
  // a sheet with only the final scores keeps who sat too
  assert.deepEqual(finalsOnly({ ourScore: 90, opponentScore: 80, players: [{ name: 'Avery' }], bench: ['Drew'] }).bench, ['Drew']);
});

test('a round keeps who was in each player box, sitters too', () => {
  const g = roundOf('1', ['Avery', 'Blake', 'Drew'], { bench: ['Casey'], boxes: ['Avery', 'Blake', 'Casey', 'Drew', '', ''] });
  assert.deepEqual(g.boxes, ['Avery', 'Blake', 'Casey', 'Drew']);
  // a box naming nobody in the round is empty, a name in two boxes keeps the
  // first, and anyone in no box goes after the last
  const odd = roundOf('2', ['Avery', 'Blake', 'Drew'], { bench: ['Casey'], boxes: ['Avery', 'Zed', 'Avery', 'Casey'] });
  assert.deepEqual(odd.boxes, ['Avery', '', '', 'Casey', 'Blake', 'Drew']);
  // a page loaded before boxes were kept sends none
  assert.equal(roundOf('3', ['Avery', 'Blake'], { bench: ['Casey'] }).boxes, null);
  // a sheet with only the final scores keeps them too
  const finals = finalsOnly({ ourScore: 90, opponentScore: 80, players: [{ name: 'Avery' }], bench: ['Drew'], boxes: ['Drew', 'Avery'] });
  assert.deepEqual(finals.boxes, ['Drew', 'Avery']);
});

test('a round saved before boxes were kept takes the order most rounds list its players in', () => {
  // The sheet numbers them Gus, Avery, Hal, Drew, Sam, Ben. Round 4 was typed
  // in with Drew moved to the last box, as opening round 3 to edit used to
  // leave him.
  const r1 = roundOf('1', ['Gus', 'Avery', 'Hal', 'Drew', 'Sam'], { bench: ['Ben'] });
  const r2 = roundOf('2', ['Gus', 'Avery', 'Drew', 'Sam', 'Ben'], { bench: ['Hal'] });
  const r3 = roundOf('3', ['Gus', 'Avery', 'Hal', 'Sam', 'Ben'], { bench: ['Drew'] });
  const r4 = roundOf('4', ['Gus', 'Hal', 'Sam', 'Ben', 'Drew'], { bench: ['Avery'] });
  // a round saved with its boxes has them, then whoever else sat it
  const r5 = roundOf('5', ['Gus', 'Avery', 'Hal', 'Drew', 'Sam'], { boxes: ['Gus', 'Avery', 'Hal', 'Drew', 'Sam'] });
  const semi = roundOf('6', ['Avery', 'Hal', 'Sam', 'Ben', 'Gus'], { stage: 'semifinal', bench: ['Drew'], boxes: ['Avery', 'Hal', 'Drew', 'Sam', 'Ben', 'Gus'] });
  // another of our squads at the same tournament has its own numbers
  const other = roundOf('1', ['Zoe', 'Yan'], { team: 'JV Blue' });
  const total = totalsOnly([{ name: 'Gus', points: 50 }]);
  const boxes = boxOrder([semi, r4, r2, r1, r3, r5, other, total]);
  const sheetOrder = ['Gus', 'Avery', 'Hal', 'Drew', 'Sam', 'Ben'];
  for (const r of [r1, r2, r3, r4]) assert.deepEqual(boxes.get(r), sheetOrder);
  assert.deepEqual(boxes.get(r5), sheetOrder);
  assert.deepEqual(boxes.get(semi), ['Avery', 'Hal', 'Drew', 'Sam', 'Ben', 'Gus']);
  assert.deepEqual(boxes.get(other), ['Zoe', 'Yan']);
  assert.equal(boxes.has(total), false);
});

test('players who never played a round together keep the order they first came in', () => {
  // Erin and Finn take turns: round 1 lists Erin first, whatever order the
  // rounds were saved in
  const r1 = roundOf('1', ['Avery', 'Erin']);
  const r2 = roundOf('2', ['Avery', 'Finn']);
  const boxes = boxOrder([r2, r1]);
  assert.deepEqual(boxes.get(r1), ['Avery', 'Erin', 'Finn']);
  assert.deepEqual(boxes.get(r2), ['Avery', 'Erin', 'Finn']);
});
