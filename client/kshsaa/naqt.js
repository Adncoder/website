// A NAQT-format round for the reader: 24 tossups and 24 three-part bonuses in
// the proportions of NAQT's high school distribution, plus two tossups to
// break a tie. Like the arcade's Quizbowl mode (arcade/qbreader.js) it comes
// at random from qbreader.org's public API in the browser, from standard sets
// at the level's difficulty. Nothing is stored in this site's database, so a
// NAQT round is never counted as read and never saved to stats. The reader
// imports it in the browser and `npm test` runs it in Node, so it imports
// nothing but same-answer.js, which imports nothing either.

import { answerSet } from './same-answer.js';

const API = 'https://www.qbreader.org/api';

// qbreader's difficulty for each level, as the arcade and the giveaway imports use them
const DIFFICULTY = { beginner: 1, jv: 2, varsity: 3 };

/** Tossups a NAQT packet reads, and the extra ones that break a tie. */
export const PACKET_LENGTH = 24;
export const TIEBREAKERS = 2;

/**
 * NAQT's high school distribution (https://naqt.com/hs/distribution.jsp):
 * tossups `t` and bonuses `b` per packet on average, each group split into
 * what qbreader can ask for. A group is named for qbreader's category, so a
 * question that fills a short slot (topUp) still knows its group. `recent` is
 * how many years back a part reaches, for subjects that go stale, and `keep`
 * drops what the query cannot rule out: qbreader matches any alternate
 * subcategory to questions that have none, so asking for Math also brings
 * other science.
 */
export const DISTRIBUTION = [
  {
    group: 'Literature',
    t: 3.9,
    b: 3.8,
    parts: [
      { t: 1.3, b: 1.2, query: { subcategories: 'American Literature' } },
      { t: 1.2, b: 1.2, query: { subcategories: 'British Literature' } },
      { t: 1.4, b: 1.4, query: { subcategories: 'European Literature,World Literature,Classical Literature,Other Literature' } }
    ]
  },
  {
    group: 'Science',
    t: 5.5,
    b: 5.3,
    parts: [
      { t: 1.0, b: 0.9, query: { subcategories: 'Biology' } },
      { t: 0.8, b: 0.8, query: { subcategories: 'Chemistry' } },
      { t: 1.0, b: 0.9, query: { subcategories: 'Physics' } },
      { t: 1.0, b: 1.0, query: { subcategories: 'Other Science' }, keep: q => q.alternate_subcategory !== 'Math' },
      { t: 1.7, b: 1.7, query: { subcategories: 'Other Science', alternateSubcategories: 'Math' }, keep: q => q.alternate_subcategory === 'Math' }
    ]
  },
  {
    group: 'Fine Arts',
    t: 2.0,
    b: 2.0,
    parts: [
      { t: 0.9, b: 0.9, query: { subcategories: 'Visual Fine Arts' } },
      { t: 1.1, b: 1.1, query: { subcategories: 'Auditory Fine Arts,Other Fine Arts' } }
    ]
  },
  {
    group: 'History',
    t: 4.6,
    b: 4.5,
    parts: [
      { t: 1.8, b: 1.8, query: { subcategories: 'American History' } },
      { t: 1.0, b: 0.9, query: { subcategories: 'European History' } },
      { t: 1.5, b: 1.5, query: { subcategories: 'World History,Other History' } },
      { t: 0.3, b: 0.3, query: { subcategories: 'Ancient History' } }
    ]
  },
  { group: 'Geography', t: 1.9, b: 1.9, parts: [{ t: 1, b: 1, query: { categories: 'Geography' } }] },
  { group: 'Mythology', t: 0.6, b: 0.7, parts: [{ t: 1, b: 1, query: { categories: 'Mythology' } }] },
  {
    group: 'Pop Culture',
    t: 1.7,
    b: 1.6,
    parts: [
      { t: 0.4, b: 0.4, recent: 8, query: { subcategories: 'Sports' } },
      { t: 1.3, b: 1.2, recent: 8, query: { subcategories: 'Movies,Music,Television,Video Games,Other Pop Culture' } }
    ]
  },
  { group: 'Social Science', t: 0.6, b: 0.6, parts: [{ t: 1, b: 1, query: { categories: 'Social Science' } }] },
  { group: 'Philosophy', t: 0.3, b: 0.3, parts: [{ t: 1, b: 1, query: { categories: 'Philosophy' } }] },
  { group: 'Religion', t: 0.4, b: 0.4, parts: [{ t: 1, b: 1, query: { categories: 'Religion' } }] },
  { group: 'Current Events', t: 1.5, b: 1.4, parts: [{ t: 1, b: 1, recent: 1, query: { categories: 'Current Events' } }] },
  { group: 'Other Academic', t: 1.0, b: 1.5, parts: [{ t: 1, b: 1, query: { categories: 'Other Academic' } }] }
];

