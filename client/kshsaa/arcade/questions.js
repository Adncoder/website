// Where the arcade's questions come from: the round builder's practice sets
// (/kshsaa-round/generate with a drill per category). They pick by level and
// math tier, least-read first, and unlike rounds they do not count questions
// as read, so a Friday game never uses up what a real round would draw.

/** The most of one category the practice-set builder hands out at once. */
const MOST_PER_CATEGORY = 40;
/** What counts as short enough for Lightning Round. */
const SHORT_WORDS = 30;
const DEFAULT_SECONDS = 10;

/**
 * The time limit a question carries in its "[30 sec]" marker, else 10 seconds.
 * @param {string} text
 * @returns {number}
 */
export function secondsFor (text) {
  const marker = /^\s*\[(\d+)\s*sec\]/i.exec(String(text || ''));
  return marker ? Number(marker[1]) : DEFAULT_SECONDS;
}

/**
 * How many of each category to ask for. Lightning Round asks for twice what
 * it needs, so there are short ones to choose from.
 * @param {number} wanted - questions needed in all
 * @param {number} categories - how many categories they come from
 * @param {boolean} short
 * @returns {number}
 */
export function perCategory (wanted, categories, short) {
  const each = Math.ceil((short ? wanted * 2 : wanted) / Math.max(1, categories));
  return Math.min(MOST_PER_CATEGORY, Math.max(5, each));
}

/**
 * @param {{level: string, math: string, categories: string[], count: number}} options
 * @returns {string}
 */
export function questionsUrl ({ level, math, categories, count }) {
  const params = new URLSearchParams({ level, math, count: String(count) });
  for (const category of categories) params.append('drill', category);
  return '/kshsaa-round/generate?' + params;
}

function shuffle (list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const wordCount = text => String(text).split(' ').filter(Boolean).length;

/**
 * Turns a practice set (grouped by category) into a game's questions: shuffled,
 * nothing the game already has, and for Lightning Round quick ones first -
 * untimed, not World Language (which is held up rather than read), and at
 * most SHORT_WORDS words - then the rest by how fast they go: longer read-aloud
 * questions, and timed math and World Language only once those run out.
 * @param {object[]} round - questions as /kshsaa-round/generate returns them
 * @param {object} options
 * @param {number} options.wanted
 * @param {boolean} [options.short]
 * @param {string[]} [options.exclude] - ids the game already has
 * @param {() => number} [options.random]
 * @returns {import('./engine.js').Question[]}
 */
export function pickQuestions (round, { wanted, short = false, exclude = [], random = Math.random }) {
  const seen = new Set(exclude);
  const fresh = round.filter(q => !seen.has(q.id) && seen.add(q.id));
  let pool = shuffle(fresh, random);
  if (short) {
    const slow = q => secondsFor(q.question) > DEFAULT_SECONDS || q.category === 'World Language';
    const quick = q => !slow(q) && wordCount(q.question) <= SHORT_WORDS;
    const rest = pool.filter(q => !quick(q))
      .sort((a, b) => slow(a) - slow(b) || a.question.length - b.question.length);
    pool = shuffle(pool.filter(quick).concat(rest).slice(0, wanted), random);
  }
  return pool.slice(0, wanted).map(q => ({
    id: String(q.id),
    category: q.category,
    question: q.question,
    answer: q.answer,
    source: q.source || '',
    ...(q.tier ? { tier: q.tier } : {})
  }));
}
