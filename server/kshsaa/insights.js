// Coaching numbers from recorded games: how strong each player is in every
// category, their buzzing habits and month-to-month trend, and how hard each
// level's questions actually played. Pure computation over stored games;
// routes/kshsaa-insights.js reads the database and serves the page.
//
// Strengths come from the room model (room-model.js), which accounts for who
// else was in the room and how hard each level plays. A game where a varsity
// player held back is left out for them entirely: it does not count toward
// their games, points, or habits.

import { CATEGORIES } from '../../routes/kshsaa-round.js';
import { celerityOf, monthKeyOf, playersInGame } from './game-stats.js';
import { PLAYER_PRIOR, WEIGHTS, fitRoomModel, heldBackIn, soloAnswers } from './room-model.js';

// category questions heard before calling someone strong or weak there
const MIN_CATEGORY_HEARD = 6;
const MIN_MONTH_HEARD = 16;
// answers short of a player's usual level before a category counts as weak
const MIN_MISSING = 1.5;

const blank = () => ({ heard: 0, correct: 0, wrong: 0, negs: 0 });

function addBuzz (t, b) {
  if (b.value > 0) t.correct++;
  else { t.wrong++; if (b.value < 0) t.negs++; }
}

const median = list => {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const round4 = x => +x.toPrecision(4);

/**
 * @param {object[]} allGames - stored games, oldest first
 * @param {{inMonth: function(string): boolean, inLevel: function(string): boolean}} filters
 * @param {Map<string, {source: string, question: string, answer: string}>} questionInfo
 *   what each read question was, by tossup id
 * @param {function(string): boolean} isVarsity - whether a player is on a varsity squad or pool
 */
export function computeInsights (allGames, filters, questionInfo, isVarsity) {
  const games = allGames.filter(g => filters.inMonth(monthKeyOf(g.playedAt)) && filters.inLevel(g.level || 'untagged'));
  const model = fitRoomModel(games, isVarsity);
  // month by month, under the level filter only, for each player's trend
  const history = fitRoomModel(allGames.filter(g => filters.inLevel(g.level || 'untagged')), isVarsity,
    { groupOf: g => monthKeyOf(g.playedAt) });

  const players = {};
  const playerFor = name => players[name] || (players[name] = {
    name, games: 0, heldBack: 0, ...blank(), celerities: []
  });
  for (const g of games) {
    const held = heldBackIn(g, isVarsity);
    for (const [name, heard] of playersInGame(g)) {
      const p = playerFor(name);
      if (held.has(name)) { p.heldBack++; continue; }
      p.games++;
      p.heard += heard;
    }
    for (const b of g.buzzes || []) {
      if (!b.player || held.has(b.player)) continue; // the other school, or holding back
      const p = playerFor(b.player);
      addBuzz(p, b);
      if (b.value > 0) {
        const c = celerityOf(b.wordIndex, b.wordCount);
        if (c != null) p.celerities.push(c);
      }
    }
  }

  const teamCelerity = median(Object.values(players).map(p => median(p.celerities)).filter(c => c != null));
  // the team's average strength in a category
  const teamIn = c => model.team * model.categoryFactor[c];

  const rows = Object.values(players).map(p => {
    const m = model.players.get(p.name);
    const buzzes = p.correct + p.wrong;
    const celerity = p.celerities.length ? p.celerities.reduce((a, b) => a + b, 0) / p.celerities.length : null;
    let strong = [];
    let weak = [];
    if (m) {
      const vsTeam = c => (teamIn(c) ? m.strength[c] / teamIn(c) : 1);
      const judged = CATEGORIES.filter(c => m.categoryHeard[c] >= MIN_CATEGORY_HEARD);
      strong = judged.filter(c => vsTeam(c) >= 1.4).sort((a, b) => vsTeam(b) - vsTeam(a)).slice(0, 2);
      // The answers a category would have brought at the player's usual
      // level, in the rooms they actually played, against what they got.
      // Weak means weak for them: at most 60% of that, by enough answers to be
      // more than noise, and below the team there. Someone below the team
      // everywhere gets no arbitrary pair of categories to work on.
      const usual = c => m.overall * model.categoryFactor[c] * m.exposure[c];
      const missing = c => usual(c) - m.answers[c];
      weak = judged.filter(c => m.answers[c] <= 0.6 * usual(c) && missing(c) >= MIN_MISSING && vsTeam(c) < 1)
        .sort((a, b) => missing(b) - missing(a)).slice(0, 2);
    }

    const habits = [];
    if (buzzes >= 5 && p.negs / buzzes >= 0.3) habits.push('early');
    if (p.correct >= 6 && p.correct / buzzes >= 0.9 && celerity != null && teamCelerity != null && celerity < teamCelerity - 0.1) habits.push('late');
    if (p.heard >= 32 && buzzes / p.heard < 1 / 32) habits.push('quiet');

    // compare the two most recent months with enough play, in answers of 16
    // the player would get on their own at the reference level
    const h = history.players.get(p.name);
    const months = h ? Object.keys(h.byGroup).sort().filter(k => h.byGroup[k].heard >= MIN_MONTH_HEARD && h.byGroup[k].exposure > 0) : [];
    let trend = null;
    if (months.length >= 2) {
      // a month is pulled toward the player's usual level by PLAYER_PRIOR
      // questions' worth of it, so one good or bad game is not a trend
      const groups = Object.values(h.byGroup);
      const prior = PLAYER_PRIOR * groups.reduce((x, g) => x + g.exposure, 0) / groups.reduce((x, g) => x + g.heard, 0);
      const solo = k => {
        const r = Math.max(0, (h.byGroup[k].answers + prior * h.overall) / (h.byGroup[k].exposure + prior));
        return soloAnswers(Object.fromEntries(CATEGORIES.map(c => [c, r * history.categoryFactor[c]])), 1);
      };
      const [before, after] = months.slice(-2);
      trend = { from: before, to: after, level: history.reference, change: +(h.worth * (solo(after) - solo(before))).toFixed(1) };
    }

    return {
      name: p.name,
      games: p.games,
      heldBack: p.heldBack,
      heard: p.heard,
      correct: p.correct,
      wrong: p.wrong,
      negs: p.negs,
      ppq: p.heard ? +((10 * p.correct - 5 * p.negs) / p.heard).toFixed(2) : null,
      accuracy: buzzes ? Math.round((p.correct / buzzes) * 100) : null,
      celerity: celerity == null ? null : +celerity.toFixed(3),
      // strength in each category and what an answer is worth after the -5s,
      // for the team builder and the Adjusted column
      strength: m ? Object.fromEntries(CATEGORIES.map(c => [c, round4(m.strength[c])])) : null,
      worth: m ? round4(m.worth) : null,
      categoryHeard: Object.fromEntries(CATEGORIES.map(c => [c, m ? +m.categoryHeard[c].toFixed(1) : 0])),
      strong,
      weak,
      habits,
      trend
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    gamesUsed: games.length,
    // how hard each level plays, with the reference level at 1
    difficulty: Object.fromEntries(Object.entries(model.difficulty).map(([l, d]) => [l, round4(d)])),
    reference: model.reference,
    // the team's average strength in each category, and answer worth
    teamStrength: Object.fromEntries(CATEGORIES.map(c => [c, round4(teamIn(c))])),
    teamWorth: round4(model.teamWorth),
    weights: WEIGHTS,
    teamCelerity,
    players: rows,
    questions: questionDifficulty(games, questionInfo)
  };
}

/**
 * How each level's questions played, by where they came from: how often anyone
 * answered, how early, and how spread out the buzz points were. Uses the games
 * that recorded which question was read at each number.
 */
function questionDifficulty (games, questionInfo) {
  const groups = {};
  const perQuestion = new Map();
  for (const g of games) {
    if (!Array.isArray(g.questionIds)) continue;
    const level = g.level || 'untagged';
    g.questionIds.slice(0, g.tossupsRead || g.questionIds.length).forEach((id, i) => {
      const info = questionInfo.get(String(id));
      const source = info ? info.source : 'unknown';
      const buzzes = (g.buzzes || []).filter(b => b.questionNumber === i + 1);
      const right = buzzes.find(b => b.value > 0);
      const grp = groups[level + '|' + source] ||= { level, source, read: 0, answered: 0, negged: 0, celerities: [] };
      grp.read++;
      if (right) {
        grp.answered++;
        const c = celerityOf(right.wordIndex, right.wordCount);
        if (c != null) grp.celerities.push(c);
      }
      if (buzzes.some(b => b.value < 0)) grp.negged++;
      const q = perQuestion.get(String(id)) || { id: String(id), read: 0, answered: 0, lastRead: g.playedAt, level };
      q.read++;
      if (right) q.answered++;
      q.lastRead = g.playedAt;
      perQuestion.set(String(id), q);
    });
  }
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  const rows = Object.values(groups).map(grp => ({
    level: grp.level,
    source: grp.source,
    read: grp.read,
    answered: Math.round((grp.answered / grp.read) * 100),
    negged: Math.round((grp.negged / grp.read) * 100),
    buzzPoint: grp.celerities.length ? +mean(grp.celerities).toFixed(2) : null,
    spread: grp.celerities.length > 1
      ? +Math.sqrt(mean(grp.celerities.map(c => (c - mean(grp.celerities)) ** 2))).toFixed(2)
      : null
  })).sort((a, b) => a.level.localeCompare(b.level) || b.read - a.read);

  // questions nobody has answered, most recent first
  const dead = [...perQuestion.values()]
    .filter(q => !q.answered)
    .sort((a, b) => new Date(b.lastRead) - new Date(a.lastRead))
    .slice(0, 15)
    .map(q => ({ ...q, ...(questionInfo.get(q.id) || {}) }));
  return { rows, dead };
}
