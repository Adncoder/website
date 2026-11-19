// Number theory and notation: other bases, Roman numerals, divisors, and
// repeating decimals.

import { frac, int } from '../exact.js';
import { T, gcd, group } from '../tex.js';

const TOPIC = 'Numbers';

const BASE_NAMES = { 2: 'two', 3: 'three', 5: 'five', 8: 'eight', 16: 'sixteen' };
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];

/** A whole number from 1 to 3999 as a Roman numeral. */
export function toRoman (n) {
  let out = '';
  for (const [value, letters] of ROMAN) while (n >= value) { out += letters; n -= value; }
  return out;
}

/** How many positive divisors n has. */
export function divisorCount (n) {
  let count = 1;
  for (let p = 2; p * p <= n; p++) {
    let e = 0;
    while (n % p === 0) { n /= p; e++; }
    count *= e + 1;
  }
  return n > 1 ? count * 2 : count;
}

function factored (n) {
  const parts = [];
  for (let p = 2; p * p <= n; p++) {
    let e = 0;
    while (n % p === 0) { n /= p; e++; }
    if (e) parts.push(p + (e > 1 ? '^{' + e + '}' : ''));
  }
  if (n > 1) parts.push(String(n));
  return parts.join(T` \cdot `);
}

export default [
  {
    id: 'base-to-ten',
    name: 'From another base',
    topic: TOPIC,
    seconds: 45,
    hint: T`Each place is a power of the base. In base two the places are 1, 2, 4, 8, 16, 32, 64, 128 from the right; in base sixteen, A through F are 10 through 15.`,
    make (r) {
      const base = r.pick([2, 2, 2, 8, 16, 5, 3]);
      const n = r.int(base === 2 ? 9 : 20, base === 2 ? 127 : base === 16 ? 255 : 200);
      const written = n.toString(base).toUpperCase();
      return {
        prompt: T`What is the base-${BASE_NAMES[base]} number [[${written}_{${base}}]] in base ten?`,
        answer: int(n),
        steps: T`[[${written.split('').map((d, i) => parseInt(d, base) + T` \cdot ${base}^{${written.length - 1 - i}}`).filter(t => !t.startsWith('0 ')).join(' + ')} = ${n}]]`,
        data: { base, written }
      };
    }
  },
  {
    id: 'ten-to-base',
    name: 'Into another base',
    topic: TOPIC,
    seconds: 60,
    hint: T`Take out the largest power of the base that fits, then the next, and so on. Or divide by the base over and over and read the remainders from last to first.`,
    make (r) {
      const base = r.pick([2, 2, 2, 8, 16, 5]);
      const n = r.int(base === 2 ? 9 : 20, base === 2 ? 100 : base === 16 ? 255 : 200);
      const written = n.toString(base).toUpperCase();
      return {
        prompt: T`Write ${n} in base ${BASE_NAMES[base]}.`,
        answer: { text: written },
        steps: T`[[${n} = ${written}_{${base}}]]`,
        data: { base, n }
      };
    }
  },
  {
    id: 'roman',
    name: 'Roman numerals',
    topic: TOPIC,
    seconds: 30,
    hint: T`I 1, V 5, X 10, L 50, C 100, D 500, M 1000. A smaller numeral before a larger one subtracts: IV 4, IX 9, XL 40, XC 90, CD 400, CM 900.`,
    make (r) {
      const kind = r.pick(['read', 'write', 'divide', 'add']);
      if (kind === 'read') {
        const n = r.int(14, 2026);
        return { prompt: T`What number is the Roman numeral ${toRoman(n)}?`, answer: int(n), steps: T`${toRoman(n)} is ${n}.`, data: { kind, a: n, b: 0 } };
      }
      if (kind === 'write') {
        const n = r.int(14, 2026);
        return { prompt: T`Write ${n} as a Roman numeral.`, answer: { text: toRoman(n) }, steps: T`${n} is ${toRoman(n)}.`, data: { kind, a: n, b: 0 } };
      }
      if (kind === 'divide') {
        const b = r.pick([2, 4, 5, 10, 20, 25, 50]);
        const a = b * r.pick([3, 4, 6, 8, 12, 15, 20, 25, 40]);
        return { prompt: T`Give the answer in Roman numerals: divide ${toRoman(a)} by ${toRoman(b)}.`, answer: { text: toRoman(a / b) }, steps: T`[[${a} \div ${b} = ${a / b}]], which is ${toRoman(a / b)}.`, data: { kind, a, b } };
      }
      const [a, b] = [r.int(20, 900), r.int(20, 900)];
      return { prompt: T`Give the answer in Roman numerals: add ${toRoman(a)} and ${toRoman(b)}.`, answer: { text: toRoman(a + b) }, steps: T`[[${a} + ${b} = ${a + b}]], which is ${toRoman(a + b)}.`, data: { kind, a, b } };
    }
  },
  {
    id: 'divisors',
    name: 'Counting divisors',
    topic: TOPIC,
    seconds: 45,
    hint: T`Factor into primes, add 1 to each exponent, and multiply: [[72 = 2^3 \cdot 3^2]] has [[(3 + 1)(2 + 1) = 12]] divisors.`,
    make (r) {
      const n = r.pick([12, 18, 20, 24, 28, 30, 36, 40, 45, 48, 50, 54, 60, 64, 72, 75, 80, 81, 84, 90, 96, 100, 108, 120, 125, 144, 150, 180, 200, 210, 225, 240, 300, 360]);
      return {
        prompt: T`How many positive divisors does ${n} have?`,
        answer: int(divisorCount(n)),
        steps: T`[[${n} = ${factored(n)}]]; add 1 to each exponent and multiply to get ${divisorCount(n)}.`,
        data: { n }
      };
    }
  },
  {
    id: 'gcd-lcm',
    name: 'GCF and LCM',
    topic: TOPIC,
    seconds: 30,
    hint: T`The GCF takes each prime to its smaller power, the LCM to its larger. They multiply back to the product: [[\gcd(a, b) \cdot \operatorname{lcm}(a, b) = ab]].`,
    make (r) {
      const g = r.pick([2, 3, 4, 5, 6, 8, 9, 10, 12, 15]);
      const [p, q] = r.pick([[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6], [2, 7], [3, 7], [4, 7], [3, 8], [5, 8], [4, 9], [2, 9]]);
      const [a, b] = [g * p, g * q];
      const least = r.chance(0.5);
      return {
        prompt: T`What is the ${least ? 'least common multiple' : 'greatest common factor'} of ${a} and ${b}?`,
        answer: int(least ? a * b / gcd(a, b) : gcd(a, b)),
        steps: least ? T`The GCF is ${g}, so [[\frac{${a} \cdot ${b}}{${g}} = ${group(a * b / g)}]]` : T`[[${a} = ${g} \cdot ${p}]] and [[${b} = ${g} \cdot ${q}]], so ${g}.`,
        data: { a, b, least }
      };
    }
  },
  {
    id: 'repeating-decimal',
    name: 'Repeating decimals',
    topic: TOPIC,
    seconds: 30,
    hint: T`A block that repeats from the decimal point is the block over as many 9s: [[0.\overline{7} = \frac{7}{9}]], [[0.\overline{36} = \frac{36}{99} = \frac{4}{11}]].`,
    make (r) {
      const digits = r.pick([1, 2, 2]);
      const block = digits === 1 ? r.int(1, 8) : r.int(1, 98);
      const shown = String(block).padStart(digits, '0');
      return {
        prompt: T`Write [[0.\overline{${shown}}]] as a fraction in lowest terms.`,
        answer: { ...frac(block, 10 ** digits - 1), form: 'fraction' },
        steps: T`[[\frac{${block}}{${10 ** digits - 1}}]], then reduce.`,
        data: { block, digits }
      };
    }
  },
  {
    id: 'perfect-powers',
    name: 'Counting squares and cubes',
    topic: TOPIC,
    seconds: 30,
    hint: T`The squares up to N are [[1^2, 2^2, \ldots]] up to the largest that fits, so count the roots: there are [[\lfloor\sqrt{N}\rfloor]] of them.`,
    make (r) {
      const cube = r.chance(0.4);
      const limit = cube ? r.int(30, 1500) : r.int(50, 2000);
      let count = 0;
      while ((count + 1) ** (cube ? 3 : 2) <= limit) count++;
      return {
        prompt: T`How many whole numbers from 1 to ${group(limit).replace(/\{,\}/g, ',')}, inclusive, are perfect ${cube ? 'cubes' : 'squares'}?`,
        answer: int(count),
        steps: T`[[${count}^{${cube ? 3 : 2}} = ${group(count ** (cube ? 3 : 2))}]] fits, and [[${count + 1}^{${cube ? 3 : 2}} = ${group((count + 1) ** (cube ? 3 : 2))}]] does not.`,
        data: { cube, limit }
      };
    }
  }
];
