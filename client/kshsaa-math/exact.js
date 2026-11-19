// Exact answers, in the forms KSHSAA math answers come in: whole numbers,
// fractions, radicals, and multiples of pi ("9 radical 3", "24 pi", "negative
// two-ninths"). A value is (n / d) * sqrt(rad) * pi^pi, kept in lowest terms
// with every square taken out of the radical, so two ways of writing one
// number compare equal: 6/8 and 0.75, radical 12 and 2 radical 3.
//
// The page reads what a player types with parse() and marks it with check().
// npm test runs this in Node, so it imports nothing.

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

/**
 * @typedef {{n: number, d: number, rad: number, pi: number}} Exact
 * @typedef {Exact | {list: Exact[], ordered: boolean} | {text: string, accept?: string[]}} Answer
 */

/**
 * @param {number} n - numerator
 * @param {number} [d] - denominator
 * @param {number} [rad] - what is under the radical
 * @param {number} [pi] - the power of pi: -1, 0 or 1
 * @returns {Exact}
 */
export function exact (n, d = 1, rad = 1, pi = 0) {
  if (![n, d, rad].every(Number.isSafeInteger) || d === 0 || rad < 0 || ![-1, 0, 1].includes(pi)) {
    throw new Error('not an exact value: ' + [n, d, rad, pi].join(' '));
  }
  if (n === 0 || rad === 0) return { n: 0, d: 1, rad: 1, pi: 0 };
  if (d < 0) { n = -n; d = -d; }
  for (let f = 2; f * f <= rad; f++) {
    while (rad % (f * f) === 0) { rad /= f * f; n *= f; }
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g, rad, pi };
}

export const int = n => exact(n);
export const frac = (n, d) => exact(n, d);
/** (n / d) radical rad */
export const root = (rad, n = 1, d = 1) => exact(n, d, rad);
/** (n / d) pi */
export const pi = (n = 1, d = 1) => exact(n, d, 1, 1);
export const times = (a, b) => exact(a.n * b.n, a.d * b.d, a.rad * b.rad, a.pi + b.pi);
// 1 / sqrt(r) is sqrt(r) / r, so the radical multiplies and r joins the denominator
export const over = (a, b) => exact(a.n * b.d, a.d * b.n * b.rad, a.rad * b.rad, a.pi - b.pi);
export const toNumber = v => (v.n / v.d) * Math.sqrt(v.rad) * Math.PI ** v.pi;
export const same = (a, b) => a.n === b.n && a.d === b.d && a.rad === b.rad && a.pi === b.pi;

// units a player might type after the number
const UNITS = /\b(degrees?|deg|radians?|units?|squared?|sq|cubic|cu|cm|mm|km|meters?|inch(es)?|in|ft|feet|foot|yd|yards?|miles?|mi|mph|hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec|ways|sides|edges|faces|vertices|diagonals|dollars?|cents?|percent|pounds?|lbs?)\b\.?/g;

function tokenize (text) {
  const s = text
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√/g, ' sqrt ')
    .replace(/π/g, ' pi ')
    // before the units, which would take the "square" out of "square root"
    .replace(/\b(square root of|square root|radical|root|rad|sqrt)\b/g, ' sqrt ')
    .replace(UNITS, ' ')
    .replace(/\b(negative|minus)\b/g, '-')
    .replace(/\b(over|divided by)\b/g, '/')
    .replace(/\btimes\b/g, '*')
    .replace(/[$%°]/g, ' ')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
  const out = [];
  const token = /(\d+\.\d+|\.\d+|\d+|sqrt|pi|[-+*/()])/y;
  for (let i = 0; i < s.length;) {
    if (/\s/.test(s[i])) { i++; continue; }
    token.lastIndex = i;
    const m = token.exec(s);
    if (!m) return null;
    out.push(m[1]);
    i = token.lastIndex;
  }
  return out;
}

function fromDecimal (digits) {
  const [whole, part = ''] = digits.split('.');
  if (part.length > 9) throw new Error('too many decimals');
  return exact(Number((whole || '0') + part), 10 ** part.length);
}

// products and quotients only: 5 sqrt 3 / 2, 3 pi / 4, (1/2) pi
function parseTokens (t) {
  let i = 0;
  const primary = () => {
    const k = t[i++];
    if (k === '-') return times(exact(-1), primary());
    if (k === '+') return primary();
    if (k === '(') {
      const v = product();
      if (t[i++] !== ')') throw new Error('unclosed');
      return v;
    }
    if (k === 'sqrt') {
      const v = primary();
      if (v.rad !== 1 || v.pi !== 0 || v.n < 0) throw new Error('nested radical');
      return exact(1, v.d, v.n * v.d); // sqrt(n / d) is sqrt(nd) / d
    }
    if (k === 'pi') return exact(1, 1, 1, 1);
    if (k !== undefined && /^[\d.]/.test(k)) return fromDecimal(k);
    throw new Error('unexpected ' + k);
  };
  const product = () => {
    let v = primary();
    for (;;) {
      const k = t[i];
      if (k === '*') { i++; v = times(v, primary()); } else if (k === '/') { i++; v = over(v, primary()); } else if (k !== undefined && k !== ')' && k !== '+' && k !== '-') v = times(v, primary()); else return v;
    }
  };
  const v = product();
  if (i !== t.length) throw new Error('left over');
  return v;
}

