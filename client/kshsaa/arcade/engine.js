// The Octopus Arcade's rules engine. A game is its setup plus a list of events
// - a buzz, a ruling, the next question, a moderator's fix - and the state
// (lives, points, who is out, who may buzz) is always rebuilt by replaying that
// list. That makes undo exact (drop the last event), a refresh lossless (save
// the list), and the scoreboard window agree with the console (it replays the
// same list). Nothing here touches the DOM, so it runs in the browser and under
// node --test alike.
//
// What a right or wrong answer is worth belongs to the modes (modes/) and the
// power-ups (modifiers.js). This file holds what every mode shares: lockout,
// rebounds, elimination, shields, bonuses, the end of the game, and the
// standings.

import { MODES } from './modes/index.js';
import { MODIFIERS } from './modifiers.js';
import { newClock } from './clock.js';
import { secondsFor } from './questions.js';

/** The reader takes up to eight teams on one lockout system; so does the arcade. */
export const MAX_TEAMS = 8;
export const MAX_LIVES = 9;
const VERSION = 1;

/** A move the rules do not allow, with the reason to show the moderator. */
export class ArcadeError extends Error {}

/**
 * @typedef {object} Question
 * @property {string} id
 * @property {string} category
 * @property {string} question
 * @property {string} answer
 * @property {string} [source]
 * @property {string} [tier]
 * @property {import('./qbreader.js').Bonus} [bonus] - Quizbowl: the bonus the team that gets it plays
 */

/**
 * @typedef {object} GameConfig
 * @property {number} lives - starting lives, and the most a right answer restores
 * @property {boolean} powerUps
 * @property {string[]} modifiers - the power-ups that may come up (keys of MODIFIERS)
 * @property {boolean} rebounds - after a wrong answer, the teams left may buzz
 * @property {boolean} showAnswers - the scoreboard shows the answer once a question is done
 * @property {number} answerSeconds - the answer clock; 0 reads each question's own limit
 * @property {number} minutes - the game clock, for timed modes
 * @property {string} level
 * @property {string} math
 * @property {string[]} categories
 */

/**
 * @typedef {object} ArcadeEvent
 * @property {'question'|'buzz'|'correct'|'wrong'|'part'|'adjust'|'modifier'|'end'|'reset'} t
 * @property {number} [q] - question: which one
 * @property {?string} [modifier] - question, modifier: the power-up in play
 * @property {number} [team] - buzz, correct, wrong, adjust
 * @property {boolean} [power] - correct, in Quizbowl: before the (*)
 * @property {boolean} [neg] - wrong, in Quizbowl: interrupted the question
 * @property {boolean} [right] - part: a bonus part answered right
 * @property {number} [lives] - adjust: change in lives
 * @property {number} [points] - adjust: change in points
 * @property {boolean} [shield] - adjust: give (true) or take (false) the shield
 * @property {boolean} [out] - adjust: eliminate (true) or bring back (false)
 * @property {'questions'|'time'|'moderator'} [reason] - end
 */

/**
 * What is saved. The state is never saved; it is rebuilt from this.
 * @typedef {object} Game
 * @property {number} version
 * @property {string} id
 * @property {string} mode - a key of MODES
 * @property {{name: string, key: string}[]} teams - key: what that team's buzz types
 * @property {GameConfig} config
 * @property {Question[]} questions
 * @property {ArcadeEvent[]} events
 * @property {boolean} paused
 * @property {boolean} started - false until the moderator first starts play
 * @property {boolean} projectQuestion - the scoreboard shows the question's text
 * @property {?import('./clock.js').Clock} clock - the answer clock
 * @property {?import('./clock.js').Clock} roundClock - the game clock, for timed modes
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} TeamState
 * @property {number} lives
 * @property {number} points
 * @property {boolean} shield
 * @property {boolean} out
 * @property {number} outOrder - 1 for the first team out, 2 for the next; 0 while in
 */

