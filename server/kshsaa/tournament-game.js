// A tournament game typed in from a paper scoresheet, checked and turned into
// the stored shape (routes/kshsaa-tournaments.js saves it). Not every sheet is
// complete, so a game says how the other team's side was kept
// (OPPONENT_MODES): question by question like ours, not at all, or not there
// because we played a chair. Rounds can also run past 16 questions, a game
// can be a playoff round (STAGES) when the team makes it that far, and not
// every tournament reads its subjects in the regular order (SUBJECT_ORDERS).

import { cleanNotes } from './game-stats.js';
import { CATEGORIES, CATEGORY_BY_QUESTION, LEVELS } from './round-shape.js';

// player slots on the scoresheet: five starters and a sub
export const SLOTS = 6;
// a regular round is 16; some tournaments run longer special rounds
export const MAX_QUESTIONS = 40;
/**
 * How the other team's side of a sheet was kept:
 *   recorded   - their +10s and -5s, question by question, like ours
 *   unrecorded - not at all; the sheet may still have their final score, or
 *                just who won
 *   chair      - there was no other team: we played a chair, which counts as
 *                neither a win nor a loss
 */
export const OPPONENT_MODES = ['recorded', 'unrecorded', 'chair'];
export const RESULTS = ['win', 'loss', 'tie'];
/**
 * Playoff rounds, in bracket order. A game with none is a regular round, and
 * a chair is always one, since a playoff game has an opponent.
 */
export const STAGES = {
  quarterfinal: 'Quarterfinal',
  semifinal: 'Semifinal',
  third: 'Third-place game',
  final: 'Final'
};

/**
 * The subjects a tournament question can have: the KSHSAA ones, and 'Other'
 * for one outside them, which sheets call Misc. An Other question counts in
 * points, buzzes, and the score, but toward no subject, and Insights leaves it
 * out, since the room model reads only the KSHSAA subjects. Practice games'
 * Other questions already count that way.
 */
export const SUBJECTS = [...CATEGORIES, 'Other'];

// a round's subjects in reading order, from [subject, how many] in a row
const inOrder = (...runs) => runs.flatMap(([subject, count]) => Array(count).fill(subject));

/**
 * Rounds some tournaments read instead of the regular one. They leave out
 * World Language and make up its question another way, so every subject after
 * the change moves up a row. The entry grid offers these, and any question's
 * subject can still be changed by hand.
 */
export const SUBJECT_ORDERS = [
  { key: 'regular', label: 'Regular order', order: CATEGORY_BY_QUESTION },
  {
    key: 'language-arts',
    label: 'No World Language: a 4th Language Arts',
    order: inOrder(['Language Arts', 4], ['Science/Health', 3], ['Social Studies', 3], ['Mathematics', 3], ['Fine Arts', 2], ['Year in Review', 1])
  },
  {
    key: 'fine-arts',
    label: 'No World Language: a 3rd Fine Arts',
    order: inOrder(['Language Arts', 3], ['Science/Health', 3], ['Social Studies', 3], ['Mathematics', 3], ['Fine Arts', 3], ['Year in Review', 1])
  },
  {
    key: 'misc',
    label: 'No World Language: Misc before Year in Review',
    order: inOrder(['Language Arts', 3], ['Science/Health', 3], ['Social Studies', 3], ['Mathematics', 3], ['Fine Arts', 2], ['Other', 1], ['Year in Review', 1])
  }
];

const text = (v, max) => String(v ?? '').trim().slice(0, max);
const compare = (us, them) => (us > them ? 'win' : us < them ? 'loss' : 'tie');

/**
 * The subject of question n (1-based) when the sheet does not say: a regular
 * round's order, starting over after 16.
 * @param {number} n
 * @returns {string}
 */
export const categoryFor = n => CATEGORY_BY_QUESTION[(n - 1) % CATEGORY_BY_QUESTION.length];

/**
 * Another round of the same tournament changed to these subjects, question by
 * question as far as both go, with its buzzes following their questions. The
 * entry grid offers this after one round's subjects are changed, since a
 * tournament reads every round the same way.
 * @param {object} game - a stored tournament game
 * @param {string[]} subjects - by question, 1 first
 * @returns {{categories: string[], buzzes: object[]} | null} null when
 *   nothing would change
 */
export function withSubjects (game, subjects) {
  const read = game.tossupsRead || game.categories?.length || CATEGORY_BY_QUESTION.length;
  const own = n => game.categories?.[n - 1] || categoryFor(n);
  const categories = Array.from({ length: read }, (_, i) => (SUBJECTS.includes(subjects[i]) ? subjects[i] : own(i + 1)));
  if (categories.every((c, i) => c === own(i + 1))) return null;
  const buzzes = (game.buzzes || []).map(b =>
    b.questionNumber >= 1 && b.questionNumber <= read ? { ...b, category: categories[b.questionNumber - 1] } : b);
  return { categories, buzzes };
}

/**
 * A game from the entry grid, checked and turned into the stored shape. Throws
 * with a message for whoever is typing it in.
 * @param {object} body - { tournament, date, level, round, stage, team,
 *   opponent, opponentMode, opponentScore, result, players: [{name, from, to}],
 *   questions: [{category, us: {player, value} | null, them: 10 | -5 | null}],
 *   notes: [{questionNumber, player, text}] }. `them` counts only when the
 *   mode is 'recorded'; opponentScore and result only when it is 'unrecorded'.
 * @param {function(string): string} fix - name canonicalizer
 */
