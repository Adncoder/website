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
//
// D is set by what decides how hard the questions were. In practice that is
// the level (varsity, JV, beginner): our rounds draw each level from its own
// pools. A tournament's questions are whatever its writers wrote, whatever the
// level on its flyer, so each tournament gets its own D, measured the same
// way, from how often nobody answered given who was in the room. Our players
// come into tournaments with strengths their practice games already measure,
// which is what ties a tournament's D to the same scale. A tournament is
// pulled toward the typical tournament of its label (every tossup of every
// tournament with that label, together) by EVENT_PRIOR questions' worth, so
// one odd round does not make it look easy or hard.
//
// Some tournament sheets leave out the other team's points (opponentMode
// 'unrecorded'). A tossup our players answered is known. One they did not
// answer went to the other school or to nobody, and the sheet cannot say
// which: it is only "not us", which has chance (s_o + D) / (the room's sum),
// s_o being the other school's strength. Each time round, the fit splits such
// a tossup between the two in proportion, s_o / (s_o + D) to the other school
// and D / (s_o + D) to nobody, and counts those shares where a full sheet would
// have counted the answer (expectation-maximization). Our players' exposure is
// the same either way, so their strengths use these games in full. The other
// school's strength and the tournament's D learn only what the "not us" rate
// says about the two together; their priors and the tournament's full sheets
// decide the rest. A game against a chair has no other school in the room.

import { CATEGORIES, CATEGORY_BY_QUESTION } from './round-shape.js';
import { kindOf, monthKeyOf, opponentModeOf, playersInGame } from './game-stats.js';

/** Questions per category in a 16-question round. */
export const WEIGHTS = Object.fromEntries(CATEGORIES.map(c => [c, CATEGORY_BY_QUESTION.filter(x => x === c).length]));

// how many questions' worth of the steadier value each estimate starts from,
// both two rounds: fitted by predicting each saved game from all the others
export const PLAYER_PRIOR = 32;
export const CATEGORY_PRIOR = 32;
// a school we play at a tournament starts out, by half a round's worth, as
// strong as the lineup we sent against it (the sum of their strengths, for
// the questions each was in for), and never weaker than one average player
const OPPONENT_PRIOR = 8;
// a tournament starts out as hard as the typical tournament of its label, by
// one round's worth: a tournament of six rounds weighs its own six to that one
export const EVENT_PRIOR = 16;
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
 * Which tournament a tournament game was played at: the same name at the same
 * label in the same school year, so its rounds share one D.
 * @param {object} g - a stored game
 * @returns {{key: string, name: string, season: string}}
 */
export function tournamentOf (g) {
  const name = String(g.tournament || 'Tournament').trim().replace(/\s+/g, ' ');
  const [y, m] = monthKeyOf(g.playedAt).split('-').map(Number);
  const season = (m >= 8 ? y : y - 1) + '-' + String((m >= 8 ? y + 1 : y) % 100).padStart(2, '0');
  return { key: [name.toLowerCase(), g.level || 'untagged', season].join('|'), name, season };
}

/**
 * @typedef {object} RoomTournament
 * @property {string} name
 * @property {string} level - the level it was entered under, or 'untagged'
 * @property {string} season - the school year, 2026-27
 * @property {number} games
 * @property {number} read - tossups that count toward its difficulty
 * @property {number} answered - of those, answered by somebody; expected, not
 *   counted, for the ones in `estimated`
 * @property {number} estimated - tossups we did not answer in games whose
 *   other team went unrecorded, so nobody knows if anyone did
 * @property {number} unrecordedGames - games whose other team went unrecorded.
 *   When that is every game, nothing separates hard questions from strong
 *   schools: the fit leaves each school as strong as the lineup we sent and
 *   D takes the rest, so D is that assumption, not a measurement.
 * @property {number} difficulty - its D, on the reference level's scale
 */

/**
 * Fits the model to a set of games.
 * @param {object[]} games - stored games
 * @param {function(string): boolean} isVarsity - whether a player is on a varsity squad or pool
 * @param {{player?: number, category?: number, event?: number, groupOf?: function(object): string}} [options]
 * @returns {{reference: ?string, referencePractice: boolean, difficulty: Object<string, number>, tournaments: RoomTournament[], team: number,
 *   categoryFactor: Object<string, number>, teamWorth: number, players: Map<string, RoomPlayer>}}
 */
