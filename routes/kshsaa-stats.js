// KSHSAA practice stats: upload MODAQ exports, get season-long team analytics.
//
// INSTALL
//   1. Save as   routes/kshsaa-stats.js
//   2. In app.js: import with the others, and put the app.use line IMMEDIATELY
//      ABOVE  app.use(indexRouter);  (must be AFTER cookieSession for login):
//        import kshsaaStatsRouter from './routes/kshsaa-stats.js';
//        app.use('/kshsaa-stats', kshsaaStatsRouter);
//        app.use(indexRouter);
//   3. Add to .env and to Render's Environment tab:
//        STATS_PASSWORD=whatTheCoachAndCaptainsKnow
//        READER_PASSWORD=whatModeratorsKnow       (optional, see below)
//        STATS_EXPORT_TOKEN=aLongRandomString     (optional, see /export)

import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { ObjectId } from 'mongodb';
import { qbreader } from '../database/databases.js';
import { CATEGORIES, CATEGORY_BY_QUESTION, LEVELS, poolSummary } from './kshsaa-round.js';
import { NAME_AUTOCOMPLETE } from '../server/kshsaa/name-autocomplete.js';
import { KINDS, celerityOf, cleanNotes, kindOf, monthKeyOf, monthLabel, playersInGame, readFilters } from '../server/kshsaa/game-stats.js';
import { KSHSAA_HEAD, kshsaaNav } from '../server/kshsaa/nav.js';

const router = Router();
const games = qbreader.collection('kshsaa_games');
const roster = qbreader.collection('kshsaa_roster');
// small documents keyed by name: { _id: 'squads', list: [...] }
const settings = qbreader.collection('kshsaa_settings');

// Games read on this site send their own category list. Older games, and files
// exported from MODAQ elsewhere, fall back to the slot number - which is only
// right when the round came out at its full 16 questions.
const categoryFor = (n, explicit) =>
  (explicit && explicit[n - 1]) || CATEGORY_BY_QUESTION[n - 1] || 'Other';

// squads a rostered player can belong to until the Roster tab saves its own list
const DEFAULT_SQUADS = ['Varsity Blue', 'Varsity Crimson', 'JV Blue', 'JV Crimson', 'JV Silver', 'Rotating / sub'];

/** @returns {Promise<string[]>} the squads, in the order teams are filled */
export async function getSquads () {
  const doc = await settings.findOne({ _id: 'squads' });
  return doc?.list?.length ? doc.list : DEFAULT_SQUADS;
}

// ---------- auth ----------
// Two passwords. STATS_PASSWORD opens everything: stats, roster, insights, the
// question bank. READER_PASSWORD, when set, is the one moderators use on the
// reader: it loads player names and lineups and saves games, and nothing else,
// so reading a round never shows anyone the stats. Without it the reader asks
// for the stats password.
//
// A session keeps a fingerprint of the password it signed in with rather than
// a flag, so changing a password on the server signs out everyone who used it.

const fingerprint = password => createHmac('sha256', process.env.SECRET_KEY_1 ?? 'secretKey1')
  .update(String(password)).digest('hex').slice(0, 32);

/**
 * @returns {?('stats'|'reader')}
 */
export function roleOf (req) {
  const key = req.session?.kshsaa?.key;
  if (!key) return null;
  if (process.env.STATS_PASSWORD && key === fingerprint(process.env.STATS_PASSWORD)) return 'stats';
  if (process.env.READER_PASSWORD && key === fingerprint(process.env.READER_PASSWORD)) return 'reader';
  return null;
}

/** Stats password only. */
export const requireAuth = (req, res, next) => {
  const role = roleOf(req);
  if (role === 'stats') return next();
  res.status(role ? 403 : 401).json({ error: role ? 'this needs the stats password' : 'not logged in' });
};

/** Either password: what reading a round needs. */
const requireReader = (req, res, next) =>
  roleOf(req) ? next() : res.status(401).json({ error: 'not logged in' });

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// one shared password that never rotates is worth a guessing cap
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;
const loginAttempts = new Map();

function tooManyAttempts (ip) {
  const now = Date.now();
  if (loginAttempts.size > 1000) {
    for (const [key, entry] of loginAttempts) {
      if (now - entry.start > LOGIN_WINDOW_MS) loginAttempts.delete(key);
    }
  }
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.start > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > LOGIN_MAX;
}

router.post('/login', (req, res) => {
  const stats = process.env.STATS_PASSWORD;
  const reader = process.env.READER_PASSWORD;
  if (!stats) return res.status(500).json({ error: 'STATS_PASSWORD is not set on the server' });
  if (tooManyAttempts(req.ip)) {
    return res.status(429).json({ error: 'too many attempts - wait fifteen minutes' });
  }
  const given = String(req.body?.password ?? '');
  const role = sameSecret(given, stats) ? 'stats' : (reader && sameSecret(given, reader) ? 'reader' : null);
  if (!role) return res.status(403).json({ error: 'wrong password' });
  loginAttempts.delete(req.ip);
  req.session.kshsaa = { key: fingerprint(given) };
  delete req.session.kshsaaStats;
  res.json({ ok: true, role });
});
router.post('/logout', (req, res) => {
  if (req.session) req.session.kshsaa = null;
  res.json({ ok: true });
});
router.get('/me', (req, res) => {
  const role = roleOf(req);
  res.json({ authed: role === 'stats', reader: Boolean(role), role });
});

/**
 * Everyone who has been in a game: buzzers, plus the players on each team who
 * never buzzed.
 * @returns {Promise<string[]>}
 */
async function playedNames () {
  const [buzzed, listed] = await Promise.all([games.distinct('buzzes.player'), games.distinct('teams.players')]);
  return buzzed.concat(listed).filter(Boolean);
}

/**
 * Maps any capitalization or stray spacing of a known name to its stored
 * spelling, roster first, so "max" can never become a second "Max".
 * @returns {Promise<function(string): string>}
 */
export async function nameCanonicalizer () {
  const listed = (await roster.find({}).toArray()).map(r => r.name);
  const canon = {};
  for (const n of (await playedNames()).concat(listed)) canon[String(n).trim().toLowerCase()] = String(n).trim();
  return n => canon[String(n || '').trim().toLowerCase()] || String(n || '').trim();
}

// names for autocomplete elsewhere on the site: roster + anyone who has played
router.get('/names', requireReader, async (req, res) => {
  const played = await playedNames();
  const listed = (await roster.find({}).toArray()).map(r => r.name);
  const seen = {};
  const names = [];
  for (const n of listed.concat(played)) {
    const key = String(n || '').trim().toLowerCase();
    if (!key || seen[key]) continue;
    seen[key] = true;
    names.push(String(n).trim());
  }
  res.json({ names: names.sort() });
});

// ---------- roster ----------

