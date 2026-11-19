/* global localStorage */
// What a player has practiced, kept in this browser only, the way the Spanish
// page keeps its progress: how each skill and flashcard has gone, the problems
// to come back to, and flash anzan runs.

const KEY = 'math-bowl-progress-v1';
const MAX_MISSED = 150;

const count = n => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const tallies = (raw, fields) => {
  const out = {};
  for (const [id, t] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (t && typeof t === 'object' && id.length <= 80) out[id] = Object.fromEntries(fields.map(f => [f, count(t[f])]));
  }
  return out;
};

/**
 * A saved record, or a backup file, made safe to use: anything that is not
 * the shape the page wrote is dropped.
 * @param {*} raw
 * @returns {{skills: object, cards: object, anzan: object, missed: object[]}}
 */
export function cleanRecord (raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    // seen, right, and the milliseconds the right answers took
    skills: tallies(r.skills, ['seen', 'right', 'ms']),
    cards: tallies(r.cards, ['seen', 'right']),
    // by setting: "2 digits, 10 numbers, 1s"
    anzan: tallies(r.anzan, ['seen', 'right']),
    missed: (Array.isArray(r.missed) ? r.missed : [])
      .filter(m => m && typeof m.skill === 'string' && typeof m.prompt === 'string' && m.answer && typeof m.answer === 'object')
      .slice(-MAX_MISSED)
  };
}

export function loadRecord () {
  try {
    return cleanRecord(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return cleanRecord(null);
  }
}

/** @returns {boolean} whether it was saved; false in a private window with storage off */
export function saveRecord (record) {
  try {
    record.missed = record.missed.slice(-MAX_MISSED);
    localStorage.setItem(KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