export function fitRoomModel (games, isVarsity, options = {}) {
  const mP = options.player ?? PLAYER_PRIOR;
  const mC = options.category ?? CATEGORY_PRIOR;
  const mE = options.event ?? EVENT_PRIOR;
  const C = CATEGORIES.length;

  // everyone who can answer: our players by name, and one stand-in for the
  // other school in each tournament game
  const units = [];
  const byName = new Map();
  const unitFor = name => {
    if (!byName.has(name)) { byName.set(name, units.length); units.push({ name, opponent: false }); }
    return byName.get(name);
  };
  // what sets each tossup's D: a practice level, or one tournament
  const groups = [];
  const groupIndex = new Map();
  const groupFor = (key, make) => {
    if (!groupIndex.has(key)) { groupIndex.set(key, groups.length); groups.push({ ...make(), games: 0 }); }
    return groupIndex.get(key);
  };
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
    const event = kindOf(g) === 'tournament' ? tournamentOf(g) : null;
    const d = event
      ? groupFor('event|' + event.key, () => ({ label: level, event: true, name: event.name, season: event.season }))
      : groupFor('level|' + level, () => ({ label: level, event: false }));
    groups[d].games++;
    let opponent = -1;
    if ((g.teams || []).some(t => t.opponent)) {
      opponent = units.length;
      units.push({ name: null, opponent: true, size: 0 });
    }
    // their side of the sheet is blank: a tossup we did not get is split below
    const unrecorded = opponent !== -1 && opponentModeOf(g) === 'unrecorded';
    if (unrecorded) groups[d].unrecorded = (groups[d].unrecorded || 0) + 1;
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
      tossups.push({ c, d, room: [...room], winner, negs, group, split: unrecorded && winner === -1, opp: opponent });
    }
  }
  grow();

  const U = units.length;
  const players = units.map((u, i) => i).filter(i => !units[i].opponent);
  const s = new Array(U * C).fill(1);
  const overall = new Array(U).fill(1);
  const D = groups.map(() => 1);
  const read = groups.map(() => 0);
  for (const t of tossups) read[t.d]++;
  // tournaments by the label they were entered under
  const eventLabels = {};
  groups.forEach((grp, i) => { if (grp.event) (eventLabels[grp.label] ||= []).push(i); });
  // each label's tournaments taken together: the typical tournament of that label
  let pooled = {};
  const practiceOf = label => groupIndex.get('level|' + label);
  // a level's D: its practice games', or with none, its tournaments' together
  const levelD = label => (practiceOf(label) !== undefined ? D[practiceOf(label)] : pooled[label]);
  // the level every strength is measured against: varsity practice when the
  // games include it
  const labels = [...new Set(groups.map(grp => grp.label))];
  const reference = LEVEL_ORDER.find(l => practiceOf(l) !== undefined) ??
    LEVEL_ORDER.find(l => labels.includes(l)) ?? labels[0] ?? null;
  let E = new Array(U * C).fill(0);
  let team = 1;
  let factor = new Array(C).fill(1);
  let perQuestion = 1;

  const exposures = () => {
    E = new Array(U * C).fill(0);
    const inv = groups.map(() => 0);
    for (const t of tossups) {
      let total = D[t.d];
      for (const [u, a] of t.room) total += a * s[u * C + t.c];
      for (const [u, a] of t.room) E[u * C + t.c] += a / total;
      inv[t.d] += 1 / total;
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

  // A tossup we did not get, in a game whose other team went unrecorded, went
  // to them with chance s_o / (s_o + D) and to nobody with D / (s_o + D), at
  // the current s_o and D: each other school's expected answers, and each
  // group's expected unanswered tossups.
  const splitUnknowns = () => {
    const wins = new Array(U).fill(0);
    const none = groups.map(() => 0);
    for (const t of tossups) {
      if (!t.split) continue;
      const them = s[t.opp * C + t.c];
      const toThem = them + D[t.d] > 0 ? them / (them + D[t.d]) : 0;
      wins[t.opp] += toThem;
      none[t.d] += 1 - toThem;
    }
    return { wins, none };
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const inv = exposures();
    teamNumbers();
    const split = splitUnknowns();

    const before = s.slice();
    for (const u of players) {
      let answers = 0; let exposure = 0;
      for (let c = 0; c < C; c++) { answers += W[u * C + c]; exposure += factor[c] * E[u * C + c]; }
      overall[u] = Math.max(0, (answers + mP * perQuestion * team) / (exposure + mP * perQuestion));
      for (let c = 0; c < C; c++) {
        s[u * C + c] = Math.max(0, (W[u * C + c] + mC * perQuestion * factor[c] * overall[u]) / (E[u * C + c] + mC * perQuestion));
      }
    }
    // the lineup we sent against each other school, per tossup: what it
    // starts out as strong as
    const sent = new Array(U).fill(0);
    const count = new Array(U).fill(0);
    for (const t of tossups) {
      if (t.opp === -1) continue;
      count[t.opp]++;
      for (const [v, a] of t.room) if (!units[v].opponent) sent[t.opp] += a * overall[v];
    }
    for (let u = 0; u < U; u++) {
      if (!units[u].opponent) continue;
      let answers = split.wins[u]; let exposure = 0;
      for (let c = 0; c < C; c++) { answers += W[u * C + c]; exposure += E[u * C + c]; }
      const center = count[u] ? Math.max(team, sent[u] / count[u]) : team * Math.max(1, units[u].size);
      overall[u] = Math.max(0, (answers + OPPONENT_PRIOR * perQuestion * center) / (exposure + OPPONENT_PRIOR * perQuestion));
      for (let c = 0; c < C; c++) s[u * C + c] = overall[u];
    }
    // how hard each level plays: its unanswered tossups (the split ones by
    // their expected share) over their exposure, plus half a question as hard
    // as the reference level (D = 1 here) so no level comes out 0
    const none = split.none.slice();
    for (const t of tossups) if (t.winner === -1 && !t.split) none[t.d]++;
    groups.forEach((grp, i) => { if (!grp.event) D[i] = (none[i] + 0.5) / (inv[i] + 0.5); });
    // and each tournament: the same, plus EVENT_PRIOR questions as hard as
    // the typical tournament of its label
    pooled = {};
    for (const [label, members] of Object.entries(eventLabels)) {
      const sum = list => members.reduce((x, i) => x + list[i], 0);
      pooled[label] = (sum(none) + 0.5) / (sum(inv) + 0.5);
      for (const i of members) {
        const prior = mE * inv[i] / read[i];
        D[i] = (none[i] + prior * pooled[label]) / (inv[i] + prior);
      }
    }

    // strengths only mean anything against D, so measure them in varsity's
    const unit = reference === null ? 1 : levelD(reference);
    for (let i = 0; i < s.length; i++) s[i] /= unit;
    for (let u = 0; u < U; u++) overall[u] /= unit;
    for (let i = 0; i < D.length; i++) D[i] /= unit;
    for (const label of Object.keys(pooled)) pooled[label] /= unit;

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

  // answered by somebody: counted where the sheets say, expected where they
  // cannot (a split tossup was answered with chance s_o / (s_o + D))
  const answered = groups.map(() => 0);
  const estimated = groups.map(() => 0);
  const last = splitUnknowns();
  for (const t of tossups) {
    if (t.winner !== -1) answered[t.d]++;
    else if (t.split) estimated[t.d]++;
  }
  groups.forEach((grp, i) => { answered[i] += estimated[i] - last.none[i]; });
  return {
    reference,
    // whether D = 1 is the reference level's practice games, or (with none in
    // these games) its typical tournament
    referencePractice: reference !== null && practiceOf(reference) !== undefined,
    // each level's D from its practice games, or its tournaments' together
    // when it has none
    difficulty: Object.fromEntries(labels.map(label => [label, levelD(label)])),
    tournaments: groups.flatMap((grp, i) => (grp.event
      ? [{
          name: grp.name,
          level: grp.label,
          season: grp.season,
          games: grp.games,
          read: read[i],
          answered: answered[i],
          estimated: estimated[i],
          unrecordedGames: grp.unrecorded || 0,
          difficulty: D[i]
        }]
      : [])),
    team,
    categoryFactor: Object.fromEntries(CATEGORIES.map((c, i) => [c, factor[i]])),
    teamWorth,
    players: result
  };
}
