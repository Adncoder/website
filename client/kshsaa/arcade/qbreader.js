// Questions the arcade reads straight from qbreader.org's public API, which
// answers any site: Sports and Pop Culture for every mode, cut to the level's
// length the way the giveaway imports cut theirs (giveaway.js), and for
// Quizbowl whole tossups and three-part bonuses in every category. None of
// them is stored in this site's database, so none is ever counted as read,
// and they come from standard sets only, which keeps out the adult-themed
// "trash" tournaments.

import { questionForLevel } from '../giveaway.js';

const API = 'https://www.qbreader.org/api';

/** Categories only the arcade offers, all from qbreader.org. */
export const EXTRA_CATEGORIES = ['Sports', 'Pop Culture'];

// qbreader's difficulty for each level, as the giveaway imports use them
const DIFFICULTY = { beginner: 1, jv: 2, varsity: 3 };

// what to ask for under each category the arcade offers, matching
// giveawaySlotOf; World Language has nothing in quizbowl to match it
const QUERY = {
  'Language Arts': { categories: 'Literature,Mythology' },
  // its math is dropped once it comes back (fromTossup)
  'Science/Health': { categories: 'Science' },
  'Social Studies': { categories: 'History,Geography,Social Science,Religion,Philosophy' },
  Mathematics: { subcategories: 'Other Science', alternateSubcategories: 'Math' },
  'Fine Arts': { categories: 'Fine Arts' },
  'Year in Review': { categories: 'Current Events' },
  Sports: { subcategories: 'Sports' },
  'Pop Culture': { subcategories: 'Movies,Music,Television,Video Games,Other Pop Culture' }
};

// cut questions that cannot stand alone are dropped, so ask for this many times more
const CUT_SPARE = 3;

/** Whether qbreader.org has questions for a category. */
export const fromQbreader = label => Object.hasOwn(QUERY, label);

/**
 * The oldest set year to read from: current events and pop culture go stale.
 * @param {string} label
 * @param {number} year - this year
 */
function minYearFor (label, year) {
  if (label === 'Year in Review') return year - 1;
  if (EXTRA_CATEGORIES.includes(label)) return year - 8;
  return 2010;
}

/**
 * Where to ask for some random tossups or bonuses in one category.
 * @param {'tossup'|'bonus'} kind
 * @param {string} label - a category fromQbreader() accepts
 * @param {string} level
 * @param {number} number
 * @param {number} [year]
 * @returns {string}
 */
export function qbreaderUrl (kind, label, level, number, year = new Date().getFullYear()) {
  const params = new URLSearchParams({
    ...QUERY[label],
    difficulties: String(DIFFICULTY[level] || DIFFICULTY.varsity),
    number: String(number),
    minYear: String(minYearFor(label, year)),
    standardOnly: 'true'
  });
  if (kind === 'bonus') params.set('threePartBonuses', 'true');
  return API + (kind === 'bonus' ? '/random-bonus?' : '/random-tossup?') + params;
}

/**
 * A qbreader tossup as an arcade question: whole, or cut to the level's length.
 * @param {object} t - as qbreader.org returns it
 * @param {string} label
 * @param {string} level
 * @param {boolean} whole
 * @returns {?object} shaped like /kshsaa-round/generate's, for pickQuestions;
 *   null if it cannot be cut to stand alone
 */
export function fromTossup (t, label, level, whole) {
  if (label === 'Science/Health' && t.alternate_subcategory === 'Math') return null;
  const text = String(t.question_sanitized || '').replace(/\s+/g, ' ').trim();
  const question = whole ? text : questionForLevel(text, level);
  if (!question || !t.answer_sanitized) return null;
  return { id: 'qb-' + t._id, category: label, question, answer: t.answer_sanitized, source: t.set?.name || 'qbreader.org' };
}

/**
 * @typedef {object} Bonus
 * @property {string} id
 * @property {string} category
 * @property {string} leadin
 * @property {string[]} parts
 * @property {string[]} answers
 * @property {string} source
 */

/**
 * @param {object} b - as qbreader.org returns it
 * @param {string} label
 * @returns {?Bonus} null unless it has three parts, each with an answer
 */
export function fromBonus (b, label) {
  const parts = b.parts_sanitized || [];
  const answers = b.answers_sanitized || [];
  if (parts.length !== 3 || answers.length !== 3 || answers.some(a => !a)) return null;
  return { id: 'qb-' + b._id, category: label, leadin: b.leadin_sanitized || '', parts, answers, source: b.set?.name || '' };
}

/**
 * Gives each tossup without one a bonus, from its own category while there
 * are any, else whichever is left; a tossup gets none once they run out.
 * @param {object[]} tossups
 * @param {Bonus[]} bonuses
 * @returns {object[]}
 */
export function withBonuses (tossups, bonuses) {
  const left = bonuses.slice();
  return tossups.map(t => {
    if (t.bonus || !left.length) return t;
    const same = left.findIndex(b => b.category === t.category);
    const bonus = left.splice(same === -1 ? 0 : same, 1)[0];
    return bonus ? { ...t, bonus } : t;
  });
}

async function get (url) {
  const r = await fetch(url);
  // qbreader answers 404 when nothing matches
  if (r.status === 404) return {};
  if (!r.ok) throw new Error('it answered ' + r.status);
  return r.json();
}

/**
 * Questions for some categories, about `each` of each: tossups shaped for
 * pickQuestions, and for Quizbowl bonuses to hand the picked ones (withBonuses).
 * @param {object} options
 * @param {string[]} options.labels - categories fromQbreader() accepts
 * @param {string} options.level
 * @param {number} options.each
 * @param {boolean} options.whole - whole tossups, and bonuses, for Quizbowl
 * @returns {Promise<{tossups: object[], bonuses: Bonus[]}>}
 */
export async function fetchQbreader ({ labels, level, each, whole }) {
  const ask = whole ? each : each * CUT_SPARE;
  try {
    // the API allows 20 requests a second, and there are at most eight categories
    const tossups = (await Promise.all(labels.map(label => get(qbreaderUrl('tossup', label, level, ask))
      .then(d => (d.tossups || []).map(t => fromTossup(t, label, level, whole)).filter(Boolean).slice(0, each)))))
      .flat();
    if (!whole) return { tossups, bonuses: [] };
    const bonuses = (await Promise.all(labels.map(label => get(qbreaderUrl('bonus', label, level, each))
      .then(d => (d.bonuses || []).map(b => fromBonus(b, label)).filter(Boolean)))))
      .flat();
    return { tossups, bonuses };
  } catch (e) {
    throw new Error('Could not get questions from qbreader.org (' + e.message + '). Check that www.qbreader.org opens on this computer.');
  }
}
