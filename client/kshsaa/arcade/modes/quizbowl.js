// Real quizbowl, scored the way NAQT scores it: whole pyramidal tossups from
// qbreader.org, hardest clue first, so knowing more beats buzzing fast, and a
// three-part bonus for the team that gets each one. Only that team answers
// its bonus, and it may talk it over. The engine runs the bonus; this file
// says what everything is worth.

const POWER = 15;
const RIGHT = 10;
const NEG = -5;
const PART = 10;

/** @type {import('./index.js').ArcadeMode} */
export default {
  id: 'quizbowl',
  name: 'Quizbowl',
  summary: 'Whole quizbowl tossups with powers and negs, and a 3-part bonus for each one you get.',
  rules: () => [
    'Whole quizbowl tossups from qbreader.org. The hardest clue comes first, so knowing more beats buzzing fast.',
    'A right answer before the (*) is a power, worth ' + POWER + '. After it, ' + RIGHT + '.',
    'A wrong answer that interrupts the question costs ' + -NEG + '. Once the question is finished, a wrong answer costs nothing.',
    'Every tossup you get earns a bonus: three parts, ' + PART + ' points each. Only your team answers, and you may talk it over.',
    'Most points when the questions run out wins.'
  ],
  lives: false,
  powerUps: 'optional',
  modifierChance: 0.25,
  // five seconds to buzz once the question is finished, as at NAQT
  defaults: { questions: 20, answerSeconds: 5 },
  quizbowl: true,
  correct ({ team, scale, power, ops }) {
    ops.addPoints(team, (power ? POWER : RIGHT) * scale);
  },
  wrong ({ team, scale, neg, ops }) {
    if (neg) ops.addPoints(team, NEG * scale);
  },
  bonusPart ({ team, ops }) {
    ops.addPoints(team, PART);
  }
};
