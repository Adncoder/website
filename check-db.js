// Diagnostic: what's actually in the database, and can the round generator's
// filters find it? Run from the website folder:  node check-db.js
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const c = new MongoClient(process.env.MONGODB_URI);
await c.connect();
const t = c.db('qbreader').collection('tossups');

const counts = {
  'total imported': { kshsaaImport: true },
  'question contains FRENCH': { question: { $regex: 'FRENCH' } },
  'kshsaa_category field present': { kshsaa_category: { $nin: [null, undefined] } },
  'kshsaa_category is a language': { kshsaa_category: { $regex: 'foreign language|world language', $options: 'i' } },
  'word-boundary regex (what the route uses)': { question: { $regex: '\\b(FRENCH|GERMAN|SPANISH|LATIN)\\b' } },
  'category Other Academic': { category: 'Other Academic' },
  'timed_seconds present': { timed_seconds: { $nin: [null, undefined] } },
  'alternate_subcategory Math': { alternate_subcategory: 'Math' }
};

for (const [label, q] of Object.entries(counts)) {
  console.log(String(await t.countDocuments(q)).padStart(7), label);
}

const sample = await t.findOne({ question: { $regex: 'FRENCH' } });
console.log('\nSample question containing FRENCH:');
console.log(sample
  ? JSON.stringify({
      question: sample.question?.slice(0, 90),
      answer: sample.answer?.slice(0, 60),
      category: sample.category,
      subcategory: sample.subcategory,
      kshsaa_category: sample.kshsaa_category,
      set: sample.set?.name
    }, null, 1)
  : '  (none found)');

await c.close();
