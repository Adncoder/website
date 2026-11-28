// The Anki leaderboard's numbers: which days a week, a month, or a season
// covers, the days an add-on sends checked, players' codes, the board itself,
// and the Season Belt. Nothing here touches the database, so npm test runs it
// as is; routes/kshsaa-anki.js does the storing.
//
// A "review" is one answer to one card, Again through Easy, counted every
// time: the number Anki shows as "Studied N cards today". It is what the
// board ranks. Days are the player's own Anki days, which roll over at the
// hour set in Anki's preferences (4 AM unless changed), labeled with the date
// the day began on.

import { createHash, randomBytes } from 'crypto';

const DAY_MS = 86400000;
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * How far back an add-on may send days: a whole season and then some, since
 * add-on 1.2 sends every day since August 1 (in July, nearly a year).
 */
export const SYNC_DAYS_BACK = 400;

// what one day can hold: more than anyone studies, less than nonsense
const LIMITS = { reviews: 20000, cards: 20000, newCards: 10000, seconds: 86400 };
const COUNTS = Object.keys(LIMITS);

/** Today in Kansas, as YYYY-MM-DD. */
export const todayKey = (date = new Date()) => DAY_FORMAT.format(date);

const toDate = key => new Date(key + 'T00:00:00Z');
const toKey = date => date.toISOString().slice(0, 10);
export const addDays = (key, n) => toKey(new Date(toDate(key).getTime() + n * DAY_MS));

/** Whether a string is a real calendar date written YYYY-MM-DD. */
export function isDayKey (key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = toDate(key);
  return !Number.isNaN(date.getTime()) && toKey(date) === key;
}

/**
 * The days a board covers: a week from Monday through Sunday, a calendar
 * month, or a season from August 1 through May 31. In June and July the
 * season is still the one that just ended, so its belt stays up until the
 * next one starts.
 * @param {'week'|'month'|'season'} period
 * @param {number} back - 0 for the one today is in, 1 for the one before
 * @param {string} today - YYYY-MM-DD
 * @returns {{from: string, to: string, label: string, years?: string}} -
 *   a season also has its years, as 2026–27
 */
