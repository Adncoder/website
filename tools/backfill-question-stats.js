import { perBonusData, perTossupData } from '../database/account-info/collections.js';
import { bonuses, tossups } from '../database/qbreader/collections.js';

import yargs from 'yargs/yargs';

/**
 * Per-question stat documents are normally created by tools/upload/upsert-packet.js
 * when a packet is uploaded, and recordTossupData/recordBonusData only $push onto
 * a document that already exists. Questions that reached the database another way
 * (a restore, or a custom import) therefore have nowhere to record buzzes, and
 * every play is silently dropped.
 *
 * This creates the missing documents, with the same shape upsert-packet.js uses.
 * It never touches a question that already has one, so it is safe to re-run.
 */

const BATCH_SIZE = 1000;

/**
 * @param {object} question - a tossup or bonus document
 * @returns {object} the per-question stats document for it
 */
function statsDocument (question) {
  return {
    _id: question._id,
    category: question.category ?? null,
    data: [],
    // difficulty lives on the question itself; upsert-packet.js reads it off the
    // set it is uploading, which is the same value by a different route
    difficulty: question.difficulty ?? question.set?.difficulty ?? null,
    set_id: question.set?._id ?? null,
    subcategory: question.subcategory ?? null,
    ...(question.alternate_subcategory && { alternate_subcategory: question.alternate_subcategory })
  };
}

/**
 * @param {import('mongodb').Collection} questions
 * @param {import('mongodb').Collection} stats
 * @param {string} label
 * @param {boolean} write - actually insert, rather than only reporting
 * @returns {Promise<{total: number, missing: number, inserted: number}>}
 */
async function backfillCollection (questions, stats, label, write) {
  const total = await questions.countDocuments({});
  let missing = 0;
  let inserted = 0;
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map(q => q._id);
    const present = new Set(
      (await stats.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray())
        .map(d => String(d._id))
    );
    const toInsert = batch.filter(q => !present.has(String(q._id))).map(statsDocument);
    missing += toInsert.length;
    if (write && toInsert.length) {
      const result = await stats.insertMany(toInsert, { ordered: false });
      inserted += result.insertedCount;
    }
    batch = [];
  };

  const cursor = questions.find({}, {
    projection: { _id: 1, category: 1, subcategory: 1, alternate_subcategory: 1, difficulty: 1, 'set._id': 1, 'set.difficulty': 1 }
  });
  for await (const question of cursor) {
    batch.push(question);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(`${label}: ${total} questions, ${missing} without a stats document, ${inserted} created`);
  return { total, missing, inserted };
}

/**
 * @param {boolean} write
 * @returns {Promise<void>}
 */
export default async function backfillQuestionStats (write) {
  console.log(write ? 'WRITING to the database' : 'DRY RUN - nothing will be written (pass --write to apply)');
  console.log();
  await backfillCollection(tossups, perTossupData, 'tossups', write);
  await backfillCollection(bonuses, perBonusData, 'bonuses', write);
}

const argv = yargs(process.argv.slice(2))
  .option('write', {
    alias: 'w',
    type: 'boolean',
    default: false,
    description: 'Actually create the documents. Without this, only reports what is missing.'
  })
  .help()
  .argv;

await backfillQuestionStats(argv.write);
process.exit(0);