/**
 * Splits a whole number in proportion to some weights, rounding each share up
 * or down the way NAQT rounds its averages: every share is the floor or the
 * ceiling of its exact value, and a bigger fraction is likelier to round up.
 * @param {number} total
 * @param {number[]} weights
 * @param {function(): number} [random]
 * @returns {number[]} adds up to total
 */
export function apportion (total, weights, random = Math.random) {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const exact = weights.map(w => total * w / sum);
  const counts = exact.map(Math.floor);
  const left = total - counts.reduce((a, c) => a + c, 0);
  // a weighted draw without replacement, the fraction as the weight
  exact
    .map((x, i) => ({ i, key: x > counts[i] ? random() ** (1 / (x - counts[i])) : -1 }))
    .sort((a, b) => b.key - a.key)
    .slice(0, left)
    .forEach(({ i }) => counts[i]++);
  return counts;
}

/** Every part of the distribution with its group, in order. */
export const PARTS = DISTRIBUTION.flatMap(g => g.parts.map(p => ({ ...p, group: g.group })));

/**
 * How many questions each part gets: groups first, then each group's parts.
 * @param {number} total
 * @param {'t'|'b'} kind - tossups or bonuses
 * @param {function(): number} [random]
 * @returns {number[]} one count per entry of PARTS
 */
export function partCounts (total, kind, random = Math.random) {
  const byGroup = apportion(total, DISTRIBUTION.map(g => g[kind]), random);
  return DISTRIBUTION.flatMap((g, i) => apportion(byGroup[i], g.parts.map(p => p[kind]), random));
}

/**
 * Where to ask for some random tossups or bonuses.
 * @param {'tossup'|'bonus'} kind
 * @param {?object} part - an entry of PARTS, or null for any category
 * @param {string} level
 * @param {number} number
 * @param {number} [year] - this year
 * @returns {string}
 */
