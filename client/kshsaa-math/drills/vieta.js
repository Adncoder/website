// Vieta's formulas: what the roots of a polynomial add and multiply to,
// straight from its coefficients, without solving it.

import { frac } from '../exact.js';
import { T, poly } from '../tex.js';

const TOPIC = "Vieta's formulas";

// a fraction in lowest terms as TeX
function fracTex (n, d) {
  const v = frac(n, d);
  return v.d === 1 ? String(v.n) : (v.n < 0 ? '-' : '') + T`\frac{${Math.abs(v.n)}}{${v.d}}`;
}

export default [
  {
    id: 'vieta-quadratic',
    name: 'Sum and product of roots',
    topic: TOPIC,
    seconds: 30,
    hint: T`For [[ax^2 + bx + c = 0]] the roots add to [[-\frac{b}{a}]] and multiply to [[\frac{c}{a}]], whether or not they are real.`,
    make (r) {
      const [a, b, c] = [r.pick([1, 1, 1, 2, 3, 4, 5]), r.nonzero(-12, 12), r.nonzero(-12, 12)];
      const sum = r.chance(0.5);
      return {
        prompt: T`What is the ${sum ? 'sum' : 'product'} of the roots of [[${poly([a, b, c])} = 0]]?`,
        answer: sum ? frac(-b, a) : frac(c, a),
        steps: sum ? T`[[-\frac{b}{a} = -\frac{${b}}{${a}}]]` : T`[[\frac{c}{a} = \frac{${c}}{${a}}]]`,
        data: { a, b, c, sum }
      };
    }
  },
  {
    id: 'vieta-cubic',
    name: 'Roots of a cubic',
    topic: TOPIC,
    seconds: 45,
    hint: T`For [[ax^3 + bx^2 + cx + d = 0]]: the roots add to [[-\frac{b}{a}]], their products two at a time add to [[\frac{c}{a}]], and all three multiply to [[-\frac{d}{a}]]. The signs alternate, starting with minus.`,
    make (r) {
      const [a, b, c, d] = [r.pick([1, 1, 1, 2, 3]), r.nonzero(-9, 9), r.nonzero(-9, 9), r.nonzero(-9, 9)];
      const which = r.pick(['sum', 'pairs', 'product']);
      const ask = { sum: 'sum of the roots', pairs: 'sum of the products of the roots taken two at a time', product: 'product of the roots' }[which];
      const answer = { sum: frac(-b, a), pairs: frac(c, a), product: frac(-d, a) }[which];
      const steps = { sum: T`[[-\frac{b}{a} = -\frac{${b}}{${a}}]]`, pairs: T`[[\frac{c}{a} = \frac{${c}}{${a}}]]`, product: T`[[-\frac{d}{a} = -\frac{${d}}{${a}}]]` }[which];
      return { prompt: T`What is the ${ask} of [[${poly([a, b, c, d])} = 0]]?`, answer, steps, data: { a, b, c, d, which } };
    }
  },
  {
    id: 'vieta-symmetric',
    name: 'Expressions in the roots',
    topic: TOPIC,
    seconds: 60,
    hint: T`Write it in terms of the sum S and product P. [[r^2 + s^2 = S^2 - 2P]]. [[\frac{1}{r} + \frac{1}{s} = \frac{S}{P}]]. [[(r - s)^2 = S^2 - 4P]].`,
    make (r) {
      const [a, b, c] = [r.pick([1, 1, 1, 2]), r.nonzero(-9, 9), r.nonzero(-9, 9)];
      const which = r.pick(['squares', 'reciprocals', 'difference']);
      const lead = T`If r and s are the roots of [[${poly([a, b, c])} = 0]], what is `;
      if (which === 'squares') {
        return {
          prompt: lead + T`[[r^2 + s^2]]?`,
          answer: frac(b * b - 2 * a * c, a * a),
          steps: T`[[S = ${fracTex(-b, a)}]], [[P = ${fracTex(c, a)}]], and [[S^2 - 2P = ${fracTex(b * b - 2 * a * c, a * a)}]]`,
          data: { a, b, c, which }
        };
      }
      if (which === 'reciprocals') {
        return {
          prompt: lead + T`[[\frac{1}{r} + \frac{1}{s}]]?`,
          answer: frac(-b, c),
          steps: T`[[\frac{r + s}{rs} = \frac{S}{P} = -\frac{b}{c} = ${fracTex(-b, c)}]]`,
          data: { a, b, c, which }
        };
      }
      return {
        prompt: lead + T`[[(r - s)^2]]?`,
        answer: frac(b * b - 4 * a * c, a * a),
        steps: T`[[S^2 - 4P = ${fracTex(b * b - 4 * a * c, a * a)}]], the discriminant over [[a^2]]`,
        data: { a, b, c, which }
      };
    }
  },
  {
    id: 'vieta-build',
    name: 'A quadratic from its roots',
    topic: TOPIC,
    seconds: 45,
    hint: T`With leading coefficient 1, the quadratic is [[x^2 - Sx + P]]: minus the sum, plus the product.`,
    make (r) {
      const [p, q] = [r.nonzero(-9, 9), r.nonzero(-9, 9)];
      const linear = r.chance(0.5);
      return {
        prompt: T`A quadratic [[x^2 + bx + c]] has roots ${p} and ${q}. What is ${linear ? 'b' : 'c'}?`,
        answer: frac(linear ? -(p + q) : p * q, 1),
        steps: linear ? T`[[b = -(${p} + ${q < 0 ? '(' + q + ')' : q}) = ${-(p + q)}]]` : T`[[c = ${p} \cdot ${q < 0 ? '(' + q + ')' : q} = ${p * q}]]`,
        data: { p, q, linear }
      };
    }
  }
];
