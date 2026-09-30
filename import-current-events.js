// Import Year in Review questions: the giveaway line of every recent current
// events tossup on qbreader.org, middle school through national high school,
// minus "For 10 points". Rounds only use Year in Review questions from this
// year or last, so this fetches just those years.
//
// Run from the website folder (the same place as import-kshsaa.js):
//   node import-current-events.js              fetch, convert, and import
//   node import-current-events.js --dry-run    fetch and convert only; writes
//                                              current-events-preview.json
// See server/kshsaa/qbreader-import.js for the other options, and for
// --use-system-ca on networks that inspect secure connections.
//
// Re-run it every month or two: qbreader keeps adding new sets, and each run
// replaces the previous import with whatever is current. Needs MONGODB_URI in
// .env (not for --dry-run).

import 'dotenv/config';
import { runImport } from './server/kshsaa/qbreader-import.js';

await runImport({
  what: 'Current Events',
  setPrefix: 'QB Current Events',
  // 3 is what converted quizbowl carries in this database
  difficulty: 3,
  // middle school through national high school; college current events run
  // too hard for a scholars bowl round
  difficulties: [1, 2, 3, 4, 5],
  categories: ['Current Events'],
  minYear: new Date().getFullYear() - 1,
  slotOf: t => (t.category === 'Current Events'
    ? { label: 'Year in Review', category: 'Current Events', subcategory: 'Current Events', alternate_subcategory: null }
    : null),
  preview: 'current-events-preview.json'
});
