// The Octopus Arcade's rules engine (client/kshsaa/arcade/), which has no DOM
// and so runs here as it does in the browser. Run with `npm test`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeError, act, newGame, replay, standings, whyNoBuzz, winners } from '../client/kshsaa/arcade/engine.js';
import { MODES } from '../client/kshsaa/arcade/modes/index.js';
import { pickQuestions, questionsUrl, secondsFor } from '../client/kshsaa/arcade/questions.js';
import { fromBonus, fromQbreader, fromTossup, qbreaderUrl, withBonuses } from '../client/kshsaa/arcade/qbreader.js';
import { addTime, clockLeft, formatClock, newClock, startClock, stopClock } from '../client/kshsaa/arcade/clock.js';

const QUESTIONS = Array.from({ length: 12 }, (x, i) => ({
  id: 'q' + i, category: 'Science/Health', question: 'Question ' + i, answer: 'Answer ' + i
}));
const TEAMS = ['Crimson', 'Gold', 'Navy', 'White'].map((name, i) => ({ name, key: String(i + 1) }));
// never draws a power-up unless a test asks for one
const NEVER = () => 0.99;

function start (mode, config = {}, options = {}) {
  const game = newGame({
    id: 'test',
    mode,
    teams: options.teams || TEAMS,
    config: { lives: 3, rebounds: true, ...config },
    questions: options.questions || QUESTIONS,
    random: options.random || NEVER,
    now: 0
  });
  return { ...game, paused: false, started: true };
}

/** Runs actions in order, failing loudly if the engine refuses one. */
function play (game, ...actions) {
  for (const a of actions) game = act(game, typeof a === 'string' ? { type: a } : a, NEVER);
  return game;
}

const buzz = team => ({ type: 'buzz', team });
const lives = game => replay(game).teams.map(t => t.lives);
const points = game => replay(game).teams.map(t => t.points);
const refused = (game, action, pattern) => assert.throws(
  () => act(game, typeof action === 'string' ? { type: action } : action, NEVER),
  e => e instanceof ArcadeError && pattern.test(e.message)
);

describe('Last Team Standing', () => {
  it('takes a life for a wrong answer and gives one back for a right one, up to the start', () => {
    let g = start('last-team-standing');
    g = play(g, buzz(0), 'wrong');
    assert.deepEqual(lives(g), [2, 3, 3, 3]);
    g = play(g, buzz(1), 'correct', 'next', buzz(0), 'correct');
    assert.deepEqual(lives(g), [3, 3, 3, 3]);
    g = play(g, 'next', buzz(0), 'correct');
    assert.equal(lives(g)[0], 3, 'never past the starting lives');
  });

  it('puts a team out at zero, and its buzzer stops counting', () => {
    let g = start('last-team-standing', { lives: 1 });
    g = play(g, buzz(2), 'wrong');
    const s = replay(g);
    assert.equal(s.teams[2].out, true);
    assert.match(whyNoBuzz(g, s, 2), /out/);
    g = play(g, 'next');
    refused(g, buzz(2), /Navy is out/);
  });

  it('ends when one team is left, and that team wins', () => {
    let g = start('last-team-standing', { lives: 1 });
    g = play(g, buzz(0), 'wrong', buzz(1), 'wrong', buzz(2), 'wrong');
    const s = replay(g);
    assert.equal(s.over, 'last-standing');
    assert.deepEqual(winners(g, s), [3]);
    refused(g, 'next', /over/);
  });

  it('ranks teams that are out by how long they lasted', () => {
    let g = start('last-team-standing', { lives: 1 });
    g = play(g, buzz(1), 'wrong', 'next', buzz(3), 'wrong', 'next', buzz(0), 'wrong');
    assert.deepEqual(standings(g, replay(g)).map(s => s.team), [2, 0, 3, 1]);
  });
});

describe('buzzing and rebounds', () => {
  it('locks everyone else out while a buzz waits on a ruling', () => {
    const g = play(start('last-team-standing'), buzz(0));
    refused(g, buzz(1), /Crimson buzzed first/);
    refused(g, 'next', /Rule on Crimson/);
  });

  it('opens the question to the teams left after a wrong answer, but not to the team that missed', () => {
    let g = play(start('last-team-standing'), buzz(0), 'wrong');
    refused(g, buzz(0), /already answered/);
    g = play(g, buzz(1));
    assert.equal(replay(g).buzz, 1);
  });

  it('kills the question once every team has missed it', () => {
    const g = play(start('last-team-standing'), buzz(0), 'wrong', buzz(1), 'wrong', buzz(2), 'wrong', buzz(3), 'wrong');
    assert.equal(replay(g).settled, 'dead');
  });

  it('kills the question after one wrong answer when rebounds are off', () => {
    const g = play(start('last-team-standing', { rebounds: false }), buzz(0), 'wrong');
    assert.equal(replay(g).settled, 'dead');
    refused(g, buzz(1), /done/);
  });

  it('refuses every buzz while paused', () => {
    const g = { ...start('last-team-standing'), paused: true };
    refused(g, buzz(0), /paused/);
  });
});

