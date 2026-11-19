// Algebra: quadratics, systems, the remainder theorem, functions, complex
// numbers, and the word problems KSHSAA sets about integers and percents.

import { frac, int, root } from '../exact.js';
import { T, paren, poly, signed } from '../tex.js';

const TOPIC = 'Algebra';

const evaluate = (coefficients, x) => coefficients.reduce((total, c) => total * x + c, 0);

export default [
  {
    id: 'discriminant',
    name: 'Discriminant',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[b^2 - 4ac]]. Positive: two real solutions. Zero: one. Negative: two imaginary solutions and none real.`,
    make (r) {
      const [a, b, c] = [r.pick([1, 1, 2, 3, -1]), r.int(-9, 9), r.nonzero(-9, 9)];
      const d = b * b - 4 * a * c;
      if (r.chance(0.4)) {
        return {
          prompt: T`How many real solutions does [[${poly([a, b, c])} = 0]] have?`,
          answer: int(d > 0 ? 2 : d === 0 ? 1 : 0),
          steps: T`[[b^2 - 4ac = ${b * b} - ${paren(4 * a * c)} = ${d}]], which is ${d > 0 ? 'positive: two' : d === 0 ? 'zero: one' : 'negative: none'}.`,
          data: { a, b, c, count: true }
        };
      }
      return {
        prompt: T`What is the discriminant of [[${poly([a, b, c])} = 0]]?`,
        answer: int(d),
        steps: T`[[b^2 - 4ac = ${b * b} - ${paren(4 * a * c)} = ${d}]]`,
        data: { a, b, c, count: false }
      };
    }
  },
  {
    id: 'vertex',
    name: 'Vertex of a parabola',
    topic: TOPIC,
    seconds: 45,
    hint: T`The vertex of [[y = ax^2 + bx + c]] is at [[x = -\frac{b}{2a}]]; put that back in for y.`,
    make (r) {
      const [a, h, k] = [r.pick([1, 1, -1, 2, -2, 3]), r.int(-5, 5), r.int(-9, 9)];
      const [b, c] = [-2 * a * h, a * h * h + k];
      return {
        prompt: T`Find the vertex of the parabola [[y = ${poly([a, b, c])}]]. Give it as (x, y).`,
        answer: { list: [int(h), int(k)], ordered: true },
        steps: T`[[x = -\frac{${b}}{2 \cdot ${paren(a)}} = ${h}]], and there [[y = ${k}]].`,
        data: { a, b, c }
      };
    }
  },
  {
    id: 'system',
    name: 'Systems of equations',
    topic: TOPIC,
    seconds: 60,
    hint: T`Multiply one equation so a variable cancels when you add or subtract, then put the value back.`,
    make (r) {
      const [x, y] = [r.int(-6, 6), r.int(-6, 6)];
      let a, b, c, d;
      do { [a, b, c, d] = [r.nonzero(-5, 5), r.nonzero(-5, 5), r.nonzero(-5, 5), r.nonzero(-5, 5)]; } while (a * d - b * c === 0);
      const line = (p, q) => poly([p, 0]) + (q < 0 ? ' - ' : ' + ') + (Math.abs(q) === 1 ? '' : Math.abs(q)) + 'y';
      return {
        prompt: T`Solve the system [[${line(a, b)} = ${a * x + b * y}]] and [[${line(c, d)} = ${c * x + d * y}]]. Give the answer as (x, y).`,
        answer: { list: [int(x), int(y)], ordered: true },
        steps: T`[[(x, y) = (${x}, ${y})]]: check it in both equations.`,
        data: { a, b, c, d, p: a * x + b * y, q: c * x + d * y }
      };
    }
  },
  {
    id: 'remainder-theorem',
    name: 'Remainder theorem',
    topic: TOPIC,
    seconds: 45,
    hint: T`The remainder when p(x) is divided by [[x - a]] is p(a). Dividing by [[x + 2]] means putting in -2.`,
    make (r) {
      const coefficients = [r.pick([1, 1, 2, 3]), r.int(-5, 5), r.int(-5, 5), r.int(-6, 6)];
      const a = r.nonzero(-3, 3);
      const value = evaluate(coefficients, a);
      return {
        prompt: T`What is the remainder when [[${poly(coefficients)}]] is divided by [[x ${signed(-a)}]]?`,
        answer: int(value),
        steps: T`[[p(${a}) = ${value}]]`,
        data: { coefficients, a }
      };
    }
  },
  {
    id: 'functions',
    name: 'Combining functions',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[f(g(x))]]: work from the inside out. [[(f + g)(x)]] is just [[f(x) + g(x)]].`,
    make (r) {
      const [a, b, c, k] = [r.nonzero(-4, 4), r.int(-6, 6), r.int(-6, 6), r.int(-4, 4)];
      const f = x => a * x + b;
      const g = x => x * x + c;
      const kind = r.pick(['fg', 'gf', 'sum']);
      const lead = T`If [[f(x) = ${poly([a, b])}]] and [[g(x) = ${poly([1, 0, c])}]], what is `;
      if (kind === 'fg') return { prompt: lead + T`[[f(g(${k}))]]?`, answer: int(f(g(k))), steps: T`[[g(${k}) = ${g(k)}]], then [[f(${g(k)}) = ${f(g(k))}]]`, data: { a, b, c, k, kind } };
      if (kind === 'gf') return { prompt: lead + T`[[g(f(${k}))]]?`, answer: int(g(f(k))), steps: T`[[f(${k}) = ${f(k)}]], then [[g(${f(k)}) = ${g(f(k))}]]`, data: { a, b, c, k, kind } };
      return { prompt: lead + T`[[(f + g)(${k})]]?`, answer: int(f(k) + g(k)), steps: T`[[${f(k)} + ${paren(g(k))} = ${f(k) + g(k)}]]`, data: { a, b, c, k, kind } };
    }
  },
  {
    id: 'complex',
    name: 'Complex numbers',
    topic: TOPIC,
    seconds: 30,
    hint: T`Powers of i repeat every four: [[i, -1, -i, 1]], so divide the exponent by 4 and keep the remainder. A number times its conjugate is [[(a + bi)(a - bi) = a^2 + b^2]], and its absolute value is the square root of that.`,
    make (r) {
      const kind = r.pick(['power', 'conjugate', 'conjugate', 'modulus']);
      if (kind === 'power') {
        const n = r.int(5, 60);
        const value = ['1', 'i', '-1', '-i'][n % 4];
        return {
          prompt: T`Simplify [[i^{${n}}]].`,
          answer: n % 2 === 0 ? int(Number(value)) : { text: value, accept: value === '-i' ? ['negative i', 'minus i'] : [] },
          steps: T`[[${n} = 4 \cdot ${Math.floor(n / 4)} + ${n % 4}]], so [[i^{${n}} = i^{${n % 4}} = ${value}]]`,
          data: { kind, n }
        };
      }
      const [a, b] = [r.nonzero(-9, 9), r.int(1, 9)];
      if (kind === 'conjugate') {
        return {
          prompt: T`Multiply [[${a} ${r.chance(0.5) ? '+' : '-'} ${b === 1 ? '' : b}i]] by its conjugate.`,
          answer: int(a * a + b * b),
          steps: T`[[${paren(a)}^2 + ${b}^2 = ${a * a + b * b}]]`,
          data: { kind, a, b }
        };
      }
      return {
        prompt: T`What is the absolute value of [[${a} + ${b === 1 ? '' : b}i]], in simplest radical form?`,
        answer: root(a * a + b * b),
        steps: T`[[\sqrt{${paren(a)}^2 + ${b}^2} = \sqrt{${a * a + b * b}}]]`,
        data: { kind, a, b }
      };
    }
  },
  {
    id: 'determinant',
    name: 'Determinant of a 2 by 2 matrix',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[\begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc]]: down the main diagonal minus up the other.`,
    make (r) {
      const [a, b, c, d] = [r.int(-9, 9), r.int(-9, 9), r.int(-9, 9), r.int(-9, 9)];
      return {
        prompt: T`What is the determinant of [[\begin{bmatrix} ${a} & ${b} \\ ${c} & ${d} \end{bmatrix}]]?`,
        answer: int(a * d - b * c),
        steps: T`[[${paren(a)} \cdot ${paren(d)} - ${paren(b)} \cdot ${paren(c)} = ${a * d - b * c}]]`,
        data: { a, b, c, d }
      };
    }
  },
  {
    id: 'consecutive-integers',
    name: 'Consecutive integers',
    topic: TOPIC,
    seconds: 45,
    hint: T`The middle one is the average: divide the sum by how many there are, then step out from the middle.`,
    make (r) {
      const step = r.pick([1, 1, 2]);
      const count = r.pick([3, 3, 5]);
      const middle = r.int(10, 120) * (step === 2 ? 2 : 1) + (step === 2 && r.chance(0.5) ? 1 : 0);
      const largest = middle + step * (count - 1) / 2;
      const kind = step === 1 ? 'consecutive integers' : middle % 2 ? 'consecutive odd integers' : 'consecutive even integers';
      return {
        prompt: T`The sum of ${count === 3 ? 'three' : 'five'} ${kind} is ${middle * count}. What is the largest of them?`,
        answer: int(largest),
        steps: T`The middle one is [[\frac{${middle * count}}{${count}} = ${middle}]], so the largest is ${largest}.`,
        data: { step, count, sum: middle * count }
      };
    }
  },
  {
    id: 'percent',
    name: 'Percents',
    topic: TOPIC,
    seconds: 30,
    hint: T`x percent of y equals y percent of x, so pick the easier one. A price after a 10% tax is 1.1 times the price.`,
    make (r) {
      const kind = r.pick(['of', 'of', 'tax', 'change']);
      if (kind === 'of') {
        const [p, y] = r.pick([[25, 84], [20, 65], [15, 80], [40, 35], [75, 48], [12, 50], [8, 25], [60, 45], [35, 20], [16, 75], [5, 240], [125, 64], [150, 18]]);
        return { prompt: T`What is ${p}% of ${y}?`, answer: frac(p * y, 100), steps: T`[[\frac{${p}}{100} \cdot ${y} = ${p * y / 100}]]`, data: { kind, p, y } };
      }
      if (kind === 'tax') {
        const price = 100 * r.int(2, 60);
        const p = r.pick([5, 8, 10, 20, 25]);
        const off = r.chance(0.5);
        return {
          prompt: off
            ? T`An item priced at $${price} is marked ${p}% off. What is the sale price, in dollars?`
            : T`An item costs $${price} and there is a ${p}% sales tax. What is the total cost, in dollars?`,
          answer: frac(price * (100 + (off ? -p : p)), 100),
          steps: T`[[${price} \cdot ${(100 + (off ? -p : p)) / 100} = ${price * (100 + (off ? -p : p)) / 100}]]`,
          data: { kind, price, p, off }
        };
      }
      const from = 20 * r.int(1, 10);
      const p = r.pick([10, 20, 25, 50, 75, 100, 150]);
      const up = r.chance(0.6) || p >= 100;
      const to = from * (100 + (up ? p : -p)) / 100;
      return {
        prompt: T`A value changes from ${from} to ${to}. What is the percent ${up ? 'increase' : 'decrease'}?`,
        answer: int(p),
        unit: '%',
        steps: T`[[\frac{${Math.abs(to - from)}}{${from}} = ${p}\%]]: the change over the starting value.`,
        data: { kind, from, to }
      };
    }
  }
];
