// Last Team Standing with power-ups always on, and on most questions.

import lastTeamStanding from './last-team-standing.js';

/** @type {import('./index.js').ArcadeMode} */
export default {
  ...lastTeamStanding,
  id: 'chaos-mode',
  name: 'Chaos Mode',
  summary: 'Last Team Standing, with a power-up on most questions.',
  rules: config => lastTeamStanding.rules(config).concat(
    'Most questions carry a power-up, shown on the scoreboard before the question is read.'
  ),
  powerUps: 'always',
  modifierChance: 0.6
};
