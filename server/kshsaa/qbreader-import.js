// Pulls tossups from qbreader.org into this database for the KSHSAA pages,
// keeping only each one's giveaway line (see giveaway.js). Shared by the
// import-*.js scripts in the website folder; run by hand, never by the server.
//
// Every script built on this takes the same options:
//   --dry-run            fetch and convert only; writes a preview file to look over
//   --save-raw raw.json  also keep the tossups as fetched
//   --from raw.json      use tossups saved earlier instead of fetching again
//
// On a network that inspects secure connections (school Wi-Fi, some
// antivirus), Node rejects qbreader.org's certificate. Run the script as
//   node --use-system-ca import-....js
// so Node trusts the certificates Windows does.

import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { MongoClient, ObjectId } from 'mongodb';
import { giveawayOf, lastSentencesOf } from './giveaway.js';

// overridable only so the fetching can be exercised against a local stand-in
const API = process.env.QBREADER_API || 'https://www.qbreader.org/api/query';
// qbreader caps one query at 10,000 results, read a page at a time
const PAGE_SIZE = 500;
const QUERY_CAP = 10000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Node reports every network failure as "fetch failed"; the reason is in cause
function reasonFor (e) {
  const cause = e.cause;
  if (!cause) { return e.message; }
  return [cause.code, cause.message].filter(Boolean).join(': ');
}

async function query (params) {
  const url = API + '?' + new URLSearchParams({ questionType: 'tossup', maxReturnLength: String(PAGE_SIZE), ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SJA Scholars Bowl question import' } });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      const data = await res.json();
      return data.tossups || { count: 0, questionArray: [] };
    } catch (e) {
      if (attempt >= 4) {
        const why = reasonFor(e);
        const command = ['node --use-system-ca', basename(process.argv[1]), ...process.argv.slice(2)].join(' ');
        const hint = /cert|self.signed/i.test(why)
          ? '\nThis network intercepts secure connections. Run it again as:\n  ' + command
          : '\nCheck that https://www.qbreader.org opens in a browser on this computer.';
        throw new Error('Could not reach qbreader.org (' + why + ').' + hint + '\nURL: ' + url);
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
}

/**
 * Every tossup in one category. A category bigger than one query can return is
 * fetched a year at a time instead.
 */
async function fetchCategory (params, category, minYear, maxYear) {
  const base = { ...params, categories: category, minYear: String(minYear), maxYear: String(maxYear) };
  const first = await query({ ...base, tossupPagination: '1' });
  if (first.count > QUERY_CAP && minYear < maxYear) {
    const all = [];
    for (let year = minYear; year <= maxYear; year++) { all.push(...await fetchCategory(params, category, year, year)); }
    return all;
  }
  const all = first.questionArray.slice();
  const pages = Math.ceil(Math.min(first.count, QUERY_CAP) / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    await sleep(250);
    all.push(...(await query({ ...base, tossupPagination: String(page) })).questionArray);
  }
  return all;
}

/**
 * @param {object[]} raw - qbreader tossups
 * @param {function(object): ?object} slotOf
 * @param {?{least: number, most: number, maxWords: number}} sentences - how
 *   many sentences to keep, the giveaway included; none keeps the giveaway alone
 * @returns {{questions: object[], skipped: object}}
 */
function convert (raw, slotOf, sentences) {
  const shorten = sentences
    ? (text, isMath) => lastSentencesOf(text, isMath, sentences.least, sentences.most, sentences.maxWords)
    : giveawayOf;
  const questions = [];
  const skipped = { category: 0, cannotStandAlone: 0, duplicate: 0 };
  const seen = new Set();
  for (const t of raw) {
    const slot = slotOf(t);
    if (!slot) { skipped.category++; continue; }
    const question = shorten(t.question_sanitized || t.question, slot.label === 'Mathematics');
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

async function save (questions, { what, setPrefix, difficulty }) {
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

  const mine = new RegExp('^' + setPrefix);
  const wiped = await tossupsCol.deleteMany({ 'set.name': mine });
  await packetsCol.deleteMany({ 'set.name': mine });
  await setsCol.deleteMany({ name: mine });
  console.log(`Cleared the previous ${what} import (${wiped.deletedCount} tossups).`);

  // one set per qbreader set, so the source stays traceable
  const bySet = new Map();
  for (const q of questions) {
    if (!bySet.has(q.set)) { bySet.set(q.set, []); }
    bySet.get(q.set).push(q);
  }
  let total = 0;
  for (const [sourceSet, list] of bySet) {
    const setId = new ObjectId();
    const year = list[0].year ?? 2015;
    // the round builder reads a question's year from its set name
    const name = `${setPrefix} - ${sourceSet}` + (/\b20\d{2}\b/.test(sourceSet) ? '' : ` (${year})`);
    await setsCol.insertOne({ _id: setId, name, year, difficulty, standard: true, kshsaaImport: true });

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
        difficulty,
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
  console.log(`Imported ${total} ${what} questions in ${bySet.size} sets.`);
}

/**
 * Fetches, converts, and imports (or previews) one kind of question. Safe to
 * re-run: it replaces whatever an earlier run imported under the same prefix.
 * @param {object} o
 * @param {string} o.what - what these are, for messages ("Beginner")
 * @param {string} o.setPrefix - names every imported set; the round builder
 *   picks its question pools by this prefix
 * @param {number} o.difficulty - stored on each question
 * @param {number[]} o.difficulties - qbreader difficulties to fetch
 * @param {string[]} o.categories - qbreader categories to fetch
 * @param {number} o.minYear - oldest qbreader set year to fetch
 * @param {function(object): ?{label: string, category: string, subcategory: string, alternate_subcategory: ?string}} o.slotOf
 *   where a qbreader tossup goes in a round, or null to skip it
 * @param {string} o.preview - file --dry-run writes
 * @param {{least: number, most: number, maxWords: number}} [o.sentences] - keep
 *   clues before the giveaway too, this many sentences in all
 */
export async function runImport (o) {
  const args = process.argv.slice(2);
  const option = name => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1]);

  const from = option('--from');
  let raw;
  if (from) {
    raw = JSON.parse(readFileSync(from, 'utf8'));
    console.log(`Loaded ${raw.length} tossups from ${from}`);
  } else {
    console.log(`Fetching tossups for ${o.what} questions from qbreader.org...`);
    const params = { difficulties: o.difficulties.join(',') };
    const maxYear = new Date().getFullYear();
    raw = [];
    try {
      for (const category of o.categories) {
        const list = await fetchCategory(params, category, o.minYear, maxYear);
        console.log(`  ${category}: ${list.length} tossups`);
        raw.push(...list);
      }
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

  const { questions, skipped } = convert(raw, o.slotOf, o.sentences);
  const byLabel = {};
  for (const q of questions) { byLabel[q.label] = (byLabel[q.label] || 0) + 1; }
  console.log(`Kept ${questions.length} of ${raw.length}:`, byLabel);
  console.log(`Skipped ${skipped.cannotStandAlone} whose last ${o.sentences ? 'sentences need' : 'line needs'} the earlier clues, ` +
    `${skipped.category} in categories a round has no slot for, ${skipped.duplicate} duplicates.`);

  if (args.includes('--dry-run')) {
    writeFileSync(o.preview, JSON.stringify(questions, null, 2));
    console.log(`Dry run: wrote ${o.preview}, database untouched.`);
  } else {
    await save(questions, o);
  }
}