export function periodRange (period, back, today) {
  const t = toDate(today);
  if (period === 'season') {
    const year = t.getUTCFullYear() - (t.getUTCMonth() < 7 ? 1 : 0) - back;
    const years = year + '–' + String(year + 1).slice(2);
    return { from: year + '-08-01', to: (year + 1) + '-05-31', label: years + ' season', years };
  }
  if (period === 'month') {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - back, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return { from: toKey(first), to: toKey(last), label: first.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  const monday = addDays(today, -((t.getUTCDay() + 6) % 7) - 7 * back);
  return {
    from: monday,
    to: addDays(monday, 6),
    label: 'Week of ' + toDate(monday).toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
  };
}

/**
 * What an add-on sent, checked: the first day its counts cover, and its days
 * with reviews. Dates go back at most SYNC_DAYS_BACK and forward at most to
 * tomorrow (a player can be a time zone ahead), each day once, and every
 * count a whole number within reason. Throws with a message for the player.
 * @param {*} body - { from, days: [{day, reviews, cards, newCards, seconds}] }
 * @param {string} today
 * @returns {{from: string, days: {day: string, reviews: number, cards: number, newCards: number, seconds: number}[]}}
 */
export function cleanSync (body, today) {
  const earliest = addDays(today, -SYNC_DAYS_BACK);
  const latest = addDays(today, 1);
  const inRange = key => isDayKey(key) && key >= earliest && key <= latest;
  const list = body?.days;
  if (!Array.isArray(list) || list.length > SYNC_DAYS_BACK + 2) throw new Error('days has to be a list of at most ' + (SYNC_DAYS_BACK + 2));
  const seen = new Set();
  const days = list.map(d => {
    const day = d?.day;
    if (!inRange(day)) throw new Error('a day has to be a date from ' + earliest + ' to ' + latest);
    if (seen.has(day)) throw new Error(day + ' is listed twice');
    seen.add(day);
    const out = { day };
    for (const [key, max] of Object.entries(LIMITS)) {
      const n = Number(d[key] ?? 0);
      if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(key + ' on ' + day + ' has to be a whole number from 0 to ' + max);
      out[key] = n;
    }
    return out;
  }).filter(d => d.reviews > 0);
  let from = body.from;
  if (from == null) from = days.reduce((a, d) => (d.day < a ? d.day : a), latest);
  if (!isDayKey(from)) throw new Error('from has to be a date');
  if (from < earliest) from = earliest;
  if (days.some(d => d.day < from)) throw new Error('a day comes before from');
  return { from, days };
}

/**
 * What a send changes in a player's stored days: the days to write, new or
 * with other counts, and the stored days in the window it covered that it no
 * longer lists, which have no reviews now. Days that did not change are left
 * alone, so a send covering the whole season writes only the day or two that
 * moved.
 * @param {{day: string}[]} stored - the player's stored days from sent.from on
 * @param {{from: string, days: {day: string}[]}} sent - from cleanSync
 * @returns {{write: object[], remove: string[]}} - remove lists days
 */
export function syncChanges (stored, sent) {
  const have = new Map(stored.map(d => [d.day, d]));
  const listed = new Set(sent.days.map(d => d.day));
  return {
    write: sent.days.filter(d => !have.has(d.day) || COUNTS.some(k => (have.get(d.day)[k] || 0) !== d[k])),
    remove: stored.filter(d => d.day >= sent.from && !listed.has(d.day)).map(d => d.day)
  };
}

/**
 * The board for one week or month: every player with their reviews, minutes,
 * days studied, new cards, best day, and current streak, best first. Players
 * tied on reviews share a rank; a player with no reviews has none.
 * @param {{_id: *, name: string, lastSyncAt: ?Date}[]} players
 * @param {{player: string, day: string, reviews: number, seconds?: number, newCards?: number}[]} days -
 *   every stored day from the period's start, and from SYNC_DAYS_BACK ago for the streaks
 * @param {{from: string, to: string}} range
 * @param {string} today
 */
export function buildBoard (players, days, range, today) {
  const rows = new Map(players.map(p => [String(p._id), {
    id: String(p._id), name: p.name, lastSyncAt: p.lastSyncAt || null, reviews: 0, seconds: 0, newCards: 0, days: 0, best: 0, streak: 0
  }]));
  const studied = new Map();
  for (const d of days) {
    const row = rows.get(String(d.player));
    if (!row || !(d.reviews > 0)) continue;
    if (!studied.has(row.id)) studied.set(row.id, new Set());
    studied.get(row.id).add(d.day);
    if (d.day < range.from || d.day > range.to) continue;
    row.reviews += d.reviews;
    row.seconds += d.seconds || 0;
    row.newCards += d.newCards || 0;
    row.days++;
    row.best = Math.max(row.best, d.reviews);
  }
  // a streak runs back from today, or from yesterday when today has nothing yet
  for (const row of rows.values()) {
    const set = studied.get(row.id) || new Set();
    let day = set.has(today) ? today : addDays(today, -1);
    while (set.has(day)) { row.streak++; day = addDays(day, -1); }
  }
  const sorted = [...rows.values()].sort((a, b) => b.reviews - a.reviews || a.name.localeCompare(b.name));
  let rank = 0;
  sorted.forEach((row, i) => {
    if (i === 0 || row.reviews !== sorted[i - 1].reviews) rank = i + 1;
    row.rank = row.reviews ? rank : null;
  });
  return sorted;
}

/**
 * Where a player stands on a board, for the add-on to show.
 * @returns {{reviews: number, rank: ?number, of: number}}
 */
export function standingOf (board, id) {
  const row = board.find(r => r.id === String(id));
  return { reviews: row ? row.reviews : 0, rank: row ? row.rank : null, of: board.filter(r => r.rank).length };
}

/**
 * The Season Belt. Whoever has studied the most cards since the season began
 * holds it, and whoever holds it when the season ends on May 31 wins it. It
 * is worked out a day at a time from the season's first day, so it also says
 * since when each holder has had it and how many days each player held it.
 * Players tied for the most share it, and nobody holds it before the
 * season's first card. A day sent from a time zone ahead counts as today.
 * @param {{_id: *}[]} players - a removed player's leftover days are skipped
 * @param {{player: string, day: string, reviews: number}[]} days - stored days, the season's at least
 * @param {{from: string, to: string}} season - from periodRange('season', ...)
 * @param {string} today
 * @returns {{over: boolean, holders: string[], reviews: number, since: Object<string, string>,
 *   held: Object<string, number>, totals: Object<string, number>}} - holders are player ids, reviews
 *   their season total; since is when each holder's current hold began, held the days each player
 *   has held it, totals each player's cards for the season so far
 */
export function seasonBelt (players, days, season, today) {
  const over = today > season.to;
  const last = over ? season.to : today;
  const ids = new Set(players.map(p => String(p._id)));
  const added = new Map();
  for (const d of days) {
    const id = String(d.player);
    if (!ids.has(id) || !(d.reviews > 0) || d.day < season.from || d.day > season.to) continue;
    const day = d.day > last ? last : d.day;
    if (!added.has(day)) added.set(day, []);
    added.get(day).push([id, d.reviews]);
  }
  const totals = new Map();
  const held = new Map();
  const since = new Map();
  let holders = [];
  for (let day = season.from; day <= last; day = addDays(day, 1)) {
    for (const [id, n] of added.get(day) || []) totals.set(id, (totals.get(id) || 0) + n);
    const top = Math.max(0, ...totals.values());
    const now = top ? [...totals.keys()].filter(id => totals.get(id) === top) : [];
    for (const id of now) {
      held.set(id, (held.get(id) || 0) + 1);
      if (!holders.includes(id)) since.set(id, day);
    }
    holders = now;
  }
  return {
    over,
    holders,
    reviews: holders.length ? totals.get(holders[0]) : 0,
    since: Object.fromEntries(holders.map(id => [id, since.get(id)])),
    held: Object.fromEntries(held),
    totals: Object.fromEntries(totals)
  };
}

// no 0/O or 1/I, so a code read aloud or copied by hand comes out right
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A new player code: 12 characters, 60 random bits, as XXXX-XXXX-XXXX. */
export function newCode () {
  const chars = [...randomBytes(12)].map(b => ALPHABET[b % 32]).join('');
  return chars.slice(0, 4) + '-' + chars.slice(4, 8) + '-' + chars.slice(8);
}

/** A code however it was typed: any case, with or without dashes and spaces. */
export const normalizeCode = code => String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/** What is stored instead of the code. */
export const codeHash = code => createHash('sha256').update(normalizeCode(code)).digest('hex');

/**
 * Where the add-on sends counts, in order (anki-addon/client.py): the site
 * that never sleeps, then the address the add-on was downloaded from, each
 * once. Every site shares one database, so any of them updates the board.
 * @param {string} awake - the always-awake site
 * @param {string} here - this site, as the download request reached it
 * @returns {string[]}
 */
export function syncServers (awake, here) {
  const seen = new Set();
  return [awake, here].map(s => String(s ?? '').trim().replace(/\/+$/, '')).filter(s => {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
