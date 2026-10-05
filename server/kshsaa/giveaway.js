// Turns a middle-school quizbowl tossup into a Beginner scholars bowl question
// by keeping only its giveaway -- the "For 10 points, name this..." sentence
// that quizbowl saves for last because it is the easiest clue -- and dropping
// the "For 10 points" itself, which scholars bowl does not use.
//
// Many giveaways lean on the clues before them ("For 10 points, name this
// American poet.") and are unanswerable alone, so those are rejected rather
// than kept: a Beginner round is only useful if every question can be answered.

// the quizbowl point-value phrase, wherever it sits in the sentence
const FOR_POINTS = /\s*,?\s*\b(?:for\s+(?:10|ten|15|fifteen|20|twenty)\s+points|ftp)\b(?:\s+each)?\s*[,:;.—–-]*\s*/i;
const FOR_POINTS_ALL = new RegExp(FOR_POINTS.source, 'gi');

// a sentence ends at . ? or ! (plus any closing quote or bracket) followed by
// whitespace and something that can start a sentence
const SENTENCE_END = /[.?!]["'”’)\]]*\s+(?=["'“‘(]?[A-Z0-9])/g;

// a period after one of these is not the end of a sentence ("U.S. President",
// "J. K. Rowling", "St. Louis")
const ABBREVIATION = /(\b[A-Z]|\b(Mr|Mrs|Ms|Dr|St|Mt|Ft|Jr|Sr|vs|etc|No|Gen|Lt|Col|Capt|Gov|Sen|Rep|Pres|Rev))$/;

// words that attach a clue to the thing being asked for; without one, a giveaway
// like "Name this element." has nothing left to answer from
const CLUE_LINK = /\b(of|who|whom|whose|which|that|in|on|at|from|by|with|for|to|as|where|when|about|during|after|before|between|called|known|named|nicknamed|wrote|written|painted|composed|discovered|invented|founded|led|won|used|found|made|created|built|signed|fought|developed|described|consisting|containing|including|located)\b/i;

// phrases that only make sense after the earlier clues
const BACK_REFERENCE = /\b(these clues|this clue|above|aforementioned|previously|mentioned|this passage|this excerpt|these lines|this line|this quot(e|ation)|the quot(e|ation)|note to (the )?moderator|description acceptable|each of these|both of these|all of these)\b/i;

// in a math question any of these points back at a setup sentence that is gone
const MATH_BACK_REFERENCE = /\b(it|its|this|that|these|those|they|their|them|he|she|his|her|him)\b/i;

/**
 * @param {string} text - the tossup's question_sanitized
 * @param {boolean} isMath - math giveaways need to stand alone as a computation
 * @returns {?string} the giveaway as a standalone question, or null if it
 * cannot stand alone
 */
export function giveawayOf (text, isMath) {
  const clean = String(text || '')
    .replace(/\((\*|\+)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // where the last "for 10 points" itself begins, past any comma before it
  let at = -1;
  for (const m of clean.matchAll(FOR_POINTS_ALL)) { at = m.index + m[0].search(/[^\s,]/); }
  if (at === -1) { return null; }

  // back up to the start of the sentence the phrase sits in, so "This poet,
  // for 10 points, wrote 'The Raven.'" keeps its subject
  let start = 0;
  for (const m of clean.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end > at) { break; }
    if (!ABBREVIATION.test(clean.slice(0, m.index))) { start = end; }
  }

  let q = clean.slice(start)
    .replace(FOR_POINTS, ' ')
    .replace(/\s+([.,?!;:])/g, '$1')
    .replace(/^[\s,;:.—–-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) { return null; }
  q = q.charAt(0).toUpperCase() + q.slice(1);
  if (!/[.?!]["'”’)\]]*$/.test(q)) { q += '.'; }

  const words = q.split(' ').length;
  if (words < 5 || words > 70) { return null; }
  if (BACK_REFERENCE.test(q)) { return null; }

  if (isMath) {
    if (!/\d/.test(q) || MATH_BACK_REFERENCE.test(q)) { return null; }
    return q;
  }

  // "Name this element." asks without telling: what follows the directive has
  // to carry a clue of its own. A statement ("This president issued the
  // Emancipation Proclamation.") is its own clue.
  const directive = /^(name|identify|give|what is|what are|who is|who was|what was)\s+(this|these|the)\s+/i;
  if (directive.test(q) && !CLUE_LINK.test(q.replace(directive, ''))) { return null; }
  return q;
}

/**
 * Where a qbreader tossup goes in a KSHSAA round, and the category fields it
 * is stored with so the round builder's filters pick it up.
 * @param {{category: string, subcategory: string, alternate_subcategory?: string}} tossup
 * @returns {?{label: string, category: string, subcategory: string, alternate_subcategory: ?string}}
 * null for categories a scholars bowl round has no slot for. Current events are
 * skipped too: "current" events in these older sets are years out of date, so
 * Year in Review falls through to the other pools.
 * Used by the Beginner and JV imports.
 */
export function giveawaySlotOf ({ category, subcategory, alternate_subcategory: alt }) {
  switch (category) {
    case 'Literature':
      return { label: 'Language Arts', category, subcategory, alternate_subcategory: alt ?? null };
    case 'Mythology':
      return { label: 'Language Arts', category: 'Literature', subcategory: 'Other Literature', alternate_subcategory: null };
    case 'Science':
      return alt === 'Math'
        ? { label: 'Mathematics', category, subcategory: 'Other Science', alternate_subcategory: 'Math' }
        : { label: 'Science/Health', category, subcategory, alternate_subcategory: alt ?? null };
    case 'History':
    case 'Geography':
    case 'Social Science':
    case 'Religion':
    case 'Philosophy':
      return { label: 'Social Studies', category: 'Social Science', subcategory: 'Social Science', alternate_subcategory: null };
    case 'Fine Arts':
      return { label: 'Fine Arts', category, subcategory, alternate_subcategory: alt ?? null };
    default:
      return null;
  }
}
