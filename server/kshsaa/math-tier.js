// Sorts a math question into a rough course level from its wording and its
// time limit, so a round for freshmen does not hand them a derivative. KSHSAA
// gives a question 45 seconds or more when it takes several steps (a system of
// equations about coins, the diagonal of a box), which is never basic whatever
// the wording. Nothing is stored: the round builder runs this over the
// candidate questions each time, which keeps newly added questions classified
// without a migration.

/** Tiers in increasing difficulty. */
export const MATH_TIERS = ['basic', 'intermediate', 'advanced'];

// Algebra II, trigonometry, precalculus and calculus.
const ADVANCED = [
  /calculus/, /deriv/, /integra[lt]/, /\blimits?\b/, /\blim\b/,
  /logarithm/, /\blog\b/, /\bln\b/, /natural log/,
  /\bsine\b/, /\bsin\b/, /cosine/, /\bcos\b/, /\btan\b/, /tangent/, /secant/, /cotangent/,
  /trig/, /radian/, /unit circle/, /arc(sin|cos|tan)/,
  /asymptot/, /matri(x|ces)/, /determinant/, /vector/,
  /imaginary/, /complex number/, /\bpolar\b/, /parametric/,
  /\bseries\b/, /summation/, /sigma notation/,
  /conic/, /ellips/, /hyperbol/,
  /binomial theorem/, /exponential/, /inverse function/, /composit(e|ion) (of )?function/,
  /rational function/, /synthetic division/, /(remainder|factor) theorem/,
  /\be\s*\^/, /\bi\s*\^\s*\d/
];

// Algebra I and geometry.
const INTERMEDIATE = [
  /\bsolve\b/, /equation/, /\bslope\b/, /intercept/, /linear/, /quadratic/, /parabola/, /vertex/,
  /polynomial/, /binomial/, /trinomial/, /monomial/, /factor(ed)? the\b/, /factored form/, /factoring/,
  /system of/, /simultaneous/, /inequalit/, /absolute value/, /function/, /\b[fg]\s*\(/,
  /exponent/, /square root/, /cube root/, /radical/, /scientific notation/,
  /pythagore/, /hypotenuse/, /triangle/, /circle/, /radius/, /radii/, /diameter/, /circumference/, /\bpi\b/,
  /volume/, /surface area/, /\barea\b/, /perimeter/, /angle/, /polygon/, /(penta|hexa|hepta|octa|nona|deca)gon/,
  /prism/, /cylinder/, /\bcone\b/, /sphere/, /diagonal/, /\bpower\b/,
  /quadrilateral/, /parallelogram/, /trapezoid/, /rhombus/, /congruent/, /similar triangles/,
  /distance formula/, /midpoint/, /coordinate/,
  /probability/, /how many (different )?ways/, /permutation/, /combinations?\b/, /factorial/, /\bchoose\b/,
  /sequence/, /standard deviation/, /\bbase (two|eight|sixteen|\d+)\b/, /binary/, /variable/
];

// A lone letter next to an operator or a number reads as a variable ("3x",
// "y = 2", "x^2"). Multiplication written "3 x 4" is taken out first so it is
// not mistaken for one.
const VARIABLE = /\b\d+\s*[xyzn]\b|\b[xyzabn]\s*[=+^²³]|[=+^]\s*[xyzabn]\b/;

/**
 * @param {string} text - the question as stored
 * @param {?number} [seconds] - its time limit, if stored apart from the text;
 *   a "[45 sec]" at the start of the text counts too
 * @returns {'basic'|'intermediate'|'advanced'}
 */
export default function mathTierOf (text, seconds) {
  const t = String(text || '').toLowerCase().replace(/(\d)\s*x\s*(?=\d)/g, '$1 * ');
  if (ADVANCED.some(re => re.test(t))) { return 'advanced'; }
  if (INTERMEDIATE.some(re => re.test(t)) || VARIABLE.test(t)) { return 'intermediate'; }
  const limit = Number(seconds) || Number((t.match(/^\[(\d+)\s*sec\]/) || [])[1]) || 0;
  return limit >= 45 ? 'intermediate' : 'basic';
}

// numbers written out, as KSHSAA often reads them ("four to the ninth power");
// "one" is left out because it is as often just a word ("which one")
const NUMBER_WORDS = /\b(zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|half|halves|thirds?|quarters?)\b/i;
// working something out without numbers: simplifying, solving, counting
const WORKS_IT_OUT = /\b(simplify|evaluate|solve|compute|calculate|find|how many|how much|value of|factor|expand|express(ed)?|convert|round|estimate|determine|[fgh] of)\b/i;
const ROMAN = /\b[MDCLXVI]{3,}\b/;
// asking for a name, a term, or a definition, numbers or not ("What is the
// name of a polygon with 10 sides?")
const THEORY = [
  /\b(what|which)\s+(is|are)\s+(the\s+)?(name|term|word)s?\b/i,
  /\bwhat\s+(name|term|word)\b/i,
  /\bnames?\s+(given|for)\b/i,
  /\b(is|are)\s+(called|known as|named)\b/i,
  /\bstand for\b/i,
  /\bcomplete the analogy\b/i,
  /^(name|identify)\s+(the|this|a|an)\b/i,
  /\bwho\s+(was|is|proved|discovered|invented|developed)\b/i,
  /\bdefin(e|ition)\b/i
];

/**
 * Whether a math question asks for a computation rather than theory -- a
 * definition, a term, a theorem's name. KSHSAA math is mostly computation, so
 * rounds read theory at most about one math question in six.
 * @param {string} text - the question as stored
 * @returns {boolean}
 */
export function isComputation (text) {
  const t = String(text || '').replace(/^\[\d+\s*sec\]\s*/i, '');
  if (THEORY.some(re => re.test(t))) { return false; }
  return /\d/.test(t) || NUMBER_WORDS.test(t) || WORKS_IT_OUT.test(t) || ROMAN.test(t) || VARIABLE.test(t.toLowerCase());
}
