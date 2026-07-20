// Import KSHSAA parsed questions into a self-hosted QBReader database.  (v4)
//
// v4: every tossup gets a VALID subcategory from the site's SUBCATEGORIES list
// (subcategory:null is silently excluded by the default random-question query),
// and math questions get alternate_subcategory "Math" per the site's convention.
//
// Place in the root of your qbreader/website clone, then run:
//   node import-kshsaa.js "C:/path/to/parsed/all_questions.json"
// Safe to re-run: wipes all previously imported KSHSAA data first.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { MongoClient, ObjectId } from 'mongodb';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node import-kshsaa.js path/to/all_questions.json');
  process.exit(1);
}
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Set MONGODB_URI in your .env first.');
  process.exit(1);
}

const questions = JSON.parse(readFileSync(file, 'utf8'));
console.log(`Loaded ${questions.length} questions from ${file}`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db('qbreader');
const setsCol = db.collection('sets');
const packetsCol = db.collection('packets');
const tossupsCol = db.collection('tossups');

const oldSetMatch = {
  $or: [
    { kshsaaImport: true },
    { name: /KSHSAA/i },
    { name: /^\d{2}-\d{2}\s.*(Reg|State|Question)/i }
  ]
};
const oldRefMatch = {
  $or: [
    { kshsaaImport: true },
    { 'set.name': /KSHSAA/i },
    { 'set.name': /^\d{2}-\d{2}\s.*(Reg|State|Question)/i }
  ]
};
const wiped = await Promise.all([
  tossupsCol.deleteMany(oldRefMatch),
  packetsCol.deleteMany(oldRefMatch),
  setsCol.deleteMany(oldSetMatch)
]);
console.log(`Cleared old import (${wiped[0].deletedCount} tossups).`);

const sanitize = s => (s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();

const DIFFICULTY = 2; // 2 = "regular high school"

// KSHSAA category -> [category, subcategory, alternate_subcategory]
// subcategory MUST be from the site's SUBCATEGORIES list (never null).
const REMAP = {
  'language arts':      ['Literature', 'Other Literature', null],
  'science & health':   ['Science', 'Other Science', null],
  'science and health': ['Science', 'Other Science', null],
  'science':            ['Science', 'Other Science', null],
  'mathematics':        ['Science', 'Other Science', 'Math'],
  'math':               ['Science', 'Other Science', 'Math'],
  'social science':     ['Social Science', 'Social Science', null],
  'fine arts':          ['Fine Arts', 'Other Fine Arts', null],
  'year in review':     ['Current Events', 'Current Events', null],
  'current events':     ['Current Events', 'Current Events', null],
  'foreign language':   ['Other Academic', 'Other Academic', null],
  'world language':     ['Other Academic', 'Other Academic', null],
  'geography':          ['Geography', 'Geography', null],
  'history':            ['History', 'Other History', null]
};
const FALLBACK = ['Other Academic', 'Other Academic', null];
function finalCat (q) {
  const k = (q.kshsaa_category || '').toLowerCase().trim();
  return REMAP[k] || FALLBACK;
}

// group: set name -> packet number -> [questions]
const bySet = new Map();
for (const q of questions) {
  const setName = q.set || 'KSHSAA Unknown';
  if (!bySet.has(setName)) bySet.set(setName, new Map());
  const packets = bySet.get(setName);
  const pkt = q.packet ?? 0;
  if (!packets.has(pkt)) packets.set(pkt, []);
  packets.get(pkt).push(q);
}

let totalT = 0;
for (const [setName, packets] of bySet) {
  const yearMatch = setName.match(/(20\d{2})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : 2000;
  const setId = new ObjectId();
  await setsCol.insertOne({
    _id: setId,
    name: setName,
    year,
    difficulty: DIFFICULTY,
    standard: true,
    kshsaaImport: true
  });

  for (const [pktNum, qs] of [...packets.entries()].sort((a, b) => a[0] - b[0])) {
    const packetId = new ObjectId();
    const packetName = (qs[0] && qs[0].packet_name)
      ? qs[0].packet_name
      : `Round ${String(pktNum).padStart(2, '0')}`;
    await packetsCol.insertOne({
      _id: packetId,
      name: packetName,
      number: pktNum,
      set: { _id: setId, name: setName },
      kshsaaImport: true
    });

    const docs = qs.map((q, i) => {
      const [cat, sub, alt] = finalCat(q);
      return {
        _id: new ObjectId(),
        question: q.question,
        question_sanitized: sanitize(q.question),
        answer: q.answer,
        answer_sanitized: sanitize(q.answer),
        category: cat,
        subcategory: sub,
        alternate_subcategory: alt,
        number: i + 1,
        difficulty: DIFFICULTY,
        set: { _id: setId, name: setName, year, standard: true },
        packet: { _id: packetId, name: packetName, number: pktNum },
        kshsaaImport: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
    await tossupsCol.insertMany(docs);
    totalT += docs.length;
  }
  console.log(`  ${setName}: ${[...packets.values()].reduce((a, v) => a + v.length, 0)} tossups in ${packets.size} packets`);
}

console.log(`Done: ${bySet.size} sets, ${totalT} tossups imported.`);
console.log('IMPORTANT: in site settings, drag the minimum set year down to 2000 -');
console.log('the site default of 2010 hides your 2003-2009 sets.');
await client.close();
