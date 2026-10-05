// Import Beginner-level questions: the giveaway line of every middle-school
// tossup on qbreader.org, minus "For 10 points", which scholars bowl does not
// use. See server/kshsaa/giveaway.js for how the line is picked and which
// questions are skipped because their last line cannot stand alone.
//
// Run from the website folder (the same place as import-kshsaa.js):
//   node import-beginner.js              fetch, convert, and import
//   node import-beginner.js --dry-run    fetch and convert only; writes
//                                        beginner-preview.json to look over
// See server/kshsaa/qbreader-import.js for the other options, and for
// --use-system-ca on networks that inspect secure connections.
//
// Safe to re-run: removes the previous Beginner import first, and touches
// nothing else. Needs MONGODB_URI in .env (not for --dry-run).

import 'dotenv/config';
import { giveawaySlotOf } from './server/kshsaa/giveaway.js';
import { runImport } from './server/kshsaa/qbreader-import.js';

await runImport({
  what: 'Beginner',
  setPrefix: 'QB Beginner',
  // qbreader's difficulty 1 is middle school; 1 is also free in this database,
  // where 2 marks KSHSAA questions and 3 converted quizbowl
  difficulty: 1,
  difficulties: [1],
  categories: ['Literature', 'Mythology', 'Science', 'History', 'Geography', 'Social Science', 'Religion', 'Philosophy', 'Fine Arts'],
  minYear: 2000,
  slotOf: giveawaySlotOf,
  preview: 'beginner-preview.json'
});
