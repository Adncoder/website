// Lives instead of points: a wrong answer costs one, a right answer wins one
// back, and a team with none left is out. Points still count, ten for each
// right answer, to settle a game the questions end before the lives do.

const livesText = n => n + (n === 1 ? ' life' : ' lives');

/** @type {import('./index.js').ArcadeMode} */
export default {
  id: 'last-team-standing',
  name: 'Last Team Standing',
  summary: 'Lives, not points. Lose them all and you are out.',
  rules: config => [
    'Every team starts with ' + livesText(config.lives) + '.',
    'A wrong answer costs a life. A right answer wins one back, up to ' + config.lives + '.',
    'At zero you are out, and your buzzer no longer counts.',
    'Last team standing wins. If the questions run out first, most lives wins, then most points (10 per right answer).'
  ],
  lives: true,
  powerUps: 'optional',
  modifierChance: 0.3,
  defaults: { questions: 40, lives: 3 },
  correct ({ team, ops }) {
    ops.gainLives(team, 1);
    ops.addPoints(team, 10);
  },
  wrong ({ team, scale, ops }) {
    ops.loseLives(team, scale);
  }
};
