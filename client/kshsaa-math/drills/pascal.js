// Pascal's triangle: knowing the combinations cold, and the binomial theorem
// that reads its coefficients off the same rows.

import { int } from '../exact.js';
import { T, choose, ordinal, paren } from '../tex.js';

const TOPIC = "Pascal's triangle";

// n(n-1)... over k!, the short side of the row
function product (n, k) {
  const m = Math.min(k, n - k);
  if (m === 0) return '1';
  const top = Array.from({ length: m }, (_, i) => n - i).join(T` \cdot `);
  const bottom = Array.from({ length: m }, (_, i) => m - i).join(T` \cdot `);
  return T`\frac{${top}}{${bottom}}`;
}

export default [
  {
    id: 'pascal',
    name: 'Combinations from the triangle',
    topic: TOPIC,
    seconds: 10,
    hint: T`Symmetry: [[\binom{n}{k} = \binom{n}{n-k}]]. Or multiply down from n and divide by k!: [[\binom{n}{k} = \frac{n(n-1)\cdots(n-k+1)}{k!}]].`,
    /** @param {object} r @param {{maxRow?: number, edges?: boolean}} [options] */
    make (r, options = {}) {
      const maxRow = Math.max(0, Math.min(14, options.maxRow ?? 10));
      const edges = options.edges || maxRow < 2;
      const n = r.int(edges ? 0 : 2, maxRow);
      const k = edges ? r.int(0, n) : r.int(1, n - 1);
      const value = choose(n, k);
      const ask = r.pick([
        T`What is [[\binom{${n}}{${k}}]]?`,
        T`What is [[C(${n}, ${k})]]?`,
        T`What is [[{}_{${n}}C_{${k}}]], ${n} choose ${k}?`
      ]);
      const flipped = k > n - k ? T`\binom{${n}}{${n - k}} = ` : '';
      return {
        prompt: ask,
        answer: int(value),
        steps: T`[[\binom{${n}}{${k}} = ${flipped}${product(n, k)} = ${value}]], entry ${k} of row ${n}.`,
        data: { n, k }
      };
    }
  },
  {
    id: 'pascal-row-sum',
    name: 'Sum of a row',
    topic: TOPIC,
    seconds: 10,
    hint: T`Row n adds up to [[2^n]]: each entry counts the subsets of one size.`,
    make (r) {
      const n = r.int(3, 12);
      return {
        prompt: T`What is the sum of the entries in row ${n} of Pascal's triangle? (The top row is row 0.)`,
        answer: int(2 ** n),
        steps: T`[[2^{${n}} = ${2 ** n}]]`,
        data: { n }
      };
    }
  },
  {
    id: 'binomial-coefficient',
    name: 'Binomial theorem: a coefficient',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[(a + b)^n = \sum_k \binom{n}{k} a^{n-k} b^k]]. The term with [[x^k]] takes the x part k times and the constant n - k times.`,
    make (r) {
      const n = r.int(3, 6);
      const a = r.pick([1, 1, 2, 3]);
      const b = r.pick([1, -1, 2, -2, 3]);
      const k = r.int(1, n - 1);
      const value = choose(n, k) * a ** k * b ** (n - k);
      const inside = (a === 1 ? 'x' : a + 'x') + (b < 0 ? ' - ' + -b : ' + ' + b);
      return {
        prompt: T`What is the coefficient of [[x^{${k}}]] in the expansion of [[(${inside})^{${n}}]]?`,
        answer: int(value),
        steps: T`[[\binom{${n}}{${k}} \cdot ${paren(a)}^{${k}} \cdot ${paren(b)}^{${n - k}} = ${choose(n, k)} \cdot ${a ** k} \cdot ${paren(b ** (n - k))} = ${value}]]`,
        data: { n, a, b, k }
      };
    }
  },
  {
    id: 'binomial-term',
    name: 'Binomial theorem: the r-th term',
    topic: TOPIC,
    seconds: 60,
    hint: T`The r-th term of [[(a + b)^n]] is [[\binom{n}{r-1} a^{n-r+1} b^{r-1}]]: the powers of b start at 0, so the r-th term has [[b^{r-1}]].`,
    make (r) {
      const n = r.int(4, 6);
      const a = r.pick([1, 2, 3]);
      const b = r.pick([1, -1, 2, -2]);
      const term = r.int(2, n);
      const k = term - 1;
      const value = choose(n, k) * a ** (n - k) * b ** k;
      const inside = (a === 1 ? 'x' : a + 'x') + (b < 0 ? ' - ' : ' + ') + (Math.abs(b) === 1 ? 'y' : Math.abs(b) + 'y');
      return {
        prompt: T`What is the coefficient of the ${ordinal(term)} term in the expansion of [[(${inside})^{${n}}]], written in descending powers of x?`,
        answer: int(value),
        steps: T`The ${ordinal(term)} term has [[y^{${k}}]]: [[\binom{${n}}{${k}} \cdot ${paren(a)}^{${n - k}} \cdot ${paren(b)}^{${k}} = ${choose(n, k)} \cdot ${a ** (n - k)} \cdot ${paren(b ** k)} = ${value}]], so the term is [[${value}x^{${n - k}}y^{${k}}]].`,
        data: { n, a, b, k }
      };
    }
  }
];
