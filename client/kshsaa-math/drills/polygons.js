// Polygons: diagonals, angle sums, regular polygons, and the area formulas
// for four-sided figures.

import { exact, frac, int } from '../exact.js';
import { T } from '../tex.js';

const TOPIC = 'Polygons';

export const POLYGON_NAMES = {
  3: 'triangle', 4: 'quadrilateral', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 11: 'hendecagon', 12: 'dodecagon', 15: 'pentadecagon', 20: 'icosagon'
};
const NAMED = Object.keys(POLYGON_NAMES).map(Number);
const named = n => (POLYGON_NAMES[n] ? (/^[aeio]/.test(POLYGON_NAMES[n]) ? 'an ' : 'a ') + POLYGON_NAMES[n] : 'a polygon with ' + n + ' sides');

export default [
  {
    id: 'diagonals',
    name: 'Diagonals of a polygon',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[\frac{n(n-3)}{2}]]: each of the n vertices connects to all but itself and its two neighbors, and every diagonal is counted from both ends.`,
    make (r) {
      const n = r.chance(0.6) ? r.pick(NAMED.filter(x => x > 3)) : r.int(5, 25);
      const value = n * (n - 3) / 2;
      if (r.chance(0.25)) {
        return {
          prompt: T`A polygon has ${value} diagonals. How many sides does it have?`,
          answer: int(n),
          steps: T`[[\frac{n(n-3)}{2} = ${value}]] gives [[n(n-3) = ${2 * value} = ${n} \cdot ${n - 3}]], so [[n = ${n}]]`,
          data: { n, inverse: true }
        };
      }
      return {
        prompt: T`How many diagonals does ${named(n)} have?`,
        answer: int(value),
        steps: T`[[\frac{${n}(${n} - 3)}{2} = \frac{${n} \cdot ${n - 3}}{2} = ${value}]]`,
        data: { n, inverse: false }
      };
    }
  },
  {
    id: 'angle-sum',
    name: 'Sum of interior angles',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[(n-2) \cdot 180^\circ]]: a polygon cuts into n - 2 triangles.`,
    make (r) {
      const n = r.chance(0.7) ? r.pick(NAMED) : r.int(5, 22);
      return {
        prompt: T`What is the sum of the interior angles of ${named(n)}, in degrees?`,
        answer: int((n - 2) * 180),
        unit: '°',
        steps: T`[[(${n} - 2) \cdot 180 = ${(n - 2) * 180}]]`,
        data: { n }
      };
    }
  },
  {
    id: 'interior-angle',
    name: 'Each angle of a regular polygon',
    topic: TOPIC,
    seconds: 30,
    hint: T`Each exterior angle is [[\frac{360^\circ}{n}]], and the interior angle is 180 minus that: [[\frac{(n-2) \cdot 180^\circ}{n}]].`,
    make (r) {
      const n = r.pick([3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40]);
      const interior = 180 - 360 / n;
      if (r.chance(0.35)) {
        return {
          prompt: T`Each interior angle of a regular polygon measures ${interior} degrees. How many sides does it have?`,
          answer: int(n),
          steps: T`The exterior angle is [[180 - ${interior} = ${360 / n}]], and [[\frac{360}{${360 / n}} = ${n}]]`,
          data: { n, inverse: true }
        };
      }
      return {
        prompt: T`What is the measure of each interior angle of a regular ${POLYGON_NAMES[n] || n + '-gon'}, in degrees?`,
        answer: exact(180 * n - 360, n),
        unit: '°',
        steps: T`[[180 - \frac{360}{${n}} = ${interior}]]`,
        data: { n, inverse: false }
      };
    }
  },
  {
    id: 'exterior-angle',
    name: 'Exterior angles',
    topic: TOPIC,
    seconds: 30,
    hint: T`The exterior angles of any convex polygon add up to 360 degrees, so each one in a regular polygon is [[\frac{360^\circ}{n}]].`,
    make (r) {
      const n = r.pick([3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40, 45]);
      if (r.chance(0.4)) {
        return {
          prompt: T`Each exterior angle of a regular polygon measures ${360 / n} degrees. How many sides does it have?`,
          answer: int(n),
          steps: T`[[\frac{360}{${360 / n}} = ${n}]]`,
          data: { n, inverse: true }
        };
      }
      return {
        prompt: T`What is the measure of each exterior angle of a regular ${POLYGON_NAMES[n] || n + '-gon'}, in degrees?`,
        answer: frac(360, n),
        unit: '°',
        steps: T`[[\frac{360}{${n}} = ${360 / n}]]`,
        data: { n, inverse: false }
      };
    }
  },
  {
    id: 'polygon-names',
    name: 'Names of polygons',
    topic: TOPIC,
    seconds: 10,
    hint: T`Hepta 7, octa 8, nona 9, deca 10, hendeca 11, dodeca 12, pentadeca 15, icosa 20.`,
    make (r) {
      const n = r.pick(NAMED.filter(x => x >= 5));
      return {
        prompt: T`How many sides does ${named(n)} have?`,
        answer: int(n),
        steps: T`${POLYGON_NAMES[n]}: ${n} sides.`,
        data: { n }
      };
    }
  },
  {
    id: 'quadrilateral-area',
    name: 'Areas of four-sided figures',
    topic: TOPIC,
    seconds: 30,
    hint: T`Trapezoid: [[\frac{(b_1 + b_2)h}{2}]]. Rhombus or kite: [[\frac{d_1 d_2}{2}]]. Parallelogram: base times height, never base times the slanted side.`,
    make (r) {
      const kind = r.pick(['trapezoid', 'trapezoid', 'rhombus', 'kite', 'parallelogram']);
      if (kind === 'trapezoid') {
        const [a, b, h] = [r.int(3, 20), r.int(3, 20), r.int(2, 12)];
        return {
          prompt: T`Find the area of a trapezoid with bases ${a} and ${b} and height ${h}.`,
          answer: frac((a + b) * h, 2),
          steps: T`[[\frac{(${a} + ${b}) \cdot ${h}}{2} = \frac{${(a + b) * h}}{2}]]`,
          data: { kind, a, b, h }
        };
      }
      if (kind === 'parallelogram') {
        const [b, h, side] = [r.int(4, 15), r.int(3, 12), r.int(13, 20)];
        return {
          prompt: T`A parallelogram has base ${b}, height ${h}, and slanted side ${side}. What is its area?`,
          answer: int(b * h),
          steps: T`Base times height: [[${b} \cdot ${h} = ${b * h}]]. The side length is not needed.`,
          data: { kind, a: b, b: h, h: side }
        };
      }
      const [d1, d2] = [r.int(4, 20), r.int(4, 20)];
      return {
        prompt: T`The diagonals of a ${kind} measure ${d1} and ${d2}. What is its area?`,
        answer: frac(d1 * d2, 2),
        steps: T`[[\frac{${d1} \cdot ${d2}}{2} = \frac{${d1 * d2}}{2}]]`,
        data: { kind, a: d1, b: d2, h: null }
      };
    }
  },
  {
    id: 'hexagon-area',
    name: 'Area of a regular hexagon',
    topic: TOPIC,
    seconds: 45,
    hint: T`Six equilateral triangles: [[6 \cdot \frac{\sqrt{3}}{4}s^2 = \frac{3\sqrt{3}}{2}s^2]].`,
    make (r) {
      const s = r.int(2, 12);
      return {
        prompt: T`What is the area of a regular hexagon with side length ${s}, in simplest radical form?`,
        answer: exact(3 * s * s, 2, 3),
        steps: T`[[\frac{3\sqrt{3}}{2} \cdot ${s}^2 = \frac{${3 * s * s}\sqrt{3}}{2}]]`,
        data: { s }
      };
    }
  }
];
