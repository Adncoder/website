// Averages of every kind, and the 68-95-99.7 rule.

import { exact, frac, int, root } from '../exact.js';
import { T } from '../tex.js';

const TOPIC = 'Statistics';

// percent of a normal distribution below each whole number of standard
// deviations from the mean, by the 68-95-99.7 rule
const BELOW = { '-3': 0.15, '-2': 2.5, '-1': 16, 0: 50, 1: 84, 2: 97.5, 3: 99.85 };

const percent = x => exact(Math.round(x * 100), 100);

export default [
  {
    id: 'mean',
    name: 'Mean',
    topic: TOPIC,
    seconds: 30,
    hint: T`Add them up and divide by how many there are.`,
    make (r) {
      const n = r.int(4, 6);
      const list = Array.from({ length: n }, () => r.int(2, 40));
      const sum = list.reduce((a, b) => a + b, 0);
      return {
        prompt: T`What is the mean of ${list.join(', ')}?`,
        answer: frac(sum, n),
        steps: T`[[\frac{${sum}}{${n}}]]`,
        data: { list }
      };
    }
  },
  {
    id: 'median',
    name: 'Median',
    topic: TOPIC,
    seconds: 30,
    hint: T`Put them in order and take the middle one, or the mean of the middle two.`,
    make (r) {
      const n = r.int(5, 8);
      const list = Array.from({ length: n }, () => r.int(1, 30));
      const sorted = list.slice().sort((a, b) => a - b);
      const answer = n % 2 ? int(sorted[(n - 1) / 2]) : frac(sorted[n / 2 - 1] + sorted[n / 2], 2);
      return {
        prompt: T`What is the median of ${list.join(', ')}?`,
        answer,
        steps: T`In order: ${sorted.join(', ')}.`,
        data: { list }
      };
    }
  },
  {
    id: 'missing-score',
    name: 'Score needed for an average',
    topic: TOPIC,
    seconds: 45,
    hint: T`The total has to be the target average times the number of scores. Subtract what is already there.`,
    make (r) {
      const n = r.int(3, 5);
      const target = r.int(80, 92);
      const scores = Array.from({ length: n }, () => target + r.int(-9, 6));
      const sum = scores.reduce((a, b) => a + b, 0);
      const need = target * (n + 1) - sum;
      return {
        prompt: T`A student has scores of ${scores.join(', ')}. What score on the next test brings the average to exactly ${target}?`,
        answer: int(need),
        steps: T`[[${target} \cdot ${n + 1} - ${sum} = ${need}]]`,
        data: { scores, target }
      };
    }
  },
  {
    id: 'geometric-mean',
    name: 'Geometric mean',
    topic: TOPIC,
    seconds: 30,
    hint: T`Of two numbers: [[\sqrt{ab}]]. Of n numbers: the n-th root of their product. It is also the altitude to the hypotenuse of a right triangle that the altitude cuts into a and b.`,
    make (r) {
      if (r.chance(0.25)) {
        // three numbers whose product is a perfect cube
        const [a, b, c] = r.pick([[1, 8, 27], [2, 4, 8], [3, 9, 27], [1, 4, 16], [2, 6, 18], [4, 6, 9], [1, 3, 9], [2, 10, 50]]);
        const g = Math.round(Math.cbrt(a * b * c));
        return {
          prompt: T`What is the geometric mean of ${a}, ${b}, and ${c}?`,
          answer: int(g),
          steps: T`[[\sqrt[3]{${a} \cdot ${b} \cdot ${c}} = \sqrt[3]{${a * b * c}} = ${g}]]`,
          data: { list: [a, b, c] }
        };
      }
      const a = r.int(2, 12);
      const b = a * r.pick([2, 3, 4, 5, 8, 9]) / (r.chance(0.5) && a % 2 === 0 ? 2 : 1);
      return {
        prompt: T`What is the geometric mean of ${a} and ${b}?`,
        answer: root(a * b),
        steps: T`[[\sqrt{${a} \cdot ${b}} = \sqrt{${a * b}}]]`,
        data: { list: [a, b] }
      };
    }
  },
  {
    id: 'harmonic-mean',
    name: 'Harmonic mean',
    topic: TOPIC,
    seconds: 45,
    hint: T`Of two numbers: [[\frac{2ab}{a+b}]]. In general, n over the sum of the reciprocals. The average speed of a round trip is the harmonic mean of the two speeds, never the ordinary average.`,
    make (r) {
      const [a, b] = r.pick([[3, 6], [4, 12], [2, 6], [6, 12], [10, 15], [20, 30], [40, 60], [30, 60], [12, 24], [5, 20], [4, 6], [8, 12], [60, 120], [3, 4], [2, 3], [5, 10]]);
      const value = frac(2 * a * b, a + b);
      if (a >= 20 && r.chance(0.6)) {
        return {
          prompt: T`A driver goes to a town at ${a} miles per hour and returns over the same road at ${b} miles per hour. What is the average speed for the whole trip, in miles per hour?`,
          answer: value,
          steps: T`Same distance each way, so the harmonic mean: [[\frac{2 \cdot ${a} \cdot ${b}}{${a} + ${b}} = \frac{${2 * a * b}}{${a + b}}]]`,
          data: { a, b }
        };
      }
      return {
        prompt: T`What is the harmonic mean of ${a} and ${b}?`,
        answer: value,
        steps: T`[[\frac{2 \cdot ${a} \cdot ${b}}{${a} + ${b}} = \frac{${2 * a * b}}{${a + b}}]]`,
        data: { a, b }
      };
    }
  },
  {
    id: 'empirical-rule',
    name: 'The 68-95-99.7 rule',
    topic: TOPIC,
    seconds: 30,
    hint: T`In a normal distribution about 68% of the data is within 1 standard deviation of the mean, 95% within 2, and 99.7% within 3. Halve those for one side: 34, 47.5, 49.85.`,
    make (r) {
      const mean = r.pick([50, 60, 70, 100, 500]);
      const sd = r.pick(mean === 500 ? [50, 100] : mean === 100 ? [10, 15] : [5, 10]);
      const lo = r.int(-3, 2);
      const hi = r.int(lo + 1, 3);
      const kind = r.pick(['between', 'between', 'between', 'above', 'below']);
      const at = z => mean + z * sd;
      const what = r.pick(['Test scores', 'Heights in a sample', 'Weights of packages']);
      const lead = T`${what} are normally distributed with a mean of ${mean} and a standard deviation of ${sd}. By the 68-95-99.7 rule, what percent `;
      if (kind === 'above') {
        const z = r.int(-2, 3);
        return {
          prompt: lead + T`are above ${at(z)}?`,
          answer: percent(100 - BELOW[z]),
          unit: '%',
          steps: T`${at(z)} is ${z === 0 ? 'the mean' : Math.abs(z) + ' standard deviation' + (Math.abs(z) > 1 ? 's' : '') + (z > 0 ? ' above' : ' below') + ' the mean'}: [[100 - ${BELOW[z]} = ${100 - BELOW[z]}]] percent`,
          data: { kind, lo: z, hi: null }
        };
      }
      if (kind === 'below') {
        const z = r.int(-3, 2);
        return {
          prompt: lead + T`are below ${at(z)}?`,
          answer: percent(BELOW[z]),
          unit: '%',
          steps: T`${at(z)} is ${z === 0 ? 'the mean' : Math.abs(z) + ' standard deviation' + (Math.abs(z) > 1 ? 's' : '') + (z > 0 ? ' above' : ' below') + ' the mean'}: ${BELOW[z]} percent lies below it.`,
          data: { kind, lo: null, hi: z }
        };
      }
      const value = BELOW[hi] - BELOW[lo];
      return {
        prompt: lead + T`are between ${at(lo)} and ${at(hi)}?`,
        answer: percent(value),
        unit: '%',
        steps: T`From ${lo} to ${hi} standard deviations: [[${BELOW[hi]} - ${BELOW[lo]} = ${+value.toFixed(2)}]] percent`,
        data: { kind, lo, hi }
      };
    }
  }
];
