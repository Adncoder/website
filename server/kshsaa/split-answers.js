// Repairs KSHSAA archive questions that the packet parser got wrong. The
// parser behind import-kshsaa.js's JSON missed two things in the packets:
//
// - Some packets print every question as "2 Question? Answer: answer", and
//   there it often ran several questions into one record, answers and all, so
//   the question text gives an earlier answer away and the answer line belongs
//   to the last question. Hundreds more have no answer at all, because it is
//   still at the end of the question text.
// - It kept the pages' headers and footers ("Round: Replacement 04",
//   "Round: 08 / Page: 15", "Page 27 of 68"), and the bare page number after
//   the answer that ends a page ("schizophrenia 3").
//
// splitRecord turns one record into the questions it really holds.
// tools/repair-kshsaa-questions.js runs it over the database, and
// import-kshsaa.js over every parsed question, so a re-import comes out clean.
// It imports nothing.

const ROUND_HEADER = /\s*\bRound:\s*(?:(?:Consolation|Championship|Champ|Semi-Final|Replacement)\b\s*)*(?:\d{1,2}\b)?(?:\s*\/\s*Page:\s*\d+)?/gi;
const PAGE_FOOTER = /\s*\bPage\s+\d+\s+of\s+\d+\b/gi;
// the converted quizbowl sets' own footer: "SCOP B Round 11 Page 4 of 4"
const SCOP_FOOTER = /\s*\bSCOP\s+[A-Z]\s+Round\s+\d+\s+Page\s+\d+(?:\s+of\s+\d+)?/gi;
const ANSWER_LABEL = /\s*\bAnswer\s*:\s*/i;
// where one question runs into the next, the next one's number in its
// category: "... Answer: France 3 Name both the branch ..."
const NEXT_NUMBER = /\s(\d{1,2})\.?\s+(?=["“‘'(]?[A-Z])/;
// a page number left after the answer that ends a page. Math and science
// answers can end in a number of their own, so they keep theirs (splitRecord)
const PAGE_NUMBER = /([A-Za-z)\]"'”’])\s+\d{1,2}$/;
// words a number after them belongs to: "Apollo 11", "Article I, Section 8"
const NUMBERED = /\b(?:apollo|area|route|interstate|highway|bowl|proposition|amendment|chapter|psalm|symphony|no|number|title|article|section|clause|catch|vitamin|carbon|uranium|cobalt)$/i;
// the heading of the next category, run onto the answer before it. Only
// after the end of a sentence, a bracket, a quote, or a number, so "Museum of
// Fine Arts" keeps its name
const HEADING = /([.)"”'\d])\s+(?:Year In Review|Language Arts|Science (?:&|and) Health|Social Science|Fine Arts|Mathematics|World Language|Foreign Language)$/i;

const tidy = s => String(s ?? '').replace(SCOP_FOOTER, ' ').replace(PAGE_FOOTER, ' ').replace(ROUND_HEADER, ' ')
  .replace(/\s+/g, ' ').trim();

function withoutPageNumber (answer) {
  const m = answer.match(PAGE_NUMBER);
  if (!m) return answer;
  const before = answer.slice(0, m.index + 1);
  return NUMBERED.test(before) ? answer : before.trim();
}

/**
 * A question with no answer label whose answer follows its last sentence:
 * "What was the first ghost to visit Macbeth? Banquo".
 * @param {string} text
 * @returns {?{question: string, answer: string}}
 */
function unlabeled (text) {
  const ends = [...text.matchAll(/[?.!]["”’']?\s+/g)];
  // a question mark ends the question if there is one, else the last sentence
  const at = ends.filter(m => m[0].charAt(0) === '?').pop() || ends.pop();
  if (!at || at.index < 30) return null;
  const answer = text.slice(at.index + at[0].length).trim();
  if (!answer || answer.length > 120) return null;
  return { question: text.slice(0, at.index + at[0].trimEnd().length).trim(), answer };
}

/**
 * One or more numbered questions with no answer label:
 * "Name the native Minnesotan ... Main Street. (Sinclair) Lewis 3 Who is
 * Edmond Dantes better known as? The Count of Monte Cristo".
 * @param {string} text
 * @returns {?{question: string, answer: string}[]} null unless every one splits
 */
function unlabeledRun (text) {
  const pieces = [];
  let rest = text;
  for (let next = rest.match(NEXT_NUMBER); next; next = rest.match(NEXT_NUMBER)) {
    pieces.push(rest.slice(0, next.index));
    rest = rest.slice(next.index + next[0].length);
  }
  const items = pieces.concat(rest).map(unlabeled);
  return items.every(Boolean) ? items : null;
}

/**
 * The questions an archive record holds, each with its own answer, and
 * without page headers, footers, or page numbers.
 * @param {{question?: string, answer?: string}} record
 * @param {object} [options]
 * @param {boolean} [options.numeric] - math or science, whose answer may end in a number
 * @returns {{question: string, answer: string}[]} one entry for a record
 *   that needed nothing but cleaning; an empty answer where none could be found
 */
export function splitRecord ({ question, answer }, { numeric = false } = {}) {
  const q = tidy(question);
  const a = tidy(answer);
  const parts = (a ? q + ' Answer: ' + a : q).split(ANSWER_LABEL);
  let items = [];
  let current = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const next = part.match(NEXT_NUMBER);
    if (i < parts.length - 1) {
      // another "Answer:" follows, so the next question starts here
      if (!next) return [{ question: q, answer: a }];
      items.push({ question: current, answer: part.slice(0, next.index) });
      current = part.slice(next.index + next[0].length);
      continue;
    }
    // the last answer, sometimes followed by more questions and their
    // answers with no "Answer:" between them
    const more = next && unlabeledRun(part.slice(next.index + next[0].length));
    if (more) {
      items.push({ question: current, answer: part.slice(0, next.index) }, ...more);
    } else {
      items.push({ question: current, answer: part });
    }
  }
  if (!items.length) {
    // a World Language question that kept its "Translation:" line
    const at = q.search(/\bTranslation:/);
    items = at > 0 ? [{ question: q.slice(0, at), answer: q.slice(at) }] : [{ question: q, answer: '' }];
  }
  // a question printed twice, the second time corrected
  const key = item => item.question.toLowerCase().slice(0, 40);
  items = items.filter((item, i) => !items.slice(i + 1).some(later => key(later) === key(item)));
  return items.map(item => {
    const answer = item.answer.trim().replace(HEADING, '$1');
    return { question: item.question.trim(), answer: numeric ? answer : withoutPageNumber(answer) };
  });
}
