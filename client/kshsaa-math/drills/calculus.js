// Calculus as KSHSAA asks it: a derivative or an integral of a polynomial,
// and limits, including the ones L'Hopital's rule settles.

import { frac, int } from '../exact.js';
import { T, poly } from '../tex.js';

const TOPIC = 'Calculus';

const derivative = coefficients => coefficients.slice(0, -1).map((c, i) => c * (coefficients.length - 1 - i));
const evaluate = (coefficients, x) => coefficients.reduce((total, c) => total * x + c, 0);

export default [
  {
    id: 'derivative',
    name: 'Derivative at a point',
    topic: TOPIC,
    seconds: 45,
    hint: T`Power rule: the derivative of [[ax^n]] is [[anx^{n-1}]], and constants drop out. The slope of the tangent at a point is the derivative there.`,
    make (r) {
      const degree = r.pick([2, 3, 3]);
      const coefficients = Array.from({ length: degree + 1 }, (_, i) => (i === 0 ? r.pick([1, 2, 3, -1, 4]) : r.int(-6, 6)));
      const k = r.int(-3, 3);
      const second = degree === 3 && r.chance(0.35);
      const first = derivative(coefficients);
      const used = second ? derivative(first) : first;
      const value = evaluate(used, k);
      return {
        prompt: second
          ? T`If [[f(x) = ${poly(coefficients)}]], what is the second derivative [[f''(${k})]]?`
          : r.chance(0.5)
            ? T`If [[f(x) = ${poly(coefficients)}]], what is [[f'(${k})]]?`
            : T`What is the slope of the tangent to [[y = ${poly(coefficients)}]] at [[x = ${k}]]?`,
        answer: int(value),
        steps: second
          ? T`[[f'(x) = ${poly(first)}]], [[f''(x) = ${poly(used)}]], and [[f''(${k}) = ${value}]]`
          : T`[[f'(x) = ${poly(first)}]], and at [[x = ${k}]] that is ${value}.`,
        data: { coefficients, k, second }
      };
    }
  },
  {
    id: 'integral',
    name: 'Definite integral',
    topic: TOPIC,
    seconds: 60,
    hint: T`Reverse the power rule: the integral of [[ax^n]] is [[\frac{a}{n+1}x^{n+1}]]. Evaluate at the top limit and subtract the value at the bottom.`,
    make (r) {
      const coefficients = r.pick([[0, 0, r.int(1, 9)], [0, r.nonzero(-6, 6), r.int(-6, 6)], [r.pick([1, 3, 6, -3]), r.int(-6, 6), r.int(-5, 5)], [0, r.int(1, 8), 0], [3, 0, 0]]);
      const lo = r.int(-2, 2);
      const hi = lo + r.int(1, 4);
      // each term a x^p integrates to a (hi^(p+1) - lo^(p+1)) / (p + 1), and p + 1 divides 6
      const sixths = coefficients.reduce((total, c, i) => {
        const p = coefficients.length - 1 - i;
        return total + c * (hi ** (p + 1) - lo ** (p + 1)) * 6 / (p + 1);
      }, 0);
      const anti = coefficients.map((c, i) => {
        const p = coefficients.length - 1 - i;
        if (c === 0) return '';
        const v = frac(c, p + 1);
        const size = v.d === 1 ? (Math.abs(v.n) === 1 ? '' : Math.abs(v.n)) : T`\frac{${Math.abs(v.n)}}{${v.d}}`;
        return (v.n < 0 ? '-' : '+') + size + 'x' + (p === 0 ? '' : T`^{${p + 1}}`);
      }).join(' ').replace(/^\+/, '');
      return {
        prompt: T`Evaluate [[\int_{${lo}}^{${hi}} ${coefficients.filter(c => c).length > 1 ? T`\left(${poly(coefficients)}\right)` : poly(coefficients)}\,dx]].`,
        answer: frac(sixths, 6),
        steps: T`An antiderivative is [[${anti}]]; take its value at ${hi} minus its value at ${lo}.`,
        data: { coefficients, lo, hi }
      };
    }
  },
  {
    id: 'limit-factor',
    name: 'Limits by factoring',
    topic: TOPIC,
    seconds: 30,
    hint: T`A [[\frac{0}{0}]] with polynomials means the top and bottom share a factor. Cancel it, then substitute. At infinity, only the leading terms matter.`,
    make (r) {
      if (r.chance(0.3)) {
        const [a, d] = [r.nonzero(-9, 9), r.nonzero(-9, 9)];
        const degree = r.pick([2, 3]);
        const rest = () => Array.from({ length: degree }, () => r.int(-9, 9));
        return {
          prompt: T`What is [[\lim_{x \to \infty} \frac{${poly([a, ...rest()])}}{${poly([d, ...rest()])}}]]?`,
          answer: frac(a, d),
          steps: T`The same degree top and bottom, so the limit is the ratio of the leading coefficients: [[\frac{${a}}{${d}}]]`,
          data: { kind: 'infinity', a, d }
        };
      }
      const [a, b] = [r.nonzero(-7, 7), r.int(-7, 7)];
      // (x - a)(x + b) over (x - a)
      const top = [1, b - a, -a * b];
      return {
        prompt: T`What is [[\lim_{x \to ${a}} \frac{${poly(top)}}{x ${a < 0 ? '+ ' + -a : '- ' + a}}]]?`,
        answer: int(a + b),
        steps: T`The top factors as [[(x ${a < 0 ? '+ ' + -a : '- ' + a})(x ${b < 0 ? '- ' + -b : '+ ' + b})]]; cancel and substitute: [[${a} ${b < 0 ? '- ' + -b : '+ ' + b} = ${a + b}]]`,
        data: { kind: 'factor', a, b }
      };
    }
  },
  {
    id: 'lhopital',
    name: "L'Hopital's rule",
    topic: TOPIC,
    seconds: 45,
    hint: T`When a limit comes out [[\frac{0}{0}]] or [[\frac{\infty}{\infty}]], take the derivative of the top and of the bottom separately, then try again: [[\lim \frac{f}{g} = \lim \frac{f'}{g'}]]. Worth knowing: [[\frac{\sin x}{x} \to 1]] and [[\frac{e^x - 1}{x} \to 1]] as x goes to 0.`,
    make (r) {
      const [a, b] = [r.int(2, 9), r.int(2, 9)];
      const kind = r.pick(['sin', 'exp', 'tan', 'sinsin', 'log', 'cos', 'power', 'lnx', 'expexp']);
      // the power in the x^n - a^n limit, kept small so a^n stays readable
      const n = b > 5 ? 3 : b;
      const zero = T`\lim_{x \to 0}`;
      const ratio = T`\frac{${a}}{${b}}`;
      const made = {
        sin: [T`${zero} \frac{\sin ${a}x}{${b}x}`, frac(a, b), T`[[\frac{${a}\cos ${a}x}{${b}} \to ${ratio}]]`],
        exp: [T`${zero} \frac{e^{${a}x} - 1}{${b}x}`, frac(a, b), T`[[\frac{${a}e^{${a}x}}{${b}} \to ${ratio}]]`],
        tan: [T`${zero} \frac{\tan ${a}x}{\sin ${b}x}`, frac(a, b), T`[[\frac{${a}\sec^2 ${a}x}{${b}\cos ${b}x} \to ${ratio}]]`],
        sinsin: [T`${zero} \frac{\sin ${a}x}{\sin ${b}x}`, frac(a, b), T`[[\frac{${a}\cos ${a}x}{${b}\cos ${b}x} \to ${ratio}]]`],
        log: [T`${zero} \frac{\ln(1 + ${a}x)}{${b}x}`, frac(a, b), T`[[\frac{${a}}{${b}(1 + ${a}x)} \to ${ratio}]]`],
        cos: [T`${zero} \frac{1 - \cos ${a}x}{x^2}`, frac(a * a, 2), T`Twice: [[\frac{${a}\sin ${a}x}{2x} \to \frac{${a * a}\cos ${a}x}{2} \to \frac{${a * a}}{2}]]`],
        power: [T`\lim_{x \to ${a}} \frac{x^{${n}} - ${a ** n}}{x - ${a}}`, int(n * a ** (n - 1)), T`[[\frac{${n}x^{${n - 1}}}{1} \to ${n} \cdot ${a}^{${n - 1}}]]`],
        lnx: [T`\lim_{x \to 1} \frac{${a}\ln x}{${b}(x - 1)}`, frac(a, b), T`[[\frac{${a}/x}{${b}} \to ${ratio}]]`],
        expexp: [T`${zero} \frac{e^{${a}x} - e^{${b}x}}{x}`, int(a - b), T`[[\frac{${a}e^{${a}x} - ${b}e^{${b}x}}{1} \to ${a} - ${b}]]`]
      }[kind];
      return { prompt: T`What is [[${made[0]}]]?`, answer: made[1], steps: made[2], data: { kind, a, b } };
    }
  },
  {
    id: 'derivative-rules',
    name: 'Derivatives to know',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[(\sin x)' = \cos x]], [[(\cos x)' = -\sin x]], [[(e^x)' = e^x]], [[(\ln x)' = \frac{1}{x}]]. Chain rule: multiply by the derivative of the inside, so [[(e^{kx})' = ke^{kx}]].`,
    make (r) {
      const k = r.int(2, 9);
      const made = r.pick([
        [T`f(x) = \sin ${k}x`, T`f'(0)`, int(k), T`[[f'(x) = ${k}\cos ${k}x]], and [[\cos 0 = 1]]`, 'sin'],
        [T`f(x) = e^{${k}x}`, T`f'(0)`, int(k), T`[[f'(x) = ${k}e^{${k}x}]], and [[e^0 = 1]]`, 'exp'],
        [T`f(x) = \ln x`, T`f'(${k})`, frac(1, k), T`[[f'(x) = \frac{1}{x}]]`, 'ln'],
        [T`f(x) = \cos ${k}x`, T`f'(0)`, int(0), T`[[f'(x) = -${k}\sin ${k}x]], and [[\sin 0 = 0]]`, 'cos'],
        [T`f(x) = \sqrt{x}`, T`f'(${k * k})`, frac(1, 2 * k), T`[[f'(x) = \frac{1}{2\sqrt{x}} = \frac{1}{2 \cdot ${k}}]]`, 'sqrt'],
        [T`f(x) = \frac{1}{x}`, T`f'(${k})`, frac(-1, k * k), T`[[f'(x) = -\frac{1}{x^2}]]`, 'reciprocal'],
        [T`f(x) = (x + ${k})^2`, T`f'(1)`, int(2 * (1 + k)), T`[[f'(x) = 2(x + ${k})]]`, 'square']
      ]);
      return { prompt: T`If [[${made[0]}]], what is [[${made[1]}]]?`, answer: made[2], steps: made[3], data: { kind: made[4], k } };
    }
  }
];
