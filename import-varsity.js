// Import Varsity-level questions: the last two to four sentences of every
// regular high school tossup on qbreader.org since 2010 -- the giveaway and up
// to three clues before it -- minus "For 10 points". Varsity rounds read these
// alongside the converted quizbowl sets, so most Varsity questions run three
// or four sentences, harder clues first, where JV (import-jv.js) keeps two and
// Beginner (import-beginner.js) the giveaway alone. See
// server/kshsaa/giveaway.js for how the sentences are picked and which
// questions are skipped because they cannot stand alone.
//
// Run from the website folder (the same place as import-kshsaa.js):
//   node import-varsity.js              fetch, convert, and import
//   node import-varsity.js --dry-run    fetch and convert only; writes
//                                       varsity-preview.json to look over
// See server/kshsaa/qbreader-import.js for the other options, and for
// --use-system-ca on networks that inspect secure connections.
//
// Safe to re-run: removes the previous Varsity import first, and touches
// nothing else. Needs MONGODB_URI in .env (not for --dry-run).

import 'dotenv/config';
import { giveawaySlotOf } from './server/kshsaa/giveaway.js';
import { runImport } from './server/kshsaa/qbreader-import.js';

await runImport({
  what: 'Varsity',
  setPrefix: 'QB Varsity',
  // qbreader's difficulty 3 is regular high school; 3 is also what converted
  // quizbowl carries in this database
  difficulty: 3,
  difficulties: [3],
  categories: ['Literature', 'Mythology', 'Science', 'History', 'Geography', 'Social Science', 'Religion', 'Philosophy', 'Fine Arts'],
  minYear: 2010,
  slotOf: giveawaySlotOf,
  // the giveaway and up to three clues before it, read in about twenty seconds
  sentences: { least: 2, most: 4, maxWords: 110 },
  preview: 'varsity-preview.json'
});
