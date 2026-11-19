// Triangles: Pythagorean triples, the two special right triangles, Heron's
// formula, and the laws of sines and cosines.

import { exact, frac, int, over, root, times } from '../exact.js';
import { T } from '../tex.js';

const TOPIC = 'Triangles';

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41], [12, 35, 37]];
// sides with a whole-number area
const HERONIAN = [
  [3, 4, 5], [5, 5, 6], [5, 5, 8], [13, 14, 15], [5, 12, 13], [6, 8, 10], [7, 15, 20], [9, 10, 17], [10, 13, 13], [4, 13, 15],
  [8, 15, 17], [11, 13, 20], [12, 17, 25], [13, 20, 21], [10, 17, 21], [13, 13, 24], [15, 15, 18], [6, 25, 29], [17, 25, 28]
];
// [a, b, c, the angle opposite c]
const ANGLED = [[3, 8, 7, 60], [5, 8, 7, 60], [7, 15, 13, 60], [8, 15, 13, 60], [5, 21, 19, 60], [3, 5, 7, 120], [7, 8, 13, 120], [5, 16, 19, 120]];

/** sine of a multiple of 30 or 45 degrees from 30 to 150 */
export const SIN = { 30: frac(1, 2), 45: root(2, 1, 2), 60: root(3, 1, 2), 90: int(1), 120: root(3, 1, 2), 135: root(2, 1, 2), 150: frac(1, 2) };
const SIN_TEX = { 30: T`\frac{1}{2}`, 45: T`\frac{\sqrt{2}}{2}`, 60: T`\frac{\sqrt{3}}{2}`, 90: '1', 120: T`\frac{\sqrt{3}}{2}`, 135: T`\frac{\sqrt{2}}{2}`, 150: T`\frac{1}{2}` };
// -2 cos C, so that c^2 = a^2 + b^2 + (this) ab
const MINUS_TWO_COS = { 60: -1, 90: 0, 120: 1 };

