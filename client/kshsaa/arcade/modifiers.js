// Power-ups: question modifiers that Chaos Mode always plays with and the other
// modes can turn on. A question draws one (or none) as it comes up, and the
// scoreboard announces it before the question is read. Each is a few hooks the
// engine calls around the mode's own rules; shields are honoured by the
// engine, so a power-up never has to check for one.

/**
 * @typedef {object} Modifier
 * @property {string} id
 * @property {string} icon
 * @property {(lives: boolean) => string} label - lives: whether the mode plays for lives
 * @property {(lives: boolean) => string} blurb - what to announce
 * @property {number} [scale] - multiplies everything won or lost on the question
 * @property {boolean} [opensToOut] - eliminated teams may buzz on this question
 * @property {boolean} [livesOnly] - means nothing without lives
 * @property {(state: import('./engine.js').State) => boolean} [available] - worth drawing right now
 * @property {(ctx: import('./modes/index.js').RulingContext) => void} [afterCorrect]
 */

/** @type {Object<string, Modifier>} */
export const MODIFIERS = {
  double: {
    id: 'double',
    icon: '💥',
    label: () => 'Double Damage',
    blurb: lives => lives ? 'A wrong answer costs two lives.' : 'Every point won or lost counts double.',
    scale: 2
  },
  shield: {
    id: 'shield',
    icon: '🛡️',
    label: () => 'Shield',
    blurb: lives => 'Answer it right to earn a shield that blocks your next ' + (lives ? 'lost life.' : 'loss of points.'),
    afterCorrect ({ team, ops }) {
      ops.giveShield(team);
    }
  },
  steal: {
    id: 'steal',
    icon: '🧛',
    label: lives => lives ? 'Life Steal' : 'Point Steal',
    blurb: lives => lives
      ? 'Answer it right to take a life from the team with the most.'
      : 'Answer it right to take 10 points from the leader.',
    afterCorrect ({ team, lives, ops }) {
      // one victim: the most lives (or points), then the most points, then
      // whoever is listed first
      const top = ops.leaders(team, lives ? 'lives' : 'points', 0);
      if (!top.length) return;
      const victim = top.reduce((a, b) => ops.points(b) > ops.points(a) ? b : a);
      if (lives) ops.takeLife(victim, team);
      else ops.takePoints(victim, team, 10);
    }
  },
  resurrection: {
    id: 'resurrection',
    icon: '✨',
    label: () => 'Resurrection',
    blurb: () => 'Eliminated teams may buzz in. A right answer brings them back with one life.',
    livesOnly: true,
    opensToOut: true,
    available: state => state.teams.some(t => t.out)
  }
};