export function tournamentGame (body, fix) {
  const tournament = text(body.tournament, 80);
  if (!tournament) throw new Error('which tournament was it?');
  const date = String(body.date || '');
  // midday in Kansas, so the game files under the right day and month
  const playedAt = new Date(date + 'T18:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(playedAt.getTime())) throw new Error('the tournament needs a date');
  const team = text(body.team, 60) || 'SJA';
  const mode = OPPONENT_MODES.includes(body.opponentMode) ? body.opponentMode : 'recorded';
  const opponent = mode === 'chair' ? null : text(body.opponent, 60);
  if (mode !== 'chair') {
    if (!opponent) throw new Error('who was the opponent? If nobody, set their points to "none: we played a chair"');
    if (opponent.toLowerCase() === team.toLowerCase()) throw new Error('the opponent needs a different name from our team');
  }
  const stage = Object.hasOwn(STAGES, body.stage ?? '') ? body.stage : null;
  if (stage && mode === 'chair') throw new Error('a playoff game has an opponent, so a chair is a regular round');

  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (!questions.length || questions.length > MAX_QUESTIONS) throw new Error('a game has 1 to ' + MAX_QUESTIONS + ' questions');
  const read = questions.length;

  // who played, and for which questions: a sub who came in at question 9
  // heard 8 of them
  const lineup = [];
  const span = {};
  for (const p of (Array.isArray(body.players) ? body.players : []).slice(0, SLOTS + 4)) {
    const name = fix(text(p?.name, 60));
    if (!name) continue;
    if (span[name]) throw new Error(name + ' is listed twice');
    const from = p.from == null || p.from === '' ? 1 : Number(p.from);
    const to = p.to == null || p.to === '' ? read : Number(p.to);
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 1 && from <= to && to <= read)) {
      throw new Error(name + ' has to be in for questions somewhere from 1 to ' + read);
    }
    span[name] = [from, to];
    lineup.push({ name, from, to });
  }
  if (!lineup.length) throw new Error('list who played');

  const buzzes = [];
  const categories = questions.map((q, i) => {
    const n = i + 1;
    const category = SUBJECTS.includes(q?.category) ? q.category : categoryFor(n);
    const us = q?.us?.player ? { player: fix(text(q.us.player, 60)), value: Number(q.us.value) } : null;
    const them = mode !== 'recorded' || q?.them == null || q.them === '' ? null : Number(q.them);
    if (us) {
      if (!span[us.player]) throw new Error('question ' + n + ' is credited to ' + us.player + ', who is not listed as playing');
      if (n < span[us.player][0] || n > span[us.player][1]) throw new Error(us.player + ' was not in for question ' + n);
      if (us.value !== 10 && us.value !== -5) throw new Error('question ' + n + ': our answer counts +10 or -5');
    }
    if (them != null && them !== 10 && them !== -5) throw new Error('question ' + n + ': their answer counts +10 or -5');
    // one team answers a question correctly, and only the first team to
    // interrupt can lose points on it
    if (us && them != null && us.value === them) {
      throw new Error('question ' + n + ': both teams cannot ' + (them > 0 ? 'get it right' : 'lose 5 points'));
    }
    const entry = (player, teamName, value) => ({
      player, team: teamName, questionNumber: n, category, value, wordIndex: null, wordCount: null, charCount: null
    });
    const both = [];
    if (us) both.push(entry(us.player, team, us.value));
    if (them != null) both.push(entry(null, opponent, them));
    // the wrong answer came first
    buzzes.push(...both.sort((a, b) => a.value - b.value));
    return category;
  });

  // the score, and who won: from both sides' buzzes when the sheet has them,
  // else from their final score or the result the sheet gives, if any
  const ourScore = buzzes.reduce((s, b) => s + (b.team === team ? b.value : 0), 0);
  let theirScore = null;
  let result = null;
  if (mode === 'recorded') {
    theirScore = buzzes.reduce((s, b) => s + (b.team === opponent ? b.value : 0), 0);
    result = compare(ourScore, theirScore);
  } else if (mode === 'unrecorded') {
    if (body.opponentScore != null && String(body.opponentScore).trim() !== '') {
      theirScore = Number(body.opponentScore);
      if (!Number.isInteger(theirScore) || Math.abs(theirScore) > 2000) throw new Error('their final score has to be a whole number');
      result = compare(ourScore, theirScore);
    } else if (RESULTS.includes(body.result)) {
      result = body.result;
    }
  }

  const round = text(body.round, 20);
  const ours = { name: team, players: lineup.map(p => p.name), score: ourScore };
  return {
    kind: 'tournament',
    tournament,
    round,
    stage,
    opponent,
    opponentMode: mode,
    result,
    // a playoff game goes by its stage: "Hays Invitational, semifinal vs Hays"
    label: tournament + (stage ? ', ' + STAGES[stage].toLowerCase() : round ? ', round ' + round : '') +
      (mode === 'chair' ? ' (chair)' : ' vs ' + opponent),
    playedAt,
    level: LEVELS[body.level] ? body.level : null,
    tossupsRead: read,
    categories,
    wordCounts: null,
    charCounts: null,
    lineup,
    teams: mode === 'chair' ? [ours] : [ours, { name: opponent, players: [], score: theirScore, opponent: true }],
    heardByPlayer: Object.fromEntries(lineup.map(p => [team + '|' + p.name, p.to - p.from + 1])),
    buzzes,
    notes: cleanNotes(body.notes, n => Boolean(span[n]), fix)
  };
}
