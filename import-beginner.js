// Import Beginner-level questions: the giveaway line of every middle-school
// tossup on qbreader.org, minus "For 10 points", which scholars bowl does not
// use. See server/kshsaa/giveaway.js for how the line is picked and which
// questions are skipped because their last line cannot stand alone.
//
// Run from the website folder (the same place as import-kshsaa.js):
//   node import-beginner.js              fetch, convert, and import
//   node import-beginner.js --dry-run    fetch and convert only; writes
//                                        beginner-preview.json to look over
//   node import-beginner.js --from raw.json   use tossups saved earlier with
//                                        --save-raw instead of fetching again
//   node import-beginner.js --save-raw raw.json
//
// Safe to re-run: removes the previous Beginner import first, and touches
// nothing else. Needs MONGODB_URI in .env (not for --dry-run).
//
// On a network that inspects secure connections (school Wi-Fi, some
// antivirus), Node rejects qbreader.org's certificate. Run it as
//   node --use-system-ca import-beginner.js ...
// so Node trusts the certificates Windows does.

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { MongoClient, ObjectId } from 'mongodb';
import { beginnerCategoryOf, giveawayOf } from './server/kshsaa/giveaway.js';

// overridable only so the fetching can be exercised against a local stand-in
const API = process.env.QBREADER_API || 'https://www.qbreader.org/api/query';
const SET_PREFIX = 'QB Beginner';
// qbreader's difficulty 1 is middle school; 1 is also free in this database,
// where 2 marks KSHSAA questions and 3 converted quizbowl
const DIFFICULTY = 1;
const CATEGORIES = ['Literature', 'Mythology', 'Science', 'History', 'Geography', 'Social Science', 'Religion', 'Philosophy', 'Fine Arts'];
// qbreader caps one query at 10,000 results, read a page at a time
const PAGE_SIZE = 500;
const QUERY_CAP = 10000;
const MIN_YEAR = 2000;
const MAX_YEAR = new Date().getFullYear();

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1]);
const dryRun = flag('--dry-run');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Node reports every network failure as "fetch failed"; the reason is in cause
function reasonFor (e) {
  const cause = e.cause;
  if (!cause) { return e.message; }
  return [cause.code, cause.message].filter(Boolean).join(': ');
}

