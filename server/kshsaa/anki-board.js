// The Anki leaderboard's numbers: which days a week or a month covers, the
// days an add-on sends checked, players' codes, and the board itself. Nothing
// here touches the database, so npm test runs it as is;
// routes/kshsaa-anki.js does the storing.
//
// A "review" is one answer to one card, Again through Easy, counted every
// time: the number Anki shows as "Studied N cards today". It is what the
// board ranks. Days are the player's own Anki days, which roll over at the
// hour set in Anki's preferences (4 AM unless changed), labeled with the date
// the day began on.

import { createHash, randomBytes } from 'crypto';

const DAY_MS = 86400000;
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });

/** How far back an add-on may send days. */
export const SYNC_DAYS_BACK = 120;

// what one day can hold: more than anyone studies, less than nonsense
const LIMITS = { reviews: 20000, cards: 20000, newCards: 10000, seconds: 86400 };

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
 * The days a board covers: a week from Monday through Sunday, or a calendar
 * month.
 * @param {'week'|'month'} period
 * @param {number} back - 0 for the one today is in, 1 for the one before
 * @param {string} today - YYYY-MM-DD
 * @returns {{from: string, to: string, label: string}}
 */
export function periodRange (period, back, today) {
  const t = toDate(today);
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
