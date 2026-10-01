// Reading recorded games, shared by the stats and insights pages: who played
// and for how long, how early a buzz came, and which games a month/level filter
// covers.

import { LEVELS } from '../../routes/kshsaa-round.js';

const LEVEL_KEYS = Object.keys(LEVELS);

/**
 * Celerity, as qbreader defines it: the share of the question still unread when
 * the buzz came, so 1.0 is a first-word buzz and 0 is a buzz at the very end.
 * qbreader measures that in characters; a word index is proportional to it and
 * is what MODAQ gives us, so use the word position against the buzzable-word
 * count the reader sent. Returns null when the denominator is unknown, which is
 * the case for games exported from MODAQ somewhere else.
 * @param {?number} wordIndex
 * @param {?number} wordCount
 * @returns {?number}
 */
export function celerityOf (wordIndex, wordCount) {
  if (wordIndex == null || !wordCount || wordCount < 2) { return null; }
  const c = 1 - wordIndex / (wordCount - 1);
  return Math.min(1, Math.max(0, Number(c.toFixed(4))));
}

// Month boundaries in the team's own time zone, so a game read at 8pm on the
// last day of the month is not filed under the next one (the server runs UTC).
const MONTH_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' });
export const monthKeyOf = date => MONTH_FORMAT.format(new Date(date)).slice(0, 7);
export const monthLabel = key => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** First month of the current school year, which starts in August. */
export function seasonStartKey () {
  const [y, m] = monthKeyOf(new Date()).split('-').map(Number);
  return (m >= 8 ? y : y - 1) + '-08';
}

/**
 * The month and level filters from a query string, validated, plus tests for a
 * game's month key and level key.
 * @param {object} query - req.query
 */
export function readFilters (query) {
  const month = query.month === 'all' || /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : 'season';
  const level = query.level === 'untagged' || LEVEL_KEYS.includes(query.level) ? query.level : 'all';
  const season = seasonStartKey();
  return {
    month,
    level,
    season,
    inMonth: key => month === 'all' || (month === 'season' ? key >= season : key === month),
    inLevel: key => level === 'all' || key === level
  };
}

/**
 * Who was in the room for a game, and for how many tossups. MODAQ reports it
 * per player, keyed "team|player"; players added by hand have no count and fall
 * back to the whole round. A bench player who never came in is left out.
 * @param {object} g - a stored game
 * @returns {Map<string, number>} player name -> tossups heard
 */
export function playersInGame (g) {
  const heardBy = new Map();
  for (const t of g.teams || []) {
    for (const name of t.players || []) {
      const heard = g.heardByPlayer?.[t.name + '|' + name] ?? g.tossupsRead ?? 0;
      heardBy.set(name, Math.max(heardBy.get(name) ?? 0, heard));
    }
  }
  const buzzers = new Set((g.buzzes || []).map(b => b.player));
  for (const name of buzzers) { if (!heardBy.has(name)) heardBy.set(name, g.tossupsRead ?? 0); }
  for (const [name, heard] of heardBy) { if (!heard && !buzzers.has(name)) heardBy.delete(name); }
  return heardBy;
}
