// Speed tricks: the Vedic shortcuts and the facts worth knowing cold. Each
// one carries a lesson, the worked example the page shows under "How it
// works", so a trick can be learned and then drilled.

import { frac, int } from '../exact.js';
import { T, group } from '../tex.js';

const TOPIC = 'Speed tricks';

const pad2 = n => String(n).padStart(2, '0');
// fractions with decimals that end
const PARTS = [[1, 8], [3, 8], [5, 8], [7, 8], [1, 5], [2, 5], [3, 5], [4, 5], [1, 4], [3, 4], [1, 20], [3, 20], [7, 20], [9, 20], [1, 25], [3, 25], [1, 16], [3, 16], [1, 40], [3, 40]];

export default [
  {
    id: 'x11',
    name: 'Multiply by 11',
    topic: TOPIC,
    seconds: 10,
    hint: T`Keep the end digits and put the sums of neighbors between them, carrying as needed.`,
    lesson: T`Write the first digit, then each pair of neighbors added, then the last digit. [[43 \times 11]]: 4, then [[4 + 3 = 7]], then 3, so 473. A sum of 10 or more carries left: [[78 \times 11]] is 7, 15, 8, which becomes 858. Three digits work the same way: [[254 \times 11]] is 2, [[2 + 5]], [[5 + 4]], 4, so 2,794.`,
    make (r) {
      const n = r.chance(0.7) ? r.int(12, 99) : r.int(101, 999);
      return { prompt: T`[[${n} \times 11]]`, answer: int(n * 11), steps: T`[[${n} \times 10 + ${n} = ${group(n * 11)}]]`, data: { a: n, b: 11 } };
    }
  },
  {
    id: 'square-5',
    name: 'Squares ending in 5',
    topic: TOPIC,
    seconds: 10,
    hint: T`Multiply the tens part by one more than itself, then tack on 25.`,
    lesson: T`For a number ending in 5, multiply what comes before the 5 by the next whole number and write 25 after it. [[65^2]]: [[6 \times 7 = 42]], so 4,225. [[115^2]]: [[11 \times 12 = 132]], so 13,225. It works because [[(10n + 5)^2 = 100n(n + 1) + 25]].`,
    make (r) {
      const n = r.int(1, 12);
      return { prompt: T`[[${10 * n + 5}^2]]`, answer: int((10 * n + 5) ** 2), steps: T`[[${n} \times ${n + 1} = ${n * (n + 1)}]], then 25: ${group((10 * n + 5) ** 2).replace(/\{,\}/g, ',')}`, data: { a: 10 * n + 5, b: 10 * n + 5 } };
    }
  },
  {
    id: 'tens-complement',
    name: 'Same tens, units adding to 10',
    topic: TOPIC,
    seconds: 10,
    hint: T`Tens digit times one more than itself, then the product of the units as two digits.`,
    lesson: T`When two numbers share their tens digit and their units add to 10, multiply the tens digit by the next number, then write the product of the units as two digits. [[43 \times 47]]: [[4 \times 5 = 20]] and [[3 \times 7 = 21]], so 2,021. [[81 \times 89]]: [[8 \times 9 = 72]] and [[1 \times 9 = 09]], so 7,209. Squares ending in 5 are the special case where both units are 5.`,
    make (r) {
      const [tens, unit] = [r.int(1, 11), r.int(1, 9)];
      const [a, b] = [10 * tens + unit, 10 * tens + 10 - unit];
      return { prompt: T`[[${a} \times ${b}]]`, answer: int(a * b), steps: T`[[${tens} \times ${tens + 1} = ${tens * (tens + 1)}]], then [[${unit} \times ${10 - unit} = ${pad2(unit * (10 - unit))}]]: ${group(a * b).replace(/\{,\}/g, ',')}`, data: { a, b } };
    }
  },
  {
    id: 'near-100',
    name: 'Numbers near 100',
    topic: TOPIC,
    seconds: 15,
    hint: T`Take how far each is from 100. Add one number's distance to the other number, then write the product of the distances as two digits.`,
    lesson: T`Write each number's distance from 100. [[97 \times 94]]: the distances are -3 and -6. Cross-add: [[97 - 6 = 91]] (or [[94 - 3]], the same). Multiply the distances: [[3 \times 6 = 18]]. Answer 9,118. Above 100 it is the same with plus signs: [[104 \times 107]] is [[104 + 7 = 111]] and [[4 \times 7 = 28]], so 11,128. One above and one below, the product of the distances is negative, so subtract it: [[103 \times 96]] is [[99 \times 100 - 12 = 9{,}888]].`,
    make (r) {
      const [x, y] = [r.nonzero(-9, 12), r.nonzero(-9, 12)];
      const [a, b] = [100 + x, 100 + y];
      return { prompt: T`[[${a} \times ${b}]]`, answer: int(a * b), steps: T`[[${a} ${y < 0 ? '- ' + -y : '+ ' + y} = ${a + y}]] hundreds, ${x * y < 0 ? 'minus' : 'plus'} [[${Math.abs(x)} \times ${Math.abs(y)} = ${Math.abs(x * y)}]]: ${group(a * b).replace(/\{,\}/g, ',')}`, data: { a, b } };
    }
  },
  {
    id: 'square-near-50',
    name: 'Squares near 50',
    topic: TOPIC,
    seconds: 10,
    hint: T`25 plus the distance from 50, then the distance squared as two digits.`,
    lesson: T`For a number near 50, add its distance from 50 to 25, then write the square of the distance as two digits. [[53^2]]: [[25 + 3 = 28]] and [[3^2 = 09]], so 2,809. [[46^2]]: [[25 - 4 = 21]] and [[4^2 = 16]], so 2,116. It works because [[(50 + a)^2 = 100(25 + a) + a^2]].`,
    make (r) {
      const d = r.nonzero(-9, 9);
      return { prompt: T`[[${50 + d}^2]]`, answer: int((50 + d) ** 2), steps: T`[[25 ${d < 0 ? '- ' + -d : '+ ' + d} = ${25 + d}]], then [[${Math.abs(d)}^2 = ${pad2(d * d)}]]: ${group((50 + d) ** 2).replace(/\{,\}/g, ',')}`, data: { a: 50 + d, b: 50 + d } };
    }
  },
  {
    id: 'difference-of-squares',
    name: 'Difference of squares',
    topic: TOPIC,
    seconds: 10,
    hint: T`Two numbers the same distance either side of a round one: square the round one and subtract the distance squared.`,
    lesson: T`[[(m - d)(m + d) = m^2 - d^2]]. When two numbers sit the same distance on either side of an easy one, square the middle and subtract the square of the distance. [[47 \times 53]]: the middle is 50 and the distance 3, so [[2500 - 9 = 2{,}491]]. [[28 \times 32 = 900 - 4 = 896]]. It also squares anything: [[38^2 = 36 \times 40 + 2^2 = 1{,}444]].`,
    make (r) {
      const [m, d] = [10 * r.int(2, 12), r.int(1, 5)];
      return { prompt: T`[[${m - d} \times ${m + d}]]`, answer: int(m * m - d * d), steps: T`[[${m}^2 - ${d}^2 = ${group(m * m)} - ${d * d} = ${group(m * m - d * d)}]]`, data: { a: m - d, b: m + d } };
    }
  },
  {
    id: 'teens',
    name: 'Two numbers in the teens',
    topic: TOPIC,
    seconds: 10,
    hint: T`Add one number to the other's units digit, times 10, plus the product of the units.`,
    lesson: T`For two numbers from 11 to 19, add the units digit of one to the other, multiply by 10, and add the product of the units. [[13 \times 17]]: [[13 + 7 = 20]], so 200, plus [[3 \times 7 = 21]] is 221. [[16 \times 18]]: [[16 + 8 = 24]], so 240, plus [[6 \times 8 = 48]] is 288.`,
    make (r) {
      const [a, b] = [r.int(11, 19), r.int(11, 19)];
      return { prompt: T`[[${a} \times ${b}]]`, answer: int(a * b), steps: T`[[(${a} + ${b - 10}) \times 10 + ${a - 10} \times ${b - 10} = ${(a + b - 10) * 10} + ${(a - 10) * (b - 10)} = ${a * b}]]`, data: { a, b } };
    }
  },
  {
    id: 'criss-cross',
    name: 'Criss-cross multiplication',
    topic: TOPIC,
    seconds: 20,
    hint: T`Units times units, then the two cross products added, then tens times tens, carrying each time.`,
    lesson: T`For any two-digit numbers, work right to left in three steps. [[32 \times 41]]: units [[2 \times 1 = 2]]. Cross: [[3 \times 1 + 2 \times 4 = 11]], write 1 and carry 1. Tens: [[3 \times 4 = 12]], plus the carry is 13. Answer 1,312. This is the Vedic "vertically and crosswise" rule, and it is [[(10a + b)(10c + d) = 100ac + 10(ad + bc) + bd]].`,
    make (r) {
      const [a, b] = [r.int(12, 99), r.int(12, 99)];
      const [a1, a0, b1, b0] = [Math.floor(a / 10), a % 10, Math.floor(b / 10), b % 10];
      return {
        prompt: T`[[${a} \times ${b}]]`,
        answer: int(a * b),
        steps: T`Units [[${a0} \times ${b0} = ${a0 * b0}]], cross [[${a1} \times ${b0} + ${a0} \times ${b1} = ${a1 * b0 + a0 * b1}]], tens [[${a1} \times ${b1} = ${a1 * b1}]]: [[${a1 * b1 * 100} + ${(a1 * b0 + a0 * b1) * 10} + ${a0 * b0} = ${group(a * b)}]]`,
        data: { a, b }
      };
    }
  },
  {
    id: 'x5-25-125',
    name: 'Multiply by 5, 25, or 125',
    topic: TOPIC,
    seconds: 10,
    hint: T`They are 10, 100, and 1000 divided by 2, 4, and 8. Divide first, then add the zeros.`,
    lesson: T`[[5 = \frac{10}{2}]], [[25 = \frac{100}{4}]], and [[125 = \frac{1000}{8}]], so halve, quarter, or take an eighth and then move the decimal point. [[48 \times 25]]: [[48 \div 4 = 12]], so 1,200. [[64 \times 125]]: [[64 \div 8 = 8]], so 8,000. Dividing goes the other way: to divide by 25, multiply by 4 and move the point two places.`,
    make (r) {
      const by = r.pick([5, 25, 25, 125]);
      const n = (by === 5 ? 2 : by === 25 ? 4 : 8) * r.int(3, by === 5 ? 60 : 24) + (by === 5 && r.chance(0.4) ? 1 : 0);
      return { prompt: T`[[${n} \times ${by}]]`, answer: int(n * by), steps: T`[[\frac{${n}}{${by === 5 ? 2 : by === 25 ? 4 : 8}} \times ${by === 5 ? 10 : by === 25 ? 100 : 1000} = ${group(n * by)}]]`, data: { a: n, b: by } };
    }
  },
  {
    id: 'x9-99',
    name: 'Multiply by 9, 99, or 101',
    topic: TOPIC,
    seconds: 10,
    hint: T`One less or one more than a round number: multiply by the round number, then subtract or add the number once.`,
    lesson: T`[[99 = 100 - 1]], so [[47 \times 99 = 4700 - 47 = 4{,}653]]. The same idea gives [[9 = 10 - 1]], [[999 = 1000 - 1]], and [[101 = 100 + 1]]: [[36 \times 101 = 3600 + 36 = 3{,}636]].`,
    make (r) {
      const by = r.pick([9, 99, 99, 101, 999]);
      const n = r.int(12, by === 999 ? 60 : 99);
      return { prompt: T`[[${n} \times ${by}]]`, answer: int(n * by), steps: T`[[${group(n * (by === 101 ? 100 : by + 1))} ${by === 101 ? '+' : '-'} ${n} = ${group(n * by)}]]`, data: { a: n, b: by } };
    }
  },
  {
    id: 'x15',
    name: 'Multiply by 15',
    topic: TOPIC,
    seconds: 10,
    hint: T`Add half of the number to itself, then multiply by 10.`,
    lesson: T`[[15 = 10 \times 1.5]], so add half of the number to itself and put a zero on. [[48 \times 15]]: [[48 + 24 = 72]], so 720. The same move finds a 15% tip: 10% plus half of that.`,
    make (r) {
      const n = 2 * r.int(6, 49);
      return { prompt: T`[[${n} \times 15]]`, answer: int(n * 15), steps: T`[[(${n} + ${n / 2}) \times 10 = ${group(n * 15)}]]`, data: { a: n, b: 15 } };
    }
  },
  {
    id: 'double-halve',
    name: 'Double and halve',
    topic: TOPIC,
    seconds: 10,
    hint: T`Halve the even number and double the other until one of them is round.`,
    lesson: T`A product does not change when one factor is halved and the other doubled. [[16 \times 35 = 8 \times 70 = 560]]. [[18 \times 45 = 9 \times 90 = 810]]. Look for a factor ending in 5: doubling it gives a multiple of 10.`,
    make (r) {
      const [a, b] = [2 * r.int(6, 24), 5 * r.pick([3, 5, 7, 9, 11, 13, 15])];
      return { prompt: T`[[${a} \times ${b}]]`, answer: int(a * b), steps: T`[[${a / 2} \times ${2 * b} = ${group(a * b)}]]`, data: { a, b } };
    }
  },
  {
    id: 'complement',
    name: 'Subtract from a power of 10',
    topic: TOPIC,
    seconds: 10,
    hint: T`All from 9 and the last from 10.`,
    lesson: T`To subtract from 100, 1,000, or 10,000, take every digit from 9 except the last, which you take from 10. [[1000 - 368]]: [[9 - 3 = 6]], [[9 - 6 = 3]], [[10 - 8 = 2]], so 632. This is the Vedic rule "all from 9 and the last from 10", and it makes change from a round amount with no borrowing.`,
    make (r) {
      const digits = r.pick([3, 3, 4]);
      const n = r.int(10 ** (digits - 1) + 1, 10 ** digits - 1);
      return { prompt: T`[[${group(10 ** digits)} - ${group(n)}]]`, answer: int(10 ** digits - n), steps: T`Each digit from 9, the last from 10: ${group(10 ** digits - n).replace(/\{,\}/g, ',')}`, data: { a: 10 ** digits, b: n } };
    }
  },
  {
    id: 'percent-swap',
    name: 'Swap the percent',
    topic: TOPIC,
    seconds: 10,
    hint: T`x% of y is y% of x. Use whichever is easier.`,
    lesson: T`[[x\% \text{ of } y = y\% \text{ of } x]], because both are [[\frac{xy}{100}]]. So 16% of 25 is 25% of 16, which is 4, and 48% of 50 is 50% of 48, which is 24.`,
    make (r) {
      const [easy, other] = [r.pick([25, 50, 20, 10, 75, 5]), 4 * r.int(2, 24)];
      return { prompt: T`What is ${other}% of ${easy}?`, answer: frac(easy * other, 100), steps: T`${easy}% of ${other}: [[${easy * other / 100}]]`, data: { a: other, b: easy } };
    }
  },
  {
    id: 'squares',
    name: 'Squares to know',
    topic: TOPIC,
    seconds: 10,
    hint: T`11 to 20: 121, 144, 169, 196, 225, 256, 289, 324, 361, 400. 21 to 30: 441, 484, 529, 576, 625, 676, 729, 784, 841, 900.`,
    lesson: T`Know the squares through 30 on sight. From one square to the next, add the two numbers: [[17^2 = 16^2 + 16 + 17 = 256 + 33 = 289]]. Squares only ever end in 0, 1, 4, 5, 6, or 9.`,
    make (r) {
      const n = r.int(11, 30);
      return { prompt: T`[[${n}^2]]`, answer: int(n * n), steps: T`[[${n}^2 = ${n * n}]]`, data: { a: n, b: n } };
    }
  },
  {
    id: 'cubes-powers',
    name: 'Cubes and powers to know',
    topic: TOPIC,
    seconds: 10,
    hint: T`Cubes: 8, 27, 64, 125, 216, 343, 512, 729, 1000, 1331, 1728. Powers of 2: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096. Powers of 3: 3, 9, 27, 81, 243, 729.`,
    lesson: T`Know the cubes through [[12^3 = 1{,}728]], the powers of 2 through [[2^{12} = 4{,}096]], and the powers of 3 through [[3^6 = 729]]. Notice [[2^{10} = 1{,}024]], just over a thousand, and that 64 and 729 are each both a square and a cube.`,
    make (r) {
      const [base, power] = r.pick([[r.int(2, 12), 3], [2, r.int(5, 12)], [3, r.int(3, 6)], [5, r.int(3, 4)]]);
      return { prompt: T`[[${base}^{${power}}]]`, answer: int(base ** power), steps: T`[[${base}^{${power}} = ${group(base ** power)}]]`, data: { a: base, b: power } };
    }
  },
  {
    id: 'fraction-decimal',
    name: 'Fractions, decimals, and percents',
    topic: TOPIC,
    seconds: 10,
    hint: T`Eighths go up by 0.125: 0.125, 0.375, 0.625, 0.875. Fifths by 0.2, twentieths by 0.05, sixteenths by 0.0625.`,
    lesson: T`Know the eighths: [[\frac{1}{8} = 0.125]], [[\frac{3}{8} = 0.375]], [[\frac{5}{8} = 0.625]], [[\frac{7}{8} = 0.875]]. A twentieth is 5%, a twenty-fifth is 4%, a fortieth is 2.5%, and a sixteenth is 6.25%. Thirds and sixths repeat: [[\frac{1}{6} = 0.1\overline{6}]], [[\frac{5}{6} = 0.8\overline{3}]].`,
    make (r) {
      const [n, d] = r.pick(PARTS);
      const kind = r.pick(['decimal', 'percent', 'fraction']);
      if (kind === 'fraction') return { prompt: T`Write ${n / d} as a fraction in lowest terms.`, answer: { ...frac(n, d), form: 'fraction' }, steps: T`[[${n / d} = \frac{${n}}{${d}}]]`, data: { a: n, b: d } };
      if (kind === 'percent') return { prompt: T`What percent is [[\frac{${n}}{${d}}]]?`, answer: frac(100 * n, d), unit: '%', steps: T`[[\frac{${n}}{${d}} = ${100 * n / d}\%]]`, data: { a: n, b: d } };
      return { prompt: T`Write [[\frac{${n}}{${d}}]] as a decimal.`, answer: frac(n, d), steps: T`[[\frac{${n}}{${d}} = ${n / d}]]`, data: { a: n, b: d } };
    }
  },
  {
    id: 'roots-perfect',
    name: 'Roots of perfect squares and cubes',
    topic: TOPIC,
    seconds: 15,
    hint: T`The last digit narrows it down, and the size of the number does the rest.`,
    lesson: T`For a perfect cube under a million, the last digit gives the last digit of the root (2 and 8 swap, 3 and 7 swap, the rest stay the same), and the thousands in front give the first: [[\sqrt[3]{74{,}088}]] ends in 2, and 74 lies between [[4^3 = 64]] and [[5^3 = 125]], so 42. For a perfect square the last digit leaves two choices: [[\sqrt{1{,}849}]] ends in 3 or 7 and lies between [[40^2]] and [[50^2]]; since [[45^2 = 2{,}025]] is too big, it is 43.`,
    make (r) {
      const cube = r.chance(0.4);
      const n = r.int(cube ? 11 : 31, 99);
      return {
        prompt: cube ? T`[[\sqrt[3]{${group(n ** 3)}}]]` : T`[[\sqrt{${group(n * n)}}]]`,
        answer: int(n),
        steps: cube ? T`[[${n}^3 = ${group(n ** 3)}]]` : T`[[${n}^2 = ${group(n * n)}]]`,
        data: { a: n, b: cube ? 3 : 2 }
      };
    }
  },
  {
    id: 'divisibility',
    name: 'Divisibility rules',
    topic: TOPIC,
    seconds: 10,
    hint: T`3 and 9: the digit sum. 4: the last two digits. 8: the last three. 6: both 2 and 3. 11: the alternating digit sum.`,
    lesson: T`A number is divisible by 3 or 9 when its digit sum is. By 4 when its last two digits are, and by 8 when its last three are. By 6 when it passes both 2 and 3. By 11 when the digits added and subtracted in turn give 0 or a multiple of 11: for 2,728, [[2 - 7 + 2 - 8 = -11]], so it is.`,
    make (r) {
      const by = r.pick([3, 4, 6, 8, 9, 11]);
      const n = r.chance(0.5) ? by * r.int(120, 900) : r.int(1000, 9999);
      const yes = n % by === 0;
      return {
        prompt: T`Is ${group(n).replace(/\{,\}/g, ',')} divisible by ${by}? Answer yes or no.`,
        answer: { text: yes ? 'yes' : 'no', accept: yes ? ['y'] : ['n'] },
        steps: yes ? T`[[${group(n)} = ${by} \times ${group(n / by)}]]` : T`It leaves a remainder of ${n % by}.`,
        data: { a: n, b: by }
      };
    }
  }
];