/**
 * @typedef {object} State
 * @property {number} q - index of the current question
 * @property {?string} modifier - the power-up on it
 * @property {?number} buzz - the team whose buzz waits on a ruling
 * @property {number[]} locked - teams that answered this question wrong
 * @property {?('correct'|'dead')} settled - how this question ended, once it
 *   has; a question with a bonus ends when the bonus does
 * @property {?number} answeredBy
 * @property {?{team: number, results: boolean[]}} bonus - the bonus being
 *   played on this question, a result per part ruled so far
 * @property {?string} ended - why the moderator or a clock ended the game
 * @property {?string} over - why the game is over: 'last-standing' or an ended reason
 * @property {TeamState[]} teams
 * @property {number} outCount
 * @property {{q: number, text: string}[]} log - one line per event, in plain words
 */

const freshTeams = game => game.teams.map(() => ({
  lives: MODES[game.mode].lives ? game.config.lives : 0,
  points: 0,
  shield: false,
  out: false,
  outOrder: 0
}));

/** @returns {State} */
function freshState (game) {
  return {
    q: 0,
    modifier: null,
    buzz: null,
    locked: [],
    settled: null,
    answeredBy: null,
    bonus: null,
    ended: null,
    over: null,
    teams: freshTeams(game),
    outCount: 0,
    log: []
  };
}

const opensToOut = state => Boolean(MODIFIERS[state.modifier]?.opensToOut);

/**
 * @typedef {ReturnType<typeof opsFor>} Ops
 */

/**
 * What modes and power-ups may do to the teams. Shields and the lives cap are
 * honoured here, so no rule has to remember them.
 * @param {Game} game
 * @param {State} state
 */
function opsFor (game, state) {
  const most = game.config.lives;
  const t = i => state.teams[i];
  const ops = {
    lives: i => t(i).lives,
    points: i => t(i).points,
    /** @returns {number} lives gained: never past the starting count, never while out */
    gainLives (i, n) {
      if (t(i).out) return 0;
      const gained = Math.max(0, Math.min(n, most - t(i).lives));
      t(i).lives += gained;
      return gained;
    },
    /** @returns {number} lives lost; a shield takes the whole hit and breaks */
    loseLives (i, n) {
      if (t(i).out || n <= 0) return 0;
      if (t(i).shield) {
        t(i).shield = false;
        return 0;
      }
      const lost = Math.min(n, t(i).lives);
      t(i).lives -= lost;
      if (t(i).lives === 0) ops.eliminate(i);
      return lost;
    },
    /** @returns {number} the change made; a shield blocks a loss and breaks */
    addPoints (i, n) {
      if (n < 0 && t(i).shield) {
        t(i).shield = false;
        return 0;
      }
      t(i).points += n;
      return n;
    },
    /** Moves up to n points from one team to another, never more than it has. */
    takePoints (from, to, n) {
      const amount = Math.min(n, Math.max(0, t(from).points));
      if (amount <= 0) return 0;
      const taken = -ops.addPoints(from, -amount);
      if (taken) ops.addPoints(to, taken);
      return taken;
    },
    takeLife (from, to) {
      const lost = ops.loseLives(from, 1);
      if (lost) ops.gainLives(to, lost);
      return lost;
    },
    giveShield (i) {
      if (!t(i).out) t(i).shield = true;
    },
    eliminate (i) {
      Object.assign(t(i), { lives: 0, shield: false, out: true, outOrder: ++state.outCount });
    },
    /** Back in, with no lives yet: the right answer that revived them gives the first. */
    revive (i) {
      Object.assign(t(i), { out: false, outOrder: 0 });
    },
    /**
     * The other teams still in with the most lives or points, if that is more
     * than `above`.
     * @param {number} except
     * @param {'lives'|'points'} what
     * @param {number} [above]
     * @returns {number[]}
     */
    leaders (except, what, above = -Infinity) {
      const others = state.teams.map((x, i) => i).filter(i => i !== except && !t(i).out);
      const top = Math.max(...others.map(i => t(i)[what]));
      return top > above ? others.filter(i => t(i)[what] === top) : [];
    }
  };
  return ops;
}