describe('Bounty Hunter', () => {
  it('scores a right answer and takes the bounty from the leader', () => {
    let g = start('bounty-hunter');
    g = play(g, buzz(0), 'correct');
    assert.deepEqual(points(g), [10, 0, 0, 0], 'no bounty while everyone is level');
    g = play(g, 'next', buzz(1), 'correct');
    assert.deepEqual(points(g), [5, 15, 0, 0]);
  });

  it('takes the bounty from each team tied for the lead', () => {
    const g = play(start('bounty-hunter'), { type: 'adjust', team: 0, points: 15 }, { type: 'adjust', team: 1, points: 15 },
      buzz(2), 'correct');
    // Crimson and Gold tied on 15: Navy takes 5 from both
    assert.deepEqual(points(g), [10, 10, 20, 0]);
  });

  it('costs points for a wrong answer and ranks by points', () => {
    const g = play(start('bounty-hunter'), buzz(3), 'wrong', buzz(2), 'correct');
    assert.deepEqual(points(g), [0, 0, 10, -5]);
    assert.deepEqual(standings(g, replay(g)).map(s => s.rank), [1, 2, 2, 4]);
  });
});

describe('Lightning Round', () => {
  it('scores right answers, charges nothing for wrong ones, and runs on a game clock', () => {
    const g = play(start('lightning-round', { minutes: 2 }), buzz(0), 'wrong', buzz(1), 'correct');
    assert.deepEqual(points(g), [0, 10, 0, 0]);
    assert.equal(g.roundClock.limit, 120000);
    assert.equal(g.clock.limit, 5000, 'five seconds to buzz');
  });

  it('ends when time is up, with the leader winning', () => {
    const g = play(start('lightning-round'), buzz(2), 'correct', { type: 'end', reason: 'time' });
    const s = replay(g);
    assert.equal(s.over, 'time');
    assert.deepEqual(winners(g, s), [2]);
  });
});

