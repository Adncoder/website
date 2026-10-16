// Short questions against a clock for the whole game. Guessing is free, and
// the console moves on by itself once a question is done.

const RIGHT = 10;
const ANSWER_SECONDS = 5;

/** @type {import('./index.js').ArcadeMode} */
export default {
  id: 'lightning-round',
  name: 'Lightning Round',
  summary: 'Short questions against the clock. No penalty for guessing.',
  rules: config => [
    'A ' + config.minutes + '-minute clock for the whole game, and the shortest questions available.',
    'A right answer scores ' + RIGHT + '. A wrong answer costs nothing, so buzz fast.',
    'Teams get ' + ANSWER_SECONDS + ' seconds to buzz, and the next question comes up on its own.',
    'Most points when time runs out wins.'
  ],
  lives: false,
  powerUps: 'optional',
  modifierChance: 0.25,
  defaults: { questions: 50, minutes: 3, answerSeconds: ANSWER_SECONDS },
  timed: true,
  shortQuestions: true,
  autoAdvance: true,
  correct ({ team, scale, ops }) {
    ops.addPoints(team, RIGHT * scale);
  },
  wrong () {}
};
