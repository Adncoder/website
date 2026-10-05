// Import JV-level questions: the giveaway line of every easy high school
// tossup on qbreader.org since 2010, minus "For 10 points". It is the same
// conversion as import-beginner.js, one step up in difficulty: middle school
// giveaways for Beginner, easy high school giveaways for JV, and the KSHSAA
// state and regional archive and converted quizbowl for Varsity. See
// server/kshsaa/giveaway.js for how the line is picked and which questions are
// skipped because their last line cannot stand alone.
//
// Run from the website folder (the same place as import-kshsaa.js):
//   node import-jv.js              fetch, convert, and import
//   node import-jv.js --dry-run    fetch and convert only; writes
//                                  jv-preview.json to look over
// See server/kshsaa/qbreader-import.js for the other options, and for
// --use-system-ca on networks that inspect secure connections.
//
// Safe to re-run: removes the previous JV import first, and touches nothing
// else. Needs MONGODB_URI in .env (not for --dry-run).

import 'dotenv/config';
import { giveawaySlotOf } from './server/kshsaa/giveaway.js';
import { runImport } from './server/kshsaa/qbreader-import.js';

await runImport({
  what: 'JV',
  setPrefix: 'QB JV',
  // qbreader's difficulty 2 is easy high school, which is also what KSHSAA
  // questions carry in this database
  difficulty: 2,
  difficulties: [2],
  categories: ['Literature', 'Mythology', 'Science', 'History', 'Geography', 'Social Science', 'Religion', 'Philosophy', 'Fine Arts'],
  minYear: 2010,
  slotOf: giveawaySlotOf,
  preview: 'jv-preview.json'
});
