// Coaching numbers from recorded games: how strong each player is in every
// category, their buzzing habits and month-to-month trend, and how hard each
// level's questions actually played. Pure computation over stored games;
// routes/kshsaa-insights.js reads the database and serves the page.
//
// A player's rate in a category is what they scored there per question heard,
// counting a correct answer as 1 and a -5 as minus a half. Small samples are
// pulled toward something steadier -- a player's overall rate toward the
// team's, a category rate toward the player's own overall rate -- so one lucky
// game does not make anyone a specialist.

import { CATEGORIES, CATEGORY_BY_QUESTION } from '../../routes/kshsaa-round.js';
import { celerityOf, monthKeyOf, playersInGame } from './game-stats.js';

/** Questions per category in a 16-question round. */
export const WEIGHTS = Object.fromEntries(CATEGORIES.map(c => [c, CATEGORY_BY_QUESTION.filter(x => x === c).length]));

// how many questions' worth of the steadier rate each estimate starts from
const PLAYER_PRIOR = 16;
const CATEGORY_PRIOR = 8;
// category questions heard before calling someone strong or weak there
const MIN_CATEGORY_HEARD = 6;
const MIN_MONTH_HEARD = 16;
// answers short of a player's usual level before a category counts as weak
const MIN_MISSING = 1.5;

const valueOf = t => t.correct - 0.5 * t.negs;
const blank = () => ({ heard: 0, correct: 0, wrong: 0, negs: 0 });

function addBuzz (t, b) {
  if (b.value > 0) t.correct++;
  else { t.wrong++; if (b.value < 0) t.negs++; }
}

/**
 * Share of a game's tossups in each category, read off the categories the
 * reader sent (or the standard round order for older games).
 */
function categoryShares (g) {
  const read = Math.max(1, g.tossupsRead || 16);
  const cats = (g.categories && g.categories.length ? g.categories : CATEGORY_BY_QUESTION).slice(0, read);
  const shares = {};
  for (const c of cats) shares[c] = (shares[c] || 0) + 1 / cats.length;
  return shares;
}

