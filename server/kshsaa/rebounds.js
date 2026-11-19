// Which right answers were not a race. npm test runs this in Node without a
// database, so it imports nothing.

/**
 * The right answers in a game that nobody was racing for: every other team had
 * already missed the question. Under KSHSAA rules a team that interrupts and
 * misses loses 5 points and the question is finished for the other team, who
 * then has no reason to interrupt, so a good team waits for the end. Where
 * that answer came says nothing about how early the player knew it, and
 * celerity leaves it out. With three or more teams the ones still in are
 * racing each other, so only an answer after all the others missed counts.
 * @param {object} g - a stored game
 * @returns {Set<object>} those buzzes, as the objects in g.buzzes
 */
export function reboundsIn (g) {
  const teams = new Set((g.teams || []).map(t => t.name));
  const missedBy = new Map();
  for (const b of g.buzzes || []) {
    teams.add(b.team);
    if (b.value > 0 || b.questionNumber == null) continue;
    if (!missedBy.has(b.questionNumber)) missedBy.set(b.questionNumber, new Set());
    missedBy.get(b.questionNumber).add(b.team);
  }
  const rebounds = new Set();
  for (const b of g.buzzes || []) {
    if (!(b.value > 0)) continue;
    const missed = missedBy.get(b.questionNumber);
    if (!missed) continue;
    const others = [...teams].filter(t => t !== b.team);
    if (others.length && others.every(t => missed.has(t))) rebounds.add(b);
  }
  return rebounds;
}
