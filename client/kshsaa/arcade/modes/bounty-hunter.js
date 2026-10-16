// Points, with a price on the leader's head: a right answer also takes points
// from whoever is ahead of the team that gave it.

const RIGHT = 10;
const BOUNTY = 5;
const WRONG = -5;

/** @type {import('./index.js').ArcadeMode} */
export default {
  id: 'bounty-hunter',
  name: 'Bounty Hunter',
  summary: 'Right answers score and take points from the leader.',
  rules: () => [
    'A right answer scores ' + RIGHT + ' points.',
    'It also takes ' + BOUNTY + ' from the team in the lead (from each, if they are tied), unless you are already level with them or ahead.',
    'A wrong answer costs ' + -WRONG + '.',
    'Most points when the questions run out wins.'
  ],
  lives: false,
  powerUps: 'optional',
  modifierChance: 0.3,
  defaults: { questions: 25 },
  correct ({ team, scale, ops }) {
    // the leaders are whoever was ahead before this answer counted
    const leaders = ops.leaders(team, 'points', ops.points(team));
    ops.addPoints(team, RIGHT * scale);
    for (const leader of leaders) ops.takePoints(leader, team, BOUNTY * scale);
  },
  wrong ({ team, scale, ops }) {
    ops.addPoints(team, WRONG * scale);
  }
};
