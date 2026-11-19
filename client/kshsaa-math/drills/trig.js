// Trigonometry: the unit circle, reference angles, and right-triangle
// identities.

import { frac, int, over, pi, root, times } from '../exact.js';
import { T, radiansTex } from '../tex.js';

const TOPIC = 'Trigonometry';

const FIRST = { sin: { 0: int(0), 30: frac(1, 2), 45: root(2, 1, 2), 60: root(3, 1, 2), 90: int(1) } };
const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]];

/** The acute angle a makes with the x-axis. */
export function referenceAngle (degrees) {
  const a = ((degrees % 180) + 180) % 180;
  return a > 90 ? 180 - a : a;
}

/**
 * The exact value of sin, cos, or tan at a multiple of 30 or 45 degrees, or
 * null where tangent is undefined.
 * @param {'sin'|'cos'|'tan'} fn
 * @param {number} degrees
 * @returns {?import('../exact.js').Exact}
 */
export function trigValue (fn, degrees) {
  const a = ((degrees % 360) + 360) % 360;
  const ref = referenceAngle(a);
  const sin = times(FIRST.sin[ref], int(a > 180 ? -1 : 1));
  const cos = times(FIRST.sin[90 - ref], int(a > 90 && a < 270 ? -1 : 1));
  if (fn === 'sin') return sin;
  if (fn === 'cos') return cos;
  return cos.n === 0 ? null : over(sin, cos);
}

const NAMES = { sin: T`\sin`, cos: T`\cos`, tan: T`\tan` };

