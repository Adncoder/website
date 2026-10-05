// Sorts a World Language question into a rough difficulty from its Spanish,
// so a Beginner round gets "Fuimos al cine." and Varsity gets "Tu madre quiere
// que cortes el césped después de la escuela." Every question gives the same
// sentence in French, German, and Spanish; Spanish is the one read here,
// since it is the language most of the team takes. Nothing is stored: like
// math-tier.js, the round builder runs this over the candidates each time.
//
// Length does most of the work -- the archive runs from 2 to 15 Spanish
// words, mostly 5 to 8 -- and a few constructions a first-year student has
// not met yet push a sentence up a tier.

/** Tiers in increasing difficulty, named like the math tiers. */
export const LANGUAGE_TIERS = ['basic', 'intermediate', 'advanced'];

// two object pronouns on one verb (dárnoslos, dímelo, tráeselas), and the
// compound and subjunctive forms of haber
const ADVANCED = [
  /\b[a-záéíóúñ]{3,}(me|te|se|nos|os)(lo|la|los|las)\b/i,
  /\b(hubiera|hubieras|hubiéramos|hubieran|hubiese|hubiesen|habría|habrías|habríamos|habrían|haya|hayas|hayamos|hayan)\b/i
];

// the perfect tenses and the conditional
const INTERMEDIATE = [
  /\b(he|has|ha|hemos|han|había|habías|habíamos|habían)\s+[a-záéíóúñ]+(ado|ido|to|cho|so)\b/i,
  /\b[a-záéíóúñ]{2,}(ría|rías|ríamos|rían)\b/i
];

const LABEL = /\b(FRENCH|GERMAN|SPANISH|LATIN|ITALIAN)\b\s*:?/g;

/**
 * The Spanish sentence in a World Language question, or null if it has none.
 * @param {string} text
 * @returns {?string}
 */
export function spanishOf (text) {
  const t = String(text || '');
  const parts = [...t.matchAll(LABEL)];
  const at = parts.findIndex(m => m[1] === 'SPANISH');
  if (at === -1) { return null; }
  const from = parts[at].index + parts[at][0].length;
  const to = at + 1 < parts.length ? parts[at + 1].index : t.length;
  return t.slice(from, to).trim() || null;
}

/**
 * @param {string} text - the question as stored
 * @returns {'basic'|'intermediate'|'advanced'}
 */
export default function languageTierOf (text) {
  const spanish = spanishOf(text);
  // without a Spanish line there is nothing to judge by, so call it the middle
  if (!spanish) { return 'intermediate'; }
  const words = spanish.split(/\s+/).filter(w => /[a-záéíóúñü]/i.test(w)).length;
  let tier = words <= 5 ? 0 : words <= 8 ? 1 : 2;
  if (INTERMEDIATE.some(re => re.test(spanish))) { tier = Math.max(tier, 1); }
  if (ADVANCED.some(re => re.test(spanish))) { tier = 2; }
  return LANGUAGE_TIERS[tier];
}