router.get('/roster', requireAuth, async (req, res) => {
  const list = await roster.find({}).sort({ name: 1 }).toArray();
  const played = await playedNames();
  const playedSet = {};
  played.forEach(n => { playedSet[String(n).trim().toLowerCase()] = true; });
  res.json({
    squads: await getSquads(),
    roster: list.map(r => ({
      id: String(r._id),
      name: r.name,
      grade: r.grade ?? null,
      squad: r.squad || null,
      // the coach's 1-10 judgment from past seasons, blended with stats by the team builder
      rating: r.rating ?? null,
      // stays on their squad: the team builder never moves them
      permanent: Boolean(r.permanent && r.squad),
      // where the Insights page's "email" button sends a player's message
      email: r.email || null,
      // a coach who sometimes plays in practice: kept out of counts and team building
      coach: Boolean(r.coach),
      hasPlayed: Boolean(playedSet[r.name.trim().toLowerCase()])
    }))
  });
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// a past rating written the way the roster shows it: "7/10", "7.5/10", or "N/A"
const RATING = /^(10|[1-9](\.5)?)\s*\/\s*10$/;
const NO_RATING = /^n\/?a$/i;
const COACH = /^(assistant |head )?coach$/i;

// bulk add: one player per line, then any of grade, squad, email, past rating,
// and "coach" after commas
router.post('/roster/add', requireAuth, async (req, res) => {
  try {
    const text = String((req.body && req.body.text) || '');
    const existing = await roster.find({}).toArray();
    const squads = await getSquads();
    const byKey = {};
    existing.forEach(r => { byKey[r.name.trim().toLowerCase()] = r; });

    // one round trip for the whole paste rather than one per line
    const ops = [];
    let added = 0; let updated = 0;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      // "Name", "Name, 11", "Name, 11, JV 2", "Name, JV 2, name@school.org",
      // "Name, 7/10", "Name, N/A", "Name, coach" all work
      const parts = line.split(',').map(s => s.trim()).filter(Boolean);
      const name = (parts.shift() || '').replace(/[,-]+$/, '').trim();
      if (!name) continue;
      let grade = null; let squad = null; let email = null;
      // undefined: not given, so an existing rating is left alone
      let rating; let coach = false;
      for (const part of parts) {
        if (/^(9|10|11|12)(th)?$/i.test(part)) grade = Number(part.replace(/\D/g, ''));
        else if (EMAIL.test(part)) email = part.slice(0, 120);
        else if (RATING.test(part)) rating = Number(part.match(RATING)[1]);
        else if (NO_RATING.test(part)) rating = null;
        else if (COACH.test(part)) coach = true;
        else {
          const hit = squads.find(s => s.toLowerCase().replace(/[^a-z0-9]/g, '') ===
            part.toLowerCase().replace(/[^a-z0-9]/g, ''));
          if (hit) squad = hit;
        }
      }

      const key = name.toLowerCase();
      if (byKey[key]) {
        const set = {};
        if (grade != null && byKey[key].grade !== grade) set.grade = grade;
        if (squad && byKey[key].squad !== squad) set.squad = squad;
        if (email && byKey[key].email !== email) set.email = email;
        if (rating !== undefined && (byKey[key].rating ?? null) !== rating) set.rating = rating;
        if (coach && !byKey[key].coach) Object.assign(set, { coach: true, squad: null, permanent: false });
        if (Object.keys(set).length) {
          ops.push({ updateOne: { filter: { _id: byKey[key]._id }, update: { $set: set } } });
          Object.assign(byKey[key], set);
          updated++;
        }
      } else {
        const doc = { name, grade, squad: coach ? null : squad, email, rating: rating ?? null, coach, createdAt: new Date() };
        ops.push({ insertOne: { document: doc } });
        byKey[key] = doc;
        added++;
      }
    }
    if (ops.length) await roster.bulkWrite(ops);
    res.json({ ok: true, added, updated });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

router.post('/roster/update', requireAuth, async (req, res) => {
  try {
    const grade = req.body.grade === '' || req.body.grade == null ? null : Number(req.body.grade);
    const listed = (await getSquads()).includes(req.body.squad) ? req.body.squad : null;
    const given = Number(req.body.rating);
    const rating = req.body.rating === '' || req.body.rating == null || !Number.isFinite(given)
      ? null
      : Math.round(Math.min(10, Math.max(1, given)) * 2) / 2;
    const coach = Boolean(req.body.coach);
    const squad = coach ? null : listed;
    const permanent = Boolean(req.body.permanent) && Boolean(squad);
    const email = String(req.body.email ?? '').trim().slice(0, 120) || null;
    if (email && !EMAIL.test(email)) return res.status(400).json({ error: email + ' does not look like an email address' });
    await roster.updateOne({ _id: new ObjectId(String(req.body.id)) }, { $set: { grade, squad, rating, permanent, email, coach } });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/**
 * Renames a player inside every game they appear in: their buzzes, their team
 * lists, and the questions-heard counts keyed by "team|player".
 * @param {string} from
 * @param {string} to
 * @returns {Promise<number>} how many games changed
 */
async function renameInGames (from, to) {
  const hit = await games.find({ $or: [{ 'buzzes.player': from }, { 'teams.players': from }] }).toArray();
  for (const g of hit) {
    const buzzes = (g.buzzes || []).map(b => (b.player === from ? { ...b, player: to } : b));
    const notes = (g.notes || []).map(n => (n.player === from ? { ...n, player: to } : n));
    const teams = (g.teams || []).map(t => ({
      ...t,
      players: [...new Set((t.players || []).map(p => (p === from ? to : p)))]
    }));
    const heardByPlayer = {};
    for (const [key, heard] of Object.entries(g.heardByPlayer || {})) {
      const bar = key.indexOf('|');
      const team = key.slice(0, bar);
      const player = key.slice(bar + 1);
      const next = team + '|' + (player === from ? to : player);
      heardByPlayer[next] = Math.max(heardByPlayer[next] ?? 0, heard);
    }
    await games.updateOne({ _id: g._id }, { $set: { buzzes, teams, heardByPlayer, notes } });
  }
  return hit.length;
}

// Renaming carries a player's history with them. If the new name is already
// someone on the roster, the two entries merge into that one -- which is how a
// misspelling gets folded into the right player.
router.post('/roster/rename', requireAuth, async (req, res) => {
  try {
    const id = new ObjectId(String(req.body.id));
    const doc = await roster.findOne({ _id: id });
    if (!doc) return res.status(404).json({ error: 'not on the roster' });

    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'name cannot be empty' });

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clash = await roster.findOne({
      _id: { $ne: id },
      name: { $regex: '^' + escaped + '$', $options: 'i' }
    });
    const target = clash ? clash.name : name;
    const changedGames = await renameInGames(doc.name, target);
    if (clash) {
      await roster.deleteOne({ _id: id });
    } else {
      await roster.updateOne({ _id: id }, { $set: { name } });
    }
    res.json({ ok: true, name: target, games: changedGames, merged: Boolean(clash) });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// the squad list itself, edited on the Roster tab
router.post('/squads', requireAuth, async (req, res) => {
  const seen = new Set();
  const list = (Array.isArray(req.body?.list) ? req.body.list : [])
    .map(s => String(s ?? '').trim().slice(0, 40))
    .filter(s => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 24);
  if (!list.length) return res.status(400).json({ error: 'list at least one squad' });
  await settings.updateOne({ _id: 'squads' }, { $set: { list } }, { upsert: true });
  res.json({ ok: true, list });
});

// Put players on squads in one go, from the team builder. Someone who has
// played but was never added to the roster is added now.
router.post('/roster/assign', requireAuth, async (req, res) => {
  try {
    const squads = await getSquads();
    const wanted = (Array.isArray(req.body?.assignments) ? req.body.assignments : []).slice(0, 200);
    const byKey = {};
    for (const r of await roster.find({}).toArray()) byKey[r.name.trim().toLowerCase()] = r;
    const ops = [];
    for (const a of wanted) {
      const name = String(a?.name ?? '').trim().slice(0, 60);
      const squad = squads.includes(a?.squad) ? a.squad : null;
      if (!name) continue;
      const hit = byKey[name.toLowerCase()];
      if (hit) {
        ops.push({ updateOne: { filter: { _id: hit._id }, update: { $set: { squad } } } });
      } else {
        ops.push({ insertOne: { document: { name, grade: null, squad, createdAt: new Date() } } });
      }
    }
    if (ops.length) await roster.bulkWrite(ops);
    res.json({ ok: true, assigned: ops.length });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

router.post('/roster/remove', requireAuth, async (req, res) => {
  try {
    await roster.deleteOne({ _id: new ObjectId(String(req.body.id)) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---------- parsing MODAQ exports ----------

function parseQbj (m, cats, denominators) {
  const teams = [];
  const heardByPlayer = {};
  for (const mt of m.match_teams || []) {
    const teamName = mt.team?.name || 'Unknown team';
    const roster = [];
    for (const mp of mt.match_players || []) {
      const name = mp.player?.name || 'Unknown player';
      roster.push(name);
      if (typeof mp.tossups_heard === 'number') heardByPlayer[teamName + '|' + name] = mp.tossups_heard;
    }
    teams.push({ name: teamName, players: roster, score: 0 });
  }
  const buzzes = [];
  for (const q of m.match_questions || []) {
    const num = q.question_number || q.tossup_question?.question_number;
    for (const b of q.buzzes || []) {
      buzzes.push({
        player: b.player?.name || 'Unknown player',
        team: b.team?.name || 'Unknown team',
        questionNumber: num,
        category: categoryFor(num, cats),
        value: b.result?.value ?? 0,
        wordIndex: b.buzz_position?.word_index ?? null,
        wordCount: denominators?.words?.[num - 1] ?? null,
        charCount: denominators?.chars?.[num - 1] ?? null
      });
    }
  }
  return { teams, buzzes, heardByPlayer, tossupsRead: m.tossups_read || (m.match_questions || []).length };
}

function parseRaw (o, cats, denominators) {
  const teams = {};
  for (const p of o.players || []) {
    const t = p.teamName || 'Unknown team';
    teams[t] = teams[t] || { name: t, players: [], score: 0 };
    teams[t].players.push(p.name);
  }
  const buzzes = [];
  (o.cycles || []).forEach((cycle, i) => {
    const num = i + 1;
    const add = (marker, fallback) => {
      if (!marker) return;
      const pl = marker.player || marker;
      buzzes.push({
        player: pl.name || 'Unknown player',
        team: pl.teamName || 'Unknown team',
        questionNumber: num,
        category: categoryFor(num, cats),
        value: typeof marker.points === 'number' ? marker.points : fallback,
        wordIndex: typeof marker.position === 'number' ? marker.position : null,
        wordCount: denominators?.words?.[num - 1] ?? null,
        charCount: denominators?.chars?.[num - 1] ?? null
      });
    };
    add(cycle.correctBuzz, 10);
    for (const w of cycle.wrongBuzzes || []) add(w, -5);
  });
  return { teams: Object.values(teams), buzzes, heardByPlayer: {}, tossupsRead: (o.cycles || []).length };
}

const LEVEL_KEYS = Object.keys(LEVELS);
const validLevel = v => (LEVEL_KEYS.includes(v) ? v : null);

function normalize (raw, label, cats, denominators) {
  let parsed;
  if (raw && (raw.match_teams || raw.match_questions)) parsed = parseQbj(raw, cats, denominators);
  else if (raw && raw.cycles) parsed = parseRaw(raw, cats, denominators);
  else throw new Error('unrecognized export format - use MODAQ\'s QBJ or JSON export');

  for (const t of parsed.teams) t.score = teamScore(parsed.buzzes, t.name);
  for (const b of parsed.buzzes) {
    if (!parsed.teams.find(t => t.name === b.team)) {
      parsed.teams.push({ name: b.team, players: [], score: teamScore(parsed.buzzes, b.team) });
    }
  }
  if (!parsed.buzzes.length) throw new Error('no buzzes found in that file');

  return {
    label: label || 'Practice',
    playedAt: new Date(),
    tossupsRead: parsed.tossupsRead,
    categories: cats || null,
    // kept so celerity can be recalculated later without replaying anything
    wordCounts: denominators?.words ?? null,
    charCounts: denominators?.chars ?? null,
    teams: parsed.teams,
    heardByPlayer: parsed.heardByPlayer,
    buzzes: parsed.buzzes
  };
}

function teamScore (buzzes, teamName) {
  return buzzes.reduce((sum, b) => sum + (b.team === teamName ? b.value || 0 : 0), 0);
}

// ---------- endpoints ----------

// round ids being saved right now, so two saves racing each other cannot both
// pass the already-saved check below
const saving = new Set();

router.post('/upload', requireReader, async (req, res) => {
  const roundId = typeof req.body?.roundId === 'string' ? req.body.roundId.slice(0, 64) : null;
  if (roundId && saving.has(roundId)) {
    return res.status(409).json({ error: 'this game is still being saved' });
  }
  if (roundId) saving.add(roundId);
  try {
    const { game, label, categories, wordCounts, charCounts, questionIds } = req.body || {};
    if (!game) return res.status(400).json({ error: 'no game data' });
    if (roundId && await games.findOne({ roundId }, { projection: { _id: 1 } })) {
      return res.status(409).json({
        error: 'this game is already saved to team stats, and a game only saves once. Fix mistakes on the Practice stats page'
      });
    }
    const cats = Array.isArray(categories)
      ? categories.map(c => String(c == null ? '' : c).trim().slice(0, 60)).filter(Boolean)
      : null;
    const counts = arr => (Array.isArray(arr)
      ? arr.map(n => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : null))
      : null);
    const denominators = { words: counts(wordCounts), chars: counts(charCounts) };
    const doc = normalize(game, String(label || '').slice(0, 120), cats && cats.length ? cats : null, denominators);
    doc.level = validLevel(req.body.level);
    doc.roundId = roundId;
    // which questions were read, for tracing a game back to its packet
    doc.questionIds = Array.isArray(questionIds) ? questionIds.slice(0, 40).map(q => String(q).slice(0, 40)) : null;

    // backstop against duplicate players: if a name already exists with different
    // capitalization or stray spaces, store it under the existing spelling
    const fix = await nameCanonicalizer();
    for (const b of doc.buzzes) b.player = fix(b.player);
    for (const t of doc.teams) t.players = (t.players || []).map(fix);
    // notes the moderator wrote while reading
    const inGame = new Set(doc.teams.flatMap(t => t.players).concat(doc.buzzes.map(b => b.player)));
    doc.notes = cleanNotes(req.body.notes, n => inGame.has(n), fix);

    const result = await games.insertOne(doc);
    res.json({ ok: true, id: result.insertedId, buzzes: doc.buzzes.length });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  } finally {
    if (roundId) saving.delete(roundId);
  }
});

// A note written in the reader after its game was already saved: added to
// that game, found by the round it was read from.
router.post('/notes', requireReader, async (req, res) => {
  try {
    const roundId = typeof req.body?.roundId === 'string' ? req.body.roundId.slice(0, 64) : '';
    const g = roundId && await games.findOne({ roundId });
    if (!g) return res.status(404).json({ error: 'that game is not saved yet' });
    const inGame = new Set(playersInGame(g).keys());
    const added = cleanNotes(req.body.notes, n => inGame.has(n), await nameCanonicalizer());
    await games.updateOne({ _id: g._id }, { $set: { notes: (g.notes || []).concat(added) } });
    res.json({ ok: true, notes: added.length });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Lineups from recent games. Tryouts run the same people repeatedly with one
// side swapping out, so the reader offers these instead of retyping a roster.
router.get('/lineups', requireReader, async (req, res) => {
  const recent = await games
    .find({}, { projection: { label: 1, playedAt: 1, 'teams.name': 1, 'teams.players': 1 } })
    .sort({ playedAt: -1 })
    .limit(25)
    .toArray();
  res.json({
    games: recent
      .map(g => ({
        id: String(g._id),
        label: g.label,
        playedAt: g.playedAt,
        teams: (g.teams || [])
          .map(t => ({ name: t.name, players: (t.players || []).filter(Boolean) }))
          .filter(t => t.players.length)
      }))
      .filter(g => g.teams.length)
  });
});

// full record of one game, for the editor and for download/backup
router.get('/game/:id', requireAuth, async (req, res) => {
  try {
    const g = await games.findOne({ _id: new ObjectId(String(req.params.id)) });
    if (!g) return res.status(404).json({ error: 'game not found' });
    res.json(g);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

const BUZZ_VALUES = [10, -5, 0];

/**
 * Checks an edited game from the stats page and turns it into the stored
 * shape. Throws with a message for the moderator on anything invalid.
 * @param {object} body - { label, level, teams: [{name, players: [{name, heard}]}],
 *   buzzes: [{questionNumber, category, player, value, wordIndex}],
 *   notes: [{questionNumber, player, text}] }
 * @param {object} g - the game as stored
 * @param {function(string): string} fix - name canonicalizer
 */
function editedGame (body, g, fix) {
  const label = String(body.label || '').trim().slice(0, 120);
  if (!label) throw new Error('the game needs a name');
  if (!Array.isArray(body.teams) || !body.teams.length || body.teams.length > 4) {
    throw new Error('a game has one to four teams');
  }

  const teamOf = {};
  const heardByPlayer = {};
  const teamNames = {};
  const teams = body.teams.map(t => {
    const name = String(t?.name || '').trim().slice(0, 60);
    if (!name) throw new Error('every team needs a name');
    if (teamNames[name.toLowerCase()]) throw new Error('two teams are both called ' + name);
    teamNames[name.toLowerCase()] = true;
    const players = (Array.isArray(t.players) ? t.players : []).slice(0, 20).map(p => {
      const player = fix(String(p?.name || '').slice(0, 60));
      if (!player) throw new Error('a player on ' + name + ' has no name');
      if (teamOf[player]) throw new Error(player + ' is listed twice');
      teamOf[player] = name;
      const heard = Number(p.heard);
      if (p.heard != null && Number.isInteger(heard) && heard >= 0 && heard <= 200) {
        heardByPlayer[name + '|' + player] = heard;
      }
      return player;
    });
    return { name, players, score: 0 };
  });

  if (!Array.isArray(body.buzzes) || body.buzzes.length > 400) throw new Error('too many buzzes');
  const buzzes = body.buzzes.map(b => {
    const player = fix(String(b?.player || ''));
    if (!teamOf[player]) throw new Error('a buzz is credited to ' + (player || 'nobody') + ', who is not on a team');
    const value = Number(b.value);
    if (!BUZZ_VALUES.includes(value)) throw new Error('a buzz has to be +10, -5 or 0');
    const category = String(b.category || '');
    if (!CATEGORIES.includes(category) && category !== 'Other') throw new Error('unknown category ' + category);
    const q = b.questionNumber == null || b.questionNumber === '' ? null : Number(b.questionNumber);
    if (q != null && !(Number.isInteger(q) && q >= 1 && q <= 99)) throw new Error('question numbers run 1 to 99');
    // a buzz position only means something against the question it came from
    const wordIndex = q != null && Number.isInteger(b.wordIndex) && b.wordIndex >= 0 ? b.wordIndex : null;
    return {
      player,
      team: teamOf[player],
      questionNumber: q,
      category,
      value,
      wordIndex,
      wordCount: wordIndex != null ? g.wordCounts?.[q - 1] ?? null : null,
      charCount: wordIndex != null ? g.charCounts?.[q - 1] ?? null : null
    };
  }).sort((a, b) => (a.questionNumber ?? 999) - (b.questionNumber ?? 999));

  for (const t of teams) t.score = teamScore(buzzes, t.name);
  const notes = cleanNotes(body.notes, n => Boolean(teamOf[n]), fix);
  return { label, level: validLevel(body.level), teams, heardByPlayer, buzzes, notes };
}

// the stats page's game editor: rename, set the level, fix teams and scorers
router.post('/game/:id/update', requireAuth, async (req, res) => {
  try {
    const _id = new ObjectId(String(req.params.id));
    const g = await games.findOne({ _id });
    if (!g) return res.status(404).json({ error: 'game not found' });
    if (kindOf(g) === 'tournament') return res.status(400).json({ error: 'tournament games are edited on the Tournaments tab' });
    const edited = editedGame(req.body || {}, g, await nameCanonicalizer());
    await games.updateOne({ _id }, { $set: { ...edited, editedAt: new Date() } });
    res.json({ ok: true, teams: edited.teams.map(t => ({ name: t.name, score: t.score })) });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// A read-only copy of everything, for looking at the team's data from outside
// the site. Off unless STATS_EXPORT_TOKEN is set on the server; send it as
// "Authorization: Bearer <token>". A stats sign-in works too.
router.get('/export', async (req, res) => {
  const token = process.env.STATS_EXPORT_TOKEN;
  const sent = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(token && sent && sameSecret(sent, token)) && roleOf(req) !== 'stats') {
    return res.status(401).json({ error: 'not allowed' });
  }
  try {
    const [allGames, rosterList, squads, questionPool] = await Promise.all([
      games.find({}).sort({ playedAt: 1 }).toArray(),
      // emails stay on the site: the export is for numbers, not contacting anyone
      roster.find({}, { projection: { email: 0 } }).sort({ name: 1 }).toArray(),
      getSquads(),
      poolSummary()
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({ exportedAt: new Date(), squads, roster: rosterList, games: allGames, questionPool });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

router.post('/delete', requireAuth, async (req, res) => {
  try {
    await games.deleteOne({ _id: new ObjectId(String(req.body.id)) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---------- stats ----------

function emptyTotals () {
  return { games: new Set(), heard: 0, correct: 0, wrong: 0, negs: 0, points: 0, celSum: 0, celCount: 0 };
}

function addBuzz (t, b) {
  if (b.value > 0) {
    t.correct++;
    // celerity is only meaningful on a correct buzz, same as qbreader
    const c = celerityOf(b.wordIndex, b.wordCount);
    if (c != null) { t.celSum += c; t.celCount++; }
  } else {
    // every wrong answer counts against accuracy, penalized or not
    t.wrong++;
    if (b.value < 0) t.negs++;
  }
  t.points += b.value || 0;
}

function summary (t) {
  const buzzes = t.correct + t.wrong;
  return {
    games: t.games.size,
    heard: t.heard,
    correct: t.correct,
    wrong: t.wrong,
    negs: t.negs,
    points: t.points,
    // points per tossup heard -- a fairer rate than points per game when
    // players rotate in and out mid-round
    ppth: t.heard ? +(t.points / t.heard).toFixed(2) : null,
    accuracy: buzzes ? Math.round((t.correct / buzzes) * 100) : null,
    celerity: t.celCount ? +(t.celSum / t.celCount).toFixed(3) : null,
    celeritySum: t.celSum,
    celerityCount: t.celCount
  };
}

router.get('/data', requireAuth, async (req, res) => {
  const { month, level, kind, season, inMonth, inLevel, inKind } = readFilters(req.query);

  const everything = await games.find({}).sort({ playedAt: 1 }).toArray();
  const all = everything.filter(inKind);

  // squad assignment comes from the roster, not from whatever the moderator
  // typed as a team name in a given game
  const squadByName = {};
  for (const r of await roster.find({}).toArray()) {
    squadByName[r.name.trim().toLowerCase()] = r.squad || null;
  }

  // Three views of each player at once: the filtered table, a month-by-month
  // history under the chosen level, and a level-by-level split under the
  // chosen months.
  const players = {};
  const playerFor = name => players[name] || (players[name] = {
    name,
    main: emptyTotals(),
    byCategory: {},
    perGame: {},
    byMonth: {},
    byLevel: {},
    notes: []
  });
  const monthsSeen = new Set();
  const shown = [];

  for (const g of all) {
    const gid = String(g._id);
    const mKey = monthKeyOf(g.playedAt);
    const lKey = g.level || 'untagged';
    monthsSeen.add(mKey);
    const main = inMonth(mKey) && inLevel(lKey);
    if (main) shown.push(g);

    const bucketsFor = p => {
      const list = [];
      if (main) list.push(p.main);
      if (inLevel(lKey)) list.push(p.byMonth[mKey] || (p.byMonth[mKey] = emptyTotals()));
      if (inMonth(mKey)) list.push(p.byLevel[lKey] || (p.byLevel[lKey] = emptyTotals()));
      return list;
    };

    for (const [name, heard] of playersInGame(g)) {
      const p = playerFor(name);
      for (const t of bucketsFor(p)) { t.games.add(gid); t.heard += heard; }
      if (main) p.perGame[gid] = { id: gid, label: g.label + ' (' + new Date(g.playedAt).toLocaleDateString() + ')', points: 0 };
    }

    for (const b of g.buzzes || []) {
      if (!b.player) continue; // the other school, in a tournament game
      const p = playerFor(b.player);
      for (const t of bucketsFor(p)) addBuzz(t, b);
      if (main) {
        const pc = p.byCategory[b.category] || (p.byCategory[b.category] = { correct: 0, wrong: 0 });
        if (b.value > 0) pc.correct++; else pc.wrong++;
        p.perGame[gid].points += b.value || 0;
      }
    }

    if (main) {
      for (const n of g.notes || []) {
        if (!n.player || !players[n.player]) continue;
        players[n.player].notes.push({
          gameId: gid,
          game: g.label,
          playedAt: g.playedAt,
          questionNumber: n.questionNumber,
          category: n.questionNumber ? (g.categories || CATEGORY_BY_QUESTION)[n.questionNumber - 1] || null : null,
          text: n.text
        });
      }
    }
  }

  const levelLabel = key => (LEVELS[key] ? LEVELS[key].label : 'Untagged');
  const playerRows = Object.values(players)
    .filter(p => p.main.games.size)
    .map(p => ({
      name: p.name,
      team: squadByName[p.name.trim().toLowerCase()] || 'Unassigned',
      ...summary(p.main),
      byCategory: p.byCategory,
      perGame: Object.values(p.perGame),
      byMonth: Object.keys(p.byMonth).sort().reverse()
        .map(key => ({ key, label: monthLabel(key), ...summary(p.byMonth[key]) })),
      byLevel: LEVEL_KEYS.concat('untagged').filter(key => p.byLevel[key])
        .map(key => ({ key, label: levelLabel(key), ...summary(p.byLevel[key]) })),
      // newest first
      notes: p.notes.reverse()
    }))
    .sort((a, b) => (b.ppth ?? -99) - (a.ppth ?? -99));

  res.json({
    filters: { month, level, kind },
    seasonStart: monthLabel(season),
    months: [...monthsSeen].sort().reverse().map(key => ({ key, label: monthLabel(key) })),
    levels: LEVEL_KEYS.map(key => ({ key, label: LEVELS[key].label })),
    kinds: Object.keys(KINDS).map(key => ({ key, label: KINDS[key] })),
    totalGames: everything.length,
    games: shown.map(g => ({
      id: String(g._id),
      label: g.label,
      kind: kindOf(g),
      notes: (g.notes || []).length,
      level: g.level || null,
      playedAt: g.playedAt,
      tossupsRead: g.tossupsRead,
      teams: (g.teams || []).map(t => ({ name: t.name, score: t.score }))
    })),
    players: playerRows,
    categoryNames: CATEGORIES
  });
});

// ---------- page ----------

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Practice stats</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
${KSHSAA_HEAD}
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer></script>
<style>
 /* one type scale and one set of surfaces for the whole page */
 body{background:#f6f7f9;color:#1f2733;font-size:15px}
 h1{font-size:1.35rem;font-weight:600}
 h2{font-size:1.05rem;font-weight:600;color:#33415c;margin:2.25rem 0 .65rem}
 h3{font-size:.95rem;font-weight:600;color:#33415c;margin:0 0 .5rem}
 .subhead{font-size:.85rem;font-weight:600;color:#6b7280;text-transform:uppercase;
   letter-spacing:.03em;margin:1.25rem 0 .5rem}
 .card{border:1px solid #e4e8ee;border-radius:.5rem;box-shadow:none}
 .note{font-size:.83rem;color:#6b7280;margin:.5rem 0 0}
 table{font-size:.9rem;margin-bottom:0}
 thead th{font-weight:600;color:#4b5563;border-bottom:1px solid #e4e8ee;white-space:nowrap}
 thead th.sortable{cursor:pointer;user-select:none}
 thead th.sortable:hover{color:#1f2937}
 thead th.sorted{color:#1f2937}
 .sortarrow{font-size:.7em;margin-left:.25em}
 th,td{padding:.5rem .65rem !important;vertical-align:middle}
 .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 .heat{display:inline-block;min-width:3rem;padding:.15rem .4rem;border-radius:.25rem;
   text-align:center;font-size:.85rem}
 .rowlink{cursor:pointer}
 tr.selected td{background:#eef4ff !important}
 .res{display:inline-block;padding:.12rem .5rem;border-radius:.3rem;font-size:.85rem;margin-right:.35rem}
 .res-win{background:#e6f2ea;color:#1d6b40;font-weight:600}
 .res-loss{background:#f2f3f5;color:#6b7280}
 .res-tie{background:#fbf1de;color:#8a6116}
 .res .sc{font-variant-numeric:tabular-nums}
 .form-label{font-size:.85rem;font-weight:600;color:#4b5563}
 .lvl{display:inline-block;padding:.1rem .45rem;border-radius:.3rem;font-size:.78rem;background:#eef1f7;color:#33415c}
 .lvl-none{background:#f6f7f9;color:#9ca3af}
 .kv{display:inline-block;margin:0 1.25rem .4rem 0}
 .tallies{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;font-size:.85rem}
 .tally{border:1px solid #d9e0ec;background:#f6f8fb;border-radius:.3rem;padding:.12rem .55rem;color:#4b5563}
 .tally strong{color:#1f2733}
 .tally-total{border:0;background:none;padding-left:0;font-weight:700;font-size:.95rem;color:#1f2733}
 .kv .k{display:block;font-size:.75rem;color:#6b7280}
 .kv .v{font-size:1.05rem;font-weight:600;font-variant-numeric:tabular-nums}
 #gmBuzzes td{padding:.25rem .35rem !important}
 details.card > summary{cursor:pointer;padding:.75rem 1rem;font-weight:600;color:#33415c}
 /* "Show to player": one player's card over the whole screen, so showing a
    student their numbers never shows anyone else's */
 body.solo #spotlight{position:fixed;inset:0;z-index:1050;margin:0 !important;background:#fff;overflow:auto;padding:2rem 1rem}
 body.solo #spotlight > .card{max-width:1180px;margin:0 auto;border:0}
 .solo-only{display:none}
 body.solo .solo-only{display:inline-block}
 body.solo .not-solo{display:none}
</style>
</head><body>

${kshsaaNav('/kshsaa-stats', 1100)}

<div class="container pb-5" style="max-width:1100px">
  <div class="d-flex justify-content-between align-items-center">
    <h1 class="h4 mb-0">Practice stats</h1>
    <button class="btn btn-sm btn-outline-secondary d-none" id="logout">Log out</button>
  </div>

  <div id="login" class="card mt-3 d-none" style="max-width:420px"><div class="card-body">
    <label class="form-label" for="pw">Stats password</label>
    <input type="password" class="form-control mb-2" id="pw">
    <button class="btn btn-primary" id="loginBtn">Enter</button>
    <div class="small text-danger mt-2" id="loginErr"></div>
  </div></div>

  <div id="app" class="d-none">
    <ul class="nav nav-tabs mt-3" id="tabs">
      <li class="nav-item"><button class="nav-link active" data-tab="stats" type="button">Stats</button></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-insights">Insights</a></li>
      <li class="nav-item"><button class="nav-link" data-tab="roster" type="button">Roster</button></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-tournaments">Tournaments</a></li>
      <li class="nav-item"><a class="nav-link" href="/kshsaa-questions">Question bank</a></li>
    </ul>

    <div id="tabStats">
      <div class="d-flex flex-wrap gap-3 align-items-end mt-3">
        <div><label class="form-label mb-1" for="fMonth">Games from</label>
          <select class="form-select form-select-sm" id="fMonth"></select></div>
        <div><label class="form-label mb-1" for="fLevel">Level</label>
          <select class="form-select form-select-sm" id="fLevel"></select></div>
        <div><label class="form-label mb-1" for="fKind">Games</label>
          <select class="form-select form-select-sm" id="fKind"><option value="all">Practice and tournaments</option>
            <option value="practice">Practice only</option><option value="tournament">Tournaments only</option></select></div>
        <div class="note mb-1" id="filterNote"></div>
      </div>
      <div id="content"></div>

      <details class="card mt-4">
        <summary>Add a game exported from MODAQ elsewhere</summary>
        <div class="card-body pt-0">
          <p class="small text-secondary">Games read on this site save themselves &mdash; use
          &ldquo;Save to team stats&rdquo; in the reader. This is for games exported from MODAQ somewhere else.</p>
          <div class="row g-2 align-items-end">
            <div class="col-sm-4"><label class="form-label small">Game name</label>
              <input class="form-control form-control-sm" id="label" placeholder="Tuesday practice, game 2"></div>
            <div class="col-sm-2"><label class="form-label small">Level</label>
              <select class="form-select form-select-sm" id="upLevel"></select></div>
            <div class="col-sm-4"><label class="form-label small">MODAQ export file</label>
              <input class="form-control form-control-sm" type="file" id="file" accept=".json,.qbj"></div>
            <div class="col-sm-2"><button class="btn btn-primary btn-sm w-100" id="up">Upload</button></div>
          </div>
          <div class="small mt-2" id="upMsg"></div>
        </div>
      </details>
    </div>

    <div id="tabRoster" class="d-none">
    <div class="card mt-3"><div class="card-body">
      <h2 class="mt-0">Roster</h2>
      <p class="note mb-2" style="margin-top:0">Names here autocomplete when setting up a round, even before
      anyone has played, and the squad you assign is what shows in the stats table. One player per line;
      grade, squad, email, and past rating after commas are optional (<code>Max Chen, 11, JV Blue, max@school.org, 7/10</code>;
      <code>N/A</code> clears a rating, <code>coach</code> marks a coach). Pasting a name already on the roster changes
      only what that line gives &mdash; the rest is left alone. Renaming a player updates every game they played in; renaming
      them to a name already on the roster merges the two.</p>
      <div class="row g-2 align-items-start">
        <div class="col-sm-8"><textarea class="form-control form-control-sm" id="rosterText" rows="4"
          placeholder="Max Chen, 11&#10;Sarah Kim, 12&#10;Diego Alvarez, 9"></textarea></div>
        <div class="col-sm-4"><button class="btn btn-primary btn-sm w-100" id="rosterAdd">Add to roster</button>
          <div class="small mt-2" id="rosterMsg"></div></div>
      </div>
      <div class="row g-2 align-items-start mt-3">
        <div class="col-sm-8"><label class="form-label" for="squadText">Squads, one per line, strongest first</label>
          <textarea class="form-control form-control-sm" id="squadText" rows="4"></textarea></div>
        <div class="col-sm-4 pt-sm-4"><button class="btn btn-outline-primary btn-sm w-100" id="squadSave">Save squads</button>
          <div class="small mt-2" id="squadMsg"></div></div>
      </div>
      <div id="rosterList" class="mt-3"></div>
    </div></div>
    </div>
  </div>
</div>

<div class="modal fade" id="gameModal" tabindex="-1" aria-labelledby="gmTitle" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="gmTitle">Game</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body" id="gmBody"></div>
      <div class="modal-footer">
        <div class="me-auto d-flex flex-wrap gap-1">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="gmJson">Download JSON</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="gmCsv">Download CSV</button>
          <button type="button" class="btn btn-sm btn-outline-danger" id="gmDelete">Delete game</button>
        </div>
        <span class="small text-danger" id="gmErr"></span>
        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" id="gmSave">Save changes</button>
      </div>
    </div>
  </div>
</div>

${NAME_AUTOCOMPLETE}
<script>
var $ = function (id) { return document.getElementById(id); };
var DATA = null, SELECTED = null, CHARTS = {}, SQUADS = [], SQUAD = '';
var SEARCH = '', KNOWN_NAMES = [];
var FILTER = { month: 'season', level: 'all', kind: 'all' };
// points per question is the default: it orders identically to raw points when
// everyone hears the same tossups, and stays fair once players rotate in and out
var SORT = { key: 'ppth', dir: -1 };
var SORT_COLS = [
  { key: 'name', label: 'Player', text: true },
  { key: 'team', label: 'Squad', text: true },
  { key: 'games', label: 'Games', tip: 'Games played in, buzzing or not' },
  { key: 'ppth', label: 'Points/question', tip: 'Points per tossup heard' },
  { key: 'accuracy', label: 'Buzz accuracy', tip: 'Share of buzzes answered correctly, counting every wrong answer' },
  { key: 'celerity', label: 'Celerity', tip: 'How early correct buzzes came: 1.000 is the first word, 0 the last' }
];
var RESULTS = [
  { value: 10, label: '+10 correct' },
  { value: -5, label: '\\u22125 wrong, interrupted' },
  { value: 0, label: '0 wrong, no interrupt' }
];

function esc (s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function postJson (url, body) {
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); });
}
function fmt (v, kind) {
  if (v == null) return '-';
  if (kind === 'pct') return v + '%';
  if (kind === 'cel') return v.toFixed(3);
  return v;
}
function levelName (key) {
  if (!key) return 'Untagged';
  var hit = (DATA && DATA.levels || []).filter(function (l) { return l.key === key; })[0];
  return hit ? hit.label : key;
}
function levelBadge (key) {
  return '<span class="lvl' + (key ? '' : ' lvl-none') + '">' + esc(levelName(key)) + '</span>';
}

// ---------- sorting ----------

function sortColumn () {
  for (var i = 0; i < SORT_COLS.length; i++) {
    if (SORT_COLS[i].key === SORT.key) return SORT_COLS[i];
  }
  return SORT_COLS[3];
}

function sortPlayers (list) {
  var col = sortColumn();
  return list.slice().sort(function (a, b) {
    var x = a[col.key], y = b[col.key];
    if (col.text) {
      var t = String(x || '').localeCompare(String(y || ''));
      if (t) return t * SORT.dir;
    } else if (x == null || y == null) {
      // a player with no reading for this column sits at the bottom either way
      if (x != null) return -1;
      if (y != null) return 1;
    } else if (x !== y) {
      return (x < y ? -1 : 1) * SORT.dir;
    }
    if (b.points !== a.points) return b.points - a.points;
    return String(a.name).localeCompare(String(b.name));
  });
}

// ---------- login ----------

function show (a) {
  $('login').classList.toggle('d-none', a);
  $('app').classList.toggle('d-none', !a);
  $('logout').classList.toggle('d-none', !a);
  if (a) { load(); loadRoster(); loadNames(); }
}
fetch('/kshsaa-stats/me').then(function (r) { return r.json(); }).then(function (d) { show(d.authed); });

$('loginBtn').onclick = function () {
  postJson('/kshsaa-stats/login', { password: $('pw').value }).then(function (res) {
    if (!res.ok) { $('loginErr').textContent = res.d.error || 'failed'; return; }
    if (res.d.role !== 'stats') { $('loginErr').textContent = 'That is the reader password. Stats need the stats password.'; return; }
    show(true);
  });
};
$('pw').onkeydown = function (e) { if (e.key === 'Enter') $('loginBtn').click(); };
$('logout').onclick = function () { fetch('/kshsaa-stats/logout', { method: 'POST' }).then(function () { show(false); }); };

function loadNames () {
  fetch('/kshsaa-stats/names').then(function (r) { return r.json(); }).then(function (d) { KNOWN_NAMES = d.names || []; });
}

// ---------- filters ----------

function fillFilters (d) {
  var months = '<option value="season">This school year (since ' + esc(d.seasonStart) + ')</option>' +
    '<option value="all">All time</option>' +
    d.months.map(function (m) { return '<option value="' + m.key + '">' + esc(m.label) + '</option>'; }).join('');
  $('fMonth').innerHTML = months;
  $('fMonth').value = FILTER.month;
  var levels = '<option value="all">All levels</option>' +
    d.levels.map(function (l) { return '<option value="' + l.key + '">' + esc(l.label) + '</option>'; }).join('') +
    '<option value="untagged">Untagged</option>';
  $('fLevel').innerHTML = levels;
  $('fLevel').value = FILTER.level;
  $('upLevel').innerHTML = '<option value="">Untagged</option>' +
    d.levels.map(function (l) { return '<option value="' + l.key + '">' + esc(l.label) + '</option>'; }).join('');
  $('filterNote').textContent = d.games.length === d.totalGames
    ? d.totalGames + ' games'
    : d.games.length + ' of ' + d.totalGames + ' games';
}
$('fMonth').onchange = function () { FILTER.month = $('fMonth').value; load(); };
$('fLevel').onchange = function () { FILTER.level = $('fLevel').value; load(); };
$('fKind').onchange = function () { FILTER.kind = $('fKind').value; load(); };

function load () {
  fetch('/kshsaa-stats/data?month=' + encodeURIComponent(FILTER.month) + '&level=' + encodeURIComponent(FILTER.level) +
    '&kind=' + encodeURIComponent(FILTER.kind))
    .then(function (r) { return r.json(); })
    .then(function (d) { DATA = d; fillFilters(d); render(d); });
}

// ---------- upload ----------

$('up').onclick = function () {
  var f = $('file').files[0];
  if (!f) { $('upMsg').textContent = 'pick a file first'; return; }
  var reader = new FileReader();
  reader.onload = function () {
    var game;
    try { game = JSON.parse(reader.result); } catch (e) { $('upMsg').innerHTML = '<span class="text-danger">not valid JSON</span>'; return; }
    postJson('/kshsaa-stats/upload', { game: game, label: $('label').value, level: $('upLevel').value })
      .then(function (res) {
        if (res.ok) {
          $('upMsg').innerHTML = '<span class="text-success">added (' + res.d.buzzes + ' buzzes)</span>';
          $('file').value = ''; $('label').value = ''; load();
        } else {
          $('upMsg').innerHTML = '<span class="text-danger">' + esc(res.d.error || 'upload failed') + '</span>';
        }
      });
  };
  reader.readAsText(f);
};

// ---------- roster ----------

var ROSTER = [];
var ROSTER_SORT = { key: 'name', dir: 1 };
// the direction each column sorts in first: names A-Z, younger grades first,
// strongest squad first, highest rating first, players with stats first
var ROSTER_COLS = [
  { key: 'name', label: 'Player', dir: 1 },
  { key: 'grade', label: 'Grade', dir: 1, width: '6rem' },
  { key: 'squad', label: 'Squad', dir: 1, width: '14rem' },
  { key: 'rating', label: 'Past rating', dir: -1, width: '8rem', tip: 'Out of 10, from past seasons. N/A for anyone you have not seen play yet. The team builder blends it with stats.' },
  { key: 'hasPlayed', label: 'Status', dir: -1, width: '8rem' }
];

function rosterValue (r, key) {
  if (key === 'squad') {
    if (!r.squad) return null;
    var at = SQUADS.indexOf(r.squad);
    return at === -1 ? SQUADS.length : at;
  }
  if (key === 'hasPlayed') return r.hasPlayed ? 1 : 0;
  return r[key];
}

function sortedRoster () {
  var key = ROSTER_SORT.key;
  var dir = ROSTER_SORT.dir;
  return ROSTER.slice().sort(function (a, b) {
    if (key === 'name') return a.name.localeCompare(b.name) * dir;
    var x = rosterValue(a, key);
    var y = rosterValue(b, key);
    // blanks sit at the bottom whichever way the column sorts
    if (x == null || y == null) {
      if (x != null) return -1;
      if (y != null) return 1;
    } else if (x !== y) {
      return (x < y ? -1 : 1) * dir;
    }
    return a.name.localeCompare(b.name);
  });
}

function rosterSummary () {
  // coaches are on the list for autocomplete, not counted as players
  var players = ROSTER.filter(function (r) { return !r.coach; });
  var coaches = ROSTER.length - players.length;
  var grades = {};
  players.forEach(function (r) { if (r.grade) grades[r.grade] = (grades[r.grade] || 0) + 1; });
  var noGrade = players.filter(function (r) { return !r.grade; }).length;
  var onSquad = players.filter(function (r) { return r.squad; }).length;
  var tally = function (label, n) { return '<span class="tally">' + label + ': <strong>' + n + '</strong></span>'; };
  // every squad, empty ones too, so a squad still short of players shows
  var squads = {};
  players.forEach(function (r) { if (r.squad) squads[r.squad] = (squads[r.squad] || 0) + 1; });
  var squadNames = SQUADS.concat(Object.keys(squads).filter(function (q) { return SQUADS.indexOf(q) === -1; }));
  return '<div class="tallies mb-2"><span class="tally tally-total">' + players.length + ' player' + (players.length === 1 ? '' : 's') + '</span>' +
    Object.keys(grades).sort(function (a, b) { return a - b; }).map(function (g) { return tally(g + 'th grade', grades[g]); }).join('') +
    (noGrade ? tally('No grade', noGrade) : '') +
    tally('On a squad', onSquad) + (coaches ? tally('Coaches', coaches) : '') + '</div>' +
    (squadNames.length
      ? '<div class="tallies mb-2"><span class="tally tally-total">By squad</span>' +
        squadNames.map(function (q) { return tally(esc(q), squads[q] || 0); }).join('') +
        tally('Unassigned', players.length - onSquad) + '</div>'
      : '');
}

function loadRoster () {
  fetch('/kshsaa-stats/roster').then(function (r) { return r.json(); }).then(function (d) {
    ROSTER = d.roster || [];
    SQUADS = d.squads || [];
    if (document.activeElement !== $('squadText')) $('squadText').value = SQUADS.join('\\n');
    renderRoster();
  });
}

function renderRoster () {
  if (!ROSTER.length) {
    $('rosterList').innerHTML = '<p class="note">No one on the roster yet.</p>';
    return;
  }
  var h = rosterSummary() + '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>' +
    ROSTER_COLS.map(function (c) {
      var on = ROSTER_SORT.key === c.key;
      return '<th class="sortable' + (on ? ' sorted' : '') + '" data-rsort="' + c.key + '"' +
        (c.width ? ' style="width:' + c.width + '"' : '') + ' title="' + esc(c.tip || 'Sort by ' + c.label) + '">' +
        c.label + '<span class="sortarrow">' + (on ? (ROSTER_SORT.dir < 0 ? '&#9660;' : '&#9650;') : '') + '</span></th>';
    }).join('') + '<th style="width:9rem"></th></tr></thead><tbody>';
  sortedRoster().forEach(function (r) {
    h += '<tr data-row="' + r.id + '"><td class="ncell">' + esc(r.name) +
      (r.email ? '<div class="small text-secondary">' + esc(r.email) + '</div>' : '') + '</td>' +
      '<td class="gcell">' + (r.grade ? r.grade + 'th' : '<span class="text-secondary">-</span>') + '</td>' +
      '<td class="scell">' + (r.coach
      ? '<span class="badge text-bg-light border">coach</span>'
      : r.squad
        ? esc(r.squad) + (r.permanent ? ' <span class="badge text-bg-light border">permanent</span>' : '')
        : '<span class="text-secondary">unassigned</span>') + '</td>' +
      '<td class="rcell">' + (r.rating == null ? '<span class="text-secondary">N/A</span>' : r.rating + '<span class="text-secondary">/10</span>') + '</td>' +
      '<td class="text-secondary">' + (r.hasPlayed ? 'has stats' : 'no games yet') + '</td>' +
      '<td class="text-end acell">' +
      '<button class="btn btn-sm btn-link p-0 me-2 redit" data-id="' + r.id + '">edit</button>' +
      '<button class="btn btn-sm btn-link text-danger p-0 rdel" data-id="' + r.id + '">remove</button>' +
      '</td></tr>';
  });
  $('rosterList').innerHTML = h + '</tbody></table></div>';

  Array.prototype.forEach.call(document.querySelectorAll('th[data-rsort]'), function (th) {
    th.onclick = function () {
      var key = th.getAttribute('data-rsort');
      var col = ROSTER_COLS.filter(function (c) { return c.key === key; })[0];
      ROSTER_SORT = ROSTER_SORT.key === key ? { key: key, dir: -ROSTER_SORT.dir } : { key: key, dir: col.dir };
      renderRoster();
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('.redit'), function (btn) {
    btn.onclick = function () { editRosterRow(btn.getAttribute('data-id')); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('.rdel'), function (btn) {
    btn.onclick = function () {
      if (!confirm('Remove from the roster? Their past stats are kept.')) return;
      postJson('/kshsaa-stats/roster/remove', { id: btn.getAttribute('data-id') }).then(loadRoster);
    };
  });
}

function editRosterRow (id) {
  var r = ROSTER.filter(function (x) { return x.id === id; })[0];
  var row = document.querySelector('[data-row="' + id + '"]');
  var ncell = row.querySelector('.ncell');
  var gcell = row.querySelector('.gcell');
  var rcell = row.querySelector('.rcell');
  var acell = row.querySelector('.acell');

  ncell.innerHTML = '<input class="form-control form-control-sm nedit" value="' + esc(r.name) + '">' +
    '<input class="form-control form-control-sm eedit mt-1" type="email" placeholder="email (optional)" value="' + esc(r.email || '') + '">';
  gcell.innerHTML = '<input class="form-control form-control-sm gedit" type="number" min="9" max="12" ' +
    'style="width:5rem" value="' + (r.grade || '') + '">';
  row.querySelector('.scell').innerHTML = '<select class="form-select form-select-sm sedit">' +
    '<option value="">unassigned</option>' +
    SQUADS.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === r.squad ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('') + '</select>' +
    '<label class="small mt-1 d-flex align-items-center gap-1"><input type="checkbox" class="pedit"' +
    (r.permanent ? ' checked' : '') + '> permanent on this squad</label>' +
    '<label class="small d-flex align-items-center gap-1"><input type="checkbox" class="cedit"' +
    (r.coach ? ' checked' : '') + '> coach, not a player</label>';
  // N/A is for anyone not yet seen play: the team builder goes on their stats alone
  var ratings = [''];
  for (var v = 10; v >= 1; v -= 0.5) ratings.push(v);
  if (r.rating != null && ratings.indexOf(r.rating) === -1) ratings.push(r.rating);
  rcell.innerHTML = '<select class="form-select form-select-sm redit-rating" style="width:6.5rem">' +
    ratings.map(function (v) {
      return '<option value="' + v + '"' + ((r.rating == null ? '' : r.rating) === v ? ' selected' : '') + '>' +
        (v === '' ? 'N/A' : v + '/10') + '</option>';
    }).join('') + '</select>';
  acell.innerHTML = '<button class="btn btn-sm btn-primary py-0 px-2 me-1 gsave">save</button>' +
    '<button class="btn btn-sm btn-link p-0 gcancel">cancel</button>';
  ncell.querySelector('.nedit').focus();

  acell.querySelector('.gsave').onclick = function () {
    var newName = ncell.querySelector('.nedit').value.trim();
    var saveDetails = function () {
      postJson('/kshsaa-stats/roster/update', {
        id: id,
        grade: gcell.querySelector('.gedit').value,
        squad: row.querySelector('.sedit').value,
        rating: rcell.querySelector('.redit-rating').value,
        permanent: row.querySelector('.pedit').checked,
        coach: row.querySelector('.cedit').checked,
        email: ncell.querySelector('.eedit').value
      }).then(function (res) {
        if (!res.ok) alert(res.d.error || 'could not save');
        loadRoster();
      });
    };
    if (newName && newName !== r.name) {
      if (r.hasPlayed && !confirm('Rename ' + r.name + ' to ' + newName +
        ' everywhere, including every game they have played?')) return;
      postJson('/kshsaa-stats/roster/rename', { id: id, name: newName }).then(function (res) {
        if (!res.ok) { alert(res.d.error || 'could not rename'); loadRoster(); return; }
        if (res.d.merged) {
          // the other roster entry is the one that stays
          loadRoster();
        } else {
          saveDetails();
        }
        load(); loadNames();
      });
    } else saveDetails();
  };
  acell.querySelector('.gcancel').onclick = renderRoster;
  [ncell.querySelector('.nedit'), ncell.querySelector('.eedit'), gcell.querySelector('.gedit'), rcell.querySelector('.redit-rating')].forEach(function (input) {
    input.onkeydown = function (e) {
      if (e.key === 'Enter') acell.querySelector('.gsave').click();
      if (e.key === 'Escape') renderRoster();
    };
  });
}

Array.prototype.forEach.call(document.querySelectorAll('#tabs [data-tab]'), function (btn) {
  btn.onclick = function () {
    var tab = btn.getAttribute('data-tab');
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .nav-link'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    $('tabStats').classList.toggle('d-none', tab !== 'stats');
    $('tabRoster').classList.toggle('d-none', tab !== 'roster');
  };
});

$('squadSave').onclick = function () {
  var list = $('squadText').value.split('\\n').map(function (x) { return x.trim(); }).filter(Boolean);
  postJson('/kshsaa-stats/squads', { list: list }).then(function (res) {
    if (!res.ok) { $('squadMsg').innerHTML = '<span class="text-danger">' + esc(res.d.error || 'could not save') + '</span>'; return; }
    $('squadMsg').innerHTML = '<span class="text-success">saved</span>';
    loadRoster();
  });
};

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.body.classList.remove('solo');
});

// the Insights page links back here with #roster
if (location.hash === '#roster') document.querySelector('#tabs [data-tab="roster"]').click();

$('rosterAdd').onclick = function () {
  var text = $('rosterText').value;
  if (!text.trim()) { $('rosterMsg').textContent = 'paste some names first'; return; }
  postJson('/kshsaa-stats/roster/add', { text: text }).then(function (res) {
    var d = res.d;
    if (d.error) { $('rosterMsg').innerHTML = '<span class="text-danger">' + esc(d.error) + '</span>'; return; }
    $('rosterMsg').innerHTML = '<span class="text-success">added ' + d.added +
      (d.updated ? ', updated ' + d.updated : '') + '</span>';
    $('rosterText').value = '';
    loadRoster(); loadNames();
  });
};

// ---------- stats ----------

function heatColor (pct) {
  if (pct == null) return '#f1f1f1';
  var g = Math.round(200 * (pct / 100));
  return 'rgba(' + (220 - g) + ',' + (120 + g / 2) + ',120,0.45)';
}
function pctOf (v) { var t = v.correct + v.wrong; return t ? Math.round((v.correct / t) * 100) : null; }
function heatCell (v) {
  return '<td class="text-center"><span class="heat" style="background:' + heatColor(pctOf(v)) + '">' +
    v.correct + (v.wrong ? ' / ' + v.wrong : '') + '</span></td>';
}
function playerByName (n) {
  for (var i = 0; i < DATA.players.length; i++) if (DATA.players[i].name === n) return DATA.players[i];
  return null;
}

function gamesTable (d) {
  if (!d.games.length) return '<p class="note">No games match these filters.</p>';
  var h = '<div class="card"><div class="card-body p-0"><div class="table-responsive">' +
    '<table class="table table-sm table-hover mb-0"><thead><tr><th>Date</th><th>Game</th><th>Level</th><th>Result</th>' +
    '<th class="num">Tossups</th><th></th></tr></thead><tbody>';
  d.games.slice().reverse().forEach(function (g) {
    var best = Math.max.apply(null, g.teams.map(function (t) { return t.score; }));
    var tied = g.teams.filter(function (t) { return t.score === best; }).length > 1;
    var score = g.teams.map(function (t) {
      var cls = tied && t.score === best ? 'res-tie' : (t.score === best ? 'res-win' : 'res-loss');
      return '<span class="res ' + cls + '">' + esc(t.name) + ': <span class="sc">' + t.score + '</span></span>';
    }).join('');
    h += '<tr class="rowlink grow" data-id="' + g.id + '" title="See scorers, rename, or fix this game">' +
      '<td class="text-secondary">' + new Date(g.playedAt).toLocaleDateString() + '</td>' +
      '<td>' + esc(g.label) + (g.kind === 'tournament' ? ' <span class="lvl">Tournament</span>' : '') +
      (g.notes ? ' <span class="small text-secondary" title="Notes on this game">&#9998; ' + g.notes + '</span>' : '') + '</td>' +
      '<td>' + levelBadge(g.level) + '</td><td>' + score + '</td>' +
      '<td class="num">' + g.tossupsRead + '</td>' +
      '<td class="text-end text-secondary small text-nowrap">open &rsaquo;</td></tr>';
  });
  return h + '</tbody></table></div></div></div>';
}

function render (d) {
  if (!d.totalGames) {
    $('content').innerHTML = '<div class="card mt-3"><div class="card-body text-center py-5">' +
      '<p class="mb-1 fw-semibold">No practices recorded yet</p>' +
      '<p class="text-secondary small mb-3">Read a round on this site and click &ldquo;Save to team stats&rdquo; ' +
      'when the game ends &mdash; the numbers show up here.</p>' +
      '<a class="btn btn-primary btn-sm" href="/kshsaa-play">Read a round</a></div></div>';
    return;
  }

  var h = '';

  // ---- players ----
  d.players = sortPlayers(d.players);
  var squadsPresent = [];
  d.players.forEach(function (p) {
    if (squadsPresent.indexOf(p.team) === -1) squadsPresent.push(p.team);
  });
  squadsPresent.sort();

  h += '<h2>Players</h2>';
  if (!d.players.length) {
    h += '<p class="note">No one has played in the games these filters cover.</p>';
  } else {
    h += '<div class="mb-2" id="squadChips">' +
      '<button class="btn btn-sm btn-outline-secondary me-1 mb-1 chip' + (SQUAD ? '' : ' active') +
      '" data-squad="">All squads</button>' +
      squadsPresent.map(function (s) {
        return '<button class="btn btn-sm btn-outline-secondary me-1 mb-1 chip' +
          (SQUAD === s ? ' active' : '') + '" data-squad="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') + '</div>' +
      '<div id="squadSummary"></div>' +
      '<input class="form-control form-control-sm mb-2" id="search" placeholder="Search players...">' +
      '<div class="card"><div class="card-body p-0"><div class="table-responsive">' +
      '<table class="table table-sm table-hover align-middle"><thead><tr>' +
      SORT_COLS.map(function (c) {
        var on = SORT.key === c.key;
        return '<th class="sortable' + (c.text ? '' : ' num') + (on ? ' sorted' : '') +
          '" data-sort="' + c.key + '" title="' + esc(c.tip || 'Sort by ' + c.label) + '">' + esc(c.label) +
          '<span class="sortarrow">' + (on ? (SORT.dir < 0 ? '&#9660;' : '&#9650;') : '') + '</span></th>';
      }).join('') +
      '</tr></thead><tbody>';
    d.players.forEach(function (p) {
      h += '<tr class="rowlink prow" data-name="' + esc(p.name) + '" data-squad="' + esc(p.team) + '">' +
        '<td>' + esc(p.name) + '</td>' +
        '<td class="text-secondary">' + esc(p.team) + '</td>' +
        '<td class="num">' + p.games + '</td>' +
        '<td class="num fw-semibold">' + fmt(p.ppth) + '</td>' +
        '<td class="num">' + fmt(p.accuracy, 'pct') + '</td>' +
        '<td class="num">' + fmt(p.celerity, 'cel') + '</td></tr>';
    });
    h += '</tbody></table></div></div></div>' +
      '<p class="note">Click a player for their correct answers, misses, and history by level and month.</p>' +
      '<div id="spotlight" class="mt-2"></div>';

    // category heat grid - same section, its own table so neither gets squished
    h += '<div class="subhead">Category breakdown</div>' +
      '<div class="card"><div class="card-body p-0"><div class="table-responsive">' +
      '<table class="table table-sm align-middle"><thead><tr><th>Player</th>';
    d.categoryNames.forEach(function (c) { h += '<th class="text-center">' + esc(c) + '</th>'; });
    h += '</tr></thead><tbody>';
    d.players.forEach(function (p) {
      h += '<tr class="prow rowlink" data-name="' + esc(p.name) + '" data-squad="' + esc(p.team) + '"><td>' + esc(p.name) + '</td>';
      d.categoryNames.forEach(function (c) { h += heatCell(p.byCategory[c] || { correct: 0, wrong: 0 }); });
      h += '</tr>';
    });
    h += '</tbody></table></div></div></div>' +
      '<p class="note">Each cell is correct / wrong answers; the colour is accuracy.</p>';
  }

  // ---- games ----
  h += '<h2>Games</h2>' + gamesTable(d) +
    '<p class="note">Click a game to see who scored, rename it, set its level, or fix a buzz.</p>';

  $('content').innerHTML = h;

  Array.prototype.forEach.call(document.querySelectorAll('.grow'), function (row) {
    row.onclick = function () { openGame(row.getAttribute('data-id')); };
  });
  if (!d.players.length) return;

  $('search').value = SEARCH;
  $('search').oninput = function () { SEARCH = $('search').value; applyFilters(); };
  // only this table's headers: the roster's are sortable too, with their own handler
  Array.prototype.forEach.call(document.querySelectorAll('#content th[data-sort]'), function (th) {
    th.onclick = function () {
      var key = th.getAttribute('data-sort');
      if (SORT.key === key) {
        SORT.dir = -SORT.dir;
      } else {
        SORT.key = key;
        // names read best A-Z, every number reads best biggest-first
        SORT.dir = sortColumn().text ? 1 : -1;
      }
      render(DATA);
    };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#squadChips .chip'), function (chip) {
    chip.onclick = function () {
      SQUAD = chip.getAttribute('data-squad');
      Array.prototype.forEach.call(document.querySelectorAll('#squadChips .chip'), function (c) {
        c.classList.toggle('active', c === chip);
      });
      applyFilters();
      renderSquadSummary();
    };
  });
  applyFilters();
  renderSquadSummary();
  Array.prototype.forEach.call(document.querySelectorAll('.prow'), function (row) {
    row.onclick = function () { selectPlayer(row.getAttribute('data-name')); };
  });
  if (SELECTED && playerByName(SELECTED)) selectPlayer(SELECTED);
}

function saveBlob (text, type, filename) {
  var blob = new Blob([text], { type: type });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadGame (id, format) {
  fetch('/kshsaa-stats/game/' + id).then(function (r) { return r.json(); }).then(function (g) {
    if (g.error) { alert(g.error); return; }
    var base = (g.label || 'game').replace(/[^A-Za-z0-9 _-]/g, '') + ' ' +
      new Date(g.playedAt).toISOString().slice(0, 10);
    if (format === 'json') {
      saveBlob(JSON.stringify(g, null, 2), 'application/json', base + '.json');
      return;
    }
    var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    var rows = [['question', 'category', 'player', 'team', 'points', 'buzz_word_index'].join(',')];
    (g.buzzes || []).forEach(function (b) {
      rows.push([b.questionNumber == null ? '' : b.questionNumber, q(b.category), q(b.player), q(b.team), b.value,
        b.wordIndex == null ? '' : b.wordIndex].join(','));
    });
    rows.push('');
    rows.push(['team', 'final_score'].join(','));
    (g.teams || []).forEach(function (t) { rows.push([q(t.name), t.score].join(',')); });
    saveBlob(rows.join('\\r\\n'), 'text/csv', base + '.csv');
  });
}

function applyFilters () {
  var q = SEARCH.toLowerCase();
  Array.prototype.forEach.call(document.querySelectorAll('.prow'), function (row) {
    var name = row.getAttribute('data-name').toLowerCase();
    var squad = row.getAttribute('data-squad') || '';
    var hide = (q && name.indexOf(q) === -1) || (SQUAD && squad !== SQUAD);
    row.style.display = hide ? 'none' : '';
  });
}

function stat (label, value) {
  return '<span class="kv"><span class="k">' + label + '</span><span class="v">' + value + '</span></span>';
}

function renderSquadSummary () {
  var box = $('squadSummary');
  if (!box) return;
  if (!SQUAD) { box.innerHTML = ''; return; }

  var members = DATA.players.filter(function (p) { return p.team === SQUAD; });
  if (!members.length) { box.innerHTML = ''; return; }

  var totals = { correct: 0, wrong: 0, points: 0, celSum: 0, celCount: 0, heard: 0, byCategory: {} };
  var gameIds = {};
  members.forEach(function (p) {
    totals.correct += p.correct;
    totals.wrong += p.wrong;
    totals.points += p.points;
    totals.celSum += p.celeritySum || 0;
    totals.celCount += p.celerityCount || 0;
    totals.heard += p.heard || 0;
    p.perGame.forEach(function (g) { gameIds[g.id] = true; });
    DATA.categoryNames.forEach(function (c) {
      var v = p.byCategory[c] || { correct: 0, wrong: 0 };
      var t = totals.byCategory[c] || (totals.byCategory[c] = { correct: 0, wrong: 0 });
      t.correct += v.correct; t.wrong += v.wrong;
    });
  });

  var buzzes = totals.correct + totals.wrong;
  var h = '<div class="card mb-3"><div class="card-body">' +
    '<h3>' + esc(SQUAD) + ' &mdash; combined</h3><div>' +
    stat('Players', members.length) +
    stat('Games', Object.keys(gameIds).length) +
    stat('Points/question', totals.heard ? (totals.points / totals.heard).toFixed(2) : '-') +
    stat('Buzz accuracy', buzzes ? Math.round((totals.correct / buzzes) * 100) + '%' : '-') +
    stat('Celerity', totals.celCount ? (totals.celSum / totals.celCount).toFixed(3) : '-') +
    '</div><div class="table-responsive mt-2"><table class="table table-sm mb-0"><thead><tr>';
  DATA.categoryNames.forEach(function (c) { h += '<th class="text-center">' + esc(c) + '</th>'; });
  h += '</tr></thead><tbody><tr>';
  DATA.categoryNames.forEach(function (c) { h += heatCell(totals.byCategory[c] || { correct: 0, wrong: 0 }); });
  h += '</tr></tbody></table></div>' +
    '<p class="note">Squad totals across every game in these filters that any member played.</p></div></div>';
  box.innerHTML = h;
}

function breakdownTable (title, rows, note) {
  if (!rows.length) return '';
  var h = '<h3 class="mt-3">' + title + '</h3><div class="table-responsive"><table class="table table-sm mb-0"><thead><tr>' +
    '<th></th><th class="num">Games</th><th class="num">Points/question</th><th class="num">Accuracy</th>' +
    '<th class="num">Celerity</th></tr></thead><tbody>';
  rows.forEach(function (r) {
    h += '<tr><td>' + esc(r.label) + '</td><td class="num">' + r.games + '</td>' +
      '<td class="num">' + fmt(r.ppth) + '</td><td class="num">' + fmt(r.accuracy, 'pct') + '</td>' +
      '<td class="num">' + fmt(r.celerity, 'cel') + '</td></tr>';
  });
  return h + '</tbody></table></div><p class="note">' + note + '</p>';
}

// notes about a player from games in the filters, newest first
function notesList (notes) {
  if (!notes || !notes.length) return '';
  return '<h3 class="mt-3">Notes</h3><ul class="list-unstyled mb-0 small">' + notes.map(function (n) {
    return '<li class="mb-1"><span class="text-secondary">' + new Date(n.playedAt).toLocaleDateString() + ' &middot; ' +
      esc(n.game) + (n.questionNumber ? ' &middot; Q' + n.questionNumber + (n.category ? ' ' + esc(n.category) : '') : '') +
      '</span><br>' + esc(n.text) + '</li>';
  }).join('') + '</ul>';
}

function selectPlayer (name) {
  SELECTED = name;
  var p = playerByName(name);
  if (!p) return;
  Array.prototype.forEach.call(document.querySelectorAll('.prow'), function (row) {
    row.classList.toggle('selected', row.getAttribute('data-name') === name);
  });
  var monthNote = $('fMonth').options[$('fMonth').selectedIndex].text;
  var levelNote = $('fLevel').options[$('fLevel').selectedIndex].text;
  $('spotlight').innerHTML =
    '<div class="card mb-2"><div class="card-body">' +
    '<div class="d-flex justify-content-between align-items-baseline mb-2">' +
    '<h3 class="h6 mb-0">' + esc(p.name) + '</h3><span class="d-flex align-items-center gap-2">' +
    '<span class="small text-secondary">' + esc(p.team) + '</span>' +
    '<button type="button" class="btn btn-sm btn-outline-secondary not-solo" id="soloShow">Show to player</button>' +
    '<button type="button" class="btn btn-sm btn-primary solo-only" id="soloDone">Done</button></span></div>' +
    '<div>' +
    stat('Games', p.games) +
    stat('Questions heard', p.heard || '-') +
    stat('Points', p.points) +
    stat('Correct', p.correct) +
    stat('Wrong', p.wrong + (p.negs ? ' <span class="small text-danger">(' + p.negs + ' for \\u22125)</span>' : '')) +
    stat('Points/question', fmt(p.ppth)) +
    stat('Buzz accuracy', fmt(p.accuracy, 'pct')) +
    stat('Celerity', fmt(p.celerity, 'cel')) +
    '</div>' +
    '<div class="row g-3"><div class="col-md-6">' +
    breakdownTable('By level', p.byLevel, 'Games from: ' + esc(monthNote) + '.') +
    '</div><div class="col-md-6">' +
    breakdownTable('By month', p.byMonth, 'Level: ' + esc(levelNote) + '.') +
    '</div></div>' +
    '<div class="row g-3 mt-1"><div class="col-md-7"><canvas id="chartCat" height="150"></canvas></div>' +
    '<div class="col-md-5"><canvas id="chartGames" height="150"></canvas></div></div>' +
    notesList(p.notes) + '</div></div>';

  $('soloShow').onclick = function () { document.body.classList.add('solo'); };
  $('soloDone').onclick = function () { document.body.classList.remove('solo'); };

  Object.keys(CHARTS).forEach(function (k) { if (CHARTS[k]) CHARTS[k].destroy(); });
  if (typeof Chart === 'undefined') return;

  CHARTS.cat = new Chart($('chartCat'), {
    type: 'bar',
    data: {
      labels: DATA.categoryNames,
      datasets: [
        { label: 'Correct', data: DATA.categoryNames.map(function (c) { return (p.byCategory[c] || {}).correct || 0; }), backgroundColor: 'rgba(45,140,90,0.65)' },
        { label: 'Wrong', data: DATA.categoryNames.map(function (c) { return (p.byCategory[c] || {}).wrong || 0; }), backgroundColor: 'rgba(200,70,70,0.65)' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: 'Buzzes by category' }, legend: { position: 'bottom' } },
      scales: { x: { ticks: { font: { size: 9 } } }, y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  CHARTS.games = new Chart($('chartGames'), {
    type: 'line',
    data: {
      labels: p.perGame.map(function (g, i) { return 'G' + (i + 1); }),
      datasets: [{ label: 'Points', data: p.perGame.map(function (g) { return g.points; }),
        borderColor: '#1f3864', backgroundColor: 'rgba(31,56,100,0.15)', fill: true, tension: 0.25 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Points per game' }, legend: { display: false },
        tooltip: { callbacks: { title: function (items) { return p.perGame[items[0].dataIndex].label; } } }
      },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ---------- game editor ----------
// Players are referred to by a key rather than their name while editing, so
// fixing a name (Max Tinberg -> Henry Block) carries their buzzes with it.

var EDIT = null;
var NEXT_KEY = 1;
var modal = null;

function newKey () { return NEXT_KEY++; }

function toEditModel (g) {
  var teams = (g.teams || []).map(function (t) {
    return {
      key: newKey(),
      name: t.name,
      players: (t.players || []).map(function (name) {
        var heard = g.heardByPlayer ? g.heardByPlayer[t.name + '|' + name] : null;
        return { key: newKey(), name: name, heard: typeof heard === 'number' ? heard : null };
      })
    };
  });
  var findPlayer = function (teamName, name) {
    var team = teams.filter(function (t) { return t.name === teamName; })[0];
    if (!team) { team = { key: newKey(), name: teamName || 'Team', players: [] }; teams.push(team); }
    var p = team.players.filter(function (x) { return x.name === name; })[0];
    if (!p) { p = { key: newKey(), name: name, heard: null }; team.players.push(p); }
    return p;
  };
  var buzzes = (g.buzzes || []).map(function (b) {
    return {
      key: newKey(),
      q: b.questionNumber == null ? null : b.questionNumber,
      category: b.category,
      playerKey: findPlayer(b.team, b.player).key,
      value: b.value > 0 ? 10 : (b.value < 0 ? -5 : 0),
      wordIndex: b.wordIndex == null ? null : b.wordIndex
    };
  });
  var keyOfName = function (name) {
    var hit = null;
    teams.forEach(function (t) { t.players.forEach(function (p) { if (p.name === name) hit = p.key; }); });
    return hit;
  };
  var notes = (g.notes || []).map(function (n) {
    return { key: newKey(), q: n.questionNumber == null ? null : n.questionNumber, playerKey: n.player ? keyOfName(n.player) : null, text: n.text };
  });
  return {
    id: String(g._id),
    label: g.label,
    level: g.level || '',
    playedAt: g.playedAt,
    tossupsRead: g.tossupsRead,
    categories: g.categories || [],
    teams: teams,
    buzzes: buzzes,
    notes: notes
  };
}

function allPlayers () {
  var out = [];
  EDIT.teams.forEach(function (t) { t.players.forEach(function (p) { out.push({ team: t, player: p }); }); });
  return out;
}
function playerEntry (key) {
  return allPlayers().filter(function (e) { return e.player.key === key; })[0] || null;
}

function openGame (id) {
  fetch('/kshsaa-stats/game/' + id).then(function (r) { return r.json(); }).then(function (g) {
    if (g.error) { alert(g.error); return; }
    // typed in from a scoresheet, so it is fixed the same way
    if (g.kind === 'tournament') { location.href = '/kshsaa-tournaments#game=' + id; return; }
    EDIT = toEditModel(g);
    $('gmErr').textContent = '';
    renderEditor();
    // a stray Escape or click outside must not throw away unsaved edits
    modal = modal || new bootstrap.Modal($('gameModal'), { backdrop: 'static', keyboard: false });
    modal.show();
  });
}

function categoryOptions (selected) {
  return DATA.categoryNames.concat('Other').map(function (c) {
    return '<option' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
}

function playerOptions (selectedKey) {
  return EDIT.teams.map(function (t) {
    return '<optgroup label="' + esc(t.name || 'Team') + '">' + t.players.map(function (p) {
      return '<option value="' + p.key + '"' + (p.key === selectedKey ? ' selected' : '') + '>' +
        esc(p.name || '(no name)') + '</option>';
    }).join('') + '</optgroup>';
  }).join('');
}

function renderEditor () {
  var h = '<div class="row g-2">' +
    '<div class="col-md-6"><label class="form-label" for="gmLabel">Game name</label>' +
    '<input class="form-control form-control-sm" id="gmLabel" value="' + esc(EDIT.label) + '"></div>' +
    '<div class="col-md-3"><label class="form-label" for="gmLevel">Level</label>' +
    '<select class="form-select form-select-sm" id="gmLevel"><option value="">Untagged</option>' +
    DATA.levels.map(function (l) {
      return '<option value="' + l.key + '"' + (l.key === EDIT.level ? ' selected' : '') + '>' + esc(l.label) + '</option>';
    }).join('') + '</select></div>' +
    '<div class="col-md-3"><div class="form-label">Played</div><div class="small pt-1">' +
    new Date(EDIT.playedAt).toLocaleString() + ' &middot; ' + EDIT.tossupsRead + ' tossups</div></div></div>';

  h += '<div class="subhead">Scorers</div><div id="gmScorers"></div>';

  h += '<div class="subhead">Teams</div><div class="row g-2">';
  EDIT.teams.forEach(function (t, ti) {
    h += '<div class="col-md-6"><div class="card"><div class="card-body p-2">' +
      '<div class="input-group input-group-sm mb-2"><span class="input-group-text">Team</span>' +
      '<input class="form-control fw-semibold tname" data-t="' + ti + '" value="' + esc(t.name) + '">' +
      '<button type="button" class="btn btn-outline-danger tdel" data-t="' + ti + '" title="Remove this team">&times;</button></div>';
    t.players.forEach(function (p, pi) {
      h += '<div class="input-group input-group-sm mb-1">' +
        '<input class="form-control pname" data-t="' + ti + '" data-p="' + pi + '" value="' + esc(p.name) + '">' +
        '<button type="button" class="btn btn-outline-secondary pdel" data-t="' + ti + '" data-p="' + pi +
        '" title="Take this player out of the game">&times;</button></div>';
    });
    h += '<input class="form-control form-control-sm padd mt-1" data-t="' + ti +
      '" placeholder="+ add a player (type, then Enter)"></div></div></div>';
  });
  h += '</div>';
  if (EDIT.teams.length < 4) {
    h += '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" id="gmAddTeam">+ Add a team</button>';
  }

  h += '<div class="subhead">Buzzes</div>' +
    '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>' +
    '<th style="width:5.5rem">Q#</th><th>Category</th><th>Player</th><th>Result</th><th></th></tr></thead><tbody id="gmBuzzes">';
  EDIT.buzzes.forEach(function (b, bi) {
    h += '<tr>' +
      '<td><input type="number" min="1" max="99" class="form-control form-control-sm bq" data-b="' + bi +
      '" value="' + (b.q == null ? '' : b.q) + '" placeholder="?"></td>' +
      '<td><select class="form-select form-select-sm bcat" data-b="' + bi + '">' + categoryOptions(b.category) + '</select></td>' +
      '<td><select class="form-select form-select-sm bplayer" data-b="' + bi + '">' + playerOptions(b.playerKey) + '</select></td>' +
      '<td><select class="form-select form-select-sm bval" data-b="' + bi + '">' + RESULTS.map(function (r) {
        return '<option value="' + r.value + '"' + (r.value === b.value ? ' selected' : '') + '>' + r.label + '</option>';
      }).join('') + '</select></td>' +
      '<td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0 bdel" data-b="' + bi + '">remove</button></td></tr>';
  });
  h += '</tbody></table></div>' +
    '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" id="gmAddBuzz">+ Add a buzz</button>' +
    '<p class="note">Interrupting only matters on a wrong answer: &minus;5 if the player interrupted, 0 if not. ' +
    'A correct answer is +10 either way. Leave Q# blank if you do not know which question it was.</p>';

  h += '<div class="subhead">Notes</div>';
  if (EDIT.notes.length) {
    h += '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr>' +
      '<th style="width:5.5rem">Q#</th><th style="width:14rem">About</th><th>Note</th><th></th></tr></thead><tbody>';
    EDIT.notes.forEach(function (n, ni) {
      h += '<tr><td><input type="number" min="1" max="99" class="form-control form-control-sm nq" data-n="' + ni +
        '" value="' + (n.q == null ? '' : n.q) + '" placeholder="-"></td>' +
        '<td><select class="form-select form-select-sm nplayer" data-n="' + ni + '">' + noteWhoOptions(n.playerKey) + '</select></td>' +
        '<td><input class="form-control form-control-sm ntext" data-n="' + ni + '" maxlength="500" value="' + esc(n.text) + '"></td>' +
        '<td class="text-end"><button type="button" class="btn btn-sm btn-link text-danger p-0 ndel" data-n="' + ni + '">remove</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '<button type="button" class="btn btn-sm btn-outline-secondary mt-2" id="gmAddNote">+ Add a note</button>' +
    '<p class="note">Notes about a player show on their card, including when you show it to them.</p>';

  $('gmBody').innerHTML = h;
  $('gmTitle').textContent = EDIT.label || 'Game';

  Array.prototype.forEach.call($('gmBody').querySelectorAll('.pname'), function (input) {
    attachNameAutocomplete(input, {
      names: function () { return KNOWN_NAMES; },
      taken: otherNames,
      onPick: function (self) { setPlayerName(self); }
    });
  });
  Array.prototype.forEach.call($('gmBody').querySelectorAll('.padd'), function (input) {
    attachNameAutocomplete(input, {
      names: function () { return KNOWN_NAMES; },
      taken: otherNames,
      onPick: function (self) { addPlayer(self); }
    });
  });
  refreshDerived();
}

function noteWhoOptions (selectedKey) {
  return '<option value=""' + (selectedKey == null ? ' selected' : '') + '>no one in particular</option>' + playerOptions(selectedKey);
}

function otherNames (self) {
  return Array.prototype.filter.call($('gmBody').querySelectorAll('.pname'), function (i) { return i !== self; })
    .map(function (i) { return i.value; });
}

function setPlayerName (input) {
  var p = EDIT.teams[Number(input.getAttribute('data-t'))].players[Number(input.getAttribute('data-p'))];
  p.name = input.value.trim();
  refreshDerived();
}

function addPlayer (input) {
  var name = input.value.trim();
  if (!name) return;
  var clash = allPlayers().filter(function (e) { return e.player.name.toLowerCase() === name.toLowerCase(); })[0];
  if (clash) { $('gmErr').textContent = clash.player.name + ' is already on ' + clash.team.name + '.'; return; }
  var ti = Number(input.getAttribute('data-t'));
  EDIT.teams[ti].players.push({ key: newKey(), name: name, heard: null });
  $('gmErr').textContent = '';
  renderEditor();
  $('gmBody').querySelector('.padd[data-t="' + ti + '"]').focus();
}

// the parts of the editor that depend on names and buzzes, redrawn without
// touching whatever input the moderator is typing in
function refreshDerived () {
  Array.prototype.forEach.call($('gmBody').querySelectorAll('.bplayer'), function (sel) {
    sel.innerHTML = playerOptions(EDIT.buzzes[Number(sel.getAttribute('data-b'))].playerKey);
  });
  Array.prototype.forEach.call($('gmBody').querySelectorAll('.nplayer'), function (sel) {
    sel.innerHTML = noteWhoOptions(EDIT.notes[Number(sel.getAttribute('data-n'))].playerKey);
  });
  var h = '<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Team</th><th>Player</th>' +
    '<th class="num">Correct</th><th class="num">Wrong</th><th class="num">Points</th></tr></thead><tbody>';
  EDIT.teams.forEach(function (t) {
    var teamPoints = 0;
    var rows = t.players.map(function (p) {
      var mine = EDIT.buzzes.filter(function (b) { return b.playerKey === p.key; });
      var points = mine.reduce(function (s, b) { return s + b.value; }, 0);
      teamPoints += points;
      return '<tr><td></td><td>' + esc(p.name) + '</td>' +
        '<td class="num">' + mine.filter(function (b) { return b.value > 0; }).length + '</td>' +
        '<td class="num">' + mine.filter(function (b) { return b.value <= 0; }).length + '</td>' +
        '<td class="num">' + points + '</td></tr>';
    });
    h += '<tr class="table-light"><td class="fw-semibold">' + esc(t.name) + '</td><td></td><td></td><td></td>' +
      '<td class="num fw-semibold">' + teamPoints + '</td></tr>' + rows.join('');
  });
  $('gmScorers').innerHTML = h + '</tbody></table></div>';
}

$('gmBody').addEventListener('input', function (e) {
  var el = e.target;
  if (el.id === 'gmLabel') { EDIT.label = el.value; return; }
  if (el.classList.contains('tname')) { EDIT.teams[Number(el.getAttribute('data-t'))].name = el.value.trim(); refreshDerived(); return; }
  if (el.classList.contains('pname')) { setPlayerName(el); return; }
  if (el.classList.contains('ntext')) { EDIT.notes[Number(el.getAttribute('data-n'))].text = el.value; }
});

$('gmBody').addEventListener('change', function (e) {
  var el = e.target;
  var b = el.hasAttribute('data-b') ? EDIT.buzzes[Number(el.getAttribute('data-b'))] : null;
  if (el.id === 'gmLevel') { EDIT.level = el.value; return; }
  if (el.hasAttribute('data-n')) {
    var n = EDIT.notes[Number(el.getAttribute('data-n'))];
    if (el.classList.contains('nq')) n.q = el.value === '' ? null : Number(el.value);
    if (el.classList.contains('nplayer')) n.playerKey = el.value === '' ? null : Number(el.value);
    return;
  }
  if (!b) return;
  if (el.classList.contains('bq')) {
    b.q = el.value === '' ? null : Number(el.value);
    // the recorded buzz position belonged to the old question
    b.wordIndex = null;
    var cat = b.q && EDIT.categories[b.q - 1];
    if (cat) { b.category = cat; el.closest('tr').querySelector('.bcat').value = cat; }
  } else if (el.classList.contains('bcat')) {
    b.category = el.value;
  } else if (el.classList.contains('bplayer')) {
    b.playerKey = Number(el.value);
  } else if (el.classList.contains('bval')) {
    b.value = Number(el.value);
  }
  refreshDerived();
});

$('gmBody').addEventListener('click', function (e) {
  var el = e.target.closest('button');
  if (!el) return;
  if (el.id === 'gmAddTeam') {
    EDIT.teams.push({ key: newKey(), name: 'Team ' + (EDIT.teams.length + 1), players: [] });
    renderEditor();
  } else if (el.id === 'gmAddBuzz') {
    var first = allPlayers()[0];
    if (!first) { $('gmErr').textContent = 'Add a player first.'; return; }
    EDIT.buzzes.push({ key: newKey(), q: null, category: DATA.categoryNames[0], playerKey: first.player.key, value: 10, wordIndex: null });
    renderEditor();
    var rows = $('gmBuzzes').querySelectorAll('tr');
    rows[rows.length - 1].querySelector('.bq').focus();
  } else if (el.classList.contains('bdel')) {
    EDIT.buzzes.splice(Number(el.getAttribute('data-b')), 1);
    renderEditor();
  } else if (el.id === 'gmAddNote') {
    EDIT.notes.push({ key: newKey(), q: null, playerKey: null, text: '' });
    renderEditor();
    var noteRows = $('gmBody').querySelectorAll('.ntext');
    noteRows[noteRows.length - 1].focus();
  } else if (el.classList.contains('ndel')) {
    EDIT.notes.splice(Number(el.getAttribute('data-n')), 1);
    renderEditor();
  } else if (el.classList.contains('pdel')) {
    var team = EDIT.teams[Number(el.getAttribute('data-t'))];
    var p = team.players[Number(el.getAttribute('data-p'))];
    var theirs = EDIT.buzzes.filter(function (b) { return b.playerKey === p.key; }).length;
    if (theirs && !confirm('Take ' + p.name + ' out of this game along with their ' + theirs + ' buzz(es)?')) return;
    EDIT.buzzes = EDIT.buzzes.filter(function (b) { return b.playerKey !== p.key; });
    EDIT.notes.forEach(function (n) { if (n.playerKey === p.key) n.playerKey = null; });
    team.players = team.players.filter(function (x) { return x !== p; });
    renderEditor();
  } else if (el.classList.contains('tdel')) {
    var t = EDIT.teams[Number(el.getAttribute('data-t'))];
    var keys = t.players.map(function (x) { return x.key; });
    var lost = EDIT.buzzes.filter(function (b) { return keys.indexOf(b.playerKey) !== -1; }).length;
    if ((t.players.length || lost) && !confirm('Remove ' + t.name + ', its ' + t.players.length +
      ' player(s) and ' + lost + ' buzz(es) from this game?')) return;
    EDIT.buzzes = EDIT.buzzes.filter(function (b) { return keys.indexOf(b.playerKey) === -1; });
    EDIT.notes.forEach(function (n) { if (keys.indexOf(n.playerKey) !== -1) n.playerKey = null; });
    EDIT.teams = EDIT.teams.filter(function (x) { return x !== t; });
    renderEditor();
  }
});

$('gmSave').onclick = function () {
  var body = {
    label: EDIT.label,
    level: EDIT.level || null,
    teams: EDIT.teams.map(function (t) {
      return { name: t.name, players: t.players.map(function (p) { return { name: p.name, heard: p.heard }; }) };
    }),
    buzzes: EDIT.buzzes.map(function (b) {
      return {
        questionNumber: b.q,
        category: b.category,
        player: playerEntry(b.playerKey).player.name,
        value: b.value,
        wordIndex: b.wordIndex
      };
    }),
    notes: EDIT.notes.map(function (n) {
      var who = n.playerKey == null ? null : playerEntry(n.playerKey);
      return { questionNumber: n.q, player: who ? who.player.name : null, text: n.text };
    })
  };
  $('gmSave').disabled = true;
  postJson('/kshsaa-stats/game/' + EDIT.id + '/update', body).then(function (res) {
    $('gmSave').disabled = false;
    if (!res.ok) { $('gmErr').textContent = res.d.error || 'could not save'; return; }
    modal.hide();
    load(); loadNames();
  });
};

$('gmDelete').onclick = function () {
  if (!confirm('Delete "' + EDIT.label + '" and all of its stats? This cannot be undone.')) return;
  postJson('/kshsaa-stats/delete', { id: EDIT.id }).then(function () { modal.hide(); load(); });
};
$('gmJson').onclick = function () { downloadGame(EDIT.id, 'json'); };
$('gmCsv').onclick = function () { downloadGame(EDIT.id, 'csv'); };
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