export function naqtUrl (kind, part, level, number, year = new Date().getFullYear()) {
  const params = new URLSearchParams({
    ...(part ? part.query : {}),
    difficulties: String(DIFFICULTY[level] || DIFFICULTY.varsity),
    number: String(number),
    minYear: String(part && part.recent ? year - part.recent : 2010),
    standardOnly: 'true'
  });
  if (kind === 'bonus') params.set('threePartBonuses', 'true');
  return API + (kind === 'bonus' ? '/random-bonus?' : '/random-tossup?') + params;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * qbreader's formatted text as MODAQ reads it. MODAQ knows only <b>, <u>,
 * <em>, <sub>, <sup>, and <req>, and prints any other tag as text, so <i>
 * becomes <em>, <strong> becomes <b>, and the rest go.
 * @param {string} html
 * @returns {string}
 */
export function modaqText (html) {
  return String(html || '')
    .replace(/<(\/?)i>/gi, '<$1em>')
    .replace(/<(\/?)strong>/gi, '<$1b>')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<(?!\/?(?:b|u|em|sub|sup|req)>)[^>]*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e.charAt(0) !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// what the moderator sees beside the answer: the subcategory, or what is
// inside a catch-all one ("Astronomy" rather than "Other Science")
function labelOf (q) {
  if (q.alternate_subcategory === 'Math') return 'Math';
  if (q.alternate_subcategory && /^Other /.test(q.subcategory || '')) return q.alternate_subcategory;
  return q.subcategory || q.category || '';
}

/**
 * @typedef {object} NaqtTossup
 * @property {string} id
 * @property {string} group - its DISTRIBUTION group
 * @property {string} category - shown beside the answer and on the scoreboard
 * @property {string} question - formatted for MODAQ, the power mark included
 * @property {string} answer - formatted for MODAQ
 * @property {string} display - plain text, for holding it up
 * @property {string} source - the set
 * @property {string[]} answerLines - its answer as plain text, for keeping
 *   the same answer out of a round twice
 * @property {?number} part - its entry in PARTS, or null for one filling in
 *   from any category (set once it is in a round)
 */

/**
 * @param {object} t - as qbreader.org returns it
 * @returns {?NaqtTossup} null without a question or an answer
 */
export function fromTossup (t) {
  const question = modaqText(t.question);
  const answer = modaqText(t.answer);
  if (!question || !answer) return null;
  return {
    id: 'qb-' + t._id,
    group: t.category,
    category: labelOf(t),
    question,
    answer,
    display: String(t.question_sanitized || '').replace(/\s+/g, ' ').trim(),
    source: t.set?.name || '',
    answerLines: [t.answer_sanitized || answer],
    part: null
  };
}

/**
 * A bonus in MODAQ's packet format: parts, answers, and values side by side.
 * @typedef {object} NaqtBonus
 * @property {string} id
 * @property {string} group
 * @property {string} metadata - its category, as MODAQ names the field
 * @property {string} leadin
 * @property {string[]} parts
 * @property {string[]} answers
 * @property {number[]} values
 * @property {string[]} answerLines - one per part, as plain text
 * @property {?number} part - as for a tossup
 */

/**
 * @param {object} b - as qbreader.org returns it
 * @returns {?NaqtBonus} null unless it has three parts, each with an answer
 */
export function fromBonus (b) {
  const parts = b.parts || [];
  const answers = b.answers || [];
  if (parts.length !== 3 || answers.length !== 3 || answers.some(a => !modaqText(a))) return null;
  return {
    id: 'qb-' + b._id,
    group: b.category,
    metadata: labelOf(b),
    leadin: modaqText(b.leadin),
    parts: parts.map(modaqText),
    answers: answers.map(modaqText),
    values: [10, 10, 10],
    answerLines: b.answers_sanitized || answers,
    part: null
  };
}

/**
 * Puts questions in an order where no two in a row share a group whenever
 * that can be done: each pick comes from the group with the most left,
 * other than the last one's.
 * @template {{group: string}} T
 * @param {T[]} items
 * @param {function(): number} [random]
 * @returns {T[]}
 */
export function spread (items, random = Math.random) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  // shuffle within each group, and break ties between groups at random
  for (const list of groups.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  const tie = new Map([...groups.keys()].map(g => [g, random()]));
  const out = [];
  let last = null;
  while (out.length < items.length) {
    const open = [...groups.entries()].filter(([g, list]) => list.length && g !== last);
    const from = open.length ? open : [...groups.entries()].filter(([, list]) => list.length);
    from.sort((a, b) => b[1].length - a[1].length || tie.get(a[0]) - tie.get(b[0]));
    last = from[0][0];
    out.push(from[0][1].pop());
  }
  return out;
}

// qbreader.org allows 20 requests a second; ten at a time, a second apart
const BATCH = 10;
const BATCH_MS = 1000;

async function inBatches (tasks, wait) {
  const results = [];
  for (let i = 0; i < tasks.length; i += BATCH) {
    const started = Date.now();
    results.push(...await Promise.all(tasks.slice(i, i + BATCH).map(task => task())));
    if (i + BATCH < tasks.length) await wait(Math.max(0, BATCH_MS - (Date.now() - started)));
  }
  return results;
}

async function getJson (url) {
  const r = await fetch(url);
  // qbreader answers 404 when nothing matches
  if (r.status === 404) return {};
  if (!r.ok) throw new Error('it answered ' + r.status);
  return r.json();
}

// how many to ask for when n are wanted: duplicates and what keep drops leave
// fewer than asked for
const ask = (part, n) => n * (part && part.keep ? 4 : 2) + 2;

/**
 * A NAQT round: questions per part of the distribution, any category filling
 * in where a part comes back short, then ordered so subjects alternate.
 * @param {object} options
 * @param {string} options.level - beginner, jv, or varsity
 * @param {function(string): Promise<object>} [options.get] - fetches JSON
 * @param {function(number): Promise<void>} [options.wait]
 * @param {function(): number} [options.random]
 * @param {number} [options.year]
 * @returns {Promise<{round: NaqtTossup[], bonuses: NaqtBonus[], notes: string[]}>}
 *   PACKET_LENGTH tossups then the tiebreakers, and PACKET_LENGTH bonuses,
 *   fewer only if qbreader.org runs out altogether
 */
export async function naqtRound ({
  level,
  get = getJson,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random,
  year = new Date().getFullYear()
}) {
  const regular = partCounts(PACKET_LENGTH, 't', random);
  const extra = partCounts(TIEBREAKERS, 't', random);
  const bonusCounts = partCounts(PACKET_LENGTH, 'b', random);
  // no answer twice in the round, tossups and bonus parts alike
  const answers = answerSet();
  const take = (list, n, part = null) => {
    const out = [];
    for (const q of list) {
      if (out.length >= n) break;
      if (!q || q.answerLines.some(answers.has)) continue;
      q.answerLines.forEach(answers.add);
      out.push({ ...q, part });
    }
    return out;
  };
  const pull = (kind, part, n) => () => get(naqtUrl(kind, part, level, ask(part, n), year))
    .then(d => (kind === 'bonus' ? d.bonuses : d.tossups) || [])
    .then(list => list.filter(q => !part || !part.keep || part.keep(q)).map(kind === 'bonus' ? fromBonus : fromTossup));

  // one request per part that gets anything, tossups then bonuses
  const jobs = [
    ...PARTS.map((part, i) => ({ kind: 'tossup', i, n: regular[i] + extra[i] })),
    ...PARTS.map((part, i) => ({ kind: 'bonus', i, n: bonusCounts[i] }))
  ].filter(job => job.n);
  const fetched = { tossup: [], bonus: [] };
  try {
    const results = await inBatches(jobs.map(job => pull(job.kind, PARTS[job.i], job.n)), wait);
    jobs.forEach((job, k) => { fetched[job.kind][job.i] = results[k]; });
  } catch (e) {
    throw new Error('Could not get questions from qbreader.org (' + e.message + '). Check that www.qbreader.org opens on this computer.');
  }

  const tossups = [];
  const tiebreakers = [];
  const bonuses = [];
  const short = new Set();
  PARTS.forEach((part, i) => {
    const got = take(fetched.tossup[i] || [], regular[i] + extra[i], i);
    tossups.push(...got.slice(0, regular[i]));
    tiebreakers.push(...got.slice(regular[i]));
    const gotBonuses = take(fetched.bonus[i] || [], bonusCounts[i], i);
    bonuses.push(...gotBonuses);
    if (got.length < regular[i] + extra[i] || gotBonuses.length < bonusCounts[i]) short.add(part.group);
  });

  // whatever came back short, from any category
  const notes = [];
  const missing = PACKET_LENGTH - tossups.length;
  const missingTb = TIEBREAKERS - tiebreakers.length;
  const missingBonuses = PACKET_LENGTH - bonuses.length;
  if (missing + missingTb + missingBonuses > 0) {
    const [anyTossups, anyBonuses] = await Promise.all([
      missing + missingTb > 0 ? pull('tossup', null, missing + missingTb)() : [],
      missingBonuses > 0 ? pull('bonus', null, missingBonuses)() : []
    ]).catch(() => [[], []]);
    const more = take(anyTossups, missing + missingTb);
    tossups.push(...more.slice(0, missing));
    tiebreakers.push(...more.slice(missing));
    bonuses.push(...take(anyBonuses, missingBonuses));
    notes.push('qbreader.org had too few ' + [...short].join(', ') + ' questions at this level, so other subjects fill in.');
  }
  if (tossups.length < PACKET_LENGTH) notes.push('This round is ' + tossups.length + ' tossups, not ' + PACKET_LENGTH + '.');
  if (bonuses.length < PACKET_LENGTH) notes.push('This round has ' + bonuses.length + ' bonuses, not ' + PACKET_LENGTH + '.');
  if (!tossups.length) throw new Error('qbreader.org sent no questions for this level.');
  return { round: spread(tossups, random).concat(tiebreakers), bonuses: spread(bonuses, random), notes };
}

/**
 * A tossup to read in place of one thrown out: from the same part of the
 * distribution (any category, for one that filled in), and sharing no answer
 * with anything the round has had.
 * @param {object} options
 * @param {string} options.level - beginner, jv, or varsity
 * @param {NaqtTossup} options.tossup - the one thrown out
 * @param {string[]} options.answerLines - every answer the round has had:
 *   tossups, bonus parts, and thrown-out questions alike
 * @param {function(string): Promise<object>} [options.get] - fetches JSON
 * @param {number} [options.year]
 * @returns {Promise<NaqtTossup>}
 */
export async function naqtReplacement ({ level, tossup, answerLines, get = getJson, year = new Date().getFullYear() }) {
  const part = PARTS[tossup.part] || null;
  const answers = answerSet();
  answerLines.forEach(answers.add);
  let found;
  try {
    const d = await get(naqtUrl('tossup', part, level, ask(part, 4), year));
    found = (d.tossups || [])
      .filter(q => !part || !part.keep || part.keep(q))
      .map(fromTossup)
      .find(q => q && q.id !== tossup.id && !q.answerLines.some(answers.has));
  } catch (e) {
    throw new Error('Could not get a question from qbreader.org (' + e.message + ').');
  }
  if (!found) throw new Error('qbreader.org sent no ' + tossup.category + ' tossup with a new answer. Try again.');
  return { ...found, part: tossup.part ?? null };
}
