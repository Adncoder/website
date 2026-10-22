// How strong each player is once you account for who else was in the room.
// Raw answers per question reward whoever played in the weaker room: a JV
// player next to varsity players gets beaten to answers they knew, and
// varsity players asked not to interrupt only get the leftovers. Insights and
// the Stats page's Adjusted column use this instead.
//
// The model is Luce's choice model, the many-player form of Bradley-Terry. A
// tossup in category c at level L goes to player p with probability
//
//   a_p s_pc / (D_L + the sum over everyone in the room of a_q s_qc)
//
// and to nobody with probability D_L over the same sum. s_pc is the player's
// strength in the category, a_p how much of the round they were in for, and
// D_L how hard the level's questions play. Varsity's D is 1, so s / (1 + s)
// is the chance of answering a varsity question with nobody else buzzing.
//
// Strengths are fitted by Zermelo's iteration: each is correct answers /
// exposure, exposure being how many answers a strength of 1 would have
// expected in the same rooms. Small samples are pulled toward something
// steadier: a player's overall strength toward the team's, a category toward
// the player's overall.
//
// A -5 costs half of a +10, so it counts against half an answer, but outside
// the fit, which is about who gets to the right answer first: a player's
// worth is what each of their answers is worth after the -5s that come with
// it, (correct - negs / 2) / correct.
//
// Varsity players who held back (did not interrupt, to give JV players a
// chance) are left out of that game: not in the room for anyone else, their
// answers there count neither for nor against them, and a tossup one of them
// answered is skipped, since a JV player who knew it would have been racing
// them at the end.

import { CATEGORIES, CATEGORY_BY_QUESTION } from '../../routes/kshsaa-round.js';
import { kindOf, playersInGame } from './game-stats.js';

/** Questions per category in a 16-question round. */
export const WEIGHTS = Object.fromEntries(CATEGORIES.map(c => [c, CATEGORY_BY_QUESTION.filter(x => x === c).length]));

// how many questions' worth of the steadier value each estimate starts from,
// both two rounds: fitted by predicting each saved game from all the others
export const PLAYER_PRIOR = 32;
export const CATEGORY_PRIOR = 32;
// a school we play at a tournament starts out as strong as our lineup
const OPPONENT_PRIOR = 8;
// the level every strength is measured against, when its games are in
const LEVEL_ORDER = ['varsity', 'jv', 'beginner', 'untagged'];
const MAX_ROUNDS = 500;

/**
 * Whether a practice game's varsity players held back: what the moderator
 * said, or by default whenever the questions were JV or Beginner. Nobody holds
 * back against another school.
 * @param {object} g - a stored game
 * @returns {boolean}
 */
export function heldBack (g) {
  if (kindOf(g) !== 'practice') return false;
  return typeof g.holdBack === 'boolean' ? g.holdBack : g.level === 'jv' || g.level === 'beginner';
}

/**
 * The players a game leaves out: its varsity players, if they held back.
 * @param {object} g - a stored game
 * @param {function(string): boolean} isVarsity
 * @returns {Set<string>}
 */
export function heldBackIn (g, isVarsity) {
  if (!heldBack(g)) return new Set();
  return new Set([...playersInGame(g).keys()].filter(isVarsity));
}

/**
 * How many of a round's 16 questions these strengths would answer with nobody
 * else buzzing, on questions of difficulty D, less half the -5s.
 * @param {Object<string, number>} strength - by category
 * @param {number} D
 * @param {number} [worth] - what an answer is worth after the -5s
 * @returns {number}
 */
export function soloAnswers (strength, D, worth = 1) {
  return worth * CATEGORIES.reduce((sum, c) => sum + WEIGHTS[c] * strength[c] / (D + strength[c]), 0);
}

/**
 * @typedef {object} RoomPlayer
 * @property {number} overall - strength with the team's mix of categories
 * @property {Object<string, number>} strength - by category
 * @property {number} worth - what each answer is worth after the -5s
 * @property {number} heard - questions heard that count (held-back games do not)
 * @property {Object<string, number>} categoryHeard
 * @property {Object<string, number>} answers - correct answers, by category
 * @property {Object<string, number>} exposure - by category
 * @property {Object<string, {answers: number, exposure: number, heard: number}>} byGroup
 *   the same by whatever groupOf sorts games into, exposure weighted by the
 *   team's category factors so answers / exposure is an overall strength
 */

/**
 * Fits the model to a set of games.
 * @param {object[]} games - stored games
 * @param {function(string): boolean} isVarsity - whether a player is on a varsity squad or pool
 * @param {{player?: number, category?: number, groupOf?: function(object): string}} [options]
 * @returns {{reference: ?string, difficulty: Object<string, number>, team: number,
 *   categoryFactor: Object<string, number>, teamWorth: number, players: Map<string, RoomPlayer>}}
 */