function rulingContext (game, state, team, e = {}) {
  const modifier = MODIFIERS[state.modifier] || null;
  return {
    team,
    modifier,
    scale: modifier?.scale || 1,
    lives: MODES[game.mode].lives,
    power: Boolean(e.power),
    neg: Boolean(e.neg),
    ops: opsFor(game, state)
  };
}

/** The bonus a right answer on this question earns, if the mode plays them. */
const bonusOf = (game, state) => (MODES[game.mode].quizbowl && game.questions[state.q]?.bonus) || null;

/** A bonus under way: its team answers, and no one buzzes. */
const inBonus = state => Boolean(state.bonus && !state.settled);

/**
 * The teams that may still buzz on this question.
 * @param {Game} game
 * @param {State} state
 * @returns {number[]}
 */
export function eligibleTeams (game, state) {
  const open = opensToOut(state);
  return state.teams.map((x, i) => i).filter(i => !state.locked.includes(i) && (open || !state.teams[i].out));
}

/** How each event changes the state. Only act() adds events, so these trust them. */
const APPLY = {
  question (game, state, e) {
    Object.assign(state, { q: e.q, modifier: e.modifier ?? null, buzz: null, locked: [], settled: null, answeredBy: null, bonus: null });
  },
  buzz (game, state, e) {
    state.buzz = e.team;
  },
  correct (game, state, e) {
    const ctx = rulingContext(game, state, e.team, e);
    // only possible on a question that lets eliminated teams buzz
    if (state.teams[e.team].out) ctx.ops.revive(e.team);
    MODES[game.mode].correct(ctx);
    ctx.modifier?.afterCorrect?.(ctx);
    Object.assign(state, { buzz: null, answeredBy: e.team });
    if (bonusOf(game, state)) state.bonus = { team: e.team, results: [] };
    else state.settled = 'correct';
  },
  wrong (game, state, e) {
    MODES[game.mode].wrong(rulingContext(game, state, e.team, e));
    state.buzz = null;
    state.locked.push(e.team);
    if (!game.config.rebounds || !eligibleTeams(game, state).length) state.settled = 'dead';
  },
  part (game, state, e) {
    const bonus = state.bonus;
    if (e.right) MODES[game.mode].bonusPart(rulingContext(game, state, bonus.team));
    bonus.results.push(Boolean(e.right));
    if (bonus.results.length >= bonusOf(game, state).parts.length) state.settled = 'correct';
  },
  // the moderator's fixes go around the rules: no shields, no lives cap
  adjust (game, state, e) {
    const ops = opsFor(game, state);
    const t = state.teams[e.team];
    if (e.out === true && !t.out) ops.eliminate(e.team);
    if (e.out === false && t.out) {
      ops.revive(e.team);
      t.lives = Math.max(t.lives, 1);
    }
    if (e.lives) {
      t.lives = Math.max(0, Math.min(MAX_LIVES, t.lives + e.lives));
      if (MODES[game.mode].lives && t.lives === 0 && !t.out) ops.eliminate(e.team);
      if (t.lives > 0 && t.out) ops.revive(e.team);
    }
    if (e.points) t.points += e.points;
    if (typeof e.shield === 'boolean') t.shield = e.shield && !t.out;
    // a team taken out while its buzz waited cannot answer
    if (state.buzz === e.team && t.out && !opensToOut(state)) state.buzz = null;
  },
  modifier (game, state, e) {
    state.modifier = e.modifier ?? null;
  },
  end (game, state, e) {
    state.ended = e.reason;
  },
  reset (game, state) {
    Object.assign(state, {
      teams: freshTeams(game), outCount: 0, buzz: null, locked: [], settled: null, answeredBy: null, bonus: null, ended: null
    });
  }
};

function overOf (game, state) {
  if (state.ended) return state.ended;
  if (MODES[game.mode].lives && state.teams.filter(t => !t.out).length <= 1) return 'last-standing';
  return null;
}

const signed = n => (n > 0 ? '+' : '−') + Math.abs(n);

