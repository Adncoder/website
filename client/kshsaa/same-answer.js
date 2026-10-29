// Tells when two questions ask for the same thing, so a round never has the
// same answer twice. The same answer is written many ways across the sources
// -- "William Faulkner", "(William) Faulkner", "William Cuthbert Faulkner",
// "Faulkner" -- so two answer lines count as one when every word of one is
// among the other's. That also counts "Kansas" and "Kansas City" as one,
// which costs nothing: the pools are deep, and the next pick is as good.
//
// Round building (routes/kshsaa-round.js) runs this in Node and NAQT rounds
// (naqt.js) in the browser, so it imports nothing.

// words that never tell two answers apart, English and the articles of the
// languages titles come in
const FILLER = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'by', 'from', 'with',
  'le', 'la', 'les', 'el', 'los', 'las', 'il', 'lo', 'de', 'du', 'des', 'del', 'di', 'der', 'die', 'das'
]);

// Parentheses that open with one of these hold other ways to say the answer
// or a note to the moderator, so the answer ends there. Any others are part
// of it: "(William) Faulkner", "Chromatic (scale)", a World Language
// sentence's "(The) Flowers grow (bloom)".
const ALTERNATIVES = /^\s*(?:accept|or|prompt|anti-?prompt|do not|don't|also|note|read|reject|pronounced|be generous)\b/i;

/**
 * The answer itself, from an answer line: up to anything in square brackets,
 * which are always alternatives or instructions, or parentheses like the
 * ones above, and without a World Language "Translation:" label.
 * @param {string} line
 * @returns {string}
 */
function answerOnly (line) {
  const text = String(line || '').replace(/<[^>]*>/g, '').replace(/^\s*(?:translation|answer)\s*:/i, '');
  const bracket = text.indexOf('[');
  const answer = bracket === -1 ? text : text.slice(0, bracket);
  for (let open = answer.indexOf('('); open !== -1; open = answer.indexOf('(', open + 1)) {
    const close = answer.indexOf(')', open);
    if (close === -1 || ALTERNATIVES.test(answer.slice(open + 1, close))) return answer.slice(0, open);
  }
  return answer;
}

/**
 * The words of an answer line's answer, without case, accents, possessives,
 * or filler words. Fractions and decimals stay whole, so 1/3 is not 3.
 * @param {string} answer - an answer line, sanitized or not
 * @returns {Set<string>}
 */
export function answerWords (answer) {
  const words = answerOnly(answer)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .match(/\d+(?:[./,]\d+)+|[a-z0-9]+/g) || [];
  return new Set(words.filter(w => !FILLER.has(w)));
}

// every word of the shorter is in the longer; an answer with no words to
// compare (a blank, or only punctuation) matches nothing
function within (a, b) {
  if (!a.size || !b.size) return false;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const word of small) {
    if (!big.has(word)) return false;
  }
  return true;
}

/**
 * Whether two answer lines name the same thing.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameAnswer (a, b) {
  return within(answerWords(a), answerWords(b));
}

/**
 * The answers a round has so far: has() tells whether an answer line repeats
 * any of them, and add() puts one in.
 * @returns {{has: function(string): boolean, add: function(string): void}}
 */
export function answerSet () {
  const seen = [];
  return {
    has: answer => {
      const words = answerWords(answer);
      return seen.some(other => within(words, other));
    },
    add: answer => {
      const words = answerWords(answer);
      if (words.size) seen.push(words);
    }
  };
}