export function fitRoomModel (games, isVarsity, options = {}) {
  const mP = options.player ?? PLAYER_PRIOR;
  const mC = options.category ?? CATEGORY_PRIOR;
  const C = CATEGORIES.length;

  // everyone who can answer: our players by name, and one stand-in for the
  // other school in each tournament game
  const units = [];
  const byName = new Map();
  const unitFor = name => {
    if (!byName.has(name)) { byName.set(name, units.length); units.push({ name, opponent: false }); }
    return byName.get(name);
  };
  const levels = [];
  const tossups = [];
  const W = [];
  const H = [];
  const negCount = [];
  const grow = () => {
    while (W.length < units.length * C) { W.push(0); H.push(0); }
    while (negCount.length < units.length) negCount.push(0);
  };

  for (const g of games) {
    const read = g.tossupsRead || 16;
    const cats = g.categories && g.categories.length ? g.categories : CATEGORY_BY_QUESTION;
    const held = heldBackIn(g, isVarsity);
    const heard = [...playersInGame(g)].filter(([name]) => !held.has(name));
    const lineup = new Map((g.lineup || []).map(p => [p.name, p]));
    const level = g.level || 'untagged';
    if (!levels.includes(level)) levels.push(level);
    let opponent = -1;
    if ((g.teams || []).some(t => t.opponent)) {
      opponent = units.length;
      units.push({ name: null, opponent: true, size: 0 });
    }
    const group = options.groupOf ? options.groupOf(g) : null;
    for (let i = 1; i <= read; i++) {
      const c = CATEGORIES.indexOf(cats[i - 1]);
      if (c === -1) continue;
      const room = new Map();
      for (const [name, h] of heard) {
        const spot = lineup.get(name);
        const a = spot ? (i >= spot.from && i <= spot.to ? 1 : 0) : Math.min(1, h / read);
        if (a > 0) room.set(unitFor(name), a);
      }
      const buzzes = (g.buzzes || []).filter(b => b.questionNumber === i);
      const first = buzzes.find(b => b.value > 0);
      // A varsity player holding back answers at the end, where a JV player
      // who knew it would have been racing them. Nobody can say who would
      // have got it otherwise, so the tossup is skipped for everyone.
      if (first && first.player && held.has(first.player)) continue;
      if (opponent !== -1) {
        units[opponent].size += [...room.values()].reduce((x, y) => x + y, 0) / read;
        room.set(opponent, 1);
      }
      let winner = -1;
      const negs = [];
      for (const b of buzzes) {
        if (b.player && held.has(b.player)) continue;
        const u = b.player ? unitFor(b.player) : opponent;
        if (u === -1) continue;
        if (b === first) winner = u;
        else if (b.value < 0) negs.push(u);
      }
      // someone credited with a buzz was in the room for it
      if (winner !== -1 && !room.has(winner)) room.set(winner, 1);
      grow();
      for (const [u, a] of room) H[u * C + c] += a;
      if (winner !== -1) W[winner * C + c] += 1;
      for (const u of negs) negCount[u]++;
      tossups.push({ c, level: levels.indexOf(level), room: [...room], winner, negs, group });
    }
  }
  grow();

  const U = units.length;
  const players = units.map((u, i) => i).filter(i => !units[i].opponent);
  const s = new Array(U * C).fill(1);
  const overall = new Array(U).fill(1);
  const D = levels.map(() => 1);
  const ref = LEVEL_ORDER.map(l => levels.indexOf(l)).find(i => i !== -1) ?? 0;
  let E = new Array(U * C).fill(0);
  let team = 1;
  let factor = new Array(C).fill(1);
  let perQuestion = 1;

  const exposures = () => {
    E = new Array(U * C).fill(0);
    const inv = levels.map(() => 0);
    for (const t of tossups) {
      let total = D[t.level];
      for (const [u, a] of t.room) total += a * s[u * C + t.c];
      for (const [u, a] of t.room) E[u * C + t.c] += a / total;
      inv[t.level] += 1 / total;
      t.total = total;
    }
    return inv;
  };

  // the team's own numbers, from our players only: its average strength, how
  // each category plays against that, and exposure per question heard, so a
  // prior of m questions is m of these
  const teamNumbers = () => {
    let sumW = 0; let sumE = 0; let sumH = 0;
    const catW = new Array(C).fill(0);
    const catE = new Array(C).fill(0);
    for (const u of players) {
      for (let c = 0; c < C; c++) {
        catW[c] += W[u * C + c]; catE[c] += E[u * C + c]; sumH += H[u * C + c];
      }
    }
    for (let c = 0; c < C; c++) { sumW += catW[c]; sumE += catE[c]; }
    team = sumE ? Math.max(1e-6, sumW / sumE) : 1;
    factor = catE.map((e, c) => (e && catW[c] > 0 ? catW[c] / e / team : 1));
    perQuestion = sumH ? sumE / sumH : 1;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const inv = exposures();
    teamNumbers();

    const before = s.slice();
    for (const u of players) {
      let answers = 0; let exposure = 0;
      for (let c = 0; c < C; c++) { answers += W[u * C + c]; exposure += factor[c] * E[u * C + c]; }
      overall[u] = Math.max(0, (answers + mP * perQuestion * team) / (exposure + mP * perQuestion));
      for (let c = 0; c < C; c++) {
        s[u * C + c] = Math.max(0, (W[u * C + c] + mC * perQuestion * factor[c] * overall[u]) / (E[u * C + c] + mC * perQuestion));
      }
    }
    for (let u = 0; u < U; u++) {
      if (!units[u].opponent) continue;
      let answers = 0; let exposure = 0;
      for (let c = 0; c < C; c++) { answers += W[u * C + c]; exposure += E[u * C + c]; }
      const center = team * Math.max(1, units[u].size);
      overall[u] = Math.max(0, (answers + OPPONENT_PRIOR * perQuestion * center) / (exposure + OPPONENT_PRIOR * perQuestion));
      for (let c = 0; c < C; c++) s[u * C + c] = overall[u];
    }
    // how hard each level plays: its unanswered tossups over their exposure,
    // plus half a question as hard as the reference level (D = 1 here) so no
    // level comes out 0
    const none = levels.map(() => 0);
    for (const t of tossups) if (t.winner === -1) none[t.level]++;
    levels.forEach((l, i) => { D[i] = (none[i] + 0.5) / (inv[i] + 0.5); });

    // strengths only mean anything against D, so measure them in varsity's
    const unit = D[ref];
    for (let i = 0; i < s.length; i++) s[i] /= unit;
    for (let u = 0; u < U; u++) overall[u] /= unit;
    for (let i = 0; i < D.length; i++) D[i] /= unit;

    let change = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] > 1e-9 || before[i] > 1e-9) change = Math.max(change, Math.abs(s[i] - before[i]) / Math.max(s[i], before[i]));
    }
    if (change < 1e-7) break;
  }
  exposures();
  teamNumbers();

  // what an answer is worth after the -5s, pulled toward the team's by the
  // same PLAYER_PRIOR questions of the team's own rates
  const sum = (list, f) => list.reduce((x, u) => x + f(u), 0);
  const correctOf = u => W.slice(u * C, u * C + C).reduce((x, y) => x + y, 0);
  const heardOf = u => H.slice(u * C, u * C + C).reduce((x, y) => x + y, 0);
  const allHeard = sum(players, heardOf) || 1;
  const correctRate = sum(players, correctOf) / allHeard;
  const negRate = sum(players, u => negCount[u]) / allHeard;
  const teamWorth = correctRate ? Math.max(0, 1 - negRate / 2 / correctRate) : 1;
  const worthOf = u => {
    const c = correctOf(u) + mP * correctRate;
    return c ? Math.max(0, (correctOf(u) - negCount[u] / 2 + mP * (correctRate - negRate / 2)) / c) : teamWorth;
  };

  const result = new Map();
  for (const u of players) {
    const byCat = arr => Object.fromEntries(CATEGORIES.map((c, i) => [c, arr[u * C + i]]));
    result.set(units[u].name, {
      overall: overall[u],
      strength: byCat(s),
      worth: worthOf(u),
      heard: heardOf(u),
      categoryHeard: byCat(H),
      answers: byCat(W),
      exposure: byCat(E),
      byGroup: {}
    });
  }
  if (options.groupOf) {
    for (const t of tossups) {
      for (const [u, a] of t.room) {
        if (units[u].opponent) continue;
        const grp = result.get(units[u].name).byGroup[t.group] ||= { answers: 0, exposure: 0, heard: 0 };
        grp.exposure += factor[t.c] * a / t.total;
        grp.heard += a;
        if (t.winner === u) grp.answers += 1;
      }
    }
  }

  return {
    reference: levels.length ? levels[ref] : null,
    difficulty: Object.fromEntries(levels.map((l, i) => [l, D[i]])),
    team,
    categoryFactor: Object.fromEntries(CATEGORIES.map((c, i) => [c, factor[i]])),
    teamWorth,
    players: result
  };
}
