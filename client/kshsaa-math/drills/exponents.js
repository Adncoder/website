// Exponents and logarithms: fractional powers, the exponent rules, equations
// with a common base, and logs read as "what power?".

import { frac, int } from '../exact.js';
import { T, gcd, group, poly } from '../tex.js';

const TOPIC = 'Exponents and logs';

export default [
  {
    id: 'fractional-powers',
    name: 'Fractional powers',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[a^{p/q} = \left(\sqrt[q]{a}\right)^p]]: take the root first, while the number is still small, then the power. A negative exponent flips it.`,
    make (r) {
      const [base, q] = r.pick([[2, 2], [2, 3], [2, 4], [2, 5], [2, 10], [3, 2], [3, 3], [3, 4], [4, 2], [5, 2], [5, 3], [10, 2], [10, 3], [6, 2], [7, 2]]);
      const p = r.pick([1, 2, 3, 4, 5, 7].filter(x => gcd(x, q) === 1 && base ** x <= 1024));
      const negative = r.chance(0.25);
      const whole = base ** q;
      return {
        prompt: T`What is the value of [[${whole}^{${negative ? '-' : ''}${p}/${q}}]]?`,
        answer: negative ? frac(1, base ** p) : int(base ** p),
        steps: T`[[\sqrt[${q}]{${whole}} = ${base}]], and [[${base}^{${negative ? '-' : ''}${p}} = ${negative ? T`\frac{1}{${base ** p}}` : base ** p}]]`,
        data: { whole, p, q, negative }
      };
    }
  },
  {
    id: 'exponent-rules',
    name: 'Exponent rules',
    topic: TOPIC,
    seconds: 30,
    hint: T`Same base: multiplying adds the exponents, dividing subtracts them, and a power of a power multiplies them.`,
    make (r) {
      const base = r.pick([2, 3, 4, 5, 10]);
      const kind = r.pick(['times', 'over', 'power']);
      let m, n, k, written;
      if (kind === 'power') {
        [m, n] = r.pick([[2, 2], [2, 3], [3, 2], [2, -1], [-1, 2], [-2, -1], [3, -1], [-1, -1], [-1, 3]]);
        k = m * n;
        written = T`\left(${base}^{${m}}\right)^{${n}}`;
      } else {
        k = r.pick([-2, -1, 1, 2, 3]);
        n = r.int(-9, 9);
        m = kind === 'times' ? k - n : k + n;
        written = kind === 'times' ? T`${base}^{${m}} \cdot ${base}^{${n}}` : T`\frac{${base}^{${m}}}{${base}^{${n}}}`;
      }
      return {
        prompt: T`Simplify [[${written}]].`,
        answer: k >= 0 ? int(base ** k) : frac(1, base ** -k),
        steps: T`[[${base}^{${k}} = ${k >= 0 ? group(base ** k) : T`\frac{1}{${base ** -k}}`}]]`,
        data: { base, kind, m, n }
      };
    }
  },
  {
    id: 'exponent-equation',
    name: 'Equations with a common base',
    topic: TOPIC,
    seconds: 45,
    hint: T`Write both sides as powers of the same base, then set the exponents equal: [[25^{3x-2} = 5^{2x}]] becomes [[2(3x - 2) = 2x]].`,
    make (r) {
      const base = r.pick([2, 2, 3, 5]);
      const [m, n] = r.pick(base === 2 ? [[2, 1], [3, 1], [3, 2], [1, 2], [1, 3], [4, 1], [2, 3], [4, 2]] : base === 3 ? [[2, 1], [3, 1], [1, 2], [3, 2]] : [[2, 1], [3, 1], [1, 2]]);
      let a, b, c, d;
      do { [a, b, c, d] = [r.nonzero(-4, 4), r.int(-5, 5), r.int(-3, 3), r.int(-5, 5)]; } while (m * a === n * c);
      return {
        prompt: T`Solve for x: [[${base ** m}^{${poly([a, b])}} = ${base ** n}^{${poly([c, d])}}]]`,
        answer: frac(n * d - m * b, m * a - n * c),
        steps: T`As powers of ${base}: [[${m === 1 ? '' : m}(${poly([a, b])}) = ${n === 1 ? '' : n}(${poly([c, d])})]]`,
        data: { base, m, n, a, b, c, d }
      };
    }
  },
  {
    id: 'logs',
    name: 'Logarithms',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[\log_b x]] asks "b to what power is x?" Logs of a product add: [[\log_b x + \log_b y = \log_b xy]]. With two powers of the same number, [[\log_{b^m} b^n = \frac{n}{m}]].`,
    make (r) {
      const kind = r.pick(['power', 'power', 'ratio', 'sum', 'reciprocal']);
      const base = r.pick([2, 3, 5, 10]);
      if (kind === 'power') {
        const k = r.int(2, base === 2 ? 10 : base === 10 ? 6 : 4);
        return { prompt: T`What is [[\log_{${base}} ${group(base ** k)}]]?`, answer: int(k), steps: T`[[${base}^{${k}} = ${group(base ** k)}]]`, data: { kind, base, x: base ** k } };
      }
      if (kind === 'reciprocal') {
        const k = r.int(1, 4);
        return { prompt: T`What is [[\log_{${base}} \frac{1}{${base ** k}}]]?`, answer: int(-k), steps: T`[[${base}^{-${k}} = \frac{1}{${base ** k}}]]`, data: { kind, base, x: 1 / base ** k } };
      }
      if (kind === 'ratio') {
        const [b, m, n] = r.pick([[2, 2, 3], [2, 3, 2], [2, 3, 1], [2, 2, 5], [3, 2, 3], [3, 3, 2], [2, 4, 3], [5, 2, 3], [2, 5, 2], [2, 3, 4]]);
        return { prompt: T`What is [[\log_{${b ** m}} ${b ** n}]]?`, answer: frac(n, m), steps: T`[[${b ** m} = ${b}^{${m}}]] and [[${b ** n} = ${b}^{${n}}]], so [[\frac{${n}}{${m}}]]`, data: { kind, base: b ** m, x: b ** n } };
      }
      const [b, x, y] = r.pick([[6, 4, 9], [10, 25, 4], [10, 20, 50], [12, 9, 16], [6, 2, 18], [10, 2, 5], [15, 9, 25], [6, 12, 3], [10, 8, 125], [14, 4, 49]]);
      const k = Math.round(Math.log(x * y) / Math.log(b));
      return { prompt: T`What is [[\log_{${b}} ${x} + \log_{${b}} ${y}]]?`, answer: int(k), steps: T`[[\log_{${b}} (${x} \cdot ${y}) = \log_{${b}} ${x * y} = ${k}]]`, data: { kind, base: b, x: x * y } };
    }
  }
];
