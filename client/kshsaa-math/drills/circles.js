// Circles: arcs and sectors, radians, inscribed angles, chords, and the
// equation of a circle.

import { frac, int, pi, root } from '../exact.js';
import { T, radiansTex } from '../tex.js';

const TOPIC = 'Circles';

const ANGLES = [30, 36, 40, 45, 60, 72, 90, 120, 135, 150, 180, 210, 240, 270, 300];

export default [
  {
    id: 'arc-length',
    name: 'Arc length',
    topic: TOPIC,
    seconds: 30,
    hint: T`The same fraction of the circumference as the angle is of 360 degrees: [[\frac{\theta}{360} \cdot 2\pi r]]. In radians it is just [[r\theta]].`,
    make (r) {
      const angle = r.pick(ANGLES);
      const radius = r.int(2, 12);
      return {
        prompt: T`In terms of pi, what is the length of an arc with a central angle of ${angle} degrees in a circle of radius ${radius}?`,
        answer: pi(angle * radius, 180),
        steps: T`[[\frac{${angle}}{360} \cdot 2\pi \cdot ${radius}]]`,
        data: { angle, radius }
      };
    }
  },
  {
    id: 'sector-area',
    name: 'Area of a sector',
    topic: TOPIC,
    seconds: 45,
    hint: T`The same fraction of the circle's area: [[\frac{\theta}{360} \cdot \pi r^2]]. In radians, [[\frac{1}{2}r^2\theta]].`,
    make (r) {
      const angle = r.pick(ANGLES);
      const radius = r.int(2, 12);
      return {
        prompt: T`In terms of pi, what is the area of a sector with a central angle of ${angle} degrees and a radius of ${radius}?`,
        answer: pi(angle * radius * radius, 360),
        steps: T`[[\frac{${angle}}{360} \cdot \pi \cdot ${radius}^2 = \frac{${angle}}{360} \cdot ${radius * radius}\pi]]`,
        data: { angle, radius }
      };
    }
  },
  {
    id: 'circle-measures',
    name: 'Circumference and area',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[C = 2\pi r]] and [[A = \pi r^2]]. Going from one to the other, find the radius first.`,
    make (r) {
      const radius = r.int(2, 15);
      if (r.chance(0.5)) {
        return {
          prompt: T`In terms of pi, find the circumference of a circle that has an area of [[${radius * radius}\pi]].`,
          answer: pi(2 * radius),
          steps: T`[[r^2 = ${radius * radius}]], so [[r = ${radius}]] and [[C = 2\pi \cdot ${radius} = ${2 * radius}\pi]]`,
          data: { radius, toArea: false }
        };
      }
      return {
        prompt: T`In terms of pi, find the area of a circle that has a circumference of [[${2 * radius}\pi]].`,
        answer: pi(radius * radius),
        steps: T`[[2\pi r = ${2 * radius}\pi]], so [[r = ${radius}]] and [[A = ${radius * radius}\pi]]`,
        data: { radius, toArea: true }
      };
    }
  },
  {
    id: 'radians',
    name: 'Radians and degrees',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[\pi \text{ radians} = 180^\circ]]. To degrees, replace pi with 180; to radians, multiply by [[\frac{\pi}{180}]].`,
    make (r) {
      const degrees = 15 * r.int(1, 24);
      if (r.chance(0.5)) {
        return {
          prompt: T`How many degrees is [[${radiansTex(degrees)}]] radians?`,
          answer: int(degrees),
          unit: '°',
          steps: T`[[${radiansTex(degrees)} \cdot \frac{180}{\pi} = ${degrees}]]`,
          data: { degrees, toDegrees: true }
        };
      }
      return {
        prompt: T`In terms of pi, how many radians is ${degrees} degrees?`,
        answer: pi(degrees, 180),
        steps: T`[[${degrees} \cdot \frac{\pi}{180} = ${radiansTex(degrees)}]]`,
        data: { degrees, toDegrees: false }
      };
    }
  },
  {
    id: 'inscribed-angle',
    name: 'Inscribed angles',
    topic: TOPIC,
    seconds: 30,
    hint: T`An inscribed angle is half its arc; a central angle equals its arc. An angle inscribed in a semicircle is a right angle.`,
    make (r) {
      const arc = 2 * r.int(10, 85);
      if (r.chance(0.5)) {
        return {
          prompt: T`An inscribed angle intercepts an arc of ${arc} degrees. What is the measure of the angle?`,
          answer: int(arc / 2),
          unit: '°',
          steps: T`Half the arc: [[\frac{${arc}}{2} = ${arc / 2}]]`,
          data: { arc, findAngle: true }
        };
      }
      return {
        prompt: T`An inscribed angle measures ${arc / 2} degrees. What is the measure of the arc it intercepts?`,
        answer: int(arc),
        unit: '°',
        steps: T`Twice the angle: [[2 \cdot ${arc / 2} = ${arc}]]`,
        data: { arc, findAngle: false }
      };
    }
  },
  {
    id: 'intersecting-chords',
    name: 'Intersecting chords',
    topic: TOPIC,
    seconds: 45,
    hint: T`When two chords cross, the products of their pieces are equal: [[a \cdot b = c \cdot d]].`,
    make (r) {
      const c = r.int(2, 9);
      const d = r.int(2, 9);
      const a = r.pick([1, 2, 3, 4, 6].filter(x => (c * d) % x === 0 && x !== c));
      const b = c * d / a;
      return {
        prompt: T`Two chords cross inside a circle. One is cut into pieces of ${a} and ${b}; the other has one piece of ${c}. How long is its other piece?`,
        answer: frac(a * b, c),
        steps: T`[[${a} \cdot ${b} = ${c} \cdot d]], so [[d = \frac{${a * b}}{${c}} = ${d}]]`,
        data: { a, b, c }
      };
    }
  },
  {
    id: 'circle-equation',
    name: 'Equation of a circle',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[(x - h)^2 + (y - k)^2 = r^2]] has center (h, k), with the signs flipped from what is written, and the right side is the radius squared.`,
    make (r) {
      const [h, k] = [r.nonzero(-9, 9), r.nonzero(-9, 9)];
      const square = r.pick([4, 9, 16, 25, 36, 49, 64, 81, 100, 8, 12, 18, 20, 50]);
      const equation = T`(x ${h < 0 ? '+ ' + -h : '- ' + h})^2 + (y ${k < 0 ? '+ ' + -k : '- ' + k})^2 = ${square}`;
      if (r.chance(0.5)) {
        return {
          prompt: T`What is the radius of the circle [[${equation}]], in simplest radical form?`,
          answer: root(square),
          steps: T`[[r^2 = ${square}]], so [[r = \sqrt{${square}}]]`,
          data: { h, k, square, radius: true }
        };
      }
      return {
        prompt: T`What is the center of the circle [[${equation}]]? Give it as (x, y).`,
        answer: { list: [int(h), int(k)], ordered: true },
        steps: T`The center is [[(${h}, ${k})]]: the signs flip.`,
        data: { h, k, square, radius: false }
      };
    }
  },
  {
    id: 'circle-tangent-slope',
    name: 'Tangent to a circle',
    topic: TOPIC,
    seconds: 30,
    hint: T`A tangent is perpendicular to the radius to that point. For a circle centered at the origin the radius to (a, b) has slope [[\frac{b}{a}]], so the tangent has slope [[-\frac{a}{b}]].`,
    make (r) {
      const [a, b] = [r.nonzero(-9, 9), r.nonzero(-9, 9)];
      return {
        prompt: T`A circle centered at the origin passes through [[(${a}, ${b})]]. What is the slope of the line tangent to the circle at that point?`,
        answer: frac(-a, b),
        steps: T`The radius has slope [[\frac{${b}}{${a}}]]; the tangent is the negative reciprocal, [[-\frac{${a}}{${b}}]].`,
        data: { a, b }
      };
    }
  }
];
