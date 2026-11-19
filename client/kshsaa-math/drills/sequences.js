// Sequences and series: arithmetic, geometric, and the sums worth knowing.

import { frac, int } from '../exact.js';
import { T, group, ordinal, paren } from '../tex.js';

const TOPIC = 'Sequences and series';

export default [
  {
    id: 'arithmetic-term',
    name: 'Arithmetic sequence: a term',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[a_n = a_1 + (n - 1)d]]: the n-th term is n - 1 steps past the first.`,
    make (r) {
      const [a, d, n] = [r.int(-10, 20), r.nonzero(-6, 9), r.int(8, 40)];
      const terms = [0, 1, 2, 3].map(i => a + i * d).join(', ');
      return {
        prompt: T`What is the ${ordinal(n)} term of the arithmetic sequence ${terms}, ...?`,
        answer: int(a + (n - 1) * d),
        steps: T`[[${a} + ${n - 1} \cdot ${paren(d)} = ${a + (n - 1) * d}]]`,
        data: { a, d, n }
      };
    }
  },
  {
    id: 'arithmetic-sum',
    name: 'Arithmetic series',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[S_n = \frac{n(a_1 + a_n)}{2}]]: the number of terms times the average of the first and last. So [[1 + 2 + \cdots + n = \frac{n(n+1)}{2}]], the first n odd numbers add to [[n^2]], and the first n even numbers to [[n(n+1)]].`,
    make (r) {
      const kind = r.pick(['general', 'general', 'counting', 'odd', 'even']);
      const n = r.int(8, kind === 'general' ? 20 : 60);
      if (kind === 'counting') return { prompt: T`What is the sum of the whole numbers from 1 through ${n}?`, answer: int(n * (n + 1) / 2), steps: T`[[\frac{${n} \cdot ${n + 1}}{2} = ${group(n * (n + 1) / 2)}]]`, data: { a: 1, d: 1, n } };
      if (kind === 'odd') return { prompt: T`What is the sum of the first ${n} odd positive integers?`, answer: int(n * n), steps: T`[[${n}^2 = ${group(n * n)}]]`, data: { a: 1, d: 2, n } };
      if (kind === 'even') return { prompt: T`What is the sum of the first ${n} even positive integers?`, answer: int(n * (n + 1)), steps: T`[[${n} \cdot ${n + 1} = ${group(n * (n + 1))}]]`, data: { a: 2, d: 2, n } };
      const [a, d] = [r.int(1, 12), r.int(2, 7)];
      const last = a + (n - 1) * d;
      return {
        prompt: T`What is the sum of the first ${n} terms of the arithmetic sequence ${a}, ${a + d}, ${a + 2 * d}, ...?`,
        answer: int(n * (a + last) / 2),
        steps: T`The ${ordinal(n)} term is ${last}, so [[\frac{${n}(${a} + ${last})}{2} = ${group(n * (a + last) / 2)}]]`,
        data: { a, d, n }
      };
    }
  },
  {
    id: 'geometric-term',
    name: 'Geometric sequence: a term',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[a_n = a_1 r^{n-1}]]: multiply by the ratio n - 1 times.`,
    make (r) {
      const [top, bottom] = r.pick([[2, 1], [3, 1], [-2, 1], [1, 2], [1, 3], [3, 2], [2, 3], [-1, 2]]);
      const n = r.int(4, bottom === 1 && Math.abs(top) === 2 ? 9 : 6);
      const a = bottom === 1 ? r.int(1, 6) : bottom ** r.int(2, n - 1) * r.int(1, 3);
      const term = i => frac(a * top ** i, bottom ** i);
      const shown = [0, 1, 2].map(i => { const v = term(i); return v.d === 1 ? String(v.n) : T`[[${v.n < 0 ? '-' : ''}\frac{${Math.abs(v.n)}}{${v.d}}]]`; }).join(', ');
      return {
        prompt: T`What is the ${ordinal(n)} term of the geometric sequence ${shown}, ...?`,
        answer: term(n - 1),
        steps: T`The ratio is [[${bottom === 1 ? top : T`\frac{${top}}{${bottom}}`}]], so [[${a} \cdot \left(${bottom === 1 ? top : T`\frac{${top}}{${bottom}}`}\right)^{${n - 1}}]]`,
        data: { a, top, bottom, n }
      };
    }
  },
  {
    id: 'geometric-sum',
    name: 'Geometric series',
    topic: TOPIC,
    seconds: 45,
    hint: T`A finite one: [[S_n = \frac{a_1(r^n - 1)}{r - 1}]]. An infinite one, when [[|r| < 1]]: [[S = \frac{a_1}{1 - r}]].`,
    make (r) {
      if (r.chance(0.5)) {
        const [top, bottom] = r.pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [-1, 2], [-1, 3], [1, 5], [2, 5]]);
        const a = r.int(1, 12);
        const ratio = T`${top < 0 ? '-' : ''}\frac{${Math.abs(top)}}{${bottom}}`;
        return {
          prompt: T`What is the sum of the infinite geometric series with first term ${a} and common ratio [[${ratio}]]?`,
          answer: frac(a * bottom, bottom - top),
          steps: T`[[\frac{${a}}{1 - ${paren(top) === String(top) ? ratio : '(' + ratio + ')'}} = \frac{${a * bottom}}{${bottom - top}}]]`,
          data: { a, top, bottom, n: null }
        };
      }
      const [a, ratio, n] = [r.int(1, 5), r.pick([2, 3, -2]), r.int(4, 7)];
      const value = a * (ratio ** n - 1) / (ratio - 1);
      return {
        prompt: T`What is the sum of the first ${n} terms of the geometric sequence ${a}, ${a * ratio}, ${a * ratio * ratio}, ...?`,
        answer: int(value),
        steps: T`[[\frac{${a}(${paren(ratio)}^{${n}} - 1)}{${ratio} - 1} = ${group(value)}]]`,
        data: { a, top: ratio, bottom: 1, n }
      };
    }
  },
  {
    id: 'power-sums',
    name: 'Sums of squares and cubes',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[1^2 + 2^2 + \cdots + n^2 = \frac{n(n+1)(2n+1)}{6}]], and [[1^3 + 2^3 + \cdots + n^3 = \left(\frac{n(n+1)}{2}\right)^2]]: the cubes add to the square of the sum of the numbers.`,
    make (r) {
      const n = r.int(4, 12);
      if (r.chance(0.5)) {
        const value = n * (n + 1) * (2 * n + 1) / 6;
        return { prompt: T`What is [[1^2 + 2^2 + 3^2 + \cdots + ${n}^2]]?`, answer: int(value), steps: T`[[\frac{${n} \cdot ${n + 1} \cdot ${2 * n + 1}}{6} = ${group(value)}]]`, data: { n, power: 2 } };
      }
      const value = (n * (n + 1) / 2) ** 2;
      return { prompt: T`What is [[1^3 + 2^3 + 3^3 + \cdots + ${n}^3]]?`, answer: int(value), steps: T`[[\left(\frac{${n} \cdot ${n + 1}}{2}\right)^2 = ${n * (n + 1) / 2}^2 = ${group(value)}]]`, data: { n, power: 3 } };
    }
  }
];
