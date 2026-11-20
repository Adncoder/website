// The room model with tournament sheets that leave out the other team's
// points, and with chairs: a tossup we did not get there is split between the
// other school and nobody (room-model.js), never counted as nobody's.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitRoomModel } from '../server/kshsaa/room-model.js';
import { CATEGORY_BY_QUESTION } from '../server/kshsaa/round-shape.js';

const everyoneVarsity = () => true;

// mulberry32, so every run draws the same games
function rng (seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = { Ana: 0.5, Ben: 0.35, Cy: 0.25, Di: 0.2, Ed: 0.15, Flo: 0.12, Gus: 0.1, Hal: 0.08 };
const NAMES = Object.keys(PLAYERS);

// one tossup's winner, drawn from the Luce model: index into strengths, or -1
// for nobody
function draw (next, D, strengths) {
  let x = next() * (D + strengths.reduce((a, b) => a + b, 0));
  if ((x -= D) < 0) return -1;
  for (let i = 0; i < strengths.length; i++) if ((x -= strengths[i]) < 0) return i;
  return strengths.length - 1;
}

// practice: all eight of ours in one room, on varsity questions (D = 1)
function practiceGames (next, count) {
  return Array.from({ length: count }, (_, k) => {
    const buzzes = [];
    for (let q = 1; q <= 16; q++) {
      const w = draw(next, 1, NAMES.map(n => PLAYERS[n]));
      if (w !== -1) buzzes.push({ player: NAMES[w], team: w < 4 ? 'A' : 'B', questionNumber: q, category: CATEGORY_BY_QUESTION[q - 1], value: 10 });
    }
    return {
      kind: 'practice',
      level: 'varsity',
      playedAt: new Date(Date.UTC(2026, 9, 1 + k, 18)),
      tossupsRead: 16,
      categories: CATEGORY_BY_QUESTION.slice(),
      teams: [{ name: 'A', players: NAMES.slice(0, 4) }, { name: 'B', players: NAMES.slice(4) }],
      heardByPlayer: Object.fromEntries(NAMES.map((n, i) => [(i < 4 ? 'A|' : 'B|') + n, 16])),
      buzzes
    };
  });
}

// a tournament of easy questions (D) against schools as strong as `them`
function tournamentGames (next, { D, them, rounds, name = 'Easy Invitational', lineup = NAMES.slice(0, 4) }) {
  return Array.from({ length: rounds }, (_, r) => {
    const buzzes = [];
    for (let q = 1; q <= 16; q++) {
      const w = draw(next, D, lineup.map(n => PLAYERS[n]).concat(them));
      const c = CATEGORY_BY_QUESTION[q - 1];
      if (w === lineup.length) buzzes.push({ player: null, team: 'Them', questionNumber: q, category: c, value: 10 });
      else if (w !== -1) buzzes.push({ player: lineup[w], team: 'SJA', questionNumber: q, category: c, value: 10 });
    }
    return {
      kind: 'tournament',
      tournament: name,
      round: String(r + 1),
      level: 'varsity',
      playedAt: new Date(Date.UTC(2026, 10, 14, 18)),
      tossupsRead: 16,
      categories: CATEGORY_BY_QUESTION.slice(),
      lineup: lineup.map(n => ({ name: n, from: 1, to: 16 })),
      teams: [{ name: 'SJA', players: lineup }, { name: 'Them', players: [], opponent: true }],
      heardByPlayer: Object.fromEntries(lineup.map(n => ['SJA|' + n, 16])),
      buzzes
    };
  });
}

// the same game with the other team's side left off the sheet
const unrecorded = g => ({ ...g, opponentMode: 'unrecorded', buzzes: g.buzzes.filter(b => b.player) });
// and entered as if their column were empty, which is what a blank meant before
const blank = g => ({ ...g, buzzes: g.buzzes.filter(b => b.player) });
const chair = g => ({ ...g, opponentMode: 'chair', opponent: null, teams: [g.teams[0]], buzzes: g.buzzes.filter(b => b.player) });

test('an unrecorded sheet changes nothing when we answered every question', () => {
  const next = rng(7);
  const practice = practiceGames(next, 12);
  const swept = tournamentGames(next, { D: 0.05, them: 0.01, rounds: 1 })[0];
  // keep only questions we answered, so there is nothing to split
  swept.buzzes = swept.buzzes.filter(b => b.player);
  swept.tossupsRead = 16;
  for (let q = 1; q <= 16; q++) {
    if (!swept.buzzes.some(b => b.questionNumber === q)) swept.buzzes.push({ player: 'Ana', team: 'SJA', questionNumber: q, category: CATEGORY_BY_QUESTION[q - 1], value: 10 });
  }
  const recorded = fitRoomModel(practice.concat(swept), everyoneVarsity);
  const missing = fitRoomModel(practice.concat({ ...swept, opponentMode: 'unrecorded' }), everyoneVarsity);
  for (const name of NAMES) assert.equal(missing.players.get(name).overall, recorded.players.get(name).overall);
  assert.equal(missing.tournaments[0].difficulty, recorded.tournaments[0].difficulty);
  assert.equal(missing.tournaments[0].estimated, 0);
});

test('the questions we missed on unrecorded sheets are split, not lost', () => {
  const next = rng(11);
  const practice = practiceGames(next, 12);
  const games = tournamentGames(next, { D: 0.6, them: 1, rounds: 5 }).map(unrecorded);
  const ours = games.reduce((n, g) => n + g.buzzes.length, 0);
  const t = fitRoomModel(practice.concat(games), everyoneVarsity).tournaments[0];
  assert.equal(t.read, 80);
  assert.equal(t.estimated, 80 - ours);
  // answered: ours for certain, plus some share of the ones we missed
  assert.ok(t.answered > ours && t.answered < ours + t.estimated, t.answered + ' should be between ' + ours + ' and ' + (ours + t.estimated));
});

test('a chair puts nobody else in the room', () => {
  const next = rng(13);
  const practice = practiceGames(next, 12);
  const games = tournamentGames(next, { D: 0.6, them: 0.5, rounds: 4 }).map(chair);
  const ours = games.reduce((n, g) => n + g.buzzes.length, 0);
  const t = fitRoomModel(practice.concat(games), everyoneVarsity).tournaments[0];
  assert.equal(t.estimated, 0);
  assert.equal(t.answered, ours);
});

// eight rounds of easy questions against schools a bit weaker than our lineup,
// fitted with full sheets and with some of them missing the other side
function season (missing) {
  const next = rng(31);
  const practice = practiceGames(next, 24);
  const games = tournamentGames(next, { D: 0.4, them: 1, rounds: 8 });
  const fit = list => fitRoomModel(practice.concat(list), everyoneVarsity);
  const which = (g, i) => missing === 'all' || i % 2 === 0;
  return {
    full: fit(games),
    split: fit(games.map((g, i) => (which(g, i) ? unrecorded(g) : g))),
    blank: fit(games.map((g, i) => (which(g, i) ? blank(g) : g)))
  };
}
// how far the lineup's strengths moved from the full-sheet fit, at worst
const moved = (fit, full) => Math.max(...NAMES.slice(0, 4).map(n => Math.abs(Math.log(fit.players.get(n).overall / full.players.get(n).overall))));

test('with half the sheets missing their side, blank sheets make the tournament look far harder than the split', () => {
  const { full, split, blank } = season('half');
  const D = fit => fit.tournaments[0].difficulty;
  assert.ok(D(blank) > 1.5 * D(full), 'blank ' + D(blank).toFixed(3) + ' vs full ' + D(full).toFixed(3));
  assert.ok(Math.abs(Math.log(D(split) / D(full))) < Math.abs(Math.log(D(blank) / D(full))) / 2,
    'split ' + D(split).toFixed(3) + ', blank ' + D(blank).toFixed(3) + ', full ' + D(full).toFixed(3));
  assert.ok(moved(split, full) < 0.02, 'split moved players ' + moved(split, full));
  assert.ok(moved(blank, full) > moved(split, full));
});

test('with every sheet missing their side, players still match full sheets and the difficulty is flagged', () => {
  const { full, split, blank } = season('all');
  assert.ok(moved(split, full) < 0.03, 'split moved players ' + moved(split, full));
  assert.ok(moved(blank, full) > 2 * moved(split, full), 'blank ' + moved(blank, full) + ', split ' + moved(split, full));
  // nothing measured this tournament's difficulty, so Insights marks it as a guess
  assert.equal(split.tournaments[0].unrecordedGames, split.tournaments[0].games);
  assert.equal(full.tournaments[0].unrecordedGames, 0);
});
