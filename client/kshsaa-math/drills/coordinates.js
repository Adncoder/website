// The coordinate plane: slope, midpoint, distance, and intercepts.

import { frac, int, root } from '../exact.js';
import { T, paren } from '../tex.js';

const TOPIC = 'Coordinate geometry';

// two points with different x and different y
function twoPoints (r) {
  const [x1, y1] = [r.int(-9, 9), r.int(-9, 9)];
  let x2, y2;
  do { [x2, y2] = [r.int(-9, 9), r.int(-9, 9)]; } while (x2 === x1 || y2 === y1);
  return [x1, y1, x2, y2];
}

export default [
  {
    id: 'slope',
    name: 'Slope',
    topic: TOPIC,
    seconds: 30,
    hint: T`Rise over run: [[\frac{y_2 - y_1}{x_2 - x_1}]]. A perpendicular line has the negative reciprocal slope.`,
    make (r) {
      const [x1, y1, x2, y2] = twoPoints(r);
      const perpendicular = r.chance(0.3);
      return {
        prompt: perpendicular
          ? T`What is the slope of a line perpendicular to the line through [[(${x1}, ${y1})]] and [[(${x2}, ${y2})]]?`
          : T`What is the slope of the line through [[(${x1}, ${y1})]] and [[(${x2}, ${y2})]]?`,
        answer: perpendicular ? frac(x1 - x2, y2 - y1) : frac(y2 - y1, x2 - x1),
        steps: T`The slope is [[\frac{${y2} - ${paren(y1)}}{${x2} - ${paren(x1)}} = \frac{${y2 - y1}}{${x2 - x1}}]]${perpendicular ? '; flip it and change the sign.' : ''}`,
        data: { x1, y1, x2, y2, perpendicular }
      };
    }
  },
  {
    id: 'midpoint',
    name: 'Midpoint',
    topic: TOPIC,
    seconds: 30,
    hint: T`Average the x's and average the y's.`,
    make (r) {
      const [x1, y1, x2, y2] = twoPoints(r);
      return {
        prompt: T`What is the midpoint of the segment from [[(${x1}, ${y1})]] to [[(${x2}, ${y2})]]? Give it as (x, y).`,
        answer: { list: [frac(x1 + x2, 2), frac(y1 + y2, 2)], ordered: true },
        steps: T`[[\left(\frac{${x1 + x2}}{2}, \frac{${y1 + y2}}{2}\right)]]`,
        data: { x1, y1, x2, y2 }
      };
    }
  },
  {
    id: 'distance',
    name: 'Distance between points',
    topic: TOPIC,
    seconds: 30,
    hint: T`The Pythagorean theorem on the differences: [[\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}]].`,
    make (r) {
      const [x1, y1, x2, y2] = twoPoints(r);
      const [dx, dy] = [x2 - x1, y2 - y1];
      return {
        prompt: T`What is the distance between [[(${x1}, ${y1})]] and [[(${x2}, ${y2})]], in simplest radical form?`,
        answer: root(dx * dx + dy * dy),
        steps: T`[[\sqrt{${paren(dx)}^2 + ${paren(dy)}^2} = \sqrt{${dx * dx + dy * dy}}]]`,
        data: { x1, y1, x2, y2 }
      };
    }
  },
  {
    id: 'intercepts',
    name: 'Intercepts of a line',
    topic: TOPIC,
    seconds: 30,
    hint: T`For the x-intercept set y to 0; for the y-intercept set x to 0. In [[y = mx + b]] the y-intercept is b.`,
    make (r) {
      const [a, b, c] = [r.nonzero(-9, 9), r.nonzero(-9, 9), r.nonzero(-24, 24)];
      const x = r.chance(0.5);
      const line = T`${a === 1 ? '' : a === -1 ? '-' : a}x ${b < 0 ? '-' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}y = ${c}`;
      return {
        prompt: T`What is the ${x ? 'x' : 'y'}-intercept of the line [[${line}]]?`,
        answer: x ? frac(c, a) : frac(c, b),
        steps: x ? T`With [[y = 0]]: [[x = \frac{${c}}{${a}}]]` : T`With [[x = 0]]: [[y = \frac{${c}}{${b}}]]`,
        data: { a, b, c, x }
      };
    }
  },
  {
    id: 'line-through-points',
    name: 'Line through two points',
    topic: TOPIC,
    seconds: 45,
    hint: T`Find the slope m, then [[b = y_1 - m x_1]].`,
    make (r) {
      const [m, b] = [r.nonzero(-5, 5), r.int(-9, 9)];
      const x1 = r.nonzero(-4, 4);
      let x2;
      do { x2 = r.nonzero(-4, 4); } while (x2 === x1);
      return {
        prompt: T`A line passes through [[(${x1}, ${m * x1 + b})]] and [[(${x2}, ${m * x2 + b})]]. What is its y-intercept?`,
        answer: int(b),
        steps: T`The slope is ${m}, so [[b = ${m * x1 + b} - ${paren(m)} \cdot ${paren(x1)} = ${b}]]: the line is [[y = ${m === 1 ? '' : m === -1 ? '-' : m}x ${b < 0 ? '- ' + -b : '+ ' + b}]].`,
        data: { x1, y1: m * x1 + b, x2, y2: m * x2 + b }
      };
    }
  }
];