export default [
  {
    id: 'pythagorean',
    name: 'Pythagorean theorem',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[a^2 + b^2 = c^2]]. Know the triples and their multiples: 3-4-5, 5-12-13, 8-15-17, 7-24-25, 20-21-29, 9-40-41.`,
    make (r) {
      if (r.chance(0.3)) {
        const [a, b] = [r.int(2, 9), r.int(2, 9)];
        return {
          prompt: T`The legs of a right triangle measure ${a} and ${b}. What is the length of the hypotenuse, in simplest radical form?`,
          answer: root(a * a + b * b),
          steps: T`[[\sqrt{${a}^2 + ${b}^2} = \sqrt{${a * a + b * b}}]]`,
          data: { a, b, c: null }
        };
      }
      const k = r.pick([1, 1, 2, 3]);
      const [a, b, c] = r.pick(TRIPLES).map(x => x * k);
      const hide = r.int(0, 2);
      if (hide === 2) {
        return { prompt: T`The legs of a right triangle measure ${a} and ${b}. What is the length of the hypotenuse?`, answer: int(c), steps: T`[[\sqrt{${a * a} + ${b * b}} = \sqrt{${c * c}} = ${c}]]`, data: { a, b, c: null } };
      }
      const [leg, other] = hide === 0 ? [b, a] : [a, b];
      return {
        prompt: T`A right triangle has a hypotenuse of ${c} and a leg of ${leg}. What is the length of the other leg?`,
        answer: int(other),
        steps: T`[[\sqrt{${c * c} - ${leg * leg}} = \sqrt{${other * other}} = ${other}]]`,
        data: { a: leg, b: null, c }
      };
    }
  },
  {
    id: 'special-30-60-90',
    name: '30-60-90 triangles',
    topic: TOPIC,
    seconds: 30,
    hint: T`Sides are in the ratio [[1 : \sqrt{3} : 2]]: short leg x (across from 30 degrees), long leg [[x\sqrt{3}]], hypotenuse 2x. Find the short leg first.`,
    make (r) {
      const x = r.int(1, 12);
      const names = { short: 'shorter leg', long: 'longer leg', hyp: 'hypotenuse' };
      const given = r.pick(['short', 'hyp', 'long']);
      const want = r.pick(Object.keys(names).filter(s => s !== given));
      // every side from the short leg; a whole-number long leg makes the
      // short leg x over radical 3
      const short = given === 'long' ? exact(x, 3, 3) : int(x);
      const sides = { short, long: times(short, root(3)), hyp: times(short, int(2)) };
      return {
        prompt: T`In a 30-60-90 triangle, the ${names[given]} measures ${given === 'hyp' ? 2 * x : x}. What is the length of the ${names[want]}, in simplest radical form?`,
        answer: sides[want],
        steps: given === 'long'
          ? T`The short leg is [[\frac{${x}}{\sqrt{3}} = \frac{${x}\sqrt{3}}{3}]], and the hypotenuse is twice that.`
          : T`The short leg is ${x}, the long leg [[${x}\sqrt{3}]], and the hypotenuse ${2 * x}.`,
        data: { x, given, want }
      };
    }
  },
  {
    id: 'special-45-45-90',
    name: '45-45-90 triangles',
    topic: TOPIC,
    seconds: 30,
    hint: T`Sides are in the ratio [[1 : 1 : \sqrt{2}]]. From a leg, multiply by [[\sqrt{2}]]; from the hypotenuse, divide by it: [[\frac{h}{\sqrt{2}} = \frac{h\sqrt{2}}{2}]].`,
    make (r) {
      const x = r.int(2, 14);
      if (r.chance(0.5)) {
        return {
          prompt: T`What is the length of the diagonal of a square with side ${x}, in simplest radical form?`,
          answer: root(2, x),
          steps: T`[[${x}\sqrt{2}]]`,
          data: { x, fromLeg: true }
        };
      }
      return {
        prompt: T`The hypotenuse of an isosceles right triangle measures ${x}. How long is each leg, in simplest radical form?`,
        answer: exact(x, 2, 2),
        steps: T`[[\frac{${x}}{\sqrt{2}} = \frac{${x}\sqrt{2}}{2}]]`,
        data: { x, fromLeg: false }
      };
    }
  },
  {
    id: 'equilateral',
    name: 'Equilateral triangles',
    topic: TOPIC,
    seconds: 30,
    hint: T`Area [[\frac{\sqrt{3}}{4}s^2]], altitude [[\frac{\sqrt{3}}{2}s]]: the altitude splits it into two 30-60-90 triangles.`,
    make (r) {
      const s = r.int(2, 14);
      if (r.chance(0.65)) {
        return {
          prompt: T`What is the area of an equilateral triangle with side ${s}, in simplest radical form?`,
          answer: exact(s * s, 4, 3),
          steps: T`[[\frac{\sqrt{3}}{4} \cdot ${s}^2 = \frac{${s * s}\sqrt{3}}{4}]]`,
          data: { s, area: true }
        };
      }
      return {
        prompt: T`What is the altitude of an equilateral triangle with side ${s}, in simplest radical form?`,
        answer: exact(s, 2, 3),
        steps: T`[[\frac{\sqrt{3}}{2} \cdot ${s} = \frac{${s}\sqrt{3}}{2}]]`,
        data: { s, area: false }
      };
    }
  },
  {
    id: 'heron',
    name: "Heron's formula",
    topic: TOPIC,
    seconds: 60,
    hint: T`With half the perimeter [[s = \frac{a+b+c}{2}]], the area is [[\sqrt{s(s-a)(s-b)(s-c)}]].`,
    make (r) {
      const [a, b, c] = r.shuffle(r.pick(HERONIAN));
      const s = (a + b + c) / 2;
      const under = s * (s - a) * (s - b) * (s - c);
      return {
        prompt: T`What is the area of a triangle with sides ${a}, ${b}, and ${c}?`,
        answer: root(under),
        steps: T`[[s = ${s}]], so [[\sqrt{${s} \cdot ${s - a} \cdot ${s - b} \cdot ${s - c}} = \sqrt{${under}}]]`,
        data: { a, b, c }
      };
    }
  },
  {
    id: 'law-of-cosines',
    name: 'Law of cosines',
    topic: TOPIC,
    seconds: 60,
    hint: T`[[c^2 = a^2 + b^2 - 2ab\cos C]]. With [[C = 60^\circ]] that is [[a^2 + b^2 - ab]]; with [[120^\circ]], [[a^2 + b^2 + ab]]. Turned around: [[\cos C = \frac{a^2 + b^2 - c^2}{2ab}]].`,
    make (r) {
      if (r.chance(0.3)) {
        const [a, b, c, angle] = r.pick(ANGLED);
        return {
          prompt: T`A triangle has sides ${a}, ${b}, and ${c}. What is the measure, in degrees, of the angle opposite the side of length ${c}?`,
          answer: int(angle),
          unit: '°',
          steps: T`[[\cos C = \frac{${a * a} + ${b * b} - ${c * c}}{2 \cdot ${a} \cdot ${b}} = ${angle === 60 ? T`\frac{1}{2}` : T`-\frac{1}{2}`}]], so [[C = ${angle}^\circ]]`,
          data: { a, b, c, angle, findAngle: true }
        };
      }
      let [a, b, angle] = [r.int(2, 10), r.int(2, 10), r.pick([60, 60, 120, 120, 90])];
      if (r.chance(0.5)) [a, b, , angle] = r.pick(ANGLED);
      const square = a * a + b * b + MINUS_TWO_COS[angle] * a * b;
      return {
        prompt: T`Two sides of a triangle measure ${a} and ${b}, and the angle between them is ${angle} degrees. How long is the third side, in simplest radical form?`,
        answer: root(square),
        steps: T`[[c^2 = ${a * a} + ${b * b} ${angle === 90 ? '' : (angle === 60 ? '- ' : '+ ') + a * b} = ${square}]], so [[c = \sqrt{${square}}]]`,
        data: { a, b, angle, findAngle: false }
      };
    }
  },
  {
    id: 'law-of-sines',
    name: 'Law of sines',
    topic: TOPIC,
    seconds: 60,
    hint: T`[[\frac{a}{\sin A} = \frac{b}{\sin B} = \frac{c}{\sin C}]]: each side over the sine of the angle across from it.`,
    make (r) {
      const A = r.pick([30, 45, 60, 30, 45]);
      const B = r.pick([30, 45, 60, 90, 120].filter(x => x !== A && x + A < 180));
      const a = r.int(2, 12);
      return {
        prompt: T`In triangle ABC, angle A measures ${A} degrees, angle B measures ${B} degrees, and side a, opposite A, is ${a}. How long is side b, in simplest radical form?`,
        answer: over(times(int(a), SIN[B]), SIN[A]),
        steps: T`[[b = \frac{a \sin B}{\sin A} = ${a} \cdot ${SIN_TEX[B]} \div ${SIN_TEX[A]}]]`,
        data: { A, B, a }
      };
    }
  },
  {
    id: 'triangle-area-sas',
    name: 'Area from two sides and the angle',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[\text{Area} = \frac{1}{2}ab\sin C]], with C the angle between the two sides.`,
    make (r) {
      const [a, b] = [r.int(2, 12), r.int(2, 12)];
      const C = r.pick([30, 45, 60, 90, 120, 150]);
      return {
        prompt: T`Two sides of a triangle measure ${a} and ${b}, and the angle between them is ${C} degrees. What is the area of the triangle?`,
        answer: times(frac(a * b, 2), SIN[C]),
        steps: T`[[\frac{1}{2} \cdot ${a} \cdot ${b} \cdot ${SIN_TEX[C]}]]`,
        data: { a, b, C }
      };
    }
  },
  {
    id: 'altitude-hypotenuse',
    name: 'Altitude to the hypotenuse',
    topic: TOPIC,
    seconds: 30,
    hint: T`The altitude from the right angle is the geometric mean of the two pieces it cuts the hypotenuse into: [[h = \sqrt{pq}]].`,
    make (r) {
      const [p, q] = r.pick([[3, 27], [4, 9], [2, 8], [4, 16], [1, 9], [3, 12], [5, 20], [2, 18], [9, 16], [4, 25], [2, 6], [3, 6], [5, 10], [4, 12]]);
      return {
        prompt: T`The altitude from the right angle of a right triangle cuts the hypotenuse into pieces measuring ${p} and ${q}. How long is the altitude?`,
        answer: root(p * q),
        steps: T`[[\sqrt{${p} \cdot ${q}} = \sqrt{${p * q}}]]`,
        data: { p, q }
      };
    }
  },
  {
    id: 'triangle-inequality',
    name: 'Triangle inequality',
    topic: TOPIC,
    seconds: 30,
    hint: T`The third side is more than the difference of the other two and less than their sum.`,
    make (r) {
      const a = r.int(2, 9);
      const b = a + r.int(0, 8);
      return {
        prompt: T`Two sides of a triangle measure ${a} and ${b}. How many whole-number lengths are possible for the third side?`,
        answer: int(2 * a - 1),
        steps: T`It lies strictly between [[${b} - ${a} = ${b - a}]] and [[${b} + ${a} = ${a + b}]]: from ${b - a + 1} through ${a + b - 1}, which is ${2 * a - 1} values.`,
        data: { a, b }
      };
    }
  },
  {
    id: 'triangle-angles',
    name: 'Angles of a triangle',
    topic: TOPIC,
    seconds: 30,
    hint: T`The angles add to 180 degrees, and the base angles of an isosceles triangle are equal.`,
    make (r) {
      const base = r.int(20, 80);
      if (r.chance(0.5)) {
        return {
          prompt: T`In an isosceles triangle, one base angle measures ${base} degrees. What is the measure of the vertex angle?`,
          answer: int(180 - 2 * base),
          unit: '°',
          steps: T`[[180 - 2 \cdot ${base} = ${180 - 2 * base}]]`,
          data: { base, vertex: true }
        };
      }
      const vertex = 2 * r.int(10, 70);
      return {
        prompt: T`The vertex angle of an isosceles triangle measures ${vertex} degrees. What is the measure of each base angle?`,
        answer: int((180 - vertex) / 2),
        unit: '°',
        steps: T`[[\frac{180 - ${vertex}}{2} = ${(180 - vertex) / 2}]]`,
        data: { base: vertex, vertex: false }
      };
    }
  }
];