function changeText (a, b) {
  const parts = [];
  if (b.lives !== a.lives) parts.push(signed(b.lives - a.lives) + (Math.abs(b.lives - a.lives) === 1 ? ' life' : ' lives'));
  if (b.points !== a.points) parts.push(signed(b.points - a.points));
  if (!a.shield && b.shield) parts.push('+shield');
  if (a.shield && !b.shield && !b.out) parts.push('shield used');
  if (b.out && !a.out) parts.push('OUT');
  if (a.out && !b.out) parts.push('back in');
  return parts.join(' ');
}

/** One line for the console's history, in plain words. */
function describe (game, e, before, state) {
  const name = i => game.teams[i].name;
  const lives = MODES[game.mode].lives;
  const text = {
    question: () => 'Question ' + (e.q + 1) + (e.modifier ? ' (' + MODIFIERS[e.modifier].label(lives) + ')' : ''),
    buzz: () => name(e.team) + ' buzzed',
    correct: () => name(e.team) + (e.power ? ' power' : ' right'),
    wrong: () => name(e.team) + (e.neg ? ' neg' : ' wrong'),
    part: () => name(state.bonus.team) + ' bonus part ' + state.bonus.results.length + (e.right ? ' right' : ' wrong'),
    adjust: () => 'Fixed by hand',
    modifier: () => 'Power-up now ' + (e.modifier ? MODIFIERS[e.modifier].label(lives) : 'none'),
    end: () => ({ questions: 'Out of questions', time: 'Time is up', moderator: 'Game ended by the moderator' })[e.reason],
    reset: () => 'Every team back to the start'
  }[e.t]();
  if (e.t === 'reset') return text;
  const changes = state.teams
    .map((t, i) => [i, changeText(before[i], t)])
    .filter(([, c]) => c)
    .map(([i, c]) => name(i) + ' ' + c);
  return changes.length ? text + ': ' + changes.join(', ') : text;
}

/**
 * Rebuilds the state by replaying the game's events.
 * @param {Game} game
 * @returns {State}
 */
export function replay (game) {
  const state = freshState(game);
  for (const e of game.events) {
    const before = state.teams.map(t => ({ ...t }));
    APPLY[e.t](game, state, e);
    state.over = overOf(game, state);
    state.log.push({ q: state.q, text: describe(game, e, before, state) });
  }
  return state;
}

/**
 * Why a team's buzz does not count right now, or null if it does. An
 * eliminated team's buzzer stays plugged into the lockout box, so its light
 * can still come on; this is what keeps it out of the game.
 * @param {Game} game
 * @param {State} state
 * @param {number} team
 * @returns {?string}
 */
export function whyNoBuzz (game, state, team) {
  const name = game.teams[team]?.name;
  if (name === undefined) return 'There is no team ' + (team + 1) + '.';
  if (state.over) return 'The game is over.';
  if (game.paused) return 'The game is paused.';
  if (state.teams[team].out && !opensToOut(state)) return name + ' is out. Ignore their light.';
  if (inBonus(state)) return 'This is ' + game.teams[state.bonus.team].name + "'s bonus. Only they answer.";
  if (state.settled) return 'This question is done. Press Next.';
  if (state.buzz !== null) return state.buzz === team ? name + ' already buzzed.' : game.teams[state.buzz].name + ' buzzed first.';
  if (state.locked.includes(team)) return name + ' already answered this question.';
  return null;
}

/**
 * Draws the power-up for a question coming up, or none.
 * @param {Game} game
 * @param {State} state - as the question comes up
 * @param {() => number} random
 * @returns {?string}
 */
export function drawModifier (game, state, random) {
  const mode = MODES[game.mode];
  if (!game.config.powerUps || random() >= mode.modifierChance) return null;
  const options = game.config.modifiers.filter(id => {
    const m = MODIFIERS[id];
    return m && (!m.livesOnly || mode.lives) && (!m.available || m.available(state));
  });
  return options.length ? options[Math.floor(random() * options.length)] : null;
}