const median = list => {
  if (!list.length) return null;
  const s = list.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Picks the number that turns rates into rough chances of knowing an answer.
 * Ten people compete for every question, so a player who knows something still
 * only answers it some of the time; the scale is fitted so that "someone in the
 * room knew it" matches how often questions actually got answered.
 */
function fitScale (games, rateOf) {
  let best = { scale: 1, loss: Infinity };
  for (let scale = 1; scale <= 20; scale += 0.5) {
    let loss = 0;
    for (const g of games) {
      const players = [...playersInGame(g).keys()];
      const cats = (g.categories && g.categories.length ? g.categories : CATEGORY_BY_QUESTION).slice(0, g.tossupsRead || 16);
      cats.forEach((c, i) => {
        const answered = (g.buzzes || []).some(b => b.questionNumber === i + 1 && b.value > 0) ? 1 : 0;
        const missed = players.reduce((m, p) => m * (1 - Math.min(0.95, scale * rateOf(p, c))), 1);
        loss += (answered - (1 - missed)) ** 2;
      });
    }
    if (loss < best.loss) best = { scale, loss };
  }
  return best.scale;
}

/**
 * @param {object[]} allGames - stored games, oldest first
 * @param {{inMonth: function(string): boolean, inLevel: function(string): boolean}} filters
 * @param {Map<string, {source: string, question: string, answer: string}>} questionInfo
 *   what each read question was, by tossup id
 */
export function computeInsights (allGames, filters, questionInfo) {
  const games = allGames.filter(g => filters.inMonth(monthKeyOf(g.playedAt)) && filters.inLevel(g.level || 'untagged'));

  const players = {};
  const playerFor = name => players[name] || (players[name] = {
    name, games: 0, ...blank(), celerities: [], byCategory: {}, byMonth: {}
  });
  const team = { ...blank(), byCategory: {} };

  for (const g of games) {
    const shares = categoryShares(g);
    for (const [name, heard] of playersInGame(g)) {
      const p = playerFor(name);
      p.games++;
      p.heard += heard;
      team.heard += heard;
      for (const [c, share] of Object.entries(shares)) {
        (p.byCategory[c] ||= blank()).heard += heard * share;
        (team.byCategory[c] ||= blank()).heard += heard * share;
      }
    }
    for (const b of g.buzzes || []) {
      const p = playerFor(b.player);
      addBuzz(p, b);
      addBuzz(p.byCategory[b.category] ||= blank(), b);
      addBuzz(team, b);
      addBuzz(team.byCategory[b.category] ||= blank(), b);
      if (b.value > 0) {
        const c = celerityOf(b.wordIndex, b.wordCount);
        if (c != null) p.celerities.push(c);
      }
    }
  }

  // month-by-month, under the level filter only, for each player's trend
  for (const g of allGames) {
    if (!filters.inLevel(g.level || 'untagged')) continue;
    const month = monthKeyOf(g.playedAt);
    for (const [name, heard] of playersInGame(g)) {
      if (!players[name]) continue;
      (players[name].byMonth[month] ||= blank()).heard += heard;
    }
    for (const b of g.buzzes || []) {
      if (players[b.player]) addBuzz(players[b.player].byMonth[month] ||= blank(), b);
    }
  }

  const teamRate = team.heard ? Math.max(0, valueOf(team)) / team.heard : 0;
  const teamCategoryRate = c => {
    const t = team.byCategory[c];
    return t && t.heard ? Math.max(0, valueOf(t)) / t.heard : teamRate;
  };
  for (const p of Object.values(players)) {
    p.rate = Math.max(0, (valueOf(p) + PLAYER_PRIOR * teamRate) / (p.heard + PLAYER_PRIOR));
    p.categoryRate = {};
    for (const c of CATEGORIES) {
      const t = p.byCategory[c] || blank();
      const prior = teamRate ? p.rate * teamCategoryRate(c) / teamRate : p.rate;
      p.categoryRate[c] = Math.max(0, (valueOf(t) + CATEGORY_PRIOR * prior) / (t.heard + CATEGORY_PRIOR));
    }
  }

  const scale = fitScale(games, (name, c) => (players[name] ? players[name].categoryRate[c] ?? 0 : 0));
  const teamCelerity = median(Object.values(players).map(p => median(p.celerities)).filter(c => c != null));

  const rows = Object.values(players).map(p => {
    const buzzes = p.correct + p.wrong;
    const celerity = p.celerities.length ? p.celerities.reduce((a, b) => a + b, 0) / p.celerities.length : null;
    const vsTeam = c => (teamCategoryRate(c) ? p.categoryRate[c] / teamCategoryRate(c) : 1);
    // How many more answers this player would have had in a category at their
    // usual level. Weak means weak for them, and by enough answers to be more
    // than noise: someone below the team everywhere gets no arbitrary pair of
    // categories to work on.
    const missing = c => {
      const usual = teamRate ? p.rate * teamCategoryRate(c) / teamRate : p.rate;
      return (usual - p.categoryRate[c]) * (p.byCategory[c]?.heard || 0);
    };
    const judged = CATEGORIES.filter(c => (p.byCategory[c]?.heard || 0) >= MIN_CATEGORY_HEARD);
    const strong = judged.filter(c => vsTeam(c) >= 1.4).sort((a, b) => vsTeam(b) - vsTeam(a)).slice(0, 2);
    const weak = judged.filter(c => vsTeam(c) <= 0.6 && missing(c) >= MIN_MISSING).sort((a, b) => missing(b) - missing(a)).slice(0, 2);

    const habits = [];
    if (buzzes >= 5 && p.negs / buzzes >= 0.3) habits.push('early');
    if (p.correct >= 6 && p.correct / buzzes >= 0.9 && celerity != null && teamCelerity != null && celerity < teamCelerity - 0.1) habits.push('late');
    if (p.heard >= 32 && buzzes / p.heard < 1 / 32) habits.push('quiet');

    // compare the two most recent months with enough play
    const months = Object.keys(p.byMonth).sort().filter(m => p.byMonth[m].heard >= MIN_MONTH_HEARD);
    let trend = null;
    if (months.length >= 2) {
      const ppq = m => (10 * p.byMonth[m].correct - 5 * p.byMonth[m].negs) / p.byMonth[m].heard;
      const [before, after] = months.slice(-2);
      trend = { from: before, to: after, change: +(ppq(after) - ppq(before)).toFixed(2) };
    }

    return {
      name: p.name,
      games: p.games,
      heard: p.heard,
      correct: p.correct,
      wrong: p.wrong,
      negs: p.negs,
      ppq: p.heard ? +((10 * p.correct - 5 * p.negs) / p.heard).toFixed(2) : null,
      accuracy: buzzes ? Math.round((p.correct / buzzes) * 100) : null,
      celerity: celerity == null ? null : +celerity.toFixed(3),
      // rough chance of knowing a question in each category, for team building
      know: Object.fromEntries(CATEGORIES.map(c => [c, +Math.min(0.95, scale * p.categoryRate[c]).toFixed(3)])),
      categoryHeard: Object.fromEntries(CATEGORIES.map(c => [c, +(p.byCategory[c]?.heard || 0).toFixed(1)])),
      strong,
      weak,
      habits,
      trend
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    gamesUsed: games.length,
    scale,
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