async function query (params) {
  const url = API + '?' + new URLSearchParams({
    questionType: 'tossup',
    difficulties: String(DIFFICULTY),
    maxReturnLength: String(PAGE_SIZE),
    ...params
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SJA Scholars Bowl beginner import' } });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      const data = await res.json();
      return data.tossups || { count: 0, questionArray: [] };
    } catch (e) {
      if (attempt >= 4) {
        const why = reasonFor(e);
        const hint = /cert|self.signed/i.test(why)
          ? '\nThis network intercepts secure connections. Run it again as:\n  node --use-system-ca import-beginner.js ' + args.join(' ')
          : '\nCheck that https://www.qbreader.org opens in a browser on this computer.';
        throw new Error('Could not reach qbreader.org (' + why + ').' + hint + '\nURL: ' + url);
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/**
 * Every middle-school tossup in one category. A category bigger than one
 * query can return is fetched a year at a time instead.
 */
async function fetchCategory (category, minYear = MIN_YEAR, maxYear = MAX_YEAR) {
  const params = { categories: category, minYear: String(minYear), maxYear: String(maxYear) };
  const first = await query({ ...params, tossupPagination: '1' });
  if (first.count > QUERY_CAP && minYear < maxYear) {
    const all = [];
    for (let year = minYear; year <= maxYear; year++) { all.push(...await fetchCategory(category, year, year)); }
    return all;
  }
  const all = first.questionArray.slice();
  const pages = Math.ceil(Math.min(first.count, QUERY_CAP) / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    await sleep(250);
    all.push(...(await query({ ...params, tossupPagination: String(page) })).questionArray);
  }
  return all;
}

async function fetchAll () {
  const all = [];
  for (const category of CATEGORIES) {
    const list = await fetchCategory(category);
    console.log(`  ${category}: ${list.length} middle-school tossups`);
    all.push(...list);
  }
  return all;
}

/**
 * @param {object[]} raw - qbreader tossups
 * @returns {{questions: object[], skipped: object}}
 */
function convert (raw) {
  const questions = [];
  const skipped = { category: 0, cannotStandAlone: 0, duplicate: 0 };
  const seen = new Set();
  for (const t of raw) {
    const slot = beginnerCategoryOf(t);
    if (!slot) { skipped.category++; continue; }
    const question = giveawayOf(t.question_sanitized || t.question, slot.label === 'Mathematics');
    if (!question) { skipped.cannotStandAlone++; continue; }
    const key = question.toLowerCase();
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);
    questions.push({
      question,
      answer: t.answer_sanitized || t.answer,
      ...slot,
      sourceId: t._id,
      set: t.set?.name || 'Unknown set',
      year: t.set?.year ?? null,
      packet: t.packet?.name || 'Packet',
      packetNumber: t.packet?.number ?? 0
    });
  }
  return { questions, skipped };
}

async function save (questions) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGODB_URI in your .env first (or pass --dry-run).');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('qbreader');
  const setsCol = db.collection('sets');
  const packetsCol = db.collection('packets');
  const tossupsCol = db.collection('tossups');

  const mine = new RegExp('^' + SET_PREFIX);
  const wiped = await tossupsCol.deleteMany({ 'set.name': mine });
  await packetsCol.deleteMany({ 'set.name': mine });
  await setsCol.deleteMany({ name: mine });
  console.log(`Cleared the previous Beginner import (${wiped.deletedCount} tossups).`);

  // one Beginner set per middle-school set, so the source stays traceable
  const bySet = new Map();
  for (const q of questions) {
    if (!bySet.has(q.set)) { bySet.set(q.set, []); }
    bySet.get(q.set).push(q);
  }
  let total = 0;
  for (const [sourceSet, list] of bySet) {
    const setId = new ObjectId();
    const name = `${SET_PREFIX} - ${sourceSet}`;
    const year = list[0].year ?? 2015;
    await setsCol.insertOne({ _id: setId, name, year, difficulty: DIFFICULTY, standard: true, kshsaaImport: true });

    const byPacket = new Map();
    for (const q of list) {
      if (!byPacket.has(q.packetNumber)) { byPacket.set(q.packetNumber, []); }
      byPacket.get(q.packetNumber).push(q);
    }
    for (const [number, qs] of byPacket) {
      const packetId = new ObjectId();
      const packetName = qs[0].packet;
      await packetsCol.insertOne({ _id: packetId, name: packetName, number, set: { _id: setId, name }, kshsaaImport: true });
      await tossupsCol.insertMany(qs.map((q, i) => ({
        question: q.question,
        question_sanitized: q.question,
        answer: q.answer,
        answer_sanitized: q.answer,
        category: q.category,
        subcategory: q.subcategory,
        alternate_subcategory: q.alternate_subcategory,
        kshsaa_category: q.label,
        timed_seconds: null,
        number: i + 1,
        difficulty: DIFFICULTY,
        set: { _id: setId, name, year, standard: true },
        packet: { _id: packetId, name: packetName, number },
        kshsaaImport: true,
        source_tossup_id: q.sourceId,
        createdAt: new Date(),
        updatedAt: new Date()
      })));
      total += qs.length;
    }
  }
  await client.close();
  console.log(`Imported ${total} Beginner questions in ${bySet.size} sets.`);
}

const from = option('--from');
let raw;
if (from) {
  raw = JSON.parse(readFileSync(from, 'utf8'));
  console.log(`Loaded ${raw.length} tossups from ${from}`);
} else {
  console.log('Fetching middle-school tossups from qbreader.org...');
  try {
    raw = await fetchAll();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
const saveRaw = option('--save-raw');
if (saveRaw) {
  writeFileSync(saveRaw, JSON.stringify(raw));
  console.log(`Saved the raw tossups to ${saveRaw}`);
}

const { questions, skipped } = convert(raw);
const byLabel = {};
for (const q of questions) { byLabel[q.label] = (byLabel[q.label] || 0) + 1; }
console.log(`Kept ${questions.length} of ${raw.length}:`, byLabel);
console.log(`Skipped ${skipped.cannotStandAlone} whose last line needs the earlier clues, ` +
  `${skipped.category} in categories a round has no slot for, ${skipped.duplicate} duplicates.`);

if (dryRun) {
  writeFileSync('beginner-preview.json', JSON.stringify(questions, null, 2));
  console.log('Dry run: wrote beginner-preview.json, database untouched.');
} else {
  await save(questions);
}
