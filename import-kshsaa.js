// Import KSHSAA parsed questions into a self-hosted QBReader database.  (v3)
//
// Place in the root of your qbreader/website clone, then run:
//   node import-kshsaa.js "C:/path/to/parsed/all_questions.json"
//
// Safe to re-run: deletes ALL previously imported KSHSAA data first,
// including old fallback-named sets like "11-12 Reg Questions".

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

// wipe previous imports (marker field, KSHSAA names, and old fallback names)
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

const DIFFICULTY = 2; // 2 = "regular high school" on qbreader's scale

// final category/subcategory by ORIGINAL KSHSAA category
const REMAP = {
  'language arts':      ['Literature', null],
  'science & health':   ['Science', null],
  'science and health': ['Science', null],
  'mathematics':        ['Science', 'Math'],
  'math':               ['Science', 'Math'],
  'social science':     ['Social Science', null],
  'fine arts':          ['Fine Arts', null],
  'year in review':     ['Current Events', null],
  'current events':     ['Current Events', null],
  'foreign language':   ['Other Academic', null],
  'geography':          ['Geography', null]
};
function finalCat (q) {
  const k = (q.kshsaa_category || '').toLowerCase().trim();
  return REMAP[k] || [q.category || 'Other Academic', q.subcategory || null];
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
    const packetName = `Round ${String(pktNum).padStart(2, '0')}`;
    await packetsCol.insertOne({
      _id: packetId,
      name: packetName,
      number: pktNum,
      set: { _id: setId, name: setName },
      kshsaaImport: true
    });

    const docs = qs.map((q, i) => ({
      _id: new ObjectId(),
      question: q.question,
      question_sanitized: sanitize(q.question),
      answer: q.answer,
      answer_sanitized: sanitize(q.answer),
      category: finalCat(q)[0],
      subcategory: finalCat(q)[1],
      number: i + 1,
      difficulty: DIFFICULTY,
      set: { _id: setId, name: setName, year, standard: true },
      packet: { _id: packetId, name: packetName, number: pktNum },
      kshsaaImport: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await tossupsCol.insertMany(docs);
    totalT += docs.length;
  }
  console.log(`  ${setName}: ${[...packets.values()].reduce((a, v) => a + v.length, 0)} tossups in ${packets.size} packets`);
}

console.log(`Done: ${bySet.size} sets, ${totalT} tossups imported.`);
console.log('Refresh the site and test singleplayer with all difficulties enabled.');
await client.close();
