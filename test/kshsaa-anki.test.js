// The Anki leaderboard: periods, what an add-on may send, the board, the
// Season Belt, codes, and the zip the add-on downloads as.
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'zlib';

import {
  SYNC_DAYS_BACK, addDays, buildBoard, cleanSync, codeHash, isDayKey, newCode, normalizeCode, periodRange, seasonBelt, standingOf,
  syncChanges, syncServers
} from '../server/kshsaa/anki-board.js';
import { crc32, zipFiles } from '../server/kshsaa/zip.js';

const TODAY = '2026-11-18'; // a Wednesday

test('a week runs Monday through Sunday, and a month is a calendar month', () => {
  assert.deepEqual(periodRange('week', 0, TODAY), { from: '2026-11-16', to: '2026-11-22', label: 'Week of November 16' });
  assert.deepEqual(periodRange('week', 1, TODAY), { from: '2026-11-09', to: '2026-11-15', label: 'Week of November 9' });
  assert.equal(periodRange('week', 0, '2026-11-16').from, '2026-11-16', 'Monday starts its own week');
  assert.equal(periodRange('week', 0, '2026-11-22').from, '2026-11-16', 'Sunday ends it');
  assert.deepEqual(periodRange('month', 0, TODAY), { from: '2026-11-01', to: '2026-11-30', label: 'November 2026' });
  assert.deepEqual(periodRange('month', 2, TODAY), { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' });
  assert.deepEqual(periodRange('month', 11, TODAY).from, '2025-12-01');
  assert.equal(periodRange('month', 0, '2028-02-10').to, '2028-02-29', 'leap year');
  assert.equal(periodRange('week', 0, '2027-01-01').from, '2026-12-28', 'a week across New Year');
});

test('a season runs August 1 through May 31, and June and July still show the one that ended', () => {
  assert.deepEqual(periodRange('season', 0, TODAY), { from: '2026-08-01', to: '2027-05-31', label: '2026–27 season', years: '2026–27' });
  assert.equal(periodRange('season', 0, '2027-03-15').from, '2026-08-01', 'spring is the same season');
  assert.equal(periodRange('season', 0, '2027-07-31').from, '2026-08-01', 'July still shows the season that ended');
  assert.equal(periodRange('season', 0, '2027-08-01').from, '2027-08-01', 'August 1 starts the next');
  assert.deepEqual(periodRange('season', 1, TODAY), { from: '2025-08-01', to: '2026-05-31', label: '2025–26 season', years: '2025–26' });
  assert.equal(periodRange('season', 0, '2099-09-01').years, '2099–00');
});

test('day keys are real dates', () => {
  assert.ok(isDayKey('2026-02-28') && isDayKey('2028-02-29'));
  for (const bad of ['2026-02-29', '2026-13-01', '2026-1-01', 'yesterday', '', null, 20261118]) assert.ok(!isDayKey(bad), String(bad));
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('what an add-on sends is checked', () => {
  const day = (d, reviews, more = {}) => ({ day: d, reviews, cards: reviews, newCards: 0, seconds: reviews * 8, ...more });
  const ok = cleanSync({ from: '2026-09-20', days: [day('2026-11-17', 120), day('2026-11-18', 0), day('2026-11-19', 5)] }, TODAY);
  assert.deepEqual(ok.days.map(d => d.day), ['2026-11-17', '2026-11-19'], 'days without reviews are dropped; tomorrow is allowed');
  assert.equal(ok.from, '2026-09-20');
  // from defaults to the first day sent, and is held to the window
  assert.equal(cleanSync({ days: [day('2026-11-10', 3), day('2026-11-12', 4)] }, TODAY).from, '2026-11-10');
  assert.equal(cleanSync({ from: '2025-01-01', days: [] }, TODAY).from, addDays(TODAY, -SYNC_DAYS_BACK));
  const bad = [
    {},
    { days: 'lots' },
    { days: [day('2026-11-20', 3)] }, // two days ahead
    { days: [day(addDays(TODAY, -SYNC_DAYS_BACK - 1), 3)] },
    { days: [day('2026-11-17', 3), day('2026-11-17', 4)] },
    { days: [day('2026-11-17', -1)] },
    { days: [day('2026-11-17', 2.5)] },
    { days: [day('2026-11-17', 30000)] },
    { days: [day('2026-11-17', 3, { seconds: 90000 })] },
    { days: [day('2026-02-30', 3)] },
    { from: '2026-11-17', days: [day('2026-11-16', 3)] },
    { days: Array.from({ length: SYNC_DAYS_BACK + 3 }, (_, i) => day(addDays(TODAY, -i), 1)) }
  ];
  for (const body of bad) assert.throws(() => cleanSync(body, TODAY), JSON.stringify(body).slice(0, 90));
});

test('an add-on may send a whole season, and in July the year back to August', () => {
  const since = (first, n) => Array.from({ length: n }, (_, i) => ({ day: addDays(first, i), reviews: 5 }));
  const sent = cleanSync({ from: '2026-08-01', days: since('2026-08-01', 110) }, TODAY);
  assert.equal(sent.from, '2026-08-01');
  assert.equal(sent.days.length, 110);
  assert.equal(sent.days.at(-1).day, TODAY);
  assert.equal(cleanSync({ from: '2026-08-01', days: since('2026-08-01', 365) }, '2027-07-31').days.length, 365);
});

test('a send writes only the days that changed', () => {
  const day = (d, reviews, seconds) => ({ day: d, reviews, cards: reviews, newCards: 0, seconds });
  const stored = [day('2026-11-10', 40, 400), day('2026-11-12', 20, 200), day('2026-11-15', 9, 90)];
  const { write, remove } = syncChanges(stored, {
    from: '2026-11-01',
    days: [day('2026-11-10', 40, 400), day('2026-11-15', 9, 95), day('2026-11-18', 12, 100)]
  });
  assert.deepEqual(write.map(d => d.day), ['2026-11-15', '2026-11-18'], 'the same counts are not written again; new seconds are');
  assert.deepEqual(remove, ['2026-11-12'], 'a stored day the send no longer lists has no reviews now');
  assert.deepEqual(syncChanges(stored, { from: '2026-11-11', days: [] }).remove, ['2026-11-12', '2026-11-15'], 'days before the window stay');
  assert.deepEqual(syncChanges([], { from: '2026-11-01', days: [day('2026-11-02', 3, 30)] }), { write: [day('2026-11-02', 3, 30)], remove: [] });
});

test('the Season Belt goes to the most cards since August 1, changes hands, and is won when May ends', () => {
  const players = [{ _id: 'a', name: 'Ava' }, { _id: 'b', name: 'Ben' }, { _id: 'c', name: 'Cal' }];
  const d = (player, day, reviews) => ({ player, day, reviews });
  const season = periodRange('season', 0, TODAY);
  const days = [
    d('a', '2026-07-30', 900), // before the season
    d('a', '2026-09-01', 100),
    d('b', '2026-09-03', 150), // Ben takes it
    d('a', '2026-09-10', 60), // Ava takes it back, 160 to 150
    d('c', '2026-11-18', 40),
    d('zz', '2026-11-18', 999) // a removed player's leftovers
  ];
  const belt = seasonBelt(players, days, season, TODAY);
  assert.equal(belt.over, false);
  assert.deepEqual(belt.holders, ['a']);
  assert.equal(belt.reviews, 160);
  assert.deepEqual(belt.since, { a: '2026-09-10' });
  assert.deepEqual(belt.totals, { a: 160, b: 150, c: 40 });
  assert.deepEqual(belt.held, { a: 72, b: 7 }, 'Ava: Sep 1-2 and Sep 10 through today; Ben: Sep 3-9');
  assert.equal(buildBoard(players, days, season, TODAY)[0].name, 'Ava', 'the season board agrees');

  // a tie shares it, and a day sent from a time zone ahead counts as today
  const tied = seasonBelt(players, [...days, d('b', '2026-11-19', 10)], season, TODAY);
  assert.deepEqual(tied.holders.sort(), ['a', 'b']);
  assert.equal(tied.reviews, 160);
  assert.deepEqual(tied.since, { a: '2026-09-10', b: '2026-11-18' });

  const empty = seasonBelt(players, [], season, TODAY);
  assert.deepEqual([empty.holders, empty.reviews, empty.held], [[], 0, {}], 'nobody holds it before the first card');

  // once May is over, whoever held it on May 31 has won it; June's cards don't count
  const won = seasonBelt(players, [...days, d('c', '2027-05-31', 500), d('b', '2027-06-02', 900)], season, '2027-06-15');
  assert.equal(won.over, true);
  assert.deepEqual(won.holders, ['c']);
  assert.equal(won.reviews, 540);
  assert.deepEqual(won.since, { c: '2027-05-31' });
  assert.equal(won.totals.b, 150);
});

test('the board ranks by cards, shares tied ranks, and counts streaks', () => {
  const players = [{ _id: 'a', name: 'Ava' }, { _id: 'b', name: 'Ben' }, { _id: 'c', name: 'Cal' }, { _id: 'd', name: 'Dee' }, { _id: 'e', name: 'Eli' }];
  const d = (player, day, reviews, seconds = 0) => ({ player, day, reviews, seconds, newCards: 1 });
  const days = [
    d('a', '2026-11-16', 100, 600), d('a', '2026-11-17', 50, 300), d('a', '2026-11-18', 10, 60),
    d('b', '2026-11-15', 500), d('b', '2026-11-17', 160),
    d('c', '2026-11-12', 70), d('c', '2026-11-13', 70), d('c', '2026-11-14', 70), d('c', '2026-11-15', 70), d('c', '2026-11-16', 30), d('c', '2026-11-17', 130),
    d('d', '2026-11-18', 160),
    d('zz', '2026-11-18', 999) // a removed player's leftovers
  ];
  const board = buildBoard(players, days, periodRange('week', 0, TODAY), TODAY);
  assert.deepEqual(board.map(r => [r.name, r.reviews, r.rank]), [
    ['Ava', 160, 1], ['Ben', 160, 1], ['Cal', 160, 1], ['Dee', 160, 1], ['Eli', 0, null]
  ].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])));
  const by = Object.fromEntries(board.map(r => [r.name, r]));
  assert.equal(by.Ava.days, 3);
  assert.equal(by.Ava.seconds, 960);
  assert.equal(by.Ava.best, 100);
  assert.equal(by.Ava.newCards, 3);
  assert.equal(by.Ava.streak, 3, 'Monday through today');
  assert.equal(by.Ben.streak, 1, 'yesterday, with nothing yet today, still counts');
  assert.equal(by.Cal.streak, 6, 'a streak runs back past the start of the week');
  assert.equal(by.Dee.streak, 1);
  assert.equal(by.Eli.streak, 0);
  // the week before: only Ben and Cal studied
  const before = buildBoard(players, days, periodRange('week', 1, TODAY), TODAY);
  assert.deepEqual(before.filter(r => r.rank).map(r => [r.name, r.reviews, r.rank]), [['Ben', 500, 1], ['Cal', 280, 2]]);
  // standard competition ranking after a tie
  const tied = buildBoard(players, [d('a', TODAY, 9), d('b', TODAY, 9), d('c', TODAY, 4)], periodRange('week', 0, TODAY), TODAY);
  assert.deepEqual(tied.map(r => r.rank), [1, 1, 3, null, null]);
  assert.deepEqual(standingOf(tied, 'c'), { reviews: 4, rank: 3, of: 3 });
  assert.deepEqual(standingOf(tied, 'e'), { reviews: 0, rank: null, of: 3 });
});

test('codes are easy to copy and only their hashes are kept', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const code = newCode();
    assert.match(code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    seen.add(code);
  }
  assert.equal(seen.size, 300);
  assert.equal(normalizeCode(' abcd-efgh 2345 '), 'ABCDEFGH2345');
  assert.equal(codeHash('abcd-efgh-2345'), codeHash('ABCDEFGH2345'));
  assert.notEqual(codeHash('ABCDEFGH2345'), codeHash('ABCDEFGH2346'));
  assert.match(codeHash('x'), /^[0-9a-f]{64}$/);
});

// reads a zip back by its central directory, the way unzip tools do
function readZip (zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'no end of central directory');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(data), crc, name + ' fails its CRC');
    files[name] = data.toString('utf8');
    at += 46 + nameLength;
  }
  return files;
}

test('the zip writer makes a zip that reads back', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926, 'the standard CRC-32 check value');
  const files = { '__init__.py': 'print("hi")\n', 'config.json': '{"code": ""}', 'é.txt': 'ünïcode' };
  const zip = zipFiles(Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) })), new Date(2026, 10, 18, 21, 30, 10));
  assert.deepEqual(readZip(zip), files);
  assert.deepEqual(readZip(zipFiles([])), {});
});

test('the add-on sends to the always-awake site first, then the one it came from', () => {
  const awake = 'https://site--backup.code.run';
  assert.deepEqual(syncServers(awake, 'https://scholars-bowl.onrender.com'), [awake, 'https://scholars-bowl.onrender.com']);
  // downloaded from the always-awake site itself: listed once
  assert.deepEqual(syncServers(awake, 'https://SITE--backup.code.run/'), [awake]);
  assert.deepEqual(syncServers('', 'http://localhost:3029'), ['http://localhost:3029']);
});
