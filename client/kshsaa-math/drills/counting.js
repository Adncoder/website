// Counting: permutations, combinations, arrangements around a table, and the
// survey problems KSHSAA likes ("how many took neither?").

import { int } from '../exact.js';
import { T, choose, factorial, group } from '../tex.js';

const TOPIC = 'Counting';

const WORDS = ['LEVEL', 'BANANA', 'LETTER', 'KANSAS', 'TOPEKA', 'WICHITA', 'ALGEBRA', 'SCHOOL', 'COOKBOOK', 'PEPPER', 'BUBBLE', 'ERROR', 'MAMMAL', 'TENNESSEE'];

/** How many different orders a word's letters make. */
export function arrangements (word) {
  const counts = {};
  for (const c of word) counts[c] = (counts[c] || 0) + 1;
  return Object.values(counts).reduce((total, c) => total / factorial(c), factorial(word.length));
}

export default [
  {
    id: 'permutations',
    name: 'Permutations',
    topic: TOPIC,
    seconds: 30,
    hint: T`Order matters: [[{}_nP_k = \frac{n!}{(n-k)!} = n(n-1)\cdots(n-k+1)]], k factors counting down from n.`,
    make (r) {
      const n = r.int(4, 10);
      const k = r.int(2, Math.min(4, n - 1));
      const value = factorial(n) / factorial(n - k);
      const factors = Array.from({ length: k }, (_, i) => n - i).join(T` \cdot `);
      const ask = r.pick([
        T`What is the number of permutations of ${n} distinct objects taken ${k} at a time?`,
        T`${n} runners race. In how many ways can first through ${['', '', 'second', 'third', 'fourth'][k]} place be awarded?`,
        T`How many ways can ${k} of ${n} different books be lined up on a shelf?`,
        T`What is [[{}_{${n}}P_{${k}}]]?`
      ]);
      return { prompt: ask, answer: int(value), steps: T`[[${factors} = ${group(value)}]]`, data: { n, k } };
    }
  },
  {
    id: 'combinations',
    name: 'Combinations in words',
    topic: TOPIC,
    seconds: 30,
    hint: T`Order does not matter: [[\binom{n}{k} = \frac{n!}{k!\,(n-k)!}]]. Choosing who is on the team is the same as choosing who is left off.`,
    make (r) {
      const n = r.int(5, 12);
      const k = r.int(2, Math.min(5, n - 2));
      const value = choose(n, k);
      const ask = r.pick([
        T`How many different teams of ${k} players can be made from a roster of ${n}?`,
        T`A committee of ${k} is chosen from ${n} people. How many committees are possible?`,
        T`A pizza place offers ${n} toppings. How many pizzas with exactly ${k} different toppings are possible?`
      ]);
      return { prompt: ask, answer: int(value), steps: T`[[\binom{${n}}{${k}} = ${value}]]`, data: { n, k } };
    }
  },
  {
    id: 'handshakes',
    name: 'Handshakes',
    topic: TOPIC,
    seconds: 30,
    hint: T`Every pair once: [[\binom{n}{2} = \frac{n(n-1)}{2}]].`,
    make (r) {
      const n = r.int(5, 20);
      const value = n * (n - 1) / 2;
      const ask = r.pick([
        T`${n} people each shake hands once with everyone else. How many handshakes take place?`,
        T`${n} teams each play every other team once. How many games are played?`
      ]);
      return { prompt: ask, answer: int(value), steps: T`[[\frac{${n} \cdot ${n - 1}}{2} = ${value}]]`, data: { n } };
    }
  },
  {
    id: 'word-arrangements',
    name: 'Arranging letters with repeats',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[\frac{n!}{a!\,b!\cdots}]]: all n letters, divided by the factorial of each letter's count.`,
    make (r) {
      const word = r.pick(WORDS);
      const counts = {};
      for (const c of word) counts[c] = (counts[c] || 0) + 1;
      const repeats = Object.values(counts).filter(c => c > 1);
      const value = arrangements(word);
      const bottom = repeats.length ? repeats.map(c => c + '!').join(T`\,`) : '1';
      return {
        prompt: T`How many distinct arrangements are there of the letters in ${word}?`,
        answer: int(value),
        steps: T`${word.length} letters${repeats.length ? ', with repeats' : ', all different'}: [[\frac{${word.length}!}{${bottom}} = ${group(value)}]]`,
        data: { word }
      };
    }
  },
  {
    id: 'circular',
    name: 'Arrangements around a table',
    topic: TOPIC,
    seconds: 30,
    hint: T`Around a circle, [[(n-1)!]]: seat one person to fix the rotation, then arrange the rest. A ring or bracelet that can flip over halves that: [[\frac{(n-1)!}{2}]]. Two who must sit together count as one block that can sit two ways.`,
    make (r) {
      const kind = r.pick(['table', 'table', 'together', 'ring']);
      const n = r.int(kind === 'together' ? 4 : 3, kind === 'ring' ? 7 : 8);
      if (kind === 'together') {
        const value = 2 * factorial(n - 2);
        return {
          prompt: T`In how many ways can ${n} people sit around a round table if two of them insist on sitting next to each other?`,
          answer: int(value),
          steps: T`Treat the pair as one seat: ${n - 1} units around a table is [[(${n - 2})!]], and the pair can swap: [[2 \cdot ${n - 2}! = ${group(value)}]]`,
          data: { kind, n }
        };
      }
      if (kind === 'ring') {
        const value = factorial(n - 1) / 2;
        return {
          prompt: T`In how many distinct ways can ${n} different keys be arranged on a key ring?`,
          answer: int(value),
          steps: T`A ring can be flipped over, so [[\frac{(${n} - 1)!}{2} = \frac{${factorial(n - 1)}}{2} = ${group(value)}]]`,
          data: { kind, n }
        };
      }
      const value = factorial(n - 1);
      return {
        prompt: T`In how many ways can ${n} people be seated around a round table?`,
        answer: int(value),
        steps: T`[[(${n} - 1)! = ${n - 1}! = ${group(value)}]]`,
        data: { kind, n }
      };
    }
  },
  {
    id: 'factorial-quotient',
    name: 'Dividing factorials',
    topic: TOPIC,
    seconds: 30,
    hint: T`Cancel the smaller factorial: [[\frac{10!}{7!} = 10 \cdot 9 \cdot 8]].`,
    make (r) {
      const b = r.int(2, 9);
      const a = b + r.int(1, 3);
      const value = factorial(a) / factorial(b);
      const factors = Array.from({ length: a - b }, (_, i) => a - i).join(T` \cdot `);
      return {
        prompt: T`Evaluate [[\frac{${a}!}{${b}!}]].`,
        answer: int(value),
        steps: T`[[${factors} = ${group(value)}]]`,
        data: { a, b }
      };
    }
  },
  {
    id: 'counting-principle',
    name: 'Counting principle',
    topic: TOPIC,
    seconds: 30,
    hint: T`Independent choices multiply.`,
    make (r) {
      const [a, b, c] = [r.int(3, 9), r.int(2, 7), r.int(2, 6)];
      const ask = r.pick([
        T`A store sells boots in ${a} styles, each with ${b} kinds of laces and ${c} colors. How many different choices are there?`,
        T`A menu has ${a} sandwiches, ${b} sides, and ${c} drinks. How many meals of one of each are possible?`
      ]);
      return { prompt: ask, answer: int(a * b * c), steps: T`[[${a} \cdot ${b} \cdot ${c} = ${a * b * c}]]`, data: { a, b, c } };
    }
  },
  {
    id: 'subsets',
    name: 'Subsets',
    topic: TOPIC,
    seconds: 10,
    hint: T`Each element is in or out: [[2^n]] subsets, counting the empty set and the whole set.`,
    make (r) {
      const n = r.int(3, 10);
      const proper = r.chance(0.3);
      const value = 2 ** n - (proper ? 1 : 0);
      return {
        prompt: proper
          ? T`How many non-empty subsets does a set of ${n} elements have?`
          : T`How many subsets does a set of ${n} elements have?`,
        answer: int(value),
        steps: proper ? T`[[2^{${n}} - 1 = ${value}]]` : T`[[2^{${n}} = ${value}]]`,
        data: { n, proper }
      };
    }
  },
  {
    id: 'survey',
    name: 'Survey overlap',
    topic: TOPIC,
    seconds: 45,
    hint: T`[[|A \cup B| = |A| + |B| - |A \cap B|]]: add the two groups, take off the overlap counted twice, and subtract from the total for "neither".`,
    make (r) {
      const both = r.int(5, 40);
      const onlyA = r.int(5, 60);
      const onlyB = r.int(5, 60);
      const neither = r.int(3, 50);
      const [a, b, total] = [onlyA + both, onlyB + both, onlyA + onlyB + both + neither];
      const [x, y] = r.pick([['biology', 'chemistry'], ['dogs', 'cats'], ['band', 'choir'], ['French', 'Spanish']]);
      return {
        prompt: T`In a survey of ${total} students, ${a} chose ${x}, ${b} chose ${y}, and ${both} chose both. How many chose neither?`,
        answer: int(neither),
        steps: T`At least one: [[${a} + ${b} - ${both} = ${a + b - both}]]. Neither: [[${total} - ${a + b - both} = ${neither}]]`,
        data: { total, a, b, both }
      };
    }
  }
];
