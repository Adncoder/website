// Repair the KSHSAA archive questions the packet parser broke.
//
// The parser behind import-kshsaa.js left three kinds of damage in the real
// KSHSAA questions (server/kshsaa/split-answers.js has the details):
//   - answers still inside the question text, so the answer line is blank
//     and a moderator reading straight through reads the answer aloud;
//   - several questions run into one record, answers and all;
//   - page headers, footers, and page numbers on the answer lines, which the
//     converted quizbowl sets have a few of too ("SCOP B Round 11 Page 4 of 4").
// Every damaged record is split into the questions it holds: the record keeps
// the first, and the rest become new questions in the same packet, counted as
// read if the record was. A question split across records ("...has the
// following three uses:" and then a record per use) is joined back together.
//
// A question whose answer is nowhere in the data is listed and left alone;
// rounds skip questions with no answer (routes/kshsaa-round.js).
//
// USAGE
//   node tools/repair-kshsaa-questions.js                  # report what it would change
//   node tools/repair-kshsaa-questions.js --write          # apply
//   node tools/repair-kshsaa-questions.js --undo [--write] # put back what --write changed
//
// Each record is saved to kshsaa_repair_backup before it changes, so --undo
// can restore it and remove the questions split off it. Safe to re-run: it
// only touches records that still need it.

import { ObjectId } from 'mongodb';
import yargs from 'yargs/yargs';

import { perTossupData } from '../database/account-info/collections.js';
import { qbreader } from '../database/databases.js';
import { tossups } from '../database/qbreader/collections.js';
import { splitRecord } from '../server/kshsaa/split-answers.js';

const usage = qbreader.collection('kshsaa_question_usage');
const backup = qbreader.collection('kshsaa_repair_backup');
const games = qbreader.collection('kshsaa_games');

const argv = yargs(process.argv.slice(2))
  .option('write', { type: 'boolean', default: false, description: 'apply the changes' })
  .option('undo', { type: 'boolean', default: false, description: 'put back what --write changed' })
  .option('show', { type: 'number', default: 6, description: 'how many of each kind to list' })
  .help()
  .argv;