describe('Quizbowl', () => {
  const BONUS = { id: 'b', category: 'Fine Arts', leadin: 'For 10 points each:', parts: ['One?', 'Two?', 'Three?'], answers: ['1', '2', '3'], source: '' };
  // every other tossup has a bonus
  const WITH_BONUSES = QUESTIONS.map((q, i) => i % 2 ? q : { ...q, question: 'Clue (*) giveaway', bonus: BONUS });
  const qb = () => start('quizbowl', {}, { questions: WITH_BONUSES });
  const part = right => ({ type: 'part', right });

  it('scores a power 15, a right answer 10, a neg −5, and a wrong answer at the end nothing', () => {
    const g = play(qb(), buzz(0), { type: 'wrong', neg: true }, buzz(1), { type: 'wrong' }, buzz(2), { type: 'correct', power: true });
    assert.deepEqual(points(g), [-5, 0, 15, 0]);
    const plain = play(qb(), buzz(3), 'correct');
    assert.deepEqual(points(plain), [0, 0, 0, 10]);
  });

  it('gives the team that gets a tossup its bonus, which no one else may buzz on', () => {
    let g = play(qb(), buzz(1), 'correct');
    const s = replay(g);
    assert.deepEqual(s.bonus, { team: 1, results: [] });
    assert.equal(s.settled, null, 'not done until the bonus is');
    refused(g, buzz(0), /Gold's bonus/);
    refused(g, 'next', /Finish Gold's bonus/);
    g = play(g, part(true), part(false), part(true));
    assert.deepEqual(points(g), [0, 30, 0, 0]);
    assert.equal(replay(g).settled, 'correct');
    refused(g, part(true), /no bonus/);
    assert.equal(replay(play(g, 'next')).bonus, null);
  });

  it('plays no bonus on a tossup without one', () => {
    const g = play(qb(), 'next', buzz(0), 'correct');
    const s = replay(g);
    assert.equal(s.bonus, null);
    assert.equal(s.settled, 'correct');
  });

  it('undo takes back a bonus part, and throwing out the question takes back the whole bonus', () => {
    const g = play(qb(), buzz(0), 'correct', part(true), part(true));
    assert.deepEqual(points(play(g, 'undo')), [20, 0, 0, 0]);
    const thrown = play(g, 'throwout');
    assert.deepEqual(points(thrown), [0, 0, 0, 0]);
    assert.equal(replay(thrown).q, 1);
  });

  it('only scores powers and negs in Quizbowl', () => {
    const g = play(start('bounty-hunter'), buzz(0), { type: 'correct', power: true }, 'next', buzz(1), { type: 'wrong', neg: false });
    assert.deepEqual(points(g), [10, -5, 0, 0]);
    assert.equal(g.events.some(e => 'power' in e || 'neg' in e), false);
  });
});

describe('questions from qbreader.org', () => {
  it('asks for a category at the level, from standard sets, recent ones where it goes stale', () => {
    const url = new URL(qbreaderUrl('tossup', 'Pop Culture', 'jv', 30, 2026));
    assert.equal(url.pathname, '/api/random-tossup');
    assert.equal(url.searchParams.get('subcategories'), 'Movies,Music,Television,Video Games,Other Pop Culture');
    assert.equal(url.searchParams.get('difficulties'), '2');
    assert.equal(url.searchParams.get('minYear'), '2018');
    assert.equal(url.searchParams.get('standardOnly'), 'true');
    const bonus = new URL(qbreaderUrl('bonus', 'Mathematics', 'beginner', 5, 2026));
    assert.equal(bonus.pathname, '/api/random-bonus');
    assert.equal(bonus.searchParams.get('alternateSubcategories'), 'Math');
    assert.equal(bonus.searchParams.get('threePartBonuses'), 'true');
    assert.equal(fromQbreader('World Language'), false);
  });

  it('cuts a tossup to the level, or keeps it whole for Quizbowl', () => {
    const t = {
      _id: 'x',
      question_sanitized: 'This team won a title in 2019 after a long drought. This team plays at Arrowhead Stadium. For 10 points, name this NFL team led by Patrick Mahomes.',
      answer_sanitized: 'Kansas City Chiefs',
      set: { name: '2024 Test Set' }
    };
    assert.equal(fromTossup(t, 'Sports', 'beginner', false).question, 'Name this NFL team led by Patrick Mahomes.');
    assert.equal(fromTossup(t, 'Sports', 'jv', false).question,
      'This team plays at Arrowhead Stadium. Name this NFL team led by Patrick Mahomes.');
    const whole = fromTossup(t, 'Sports', 'beginner', true);
    assert.equal(whole.question, t.question_sanitized);
    assert.equal(whole.id, 'qb-x');
    assert.equal(fromTossup({ ...t, alternate_subcategory: 'Math' }, 'Science/Health', 'jv', true), null, 'math is its own category');
  });

  it('pairs each tossup with a bonus from its own category first', () => {
    const b = (id, category) => fromBonus({ _id: id, leadin_sanitized: 'L', parts_sanitized: ['a', 'b', 'c'], answers_sanitized: ['1', '2', '3'] }, category);
    assert.equal(fromBonus({ _id: 'short', parts_sanitized: ['a', 'b'], answers_sanitized: ['1', '2'] }, 'Fine Arts'), null);
    const paired = withBonuses(
      [{ id: 't1', category: 'Fine Arts' }, { id: 't2', category: 'Sports' }, { id: 't3', category: 'Sports' }],
      [b('b1', 'Sports'), b('b2', 'Fine Arts')]
    );
    assert.deepEqual(paired.map(t => t.bonus && t.bonus.id), ['qb-b2', 'qb-b1', undefined]);
    assert.equal(pickQuestions(paired, { wanted: 3 }).filter(q => q.bonus).length, 2, 'picking keeps the bonuses');
    assert.equal(withBonuses(pickQuestions(paired, { wanted: 3 }), [b('b3', 'Sports')]).filter(q => q.bonus).length, 3,
      'and a tossup without one can be given one');
  });
});

describe('power-ups', () => {
  const withModifier = (mode, modifier, config = {}) =>
    act(start(mode, { powerUps: true, ...config }), { type: 'modifier', modifier }, NEVER);

  it('Double Damage costs two lives', () => {
    const g = play(withModifier('chaos-mode', 'double'), buzz(0), 'wrong');
    assert.deepEqual(lives(g), [1, 3, 3, 3]);
  });

  it('Double Damage doubles points, bounty included', () => {
    let g = play(start('bounty-hunter'), buzz(0), 'correct', 'next');
    g = play(act(g, { type: 'modifier', modifier: 'double' }, NEVER), buzz(1), 'correct');
    assert.deepEqual(points(g), [0, 30, 0, 0]);
  });

  it('a Shield earned on one question blocks the next lost life', () => {
    let g = play(withModifier('chaos-mode', 'shield'), buzz(0), 'correct');
    assert.equal(replay(g).teams[0].shield, true);
    g = play(g, 'next', buzz(0), 'wrong');
    assert.deepEqual(lives(g), [3, 3, 3, 3]);
    assert.equal(replay(g).teams[0].shield, false);
    g = play(g, buzz(1), 'wrong');
    assert.deepEqual(lives(g), [3, 2, 3, 3]);
  });

  it('Life Steal takes a life from the team with the most', () => {
    let g = play(start('chaos-mode'), buzz(3), 'correct', 'next', buzz(0), 'wrong', buzz(1), 'wrong', 'next');
    // Crimson 2, Gold 2, Navy 3, White 3: Navy and White tie on lives, and
    // White has more points, so Crimson's right answer takes White's life
    g = play(act(g, { type: 'modifier', modifier: 'steal' }, NEVER), buzz(0), 'correct');
    assert.deepEqual(lives(g), [3, 2, 3, 2]);
  });

  it('Resurrection lets an eliminated team buzz, and a right answer brings it back', () => {
    let g = play(start('chaos-mode', { lives: 1 }), buzz(0), 'wrong', 'next');
    refused(g, buzz(0), /out/);
    g = play(act(g, { type: 'modifier', modifier: 'resurrection' }, NEVER), buzz(0), 'correct');
    const s = replay(g);
    assert.equal(s.teams[0].out, false);
    assert.equal(s.teams[0].lives, 1);
  });

  it('is drawn from the enabled power-ups as a question comes up, and Resurrection only once someone is out', () => {
    const always = () => 0;
    const g = start('chaos-mode', { modifiers: ['resurrection', 'double'] }, { random: always });
    assert.equal(replay(g).modifier, 'double');
    const off = start('last-team-standing', { powerUps: false }, { random: always });
    assert.equal(replay(off).modifier, null);
  });

  it('can only change before anyone buzzes', () => {
    const g = play(start('chaos-mode'), buzz(0));
    refused(g, { type: 'modifier', modifier: 'double' }, /before anyone buzzes/);
  });
});

describe('moderator controls', () => {
  it('undo puts back exactly what the last action changed', () => {
    const before = play(start('last-team-standing'), buzz(0));
    const after = play(before, 'wrong', 'undo');
    assert.deepEqual(replay(after), replay(before));
    refused(start('last-team-standing'), 'undo', /Nothing to undo/);
  });

  it('undo brings back a team that a wrong ruling put out', () => {
    const g = play(start('last-team-standing', { lives: 1 }), buzz(0), 'wrong', 'undo', 'undo');
    assert.equal(replay(g).teams[0].out, false);
    assert.equal(replay(g).over, null);
  });

  it('adjusts lives, points, shields, and who is out by hand', () => {
    let g = start('last-team-standing');
    g = play(g, { type: 'adjust', team: 1, lives: -3 });
    assert.equal(replay(g).teams[1].out, true);
    g = play(g, { type: 'adjust', team: 1, out: false }, { type: 'adjust', team: 0, points: 20, shield: true });
    const s = replay(g);
    assert.deepEqual([s.teams[1].out, s.teams[1].lives], [false, 1]);
    assert.deepEqual([s.teams[0].points, s.teams[0].shield], [20, true]);
  });

  it('a fix by hand can reopen a finished game', () => {
    let g = play(start('last-team-standing', { lives: 1 }), buzz(0), 'wrong', buzz(1), 'wrong', buzz(2), 'wrong');
    assert.equal(replay(g).over, 'last-standing');
    g = play(g, { type: 'adjust', team: 2, out: false });
    assert.equal(replay(g).over, null);
  });

  it('reset puts every team back to the start, and can itself be undone', () => {
    const played = play(start('last-team-standing'), buzz(0), 'wrong', 'next', buzz(1), 'wrong');
    const reset = play(played, 'reset');
    assert.deepEqual(lives(reset), [3, 3, 3, 3]);
    assert.deepEqual(lives(play(reset, 'undo')), [2, 2, 3, 3]);
  });

  it('throwing out a question undoes its rulings and moves on', () => {
    const g = play(start('last-team-standing'), buzz(0), 'wrong', buzz(1), 'correct', 'throwout');
    const s = replay(g);
    assert.equal(s.q, 1);
    assert.deepEqual(lives(g), [3, 3, 3, 3]);
  });

  it('ends the game when the questions run out, and more questions pick it back up', () => {
    let g = start('bounty-hunter', {}, { questions: QUESTIONS.slice(0, 2) });
    g = play(g, buzz(0), 'correct', 'next', 'next');
    assert.equal(replay(g).over, 'questions');
    g = act(g, { type: 'more', questions: QUESTIONS.slice(0, 5) }, NEVER);
    const s = replay(g);
    assert.equal(s.over, null);
    assert.equal(s.q, 2);
    assert.equal(g.questions.length, 5, 'nothing the game already had is added twice');
  });

  it('a moderator can end the game early; tied leaders share the win', () => {
    const g = play(start('bounty-hunter'), buzz(0), 'correct', { type: 'adjust', team: 1, points: 10 }, { type: 'end' });
    assert.deepEqual(winners(g, replay(g)), [0, 1]);
  });
});

describe('setup', () => {
  it('refuses fewer than two teams, duplicate names, and duplicate keys', () => {
    const make = teams => () => newGame({ id: 'x', mode: 'last-team-standing', teams, config: {}, questions: QUESTIONS });
    assert.throws(make(TEAMS.slice(0, 1)), /2 to 8/);
    assert.throws(make([TEAMS[0], { name: 'crimson', key: '2' }]), /same name/);
    assert.throws(make([TEAMS[0], { name: 'Gold', key: '1' }]), /same buzzer key/);
  });

  it('starts paused, on the first question, with every mode listed', () => {
    for (const mode of Object.keys(MODES)) {
      const g = newGame({ id: 'x', mode, teams: TEAMS, config: {}, questions: QUESTIONS, random: NEVER });
      assert.equal(g.paused, true);
      assert.equal(replay(g).q, 0);
      assert.ok(MODES[mode].rules(g.config).length >= 3);
    }
  });

  it('replays to the same state every time', () => {
    const g = play(start('chaos-mode'), buzz(0), 'wrong', buzz(1), 'correct', 'next');
    assert.deepEqual(replay(JSON.parse(JSON.stringify(g))), replay(g));
  });
});

describe('questions and clocks', () => {
  it('reads time limits from the [30 sec] marker', () => {
    assert.equal(secondsFor('[45 sec] What is 7 x 8?'), 45);
    assert.equal(secondsFor('Name this author.'), 10);
  });

  it('asks the round builder for one drill per category', () => {
    const url = questionsUrl({ level: 'jv', math: 'auto', categories: ['Fine Arts', 'Science/Health'], count: 8 });
    assert.equal(url, '/kshsaa-round/generate?level=jv&math=auto&count=8&drill=Fine+Arts&drill=Science%2FHealth');
  });

  it('keeps short, untimed questions for Lightning Round and skips ones the game has', () => {
    const round = [
      { id: 'a', category: 'Fine Arts', question: 'Short one?', answer: 'x' },
      { id: 'b', category: 'Mathematics', question: '[30 sec] Long sum', answer: 'x' },
      { id: 'c', category: 'Fine Arts', question: 'word '.repeat(60), answer: 'x' },
      { id: 'd', category: 'Fine Arts', question: 'Also short?', answer: 'x' }
    ];
    const ids = pickQuestions(round, { wanted: 2, short: true }).map(q => q.id).sort();
    assert.deepEqual(ids, ['a', 'd']);
    const filled = pickQuestions(round, { wanted: 3, short: true }).map(q => q.id).sort();
    assert.deepEqual(filled, ['a', 'c', 'd'], 'a long question before a timed one');
    assert.deepEqual(pickQuestions(round, { wanted: 9, exclude: ['a', 'b'] }).map(q => q.id).sort(), ['c', 'd']);
  });

  it('runs, stops, and adds time', () => {
    let c = startClock(newClock(10000), 0);
    assert.equal(clockLeft(c, 2500), 7500);
    c = stopClock(c, 4000);
    assert.equal(clockLeft(c, 99999), 6000);
    assert.equal(clockLeft(addTime(c, 5000, 5000), 5000), 11000);
    assert.equal(formatClock(8150), '8.2');
    assert.equal(formatClock(161000), '2:41');
  });
});