/**
 * What a player typed, as an exact value, or null when it is not one.
 * @param {string} typed
 * @returns {?Exact}
 */
export function parse (typed) {
  let text = String(typed ?? '').toLowerCase().trim();
  // "x = 5", "f(2) = 5"
  text = text.slice(text.lastIndexOf('=') + 1).trim();
  if (!text) return null;
  try {
    // a mixed number: 3 1/5
    const mixed = text.match(/^(-?)\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const [, sign, whole, top, bottom] = mixed;
      const v = exact(Number(whole) * Number(bottom) + Number(top), Number(bottom));
      return sign ? times(exact(-1), v) : v;
    }
    const t = tokenize(text);
    return t && t.length ? parseTokens(t) : null;
  } catch {
    return null;
  }
}

// A decimal typed for an answer that is not one (0.33 for a third, 15.59 for
// 9 radical 3) counts when it is right to the places typed, two or more.
function closeEnough (expected, typed) {
  const m = String(typed).trim().match(/^-?\d*\.(\d+)$/);
  if (!m || m[1].length < 2) return false;
  return Math.abs(Number(typed) - toNumber(expected)) <= 0.5 * 10 ** -m[1].length + 1e-12;
}

function matches (expected, typed) {
  const v = parse(typed);
  if (v && same(v, expected)) return 'exact';
  return closeEnough(expected, typed) ? 'close' : null;
}

/**
 * Marks an answer. An exact answer carrying form: 'fraction' was asked for as a
 * fraction ("write 0.375 as a fraction"), so a decimal for it is not accepted.
 * @param {Answer} answer
 * @param {string} typed
 * @returns {{ok: boolean, close?: boolean, form?: string}} close: a rounded
 *   decimal was accepted; form: right value, wrong form
 */
export function check (answer, typed) {
  const text = String(typed ?? '').trim();
  if (!text) return { ok: false };
  if (answer.form === 'fraction' && answer.d !== 1 && !text.includes('/') && !/\bover\b/i.test(text)) {
    return { ok: false, form: 'fraction' };
  }
  if (answer.text != null) {
    // the sign stays: -i is not i
    const plain = s => String(s).toLowerCase().replace(/[−–]/g, '-').replace(/[^a-z0-9-]/g, '');
    return { ok: [answer.text].concat(answer.accept || []).some(a => plain(a) === plain(text)) };
  }
  if (answer.list) {
    const parts = text.replace(/[()[\]{}]/g, ' ').split(/\s*(?:,|;|&|\band\b)\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length !== answer.list.length) return { ok: false };
    const left = answer.list.slice();
    let close = false;
    for (const [i, part] of parts.entries()) {
      const at = answer.ordered ? (matches(left[i], part) ? i : -1) : left.findIndex(v => v && matches(v, part));
      if (at === -1) return { ok: false };
      if (matches(left[at], part) === 'close') close = true;
      left[at] = null;
    }
    return { ok: true, close };
  }
  const how = matches(answer, text);
  return { ok: Boolean(how), close: how === 'close' };
}

const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');

/** @param {Exact} v @returns {string} TeX */
export function toTex (v) {
  const n = Math.abs(v.n);
  const symbols = (v.rad > 1 ? '\\sqrt{' + v.rad + '}' : '') + (v.pi === 1 ? '\\pi' : '');
  const top = (n === 1 && symbols ? '' : group(n)) + symbols;
  const bottom = (v.d === 1 ? '' : String(v.d)) + (v.pi === -1 ? '\\pi' : '');
  return (v.n < 0 ? '-' : '') + (bottom ? '\\frac{' + top + '}{' + bottom + '}' : top);
}

/** @param {Exact} v @returns {string} the way a player would type it */
export function toPlain (v) {
  const n = Math.abs(v.n);
  const symbols = (v.rad > 1 ? '√' + v.rad : '') + (v.pi === 1 ? 'π' : '');
  const top = (n === 1 && symbols ? '' : String(n)) + symbols;
  const bottom = (v.d === 1 ? '' : String(v.d)) + (v.pi === -1 ? 'π' : '');
  return (v.n < 0 ? '-' : '') + top + (bottom ? '/' + (v.d !== 1 && v.pi === -1 ? '(' + bottom + ')' : bottom) : '');
}

/** @param {Answer} answer @returns {string} TeX */
export function answerTex (answer) {
  if (answer.text != null) return '\\text{' + answer.text + '}';
  if (answer.list) {
    const inside = answer.list.map(toTex).join(',\\ ');
    return answer.ordered ? '(' + inside + ')' : inside;
  }
  return toTex(answer);
}

/** @param {Answer} answer @returns {string} something check() accepts */
export function answerPlain (answer) {
  if (answer.text != null) return answer.text;
  if (answer.list) return answer.list.map(toPlain).join(', ');
  return toPlain(answer);
}
