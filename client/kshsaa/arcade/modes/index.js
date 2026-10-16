// The arcade's game modes, in the order the setup screen lists them. A mode is
// one file: what the setup screen offers, the rules it explains, and what a
// right and a wrong answer do. To add one, write its file and list it below.
// engine.js handles everything the modes share: buzzing, lockout, rebounds,
// elimination, shields, power-ups, undo, and the winner.

import lastTeamStanding from './last-team-standing.js';
import bountyHunter from './bounty-hunter.js';
import lightningRound from './lightning-round.js';
import chaosMode from './chaos-mode.js';

/**
 * What a mode's rules get when a team is ruled right or wrong.
 * @typedef {object} RulingContext
 * @property {number} team - the team being ruled on
 * @property {number} scale - 2 on a Double Damage question, else 1
 * @property {boolean} lives - whether this mode plays for lives
 * @property {?import('../modifiers.js').Modifier} modifier - the power-up on this question
 * @property {import('../engine.js').Ops} ops - what a rule may do to the teams
 */

/**
 * @typedef {object} ArcadeMode
 * @property {string} id
 * @property {string} name
 * @property {string} summary - one line for the setup screen
 * @property {(config: import('../engine.js').GameConfig) => string[]} rules - for the setup screen and the scoreboard
 * @property {boolean} lives - teams have lives and are out at zero
 * @property {'off'|'optional'|'always'} powerUps
 * @property {number} modifierChance - how often a question carries a power-up while they are on
 * @property {{questions: number, lives?: number, minutes?: number, answerSeconds?: number}} defaults
 * @property {boolean} [timed] - a clock runs for the whole game
 * @property {boolean} [shortQuestions] - read the shortest questions available
 * @property {boolean} [autoAdvance] - the next question comes up on its own
 * @property {(ctx: RulingContext) => void} correct
 * @property {(ctx: RulingContext) => void} wrong
 */

/** @type {Object<string, ArcadeMode>} */
export const MODES = Object.fromEntries(
  [lastTeamStanding, bountyHunter, lightningRound, chaosMode].map(mode => [mode.id, mode])
);
