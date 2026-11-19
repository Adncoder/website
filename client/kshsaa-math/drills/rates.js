// Rates: working together, distance and speed, levers, unit conversions, and
// interest.

import { frac, int } from '../exact.js';
import { T, group } from '../tex.js';

const TOPIC = 'Rates and conversions';

// [amount of this, is how many of that], every factor exact
const CONVERSIONS = [
  ['square feet', 'square inches', 144], ['square yards', 'square feet', 9], ['cubic feet', 'cubic inches', 1728], ['cubic yards', 'cubic feet', 27],
  ['miles', 'feet', 5280], ['yards', 'inches', 36], ['gallons', 'quarts', 4], ['gallons', 'pints', 8], ['gallons', 'cups', 16], ['quarts', 'cups', 4],
  ['pounds', 'ounces', 16], ['tons', 'pounds', 2000], ['hours', 'seconds', 3600], ['days', 'hours', 24], ['weeks', 'hours', 168],
  ['kilometers', 'meters', 1000], ['meters', 'centimeters', 100], ['square meters', 'square centimeters', 10000], ['liters', 'milliliters', 1000], ['dozen', 'items', 12], ['gross', 'items', 144]
];

export default [
  {
    id: 'work-rate',
    name: 'Working together',
    topic: TOPIC,
    seconds: 60,
    hint: T`Add the rates, not the times: [[\frac{1}{a} + \frac{1}{b} = \frac{1}{t}]], so [[t = \frac{ab}{a + b}]]. A drain works against the fill: [[t = \frac{ab}{b - a}]].`,
    make (r) {
      const [a, b] = r.pick([[2, 3], [3, 6], [4, 12], [2, 6], [6, 12], [3, 4], [4, 6], [5, 20], [10, 15], [6, 9], [8, 24], [12, 20], [2, 4], [3, 5], [4, 5], [6, 10], [20, 30], [10, 40]]);
      const kind = r.pick(['together', 'together', 'minutes', 'drain']);
      if (kind === 'drain') {
        return {
          prompt: T`A pipe fills a tank in ${a} hours and a drain empties it in ${b} hours. With both open, how many hours does it take to fill the empty tank?`,
          answer: frac(a * b, b - a),
          steps: T`[[\frac{1}{${a}} - \frac{1}{${b}} = \frac{${b - a}}{${a * b}}]] of the tank an hour, so [[\frac{${a * b}}{${b - a}}]] hours`,
          data: { a, b, kind }
        };
      }
      const [who, what] = r.pick([['One painter', 'paint a room'], ['One machine', 'fill an order'], ['One student', 'grade a stack of papers']]);
      return {
        prompt: T`${who} can ${what} in ${a} hours and another in ${b} hours. Working together, how many ${kind === 'minutes' ? 'minutes' : 'hours'} does it take them?`,
        answer: frac(a * b * (kind === 'minutes' ? 60 : 1), a + b),
        steps: T`[[\frac{${a} \cdot ${b}}{${a} + ${b}} = \frac{${a * b}}{${a + b}}]] hours${kind === 'minutes' ? ', times 60' : ''}`,
        data: { a, b, kind }
      };
    }
  },
  {
    id: 'distance-rate-time',
    name: 'Distance, rate, and time',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[d = rt]]. Two things closing on each other add their speeds; one chasing another closes at the difference.`,
    make (r) {
      const kind = r.pick(['time', 'meet', 'catch']);
      if (kind === 'time') {
        const rate = r.pick([30, 40, 48, 50, 60, 64, 70]);
        const d = rate * r.pick([2, 3, 4, 5, 6, 8]) + r.pick([0, rate / 2, rate / 2]);
        return {
          prompt: T`How many hours does it take to travel ${d} miles at ${rate} miles per hour?`,
          answer: frac(d, rate),
          steps: T`[[\frac{${d}}{${rate}}]]`,
          data: { kind, d, a: rate, b: 0 }
        };
      }
      const [a, b] = [5 * r.int(6, 13), 5 * r.int(3, 9)];
      if (kind === 'meet') {
        const hours = r.int(2, 6);
        const d = (a + b) * hours;
        return {
          prompt: T`Two trains ${d} miles apart head toward each other at ${a} and ${b} miles per hour. In how many hours do they meet?`,
          answer: int(hours),
          steps: T`They close at [[${a} + ${b} = ${a + b}]] miles per hour: [[\frac{${d}}{${a + b}} = ${hours}]]`,
          data: { kind, d, a, b }
        };
      }
      const [fast, slow] = a > b ? [a, b] : [b + 5, b];
      const hours = r.int(2, 6);
      const d = (fast - slow) * hours;
      return {
        prompt: T`A car going ${fast} miles per hour is ${d} miles behind a truck going ${slow} miles per hour. In how many hours does the car catch the truck?`,
        answer: int(hours),
        steps: T`The gap closes at [[${fast} - ${slow} = ${fast - slow}]] miles per hour: [[\frac{${d}}{${fast - slow}} = ${hours}]]`,
        data: { kind, d, a: fast, b: slow }
      };
    }
  },
  {
    id: 'lever',
    name: 'Balancing a lever',
    topic: TOPIC,
    seconds: 30,
    hint: T`Weight times distance from the fulcrum is the same on both sides: [[w_1 d_1 = w_2 d_2]].`,
    make (r) {
      const [w1, d1] = [10 * r.int(4, 12), r.int(2, 8)];
      const w2 = r.pick([40, 50, 60, 80, 100, 120].filter(w => w !== w1));
      return {
        prompt: T`How many feet from the fulcrum of a see-saw should a ${w2}-pound child sit to balance a ${w1}-pound child sitting ${d1} feet from it?`,
        answer: frac(w1 * d1, w2),
        steps: T`[[${w1} \cdot ${d1} = ${w2} \cdot d]], so [[d = \frac{${w1 * d1}}{${w2}}]]`,
        data: { w1, d1, w2 }
      };
    }
  },
  {
    id: 'unit-conversion',
    name: 'Unit conversions',
    topic: TOPIC,
    seconds: 30,
    hint: T`Square units convert with the factor squared and cubic units with it cubed: a square foot is [[12^2 = 144]] square inches, and a cubic yard is [[3^3 = 27]] cubic feet.`,
    make (r) {
      const [from, to, factor] = r.pick(CONVERSIONS);
      const n = r.int(2, 9);
      if (r.chance(0.3)) {
        return {
          prompt: T`How many ${from} are there in ${group(n * factor).replace(/\{,\}/g, ',')} ${to}?`,
          answer: int(n),
          steps: T`[[\frac{${group(n * factor)}}{${group(factor)}} = ${n}]]`,
          data: { factor, n, reverse: true }
        };
      }
      return {
        prompt: T`How many ${to} are there in ${n} ${from}?`,
        answer: int(n * factor),
        steps: T`[[${n} \cdot ${group(factor)} = ${group(n * factor)}]]`,
        data: { factor, n, reverse: false }
      };
    }
  },
  {
    id: 'interest',
    name: 'Simple interest',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[I = Prt]]: principal times the yearly rate, as a decimal, times the years.`,
    make (r) {
      const [principal, rate, years] = [100 * r.int(2, 50), r.int(2, 9), r.int(2, 6)];
      return {
        prompt: T`How much simple interest, in dollars, does $${group(principal).replace(/\{,\}/g, ',')} earn in ${years} years at ${rate}% a year?`,
        answer: int(principal * rate * years / 100),
        steps: T`[[${principal} \cdot ${rate / 100} \cdot ${years} = ${group(principal * rate * years / 100)}]]`,
        data: { principal, rate, years }
      };
    }
  },
  {
    id: 'proportion',
    name: 'Proportions',
    topic: TOPIC,
    seconds: 30,
    hint: T`Find the price of one, or set up [[\frac{a}{b} = \frac{c}{x}]] and cross-multiply.`,
    make (r) {
      const [count, each] = [r.int(2, 6), r.pick([1.5, 2.5, 3.5, 4.5, 5.5, 2.25, 3.75, 1.25])];
      const want = count * r.int(2, 6);
      return {
        prompt: T`If ${count} pies cost $${(count * each).toFixed(2)}, how many pies can be bought with $${(want * each).toFixed(2)}?`,
        answer: int(want),
        steps: T`Each costs $${each.toFixed(2)}, and [[\frac{${(want * each).toFixed(2)}}{${each.toFixed(2)}} = ${want}]]`,
        data: { count, each, want }
      };
    }
  }
];
