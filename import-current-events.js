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

// qbreader files some general knowledge under Current Events, and a giveaway
// line keeps only that part, so these (by qbreader tossup id) are left out:
// old news, things that were never news, and lines no longer true. Checked
// October 2026; Year in Review written for scholars bowl lives in
// tools/seed-year-in-review.js.
const NOT_CURRENT = new Set([
  '6a6975a84563bb2b74bd822c', // Sadiq Khan is mayor of what city
  '6a6975a94563bb2b74bd829e', // Amy Coney Barrett, 2020
  '6a6975a94563bb2b74bd82c2', // Mamdani "is running for" mayor; he won
  '6a6975aa4563bb2b74bd8326', // Petro "governs" Colombia; his term ended August 2026
  '6a2cbf315fef949429e44bec', // the industry that produced BTS
  '6a2cbf365fef949429e44de7', // citrus greening in Florida
  '6a2cbf375fef949429e44e90', // church attendance at Easter
  '6a2cbf385fef949429e44ec4', // fast fashion and landfills
  '6a69757fb461d184c36976b8', // concerts by Shakira or Coldplay
  '6a697580b461d184c3697701', // the Death Note anime
  '6a697582b461d184c3697809', // the 2014 World Cup
  '6a697582b461d184c3697824', // Wes Moore governs Maryland
  '689a0d6a2d8608f4ad85177c', // prescription drugs
  '689a0d6b2d8608f4ad8517c8', // "current" mayor of New York: Eric Adams
  '689a0d6d2d8608f4ad85187d', // Catalonia
  '689a0d6e2d8608f4ad8518c0', // the 2024 Olympics
  '689a0d702d8608f4ad851949', // the International Space Station
  '689a0d712d8608f4ad851992', // Tim Walz and George Floyd, 2020
  '6837af63278db02eb79f1cf5', // the Bloc Quebecois
  '6837af66278db02eb79f1dc0', // Ohio as a swing state
  '6837af68278db02eb79f1e15', // the Moon
  '6a6a95abc0047738face4681', // Angela Merkel's chancellorship
  '6a6a95aec0047738face46d6', // Wisconsin's 2024 Senate race
  '6a6a95b0c0047738face4706', // the Netherlands
  '6a6a95b8c0047738face47a0', // Jan Palach, 1969
  '6a6a95b8c0047738face47a5', // Bangladesh's capital
  '6a6a95b8c0047738face47a7', // marijuana
  '6aa372dea6a80b16cfbce06a', // Google
  '6aa372dfa6a80b16cfbce09b', // where the CDC is
  '6aa372e1a6a80b16cfbce199', // Susan Collins's state
  '6aa372e1a6a80b16cfbce1bb', // Texas v. Johnson, 1989
  '6aa372e1a6a80b16cfbce1f2', // Poland's capital
  '6aa372e2a6a80b16cfbce212', // the ANC
  '68486966b074cbb48b99b2fd', // Hindu temples
  '68486967b074cbb48b99b34a', // Kathy Hochul succeeded Cuomo, 2021
  '68486969b074cbb48b99b3a1', // Abiy Ahmed leads Ethiopia
  '68486969b074cbb48b99b3c5', // Oakland
  '6848696bb074cbb48b99b453', // Diddy's trial "has begun"; it ended in 2025
  '6848696db074cbb48b99b4d6', // J. K. Rowling
  '6848696eb074cbb48b99b504', // Susan Collins's state
  '68486970b074cbb48b99b5a2', // public television
  '68486973b074cbb48b99b656', // law firms
  '69d0a6d92edcce58c88e9356', // Cory Booker was mayor of Newark
  '69d0a6da2edcce58c88e93a3', // Roblox
  '69d0a6db2edcce58c88e941a', // Northern Ireland's parties
  '69d0a6db2edcce58c88e9447', // Diddy's parties
  '69d0a6dc2edcce58c88e94c8', // the Cybertruck
  '69db1d8b4eb60d043c821a36', // Vivek Ramaswamy in 2024
  '69db1d8c4eb60d043c821a87', // Barack Obama
  '69db1d8d4eb60d043c821b0e', // Japan and Shinzo Abe
  '69db1d8d4eb60d043c821b12', // Mar-a-Lago
  '69db1d8e4eb60d043c821bf0' // Kickstarter
]);

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
  slotOf: t => (t.category === 'Current Events' && !NOT_CURRENT.has(String(t._id))
    ? { label: 'Year in Review', category: 'Current Events', subcategory: 'Current Events', alternate_subcategory: null }
    : null),
  preview: 'current-events-preview.json'
});