// what import-kshsaa.js does to a question for its _sanitized copy
const sanitize = s => String(s || '')
  .replace(/<[^>]*>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();
const short = (s, n = 90) => { const t = oneLine(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

console.log(argv.write ? 'WRITING to the database' : 'DRY RUN - nothing will be written (pass --write to apply)');
console.log();

if (argv.undo) {
  const saved = await backup.find({}).toArray();
  const inserted = saved.flatMap(s => s.inserted || []);
  console.log('records to restore               : ' + saved.length);
  console.log('split-off questions to remove    : ' + inserted.length);
  if (!argv.write || !saved.length) process.exit(0);
  await tossups.deleteMany({ _id: { $in: inserted } });
  await perTossupData.deleteMany({ _id: { $in: inserted } });
  await usage.deleteMany({ _id: { $in: inserted.map(String) } });
  await tossups.bulkWrite(saved.map(s => ({
    updateOne: {
      filter: { _id: s._id },
      update: { $set: { question: s.question, question_sanitized: s.question_sanitized, answer: s.answer, answer_sanitized: s.answer_sanitized, updatedAt: new Date() } }
    }
  })));
  await backup.deleteMany({ _id: { $in: saved.map(s => s._id) } });
  console.log('\nrestored');
  process.exit(0);
}

// The real KSHSAA questions are every kshsaaImport set but the ones the
// giveaway imports and the question bank make (SET_PREFIX in
// routes/kshsaa-round.js). Of the converted quizbowl, only the footers.
const records = await tossups.find({
  kshsaaImport: true,
  $or: [
    { 'set.name': { $not: /^(QB |SJA )/ } },
    { 'set.name': /^QB Converted/, answer: /\bSCOP\s+[A-Z]\s+Round\s+\d/ }
  ]
}).toArray();

// math and science answers can end in a number of their own
const numeric = d => d.category === 'Science';
const plans = new Map();
for (const d of records) {
  const items = splitRecord(d, { numeric: numeric(d) });
  const same = items.length === 1 && items[0].question === oneLine(d.question) && items[0].answer === oneLine(d.answer);
  plans.set(String(d._id), { record: d, items, same });
}

// "What is the punctuation called which has the following three uses:" with
// no answer, then a record for each use, the last one ending in the answer
const joins = [];
const packets = new Map();
for (const d of records) {
  const key = String(d.packet?._id);
  if (!packets.has(key)) packets.set(key, []);
  packets.get(key).push(d);
}
for (const list of packets.values()) {
  list.sort((a, b) => a.number - b.number);
  list.forEach((d, i) => {
    const stem = plans.get(String(d._id));
    if (stem.items.length !== 1 || stem.items[0].answer || !/:$/.test(stem.items[0].question)) return;
    const parts = [];
    for (const next of list.slice(i + 1)) {
      const first = plans.get(String(next._id)).items[0];
      if (!/^[a-z]/.test(first.question)) break;
      parts.push(next);
      if (first.answer) break;
    }
    const end = parts.length && plans.get(String(parts[parts.length - 1]._id));
    if (!end || !end.items[0].answer) return;
    stem.items = [{
      question: stem.items[0].question + ' ' + parts.map(p => plans.get(String(p._id)).items[0].question).join('; '),
      answer: end.items[0].answer
    }];
    stem.same = false;
    // the last part is now in the stem; a part with nothing else in it keeps
    // its words and stays unanswered, so rounds skip it
    end.items = end.items.length > 1 ? end.items.slice(1) : [{ question: end.items[0].question, answer: '' }];
    end.same = false;
    joins.push(stem);
  });
}

const changed = [...plans.values()].filter(p => !p.same);
const split = changed.filter(p => p.items.length > 1);
const found = changed.filter(p => p.items.length === 1 && !oneLine(p.record.answer) && p.items[0].answer);
const cleaned = changed.filter(p => p.items.length === 1 && oneLine(p.record.answer) && p.items[0].answer);
const unanswered = [...plans.values()].filter(p => p.items.some(item => !item.answer));
const newCount = split.reduce((n, p) => n + p.items.length - 1, 0);

const usedIds = new Set((await usage.find({ _id: { $in: changed.map(p => String(p.record._id)) } }, { projection: { _id: 1 } }).toArray()).map(u => u._id));
const played = new Set((await games.find({}, { projection: { questionIds: 1 } }).toArray()).flatMap(g => g.questionIds || []));

console.log('questions checked                : ' + records.length);
console.log('records to repair                : ' + changed.length);
console.log('  run-together, split            : ' + split.length + ' records -> ' + (split.length + newCount) + ' questions (' + newCount + ' new)');
console.log('  answer taken out of the question: ' + found.length);
console.log('  answer line cleaned            : ' + cleaned.length);
console.log('  split across records, joined   : ' + joins.length);
console.log('  already read in a round        : ' + changed.filter(p => usedIds.has(String(p.record._id))).length +
  ' (' + changed.filter(p => played.has(String(p.record._id))).length + ' in saved games)');
console.log('still no answer anywhere         : ' + unanswered.length + ' (rounds skip these)');

const sample = (title, list, show) => {
  if (!list.length) return;
  console.log('\n' + title + ':');
  list.slice(0, argv.show).forEach(show);
};
sample('split', split, p => {
  console.log('  ' + short(p.record.question, 110));
  p.items.forEach(item => console.log('    -> ' + short(item.question, 70) + '  ||  ' + short(item.answer, 40)));
});
sample('answer taken out of the question', found, p => console.log('  ' + short(p.items[0].question, 70) + '  ||  ' + short(p.items[0].answer, 40)));
sample('answer line cleaned', cleaned, p => console.log('  ' + short(p.record.answer, 60) + '  ->  ' + short(p.items[0].answer, 40)));
sample('joined', joins, p => console.log('  ' + short(p.items[0].question, 110) + '  ||  ' + p.items[0].answer));
console.log('\nstill no answer anywhere:');
unanswered.forEach(p => console.log('  ' + p.record.set.name + ' / ' + (p.record.packet?.name || '?') + ' #' + p.record.number +
  ' (' + p.record._id + '): ' + short(p.items[0].question, 80)));

if (!argv.write || !changed.length) {
  if (!argv.write) console.log('\npass --write to apply');
  process.exit(0);
}

// back everything up first, so a failure part way leaves --undo able to put
// it all back; a record saved by an earlier run keeps its first backup
const now = new Date();
for (const p of changed) p.newIds = p.items.slice(1).map(() => new ObjectId());
await backup.bulkWrite(changed.map(p => ({
  updateOne: {
    filter: { _id: p.record._id },
    update: {
      $setOnInsert: {
        question: p.record.question,
        question_sanitized: p.record.question_sanitized,
        answer: p.record.answer,
        answer_sanitized: p.record.answer_sanitized,
        at: now
      },
      $push: { inserted: { $each: p.newIds } }
    },
    upsert: true
  }
})));

// the questions split off: the record's set, packet, and categories, and a
// stats document like every other question's (publishQuestion in
// routes/kshsaa-questions.js)
const added = split.flatMap(p => p.items.slice(1).map((item, k) => ({
  ...p.record,
  _id: p.newIds[k],
  question: item.question,
  question_sanitized: sanitize(item.question),
  answer: item.answer,
  answer_sanitized: sanitize(item.answer),
  createdAt: now,
  updatedAt: now
})));
if (added.length) {
  await tossups.insertMany(added);
  await perTossupData.insertMany(added.map(t => ({
    _id: t._id,
    category: t.category,
    data: [],
    difficulty: t.difficulty,
    set_id: t.set._id,
    subcategory: t.subcategory,
    ...(t.alternate_subcategory && { alternate_subcategory: t.alternate_subcategory })
  })));
  // heard when the record they were run into was read
  const read = await usage.find({ _id: { $in: split.map(p => String(p.record._id)) } }).toArray();
  const byId = new Map(read.map(u => [u._id, u]));
  const copies = split.flatMap(p => {
    const u = byId.get(String(p.record._id));
    return u ? p.newIds.map(id => ({ _id: String(id), lastUsed: u.lastUsed, count: u.count })) : [];
  });
  if (copies.length) await usage.insertMany(copies);
}

const result = await tossups.bulkWrite(changed.map(p => ({
  updateOne: {
    filter: { _id: p.record._id },
    update: {
      $set: {
        question: p.items[0].question,
        question_sanitized: sanitize(p.items[0].question),
        answer: p.items[0].answer,
        answer_sanitized: sanitize(p.items[0].answer),
        updatedAt: now
      }
    }
  }
})));
console.log('\nrecords repaired                 : ' + result.modifiedCount);
console.log('questions added                  : ' + added.length);
console.log('backed up in kshsaa_repair_backup: ' + changed.length + ' (node tools/repair-kshsaa-questions.js --undo --write puts them back)');
process.exit(0);