/** Seconds on the answer clock for a question. */
export function answerLimit (game, q) {
  return game.config.answerSeconds || secondsFor(game.questions[q]?.question);
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/**
 * Checks a setup and starts a game on its first question, paused.
 * @param {object} options
 * @param {string} options.id
 * @param {string} options.mode
 * @param {{name: string, key: string}[]} options.teams
 * @param {Partial<GameConfig>} options.config
 * @param {Question[]} options.questions
 * @param {() => number} [options.random]
 * @param {number} [options.now]
 * @returns {Game}
 */
export function newGame ({ id, mode, teams, config, questions, random = Math.random, now = Date.now() }) {
  const m = MODES[mode];
  if (!m) throw new ArcadeError('Pick a game mode.');
  if (teams.length < 2 || teams.length > MAX_TEAMS) throw new ArcadeError('An arcade game takes 2 to ' + MAX_TEAMS + ' teams.');
  const names = teams.map(t => String(t.name || '').trim());
  const keys = teams.map(t => String(t.key || '').toLowerCase());
  if (names.some(n => !n)) throw new ArcadeError('Every team needs a name.');
  if (new Set(names.map(n => n.toLowerCase())).size < names.length) throw new ArcadeError('Two teams have the same name.');
  if (keys.some(k => k.length !== 1)) throw new ArcadeError('Every team needs a one-character buzzer key.');
  if (new Set(keys).size < keys.length) throw new ArcadeError('Two teams have the same buzzer key.');
  if (!questions.length) throw new ArcadeError('No questions came back for those categories.');
  const powerUps = m.powerUps === 'always' || (m.powerUps === 'optional' && Boolean(config.powerUps));
  const modifiers = (config.modifiers || Object.keys(MODIFIERS)).filter(k => MODIFIERS[k]);
  if (m.powerUps === 'always' && !modifiers.some(k => !MODIFIERS[k].livesOnly || m.lives)) {
    throw new ArcadeError(m.name + ' needs at least one power-up.');
  }
  const minutes = m.timed ? clamp(config.minutes ?? m.defaults.minutes, 1, 20) : 0;
  const game = {
    version: VERSION,
    id,
    mode,
    teams: names.map((name, i) => ({ name, key: keys[i] })),
    config: {
      lives: clamp(config.lives ?? m.defaults.lives ?? 3, 1, MAX_LIVES),
      powerUps,
      modifiers,
      rebounds: config.rebounds !== false,
      showAnswers: config.showAnswers !== false,
      answerSeconds: m.defaults.answerSeconds || 0,
      minutes,
      level: config.level || 'varsity',
      math: config.math || 'auto',
      categories: config.categories || []
    },
    questions,
    events: [],
    paused: true,
    started: false,
    projectQuestion: questions[0].category === 'World Language',
    clock: null,
    roundClock: minutes ? newClock(minutes * 60000) : null,
    createdAt: now,
    updatedAt: now
  };
  game.events.push({ t: 'question', q: 0, modifier: drawModifier(game, freshState(game), random) });
  game.clock = newClock(answerLimit(game, 0) * 1000);
  return game;
}

/**
 * Applies a moderator's action, or refuses it with an ArcadeError saying why.
 * The game passed in is left alone.
 * @param {Game} game
 * @param {{type: string, team?: number, reason?: string, modifier?: ?string, questions?: Question[],
 *   lives?: number, points?: number, shield?: boolean, out?: boolean, power?: boolean, neg?: boolean,
 *   right?: boolean}} action
 * @param {() => number} [random] - for drawing power-ups
 * @returns {Game}
 */
export function act (game, action, random = Math.random) {
  const state = replay(game);
  const push = e => ({ ...game, events: game.events.concat([e]) });
  const notOver = () => {
    if (state.over) throw new ArcadeError('The game is over. Undo, or start a new game.');
  };
  switch (action.type) {
    case 'buzz': {
      const why = whyNoBuzz(game, state, action.team);
      if (why) throw new ArcadeError(why);
      return push({ t: 'buzz', team: action.team });
    }
    case 'correct':
    case 'wrong': {
      notOver();
      if (state.buzz === null) throw new ArcadeError('No one has buzzed.');
      const e = { t: action.type, team: state.buzz };
      // only Quizbowl scores by where in the question the buzz came
      if (MODES[game.mode].quizbowl) {
        if (action.type === 'correct' && action.power) e.power = true;
        if (action.type === 'wrong' && action.neg) e.neg = true;
      }
      return push(e);
    }
    case 'part':
      notOver();
      if (!inBonus(state)) throw new ArcadeError('There is no bonus to rule on.');
      return push({ t: 'part', right: Boolean(action.right) });
    case 'next':
      notOver();
      if (state.buzz !== null) throw new ArcadeError('Rule on ' + game.teams[state.buzz].name + "'s buzz first.");
      if (inBonus(state)) throw new ArcadeError('Finish ' + game.teams[state.bonus.team].name + "'s bonus first: right or wrong on each part.");
      if (state.q + 1 >= game.questions.length) return push({ t: 'end', reason: 'questions' });
      return push({ t: 'question', q: state.q + 1, modifier: drawModifier(game, state, random) });
    case 'throwout': {
      // every buzz and ruling on this question undone, then on to the next;
      // the moderator's fixes during it stand
      notOver();
      const start = game.events.findLastIndex(e => e.t === 'question');
      const kept = game.events.filter((e, i) => i <= start || !['buzz', 'correct', 'wrong', 'part'].includes(e.t));
      return act({ ...game, events: kept }, { type: 'next' }, random);
    }
    case 'undo':
      if (game.events.length <= 1) throw new ArcadeError('Nothing to undo.');
      return { ...game, events: game.events.slice(0, -1) };
    case 'adjust': {
      if (!game.teams[action.team]) throw new ArcadeError('There is no team ' + (action.team + 1) + '.');
      const e = { t: 'adjust', team: action.team };
      for (const k of ['lives', 'points', 'shield', 'out']) if (action[k] !== undefined) e[k] = action[k];
      return push(e);
    }
    case 'modifier':
      notOver();
      if (state.buzz !== null || state.locked.length || state.settled || state.bonus) {
        throw new ArcadeError('The power-up can only change before anyone buzzes.');
      }
      return push({ t: 'modifier', modifier: action.modifier || null });
    case 'end':
      notOver();
      return push({ t: 'end', reason: action.reason === 'time' ? 'time' : 'moderator' });
    case 'reset':
      return push({ t: 'reset' });
    case 'more': {
      // more questions; a game that ran out of them picks up again
      const known = new Set(game.questions.map(q => q.id));
      const fresh = (action.questions || []).filter(q => !known.has(q.id));
      if (!fresh.length) throw new ArcadeError('No new questions came back.');
      const grown = { ...game, questions: game.questions.concat(fresh) };
      const last = game.events[game.events.length - 1];
      if (last.t === 'end' && last.reason === 'questions') {
        return act({ ...grown, events: grown.events.slice(0, -1) }, { type: 'next' }, random);
      }
      return grown;
    }
    default:
      throw new ArcadeError('Unknown action: ' + action.type);
  }
}

/**
 * Teams best first, with ties sharing a rank. In the lives modes, teams still
 * in come first (most lives, then most points), then the rest by how long they
 * lasted; otherwise most points.
 * @param {Game} game
 * @param {State} state
 * @returns {{team: number, rank: number}[]}
 */
export function standings (game, state) {
  const lives = MODES[game.mode].lives;
  const key = t => lives ? [t.out ? 0 : 1, t.out ? t.outOrder : t.lives, t.points] : [t.points];
  const cmp = (a, b) => {
    const x = key(state.teams[a]);
    const y = key(state.teams[b]);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  };
  const order = state.teams.map((x, i) => i).sort((a, b) => cmp(a, b) || a - b);
  let rank = 0;
  return order.map((team, n) => {
    if (n === 0 || cmp(order[n - 1], team) !== 0) rank = n + 1;
    return { team, rank };
  });
}

/**
 * The winners once the game is over: one team, or several tied.
 * @returns {number[]}
 */
export function winners (game, state) {
  if (!state.over) return [];
  return standings(game, state).filter(s => s.rank === 1).map(s => s.team);
}