export default [
  {
    id: 'unit-circle',
    name: 'Unit circle values',
    topic: TOPIC,
    seconds: 30,
    hint: T`Sine of 0, 30, 45, 60, 90 degrees is [[\frac{\sqrt{0}}{2}, \frac{\sqrt{1}}{2}, \frac{\sqrt{2}}{2}, \frac{\sqrt{3}}{2}, \frac{\sqrt{4}}{2}]]; cosine runs the other way. Past 90 degrees use the reference angle, with the sign from the quadrant: All, Sine, Tangent, Cosine positive in quadrants I to IV.`,
    make (r) {
      const fn = r.pick(['sin', 'cos', 'tan']);
      let degrees;
      do { degrees = r.pick([30, 45]) * r.int(0, 12); } while (degrees > 360 || trigValue(fn, degrees) === null);
      const radians = r.chance(0.4);
      return {
        prompt: T`What is [[${NAMES[fn]} ${radians ? (degrees === 0 ? '0' : radiansTex(degrees)) : degrees + T`^\circ`}]]?`,
        answer: trigValue(fn, degrees),
        steps: T`${radians ? T`That is ${degrees} degrees. ` : ''}The reference angle is ${referenceAngle(degrees)} degrees${degrees % 90 === 0 ? '' : ', in quadrant ' + ['I', 'II', 'III', 'IV'][Math.floor(degrees / 90) % 4]}.`,
        data: { fn, degrees }
      };
    }
  },
  {
    id: 'reference-angle',
    name: 'Reference angles',
    topic: TOPIC,
    seconds: 30,
    hint: T`The acute angle to the x-axis. Take off whole turns of 360 first, then measure to 180 or 360, whichever is closer.`,
    make (r) {
      let degrees;
      do { degrees = r.int(95, 720); } while (degrees % 90 === 0);
      return {
        prompt: T`What is the reference angle, in degrees, for an angle of ${degrees} degrees in standard position?`,
        answer: int(referenceAngle(degrees)),
        unit: '°',
        steps: T`${degrees >= 360 ? T`[[${degrees} - 360 = ${degrees - 360}]], and its ` : 'Its '}distance to the x-axis is ${referenceAngle(degrees)} degrees.`,
        data: { degrees }
      };
    }
  },
  {
    id: 'trig-triangle',
    name: 'One trig value from another',
    topic: TOPIC,
    seconds: 45,
    hint: T`Draw the right triangle: [[\sin = \frac{\text{opp}}{\text{hyp}}]], [[\cos = \frac{\text{adj}}{\text{hyp}}]], [[\tan = \frac{\text{opp}}{\text{adj}}]]. Find the missing side with a Pythagorean triple, then fix the sign from the quadrant.`,
    make (r) {
      const [a, b, c] = r.pick(TRIPLES);
      const [opp, adj] = r.chance(0.5) ? [a, b] : [b, a];
      const quadrant = r.pick([1, 1, 2, 3, 4]);
      const signs = { 1: [1, 1], 2: [1, -1], 3: [-1, -1], 4: [-1, 1] }[quadrant];
      const values = { sin: frac(signs[0] * opp, c), cos: frac(signs[1] * adj, c), tan: frac(signs[0] * signs[1] * opp, adj) };
      const given = r.pick(['sin', 'cos', 'tan']);
      const want = r.pick(['sin', 'cos', 'tan'].filter(f => f !== given));
      const show = v => (v.n < 0 ? '-' : '') + T`\frac{${Math.abs(v.n)}}{${v.d}}`;
      if (quadrant === 1 && given !== 'tan' && r.chance(0.5)) {
        return {
          prompt: T`What is [[${NAMES[want]}\left(${given === 'sin' ? T`\sin^{-1}` : T`\cos^{-1}`} ${show(values[given])}\right)]]?`,
          answer: values[want],
          steps: T`A ${a}-${b}-${c} right triangle: opposite ${opp}, adjacent ${adj}, hypotenuse ${c}.`,
          data: { opp, adj, c, quadrant, want }
        };
      }
      return {
        prompt: T`If [[${NAMES[given]}\theta = ${show(values[given])}]] and [[\theta]] is in quadrant ${['', 'I', 'II', 'III', 'IV'][quadrant]}, what is [[${NAMES[want]}\theta]]?`,
        answer: values[want],
        steps: T`A ${a}-${b}-${c} right triangle: opposite ${opp}, adjacent ${adj}, hypotenuse ${c}, with the signs of quadrant ${['', 'I', 'II', 'III', 'IV'][quadrant]}.`,
        data: { opp, adj, c, quadrant, want }
      };
    }
  },
  {
    id: 'period-amplitude',
    name: 'Period and amplitude',
    topic: TOPIC,
    seconds: 30,
    hint: T`For [[y = a\sin(bx)]] or [[y = a\cos(bx)]] the amplitude is [[|a|]] and the period is [[\frac{2\pi}{b}]]. Tangent's period is [[\frac{\pi}{b}]].`,
    make (r) {
      const [a, b] = [r.nonzero(-6, 6), r.int(2, 8)];
      const fn = r.pick(['sin', 'cos', 'tan']);
      const amplitude = fn !== 'tan' && r.chance(0.4);
      const written = T`y = ${a === 1 ? '' : a === -1 ? '-' : a}${NAMES[fn]}(${b}x)`;
      if (amplitude) return { prompt: T`What is the amplitude of [[${written}]]?`, answer: int(Math.abs(a)), steps: T`[[|${a}| = ${Math.abs(a)}]]`, data: { a, b, fn, amplitude } };
      return {
        prompt: T`In terms of pi, what is the period of [[${written}]]?`,
        answer: pi(fn === 'tan' ? 1 : 2, b),
        steps: fn === 'tan' ? T`[[\frac{\pi}{${b}}]]` : T`[[\frac{2\pi}{${b}}]]`,
        data: { a, b, fn, amplitude }
      };
    }
  },
  {
    id: 'angle-sum-identities',
    name: 'Sum and half-angle values',
    topic: TOPIC,
    seconds: 60,
    hint: T`[[\sin(A \pm B) = \sin A\cos B \pm \cos A\sin B]] and [[\cos(A \pm B) = \cos A\cos B \mp \sin A\sin B]]. The ones worth knowing cold: [[\sin 15^\circ = \cos 75^\circ = \frac{\sqrt{6} - \sqrt{2}}{4}]] and [[\sin 75^\circ = \cos 15^\circ = \frac{\sqrt{6} + \sqrt{2}}{4}]]. Products are easier: [[\sin x\cos x = \frac{1}{2}\sin 2x]].`,
    make (r) {
      // sin x cos x and cos^2 - sin^2 at angles whose double is on the unit circle
      const degrees = r.pick([15, 22.5, 75, 105, 165]);
      if (r.chance(0.5)) {
        return {
          prompt: T`What is [[\sin ${degrees}^\circ \cos ${degrees}^\circ]]?`,
          answer: times(frac(1, 2), trigValue('sin', 2 * degrees)),
          steps: T`[[\sin x\cos x = \frac{1}{2}\sin 2x = \frac{1}{2}\sin ${2 * degrees}^\circ]]`,
          data: { degrees, kind: 'product' }
        };
      }
      return {
        prompt: T`What is [[\cos^2 ${degrees}^\circ - \sin^2 ${degrees}^\circ]]?`,
        answer: trigValue('cos', 2 * degrees),
        steps: T`[[\cos^2 x - \sin^2 x = \cos 2x = \cos ${2 * degrees}^\circ]]`,
        data: { degrees, kind: 'difference' }
      };
    }
  }
];
