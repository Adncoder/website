// Probability with dice, cards, coins, and marbles.

import { frac } from '../exact.js';
import { T, choose } from '../tex.js';

const TOPIC = 'Probability';

const CARD_EVENTS = [
  ['a king', 4], ['a heart', 13], ['a face card', 12], ['a red card', 26], ['the ace of spades', 1],
  ['a king or a queen', 8], ['a heart or a king', 16], ['a red face card', 6], ['a black ace', 2], ['a number card from 2 through 10', 36]
];

/** Ways two dice add to s. */
export const diceWays = s => 6 - Math.abs(7 - s);

export default [
  {
    id: 'dice-sum',
    name: 'Two dice',
    topic: TOPIC,
    seconds: 30,
    hint: T`36 equally likely rolls. The sums 2 through 12 come up 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1 ways.`,
    make (r) {
      const kind = r.pick(['sum', 'sum', 'atLeast', 'doubles', 'prime']);
      if (kind === 'doubles') {
        return { prompt: T`Two standard dice are rolled. What is the probability that both show the same number?`, answer: frac(6, 36), steps: T`6 doubles out of 36: [[\frac{1}{6}]]`, data: { kind } };
      }
      if (kind === 'prime') {
        return { prompt: T`Two standard dice are rolled. What is the probability that the sum is a prime number?`, answer: frac(15, 36), steps: T`Sums 2, 3, 5, 7, 11 come up [[1 + 2 + 4 + 6 + 2 = 15]] ways: [[\frac{15}{36} = \frac{5}{12}]]`, data: { kind } };
      }
      const s = r.int(kind === 'atLeast' ? 8 : 2, kind === 'atLeast' ? 11 : 12);
      let ways = 0;
      for (let t = s; t <= (kind === 'atLeast' ? 12 : s); t++) ways += diceWays(t);
      return {
        prompt: kind === 'atLeast'
          ? T`Two standard dice are rolled. What is the probability that the sum is at least ${s}?`
          : T`Two standard dice are rolled. What is the probability that the sum is ${s}?`,
        answer: frac(ways, 36),
        steps: T`${ways} of the 36 rolls: [[\frac{${ways}}{36}]]`,
        data: { kind, s }
      };
    }
  },
  {
    id: 'cards',
    name: 'Drawing a card',
    topic: TOPIC,
    seconds: 30,
    hint: T`52 cards: 4 suits of 13, two suits red. Each suit has 3 face cards (jack, queen, king). For "or", do not count a card twice.`,
    make (r) {
      const [what, count] = r.pick(CARD_EVENTS);
      return {
        prompt: T`One card is drawn from a standard deck of 52. What is the probability that it is ${what}?`,
        answer: frac(count, 52),
        steps: T`${count} such cards: [[\frac{${count}}{52}]]`,
        data: { count }
      };
    }
  },
  {
    id: 'coins',
    name: 'Coin flips',
    topic: TOPIC,
    seconds: 30,
    hint: T`[[2^n]] equally likely outcomes; exactly k heads happens [[\binom{n}{k}]] ways. "At least one" is 1 minus "none".`,
    make (r) {
      const n = r.int(3, 6);
      if (r.chance(0.25)) {
        return {
          prompt: T`A fair coin is flipped ${n} times. What is the probability of at least one head?`,
          answer: frac(2 ** n - 1, 2 ** n),
          steps: T`[[1 - \frac{1}{2^{${n}}} = \frac{${2 ** n - 1}}{${2 ** n}}]]`,
          data: { n, k: null }
        };
      }
      const k = r.int(1, n - 1);
      return {
        prompt: T`A fair coin is flipped ${n} times. What is the probability of exactly ${k} head${k === 1 ? '' : 's'}?`,
        answer: frac(choose(n, k), 2 ** n),
        steps: T`[[\frac{\binom{${n}}{${k}}}{2^{${n}}} = \frac{${choose(n, k)}}{${2 ** n}}]]`,
        data: { n, k }
      };
    }
  },
  {
    id: 'marbles',
    name: 'Drawing without replacement',
    topic: TOPIC,
    seconds: 45,
    hint: T`Multiply along the way, shrinking the bag each draw: [[\frac{r}{n} \cdot \frac{r-1}{n-1}]].`,
    make (r) {
      const red = r.int(2, 6);
      const blue = r.int(2, 6);
      const total = red + blue;
      return {
        prompt: T`A bag holds ${red} red and ${blue} blue marbles. Two are drawn without replacement. What is the probability that both are red?`,
        answer: frac(red * (red - 1), total * (total - 1)),
        steps: T`[[\frac{${red}}{${total}} \cdot \frac{${red - 1}}{${total - 1}} = \frac{${red * (red - 1)}}{${total * (total - 1)}}]]`,
        data: { red, blue }
      };
    }
  },
  {
    id: 'independent-events',
    name: 'Independent events',
    topic: TOPIC,
    seconds: 45,
    hint: T`Independent events multiply: P(A and B) = P(A) [[\cdot]] P(B).`,
    make (r) {
      const die = r.pick([['a 6', 1], ['an even number', 3], ['a 2 or a 6', 2], ['a number greater than 4', 2]]);
      const card = r.pick([['a king or a queen', 8], ['a heart', 13], ['an ace', 4], ['a face card', 12]]);
      return {
        prompt: T`A coin is flipped, a die is rolled, and a card is drawn from a standard deck. What is the probability of a head, ${die[0]}, and ${card[0]}?`,
        answer: frac(die[1] * card[1], 2 * 6 * 52),
        steps: T`[[\frac{1}{2} \cdot \frac{${die[1]}}{6} \cdot \frac{${card[1]}}{52} = \frac{${die[1] * card[1]}}{624}]]`,
        data: { die: die[1], card: card[1] }
      };
    }
  }
];
