// Writing math for the drills. A prompt is plain text with TeX between double
// square brackets, which the page hands to KaTeX: T`What is [[\binom{7}{3}]]?`
// Double brackets rather than dollar signs, so a template's ${} never
// collides with them.

/** A template whose backslashes stay as written. */
export const T = String.raw;

/**
 * A polynomial as TeX.
 * @param {number[]} coefficients - highest power first
 * @param {string} [x]
 * @returns {string}
 */
export function poly (coefficients, x = 'x') {
  const degree = coefficients.length - 1;
  let out = '';
  coefficients.forEach((c, i) => {
    if (c === 0) return;
    const power = degree - i;
    const size = Math.abs(c);
    const term = (size === 1 && power > 0 ? '' : String(size)) + (power === 0 ? '' : x + (power === 1 ? '' : '^{' + power + '}'));
    out += out ? (c < 0 ? ' - ' : ' + ') + term : (c < 0 ? '-' : '') + term;
  });
  return out || '0';
}

/** "+ 5" or "- 5", for the middle of an expression. */
export const signed = n => (n < 0 ? '- ' + -n : '+ ' + n);

/** A negative number in parentheses, for substituting into a formula. */
export const paren = n => (n < 0 ? '(' + n + ')' : String(n));

export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][n % 10]);

/** 3628800 as 3{,}628{,}800 */
export const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');

export const factorial = n => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

export const choose = (n, k) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = c * (n - k + i) / i;
  return Math.round(c);
};

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

/** Degrees as a multiple of pi: 150 is \frac{5\pi}{6} */
export function radiansTex (degrees) {
  if (degrees === 0) return '0';
  const g = gcd(degrees, 180);
  const [top, bottom] = [degrees / g, 180 / g];
  return bottom === 1 ? (top === 1 ? '' : top) + T`\pi` : T`\frac{${top === 1 ? '' : top}\pi}{${bottom}}`;
}
