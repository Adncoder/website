// The shape of a KSHSAA round and the levels the site reads at: plain data with
// no database behind it, so the stats code that needs it can be tested.
// routes/kshsaa-round.js adds the question filter for each category and
// re-exports all of this.

/** [label, count]: the official KSHSAA round, 16 questions in reading order. */
export const ROUND_SHAPE = [
  ['World Language', 1],
  ['Language Arts', 3],
  ['Science/Health', 3],
  ['Social Studies', 3],
  ['Mathematics', 3],
  ['Fine Arts', 2],
  ['Year in Review', 1]
];

/** Category label of every slot in a full round, in reading order. */
export const CATEGORY_BY_QUESTION = ROUND_SHAPE.flatMap(([label, count]) => Array(count).fill(label));
/** Category labels in reading order, deduplicated. */
export const CATEGORIES = ROUND_SHAPE.map(([label]) => label);

// Question pools for each level, most preferred first. What rises is how hard
// the clues are and how many of them there are: the giveaway lines of middle
// school quizbowl (Beginner), the last two sentences of easy high school
// quizbowl (JV), and the last two to four of regular high school quizbowl,
// with converted quizbowl and then the real KSHSAA archive -- past state and
// regional rounds -- behind them (Varsity). A later pool is used only once
// the earlier ones have nothing unread left in a category: the giveaway and
// converted sets have no World Language and next to no math, so those slots
// come from the KSHSAA archive at every level. The current-events import
// (import-current-events.js) holds nothing but recent Year in Review
// questions, so every level reads it first. Approved question bank questions
// (mostly computed math) sit alongside the archive at every level.
//
// Math and World Language are also sorted into tiers (math-tier.js,
// language-tier.js), and each level reads only its own: `math` and `language`
// below. The reader's math menu can override `math`. Year in Review questions
// written for the question bank carry the level they were written for
// (`kshsaa_level`), and each level reads its own plus the ones written for
// none, which is every imported one.
export const LEVELS = {
  varsity: {
    label: 'Varsity',
    pools: [['varsity', 'converted', 'current'], ['kshsaa', 'generated']],
    math: ['basic', 'intermediate', 'advanced'],
    language: ['intermediate', 'advanced']
  },
  jv: {
    label: 'JV',
    pools: [['jv', 'current'], ['kshsaa', 'generated'], ['converted']],
    math: ['basic', 'intermediate'],
    language: ['basic', 'intermediate']
  },
  beginner: {
    label: 'Beginner',
    pools: [['beginner', 'current'], ['jv'], ['kshsaa', 'generated'], ['converted']],
    math: ['basic'],
    language: ['basic']
  }
};
