// The Anki leaderboard (/kshsaa-anki): how many cards each player studies in
// Anki, week by week, month by month, and over a season, with whatever prizes
// the team puts up. The coach sets each season's dates; whoever in the race
// has the most cards in the season holds the Season Belt, and whoever holds
// it on the season's last day wins it. Counts come from an Anki add-on
// (server/kshsaa/anki-addon/, downloaded from /kshsaa-anki/addon) that sends
// each day's numbers with the player's code; the numbers themselves are
// worked out in server/kshsaa/anki-board.js.
//
// A player signs in to the board with the same code their add-on uses, so
// the board is not public; a stats or reader sign-in sees it too. The stats
// password adds players, makes their codes, sets the prizes and the seasons,
// and says who sits out the belt race. Codes are stored only as hashes, so a
// lost code is replaced, never looked up.
//
// Collections: kshsaa_anki_players { name, nameKey, codeHash, createdAt,
// lastSyncAt, anki, addon, sitsOut }, kshsaa_anki_days { _id: player id + '|'
// + day, player, day, reviews, cards, newCards, seconds, updatedAt }, and
// kshsaa_settings { _id: 'anki', prizes, seasons: [{ from, to }] }.

import { Router } from 'express';
import { readFileSync, readdirSync } from 'fs';
import { ObjectId } from 'mongodb';
import { qbreader } from '../database/databases.js';
import { requireAuth, roleOf } from './kshsaa-stats.js';
import {
  addDays, buildBoard, cleanSync, codeHash, newCode, normalizeCode, periodRange, saveSeason, seasonAt, seasonBelt, standingOf, syncChanges,
  syncServers, todayKey
} from '../server/kshsaa/anki-board.js';
import { KSHSAA_HEAD, kshsaaNav } from '../server/kshsaa/nav.js';
import { zipFiles } from '../server/kshsaa/zip.js';

const router = Router();
const players = qbreader.collection('kshsaa_anki_players');
const days = qbreader.collection('kshsaa_anki_days');
const settings = qbreader.collection('kshsaa_settings');
const roster = qbreader.collection('kshsaa_roster');

const ADDON_DIR = new URL('../server/kshsaa/anki-addon/', import.meta.url);
// Anki compares this to decide whether a downloaded copy is newer
const ADDON_MOD = 1795824000; // version 1.2
// the add-on version this site hands out, from client.py; older ones send only
// their last 60 days, so a season longer than that misses what came before
const ADDON_VERSION = readFileSync(new URL('client.py', ADDON_DIR), 'utf8').match(/^VERSION = "(.+)"/m)?.[1] || null;
// streaks look back at least this far, past the start of a season
const STREAK_DAYS = 120;
// The add-on on AnkiWeb (ankiweb.net/shared/info/1953309465), uploaded from
// /kshsaa-anki/addon. Players paste this number into Get Add-ons, so a new
// version reaches them as an Anki update.
const ANKIWEB_ID = '1953309465';
// The copy of this site that never sleeps (Northflank), on the same database.
// Render's free plan sleeps after 15 minutes without visitors and takes about
// a minute to wake, so the add-on sends here first and to Render second.
const ALWAYS_AWAKE = 'https://site--scholars-bowl-backup--8x4rbwbgp5sd.code.run';

const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// Wrong codes are capped per address, and sends per player, the way the stats
// sign-in caps passwords.
function limiter (windowMs, max) {
  const hits = new Map();
  const entry = key => {
    const e = hits.get(key);
    return e && Date.now() - e.start < windowMs ? e : null;
  };
  return {
    blocked: key => (entry(key)?.count ?? 0) >= max,
    count: key => {
      const e = entry(key);
      if (e) { e.count++; return; }
      if (hits.size > 5000) hits.clear();
      hits.set(key, { start: Date.now(), count: 1 });
    }
  };
}
const wrongCodes = limiter(15 * 60 * 1000, 20);
const sends = limiter(60 * 60 * 1000, 120);

/** The player a code belongs to, or null. */
const playerByCode = code => (normalizeCode(code) ? players.findOne({ codeHash: codeHash(code) }) : null);

/**
 * Who is looking: a player signed in with their code (null once the code is
 * replaced), and any stats or reader sign-in.
 */
async function viewerOf (req) {
  const signedIn = req.session?.kshsaaAnki;
  let player = null;
  if (signedIn?.id && ObjectId.isValid(signedIn.id)) {
    const p = await players.findOne({ _id: new ObjectId(signedIn.id) });
    if (p && p.codeHash.slice(0, 16) === signedIn.key) player = p;
  }
  return { role: roleOf(req), player };
}

/**
 * Every player, and the stored days some boards need: each one's period, and
 * enough before today for the streaks.
 * @param {{from: string}[]} ranges - from periodRange
 * @param {string} today
 */
async function loadFor (ranges, today) {
  const oldest = [addDays(today, -STREAK_DAYS), ...ranges.map(r => r.from)].sort()[0];
  const [list, stored] = await Promise.all([
    players.find({}, { projection: { codeHash: 0 } }).toArray(),
    days.find({ day: { $gte: oldest } }, { projection: { player: 1, day: 1, reviews: 1, seconds: 1, newCards: 1 } }).toArray()
  ]);
  return { list, stored };
}

/** The coach's seasons, oldest first. */
async function seasonsSaved () {
  return (await settings.findOne({ _id: 'anki' }))?.seasons || [];
}

/**
 * The belt as the page shows it: holders by name, who in the race is closest
 * behind, and how far behind the viewer is.
 * @param {ReturnType<typeof seasonBelt>} belt
 * @param {NonNullable<ReturnType<typeof seasonAt>>} season
 * @param {{_id: *, name: string, sitsOut?: boolean}[]} list - every player
 * @param {?string} me - the signed-in player's id
 * @param {string} today
 */
function beltView (belt, season, list, me, today) {
  const nameOf = new Map(list.map(p => [String(p._id), p.name]));
  const racing = new Set(list.filter(p => !p.sitsOut).map(p => String(p._id)));
  const holding = new Set(belt.holders);
  const holders = belt.holders.map(id => ({ name: nameOf.get(id), me: id === me })).sort((a, b) => a.name.localeCompare(b.name));
  const next = Object.entries(belt.totals)
    .filter(([id, n]) => !holding.has(id) && n > 0)
    .sort((a, b) => b[1] - a[1] || nameOf.get(a[0]).localeCompare(nameOf.get(b[0])))[0];
  return {
    years: season.years,
    from: season.from,
    to: season.to,
    upcoming: season.upcoming,
    over: belt.over,
    // once a season is over, when the next one starts, if it is set
    nextFrom: belt.over && season.next && season.next.from > today ? season.next.from : null,
    holders,
    reviews: belt.reviews,
    since: holders.length === 1 ? belt.since[belt.holders[0]] : null,
    next: next ? { name: nameOf.get(next[0]), behind: belt.reviews - next[1] } : null,
    you: me && holders.length && !holding.has(me) && racing.has(me) ? { behind: belt.reviews - (belt.totals[me] || 0) } : null
  };
}

// ---------- the add-on ----------

router.post('/sync', async (req, res) => {
  if (wrongCodes.blocked(req.ip)) return res.status(429).json({ error: 'too many wrong codes from here: wait fifteen minutes' });
  const code = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const player = await playerByCode(code);
  if (!player) {
    wrongCodes.count(req.ip);
    return res.status(401).json({ error: 'that code is not on the leaderboard: check it with your captain' });
  }
  const id = String(player._id);
  if (sends.blocked(id)) return res.status(429).json({ error: 'too many sends this hour' });
  sends.count(id);
  let sent;
  try {
    sent = cleanSync(req.body, todayKey());
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
  try {
    // the add-on sends every day it looked at that had reviews, so any other
    // stored day in that window has none now; unchanged days stay as they are
    const stored = await days.find({ player: id, day: { $gte: sent.from } }, { projection: { day: 1, reviews: 1, cards: 1, newCards: 1, seconds: 1 } }).toArray();
    const { write, remove } = syncChanges(stored, sent);
    if (remove.length) await days.deleteMany({ player: id, day: { $in: remove } });
    if (write.length) {
      await days.bulkWrite(write.map(d => ({
        updateOne: { filter: { _id: id + '|' + d.day }, update: { $set: { player: id, ...d, updatedAt: new Date() } }, upsert: true }
      })));
    }
    await players.updateOne({ _id: player._id }, { $set: { lastSyncAt: new Date(), anki: text(req.body?.anki, 20), addon: text(req.body?.addon, 20) } });
    const today = todayKey();
    const season = seasonAt(await seasonsSaved(), 0, today);
    const [week, month] = ['week', 'month'].map(period => periodRange(period, 0, today));
    const { list, stored: all } = await loadFor([week, month, season].filter(Boolean), today);
    const standing = range => standingOf(buildBoard(list, all, range, today), id);
    let inSeason = null;
    if (season) {
      const belt = seasonBelt(list, all, season, today);
      const out = Boolean(player.sitsOut);
      inSeason = {
        ...standing(season),
        belt: belt.holders.includes(id),
        behind: out ? null : belt.reviews - (belt.totals[id] || 0),
        upcoming: season.upcoming,
        over: belt.over,
        out
      };
    }
    res.json({ ok: true, name: player.name, days: sent.days.length, week: standing(week), month: standing(month), season: inSeason });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// The add-on itself, with this site's address written into its settings.
router.get('/addon', (req, res) => {
  const files = readdirSync(ADDON_DIR)
    .filter(name => name.endsWith('.py') && !name.startsWith('test_'))
    .map(name => ({ name, data: readFileSync(new URL(name, ADDON_DIR)) }));
  // where it sends: the site that never sleeps, then this one
  const servers = syncServers(ALWAYS_AWAKE, req.protocol + '://' + req.get('host'));
  files.push({ name: 'config.json', data: Buffer.from(JSON.stringify({ servers, code: '' }, null, 2) + '\n') });
  files.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify({ package: 'scholars_bowl_leaderboard', name: 'Scholars Bowl leaderboard', mod: ADDON_MOD })) });
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', 'attachment; filename="scholars-bowl-leaderboard.ankiaddon"');
  res.send(zipFiles(files));
});

// ---------- the board ----------

router.post('/signin', async (req, res) => {
  if (wrongCodes.blocked(req.ip)) return res.status(429).json({ error: 'too many wrong codes: wait fifteen minutes' });
  const player = await playerByCode(req.body?.code);
  if (!player) {
    wrongCodes.count(req.ip);
    return res.status(403).json({ error: 'that code is not on the leaderboard' });
  }
  req.session.kshsaaAnki = { id: String(player._id), key: player.codeHash.slice(0, 16) };
  res.json({ ok: true, name: player.name });
});

router.post('/signout', (req, res) => {
  if (req.session) req.session.kshsaaAnki = null;
  res.json({ ok: true });
});

router.get('/data', async (req, res) => {
  const viewer = await viewerOf(req);
  if (!viewer.player && !viewer.role) return res.status(401).json({ error: 'not signed in' });
  const asked = ['month', 'season'].includes(req.query.period) ? req.query.period : 'week';
  const back = Math.min(52, Math.max(0, parseInt(req.query.back, 10) || 0));
  const today = todayKey();
  const saved = await settings.findOne({ _id: 'anki' });
  // the season on screen, or the current one beside a week or a month
  const season = seasonAt(saved?.seasons, asked === 'season' ? back : 0, today);
  const period = asked === 'season' && !season ? 'week' : asked;
  const range = period === 'season' ? season : periodRange(period, back, today);
  const { list, stored } = await loadFor([range, season].filter(Boolean), today);
  const rows = buildBoard(list, stored, range, today);
  const belt = season && seasonBelt(list, stored, season, today);
  const sitting = new Set(list.filter(p => p.sitsOut).map(p => String(p._id)));
  const me = viewer.player ? String(viewer.player._id) : null;
  res.set('Cache-Control', 'no-store');
  res.json({
    period,
    back,
    from: range.from,
    to: range.to,
    label: range.label,
    earlier: period === 'season' ? season.earlier : back < 52,
    prizes: saved?.prizes || '',
    viewer: { name: viewer.player?.name || null, manage: viewer.role === 'stats' },
    belt: season ? beltView(belt, season, list, me, today) : null,
    players: rows.map(r => ({
      name: r.name,
      rank: r.rank,
      reviews: r.reviews,
      minutes: Math.round(r.seconds / 60),
      days: r.days,
      newCards: r.newCards,
      best: r.best,
      streak: r.streak,
      lastSyncAt: r.lastSyncAt,
      belt: Boolean(belt && belt.holders.includes(r.id)),
      beltDays: period === 'season' ? belt.held[r.id] || 0 : undefined,
      sitsOut: period === 'season' ? sitting.has(r.id) : undefined,
      me: r.id === me
    }))
  });
});

// ---------- managing it: stats password ----------

router.get('/players', requireAuth, async (req, res) => {
  const [list, names] = await Promise.all([
    players.find({}, { projection: { codeHash: 0 } }).toArray(),
    roster.find({ coach: { $ne: true } }, { projection: { name: 1 } }).toArray()
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({
    players: list.sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
      id: String(p._id),
      name: p.name,
      createdAt: p.createdAt,
      lastSyncAt: p.lastSyncAt || null,
      anki: p.anki || null,
      addon: p.addon || null,
      sitsOut: Boolean(p.sitsOut)
    })),
    addon: ADDON_VERSION,
    seasons: [...await seasonsSaved()].sort((a, b) => a.from.localeCompare(b.from)),
    today: todayKey(),
    roster: names.map(r => r.name).sort()
  });
});

router.post('/players', requireAuth, async (req, res) => {
  const name = text(req.body?.name, 60);
  if (!name) return res.status(400).json({ error: 'who is it for?' });
  if (await players.findOne({ nameKey: name.toLowerCase() })) return res.status(409).json({ error: name + ' is already on the leaderboard' });
  const code = newCode();
  const result = await players.insertOne({ name, nameKey: name.toLowerCase(), codeHash: codeHash(code), createdAt: new Date(), lastSyncAt: null });
  res.json({ ok: true, id: String(result.insertedId), name, code });
});

const byId = id => (ObjectId.isValid(id) ? { _id: new ObjectId(id) } : null);

// a new code stops the old one: the add-on and any board sign-in need the new one
router.post('/players/:id/code', requireAuth, async (req, res) => {
  const filter = byId(req.params.id);
  const player = filter && await players.findOne(filter);
  if (!player) return res.status(404).json({ error: 'no such player' });
  const code = newCode();
  await players.updateOne(filter, { $set: { codeHash: codeHash(code) } });
  res.json({ ok: true, name: player.name, code });
});

router.post('/players/:id/delete', requireAuth, async (req, res) => {
  const filter = byId(req.params.id);
  const player = filter && await players.findOne(filter);
  if (!player) return res.status(404).json({ error: 'no such player' });
  await Promise.all([players.deleteOne(filter), days.deleteMany({ player: String(player._id) })]);
  res.json({ ok: true });
});

// who is in the belt race: a player who sits out stays on every board
router.post('/players/:id/race', requireAuth, async (req, res) => {
  if (typeof req.body?.racing !== 'boolean') return res.status(400).json({ error: 'racing has to be true or false' });
  const filter = byId(req.params.id);
  const player = filter && await players.findOne(filter);
  if (!player) return res.status(404).json({ error: 'no such player' });
  await players.updateOne(filter, { $set: { sitsOut: !req.body.racing } });
  res.json({ ok: true, name: player.name, sitsOut: !req.body.racing });
});

router.post('/prizes', requireAuth, async (req, res) => {
  const prizes = String(req.body?.prizes ?? '').trim().slice(0, 1000);
  await settings.updateOne({ _id: 'anki' }, { $set: { prizes, updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true, prizes });
});

// the latest season's dates, or the next season's once the latest has ended
router.post('/season', requireAuth, async (req, res) => {
  let seasons;
  try {
    seasons = saveSeason(await seasonsSaved(), req.body?.from, req.body?.to, todayKey());
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
  await settings.updateOne({ _id: 'anki' }, { $set: { seasons, updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true, seasons });
});

// takes off the latest season, for dates saved by mistake; the cards stay
router.post('/season/remove', requireAuth, async (req, res) => {
  const seasons = [...await seasonsSaved()].sort((a, b) => a.from.localeCompare(b.from)).slice(0, -1);
  await settings.updateOne({ _id: 'anki' }, { $set: { seasons, updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true, seasons });
});

// ---------- the page ----------

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anki leaderboard</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
${KSHSAA_HEAD}
<style>
 body{background:#f6f7f9;color:#1f2733;font-size:15px}
 h1{font-size:1.7rem;font-weight:700;letter-spacing:-.02em}
 .panel{background:#fff;border:1px solid #e1e6ef;border-radius:12px;padding:18px 20px;margin-bottom:18px}
 .lede{color:#5d6b82;max-width:640px}
 .prizes{background:#fff8e6;border:1px solid #f1d58a;border-radius:12px;padding:12px 18px;margin-bottom:18px;white-space:pre-line}
 .prizes b{display:block;font-size:.8rem;letter-spacing:.08em;color:#8a5a00;margin-bottom:2px}
 .belt{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;background:linear-gradient(120deg,#1c2330,#2c3a52);color:#eef2f8;border-radius:12px;padding:14px 20px;margin-bottom:18px}
 .belt .belt-icon{width:96px;height:42px;flex:none}
 .belt .kicker{font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#f2c94c}
 .belt .holder{font-size:1.15rem;font-weight:700;line-height:1.35}
 .belt .sub{color:#c5cfdf;font-size:.9rem}
 .belt-icon{width:34px;height:15px;vertical-align:-3px}
 .periodbar{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin-bottom:12px}
 .periodbar .label{font-weight:600;min-width:12rem;text-align:center}
 .board{width:100%;border-collapse:collapse}
 .board th{font-size:.75rem;color:#5d6b82;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid #e1e6ef}
 .board td{padding:9px 8px;border-bottom:1px solid #eef1f6}
 .board .num{text-align:right;font-variant-numeric:tabular-nums}
 .board tr.me td{background:#eef4ff}
 .board td.cards{font-weight:700;font-size:1.05rem}
 .rank{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;font-weight:700;font-size:.85rem;background:#eef1f6;color:#4a5b7d}
 .rank.r1{background:#f7d774;color:#5c4400}.rank.r2{background:#d9dee7;color:#3a4252}.rank.r3{background:#e8b48a;color:#5a2f0f}
 .muted{color:#6b778c;font-size:.85rem}
 .code{font:600 1.4rem ui-monospace,Consolas,monospace;letter-spacing:.08em;background:#f1f4f9;border-radius:8px;padding:6px 12px;display:inline-block}
 .steps li{margin-bottom:6px}
 .addon-id{font:600 1rem ui-monospace,Consolas,monospace;letter-spacing:.04em;background:#f1f4f9;border-radius:6px;padding:1px 7px;user-select:all}
 .table-wrap{overflow-x:auto}
 @media(max-width:640px){.hide-sm{display:none}.board td,.board th{padding:7px 5px}}
</style></head><body>
${kshsaaNav('/kshsaa-anki', 1000)}
<div class="container pb-5" style="max-width:1000px">
  <h1 class="mt-2">Anki leaderboard</h1>
  <p class="lede">Cards studied in Anki, any deck, counted straight from each player's review log: every answer counts, the same number Anki shows as &ldquo;studied N cards today&rdquo;.</p>

  <div id="signin" class="panel" hidden>
    <h2 class="h5">Sign in with your code</h2>
    <p class="muted mb-2">The code your captain gave you, the same one your Anki add-on uses.</p>
    <form id="signinForm" class="d-flex flex-wrap gap-2" style="max-width:480px">
      <input id="codeInput" class="form-control" style="flex:1 1 220px" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
    <p id="signinMsg" class="text-danger small mt-2 mb-0"></p>
    <p class="muted mt-3 mb-0">Coach or captain? <a href="/kshsaa-stats">Sign in on the Stats page</a>, then come back.</p>
  </div>

  <div id="boardBox" hidden>
    <div id="belt" class="belt" hidden></div>
    <div id="prizes" class="prizes" hidden></div>
    <div class="panel">
      <div class="periodbar">
        <div class="btn-group" role="group" aria-label="Period" id="periodGroup">
          <button type="button" class="btn btn-outline-primary btn-sm" data-period="week">Week</button>
          <button type="button" class="btn btn-outline-primary btn-sm" data-period="month">Month</button>
          <button type="button" class="btn btn-outline-primary btn-sm" data-period="season">Season</button>
        </div>
        <button type="button" class="btn btn-light btn-sm" id="earlier" aria-label="Earlier">&lsaquo;</button>
        <span class="label" id="periodLabel"></span>
        <button type="button" class="btn btn-light btn-sm" id="later" aria-label="Later">&rsaquo;</button>
        <span class="ms-auto muted" id="viewerNote"></span>
      </div>
      <div class="table-wrap"><table class="board" id="board"></table></div>
      <p class="muted mt-3 mb-0">Days run from Anki's daily rollover (4 AM unless changed). Streak counts days in a row with at least one card, through today or yesterday. A count updates when that player's Anki next sends; cards studied on a phone arrive once their computer's Anki syncs.</p>
    </div>
  </div>

  <details class="panel" id="setup">
    <summary class="fw-semibold">Get on the board: install the add-on</summary>
    <ol class="steps mt-3 mb-2">
      <li>In Anki on a computer, choose Tools &rarr; Add-ons &rarr; Get Add-ons&hellip;, paste <span class="addon-id" id="addonId">${ANKIWEB_ID}</span> <button type="button" class="btn btn-outline-secondary btn-sm py-0" id="copyAddonId">Copy</button>, and restart Anki.</li>
      <li>When Anki asks, paste the code your captain gave you. To change it later: Tools &rarr; Scholars Bowl leaderboard &rarr; Enter my code.
        <b>Study on more than one computer? Use the same code on each.</b> That menu shows the code a computer already has, so you can copy it from there.</li>
      <li>That's it. Your counts go out when Anki opens, when you finish studying, after you sync, and every half hour while Anki stays open. Studying on a phone counts once the computer's Anki syncs, so if you leave Anki open, press Sync now and then.
        With add-on 1.2 or newer, each send covers every day since August 1, so cards you studied before installing still count.</li>
    </ol>
    <p class="muted mb-2">Anki can't reach AnkiWeb? <a href="/kshsaa-anki/addon" download>Download the add-on file</a> and use Tools &rarr; Add-ons &rarr; Install from file&hellip; instead.</p>
    <p class="muted mb-0">Only numbers leave Anki: cards answered, new cards, and minutes for each day. No card text, no deck names. It needs a recent Anki (2.1.50 or newer).</p>
  </details>

  <div id="manage" hidden>
    <h2 class="h5 mt-4">Manage the leaderboard</h2>
    <div class="panel">
      <form id="addForm" class="d-flex flex-wrap gap-2 align-items-center">
        <label for="addName" class="fw-semibold">Add a player</label>
        <input id="addName" class="form-control" style="flex:1 1 220px;max-width:320px" list="rosterNames" placeholder="Name" autocomplete="off">
        <datalist id="rosterNames"></datalist>
        <button class="btn btn-primary" type="submit">Add and make a code</button>
      </form>
      <div id="codeBox" class="mt-3" hidden></div>
      <p id="manageMsg" class="text-danger small mt-2 mb-0"></p>
      <div class="table-wrap mt-3"><table class="board" id="playerTable"></table></div>
      <p id="addonNote" class="muted mt-2 mb-0" hidden></p>
    </div>
    <div class="panel">
      <div class="fw-semibold mb-1">Season Belt</div>
      <p class="muted mb-2">Of the players in the race, whoever has the most cards between these dates holds the belt, and whoever holds it on the last day wins it. Untick &ldquo;In the race&rdquo; above for anyone who sits it out; they stay on every board.</p>
      <form id="seasonForm" class="d-flex flex-wrap gap-2 align-items-center">
        <label for="seasonFrom">From</label>
        <input id="seasonFrom" type="date" class="form-control" style="width:auto">
        <label for="seasonTo">through</label>
        <input id="seasonTo" type="date" class="form-control" style="width:auto">
        <button class="btn btn-outline-primary btn-sm" type="submit">Save season</button>
        <button class="btn btn-outline-danger btn-sm" type="button" id="removeSeason" hidden>Remove this season</button>
      </form>
      <p id="seasonNote" class="muted mt-2 mb-0"></p>
      <p id="seasonMsg" class="text-danger small mt-1 mb-0"></p>
    </div>
    <div class="panel">
      <label for="prizesText" class="fw-semibold mb-1">Prizes</label>
      <p class="muted mb-2">Shown above the board. Say what the top spots win and when, for example &ldquo;Most cards in December: two hours of calculus tutoring from Andrew,&rdquo; or what the Season Belt winner gets.</p>
      <textarea id="prizesText" class="form-control" rows="3" maxlength="1000"></textarea>
      <button id="savePrizes" class="btn btn-outline-primary btn-sm mt-2" type="button">Save prizes</button>
      <span id="prizesMsg" class="muted ms-2"></span>
    </div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = n => Number(n || 0).toLocaleString('en-US');
const dayLabel = key => new Date(key + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = key => new Date(key + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
const STATE = { period: 'week', back: 0, manage: false };
const seasonButton = document.querySelector('[data-period="season"]');
// the Season Belt: a strap with a gold plate in the middle and one each side
const BELT = '<svg class="belt-icon" viewBox="0 0 64 28" aria-hidden="true">' +
  '<rect x="1" y="8" width="62" height="12" rx="4" fill="#2b2f38"/>' +
  '<path d="M4 10.4h56M4 17.6h56" stroke="#5d6472" stroke-width=".8" stroke-dasharray="2 1.6"/>' +
  '<rect x="5" y="9.5" width="10" height="9" rx="2" fill="#e9b949" stroke="#8a6100" stroke-width=".9"/>' +
  '<rect x="49" y="9.5" width="10" height="9" rx="2" fill="#e9b949" stroke="#8a6100" stroke-width=".9"/>' +
  '<ellipse cx="32" cy="14" rx="14" ry="13" fill="#f2c94c" stroke="#8a6100" stroke-width="1.2"/>' +
  '<ellipse cx="32" cy="14" rx="10" ry="9.2" fill="#e9b949" stroke="#8a6100" stroke-width=".8"/>' +
  '<polygon points="32,8 33.47,11.98 37.71,12.15 34.38,14.77 35.53,18.85 32,16.5 28.47,18.85 29.62,14.77 26.29,12.15 30.53,11.98" fill="#8a6100"/>' +
  '</svg>';

async function api (url, body) {
  const r = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || ('error ' + r.status)); e.status = r.status; throw e; }
  return data;
}

function ago (iso) {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.round(minutes / 60);
  if (hours < 36) return hours + ' h ago';
  return Math.round(hours / 24) + ' days ago';
}

// The Season Belt above the board: when the race starts, then who holds it,
// since when, and who is closest behind; once it is over, who won it. Hidden
// until the coach sets a season.
function drawBelt (b) {
  $('belt').hidden = !b;
  if (!b) return;
  const names = b.holders.map(h => '<b>' + esc(h.name) + '</b>' + (h.me ? ' (you)' : ''));
  const who = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  const shared = names.length > 1 ? ' share it with ' + fmt(b.reviews) + ' cards each.' : '';
  const wins = 'Whoever holds it on ' + longDay(b.to) + ' wins it.';
  let line;
  let sub = '';
  if (b.upcoming) {
    line = 'The race starts ' + longDay(b.from) + '.';
    sub = 'Whoever has the most cards from ' + longDay(b.from) + ' through ' + longDay(b.to) + ' wins the belt.';
  } else if (!names.length) {
    line = b.over ? 'Nobody in the race studied that season.' : 'Nobody holds it yet. The first cards of the season take it.';
    if (!b.over) sub = wins;
  } else if (b.over) {
    line = who + (shared || ' won it with ' + fmt(b.reviews) + ' cards.');
  } else {
    line = who + (shared || ' holds it with ' + fmt(b.reviews) + ' cards' + (b.since ? ', since ' + dayLabel(b.since) : '') + '.');
    if (b.you) sub = 'You are ' + fmt(b.you.behind) + ' behind. ';
    else if (b.next) sub = esc(b.next.name) + ' is ' + fmt(b.next.behind) + ' behind' + (b.holders.some(h => h.me) ? ' you' : '') + '. ';
    sub += wins;
  }
  if (b.over && b.nextFrom) sub = 'The next season starts ' + longDay(b.nextFrom) + '.';
  $('belt').innerHTML = BELT + '<div><div class="kicker">Anki Season Belt &middot; ' + esc(b.years) + '</div>' +
    '<div class="holder">' + line + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
}

function drawBoard (d) {
  const season = d.period === 'season';
  STATE.period = d.period;
  $('periodLabel').textContent = d.label + (d.back || season ? '' : (d.period === 'week' ? ' (this week)' : ' (this month)'));
  $('later').disabled = d.back === 0;
  $('earlier').disabled = !d.earlier;
  // the Season tab only once the coach has set a season
  if (d.belt) $('periodGroup').append(seasonButton);
  else seasonButton.remove();
  document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === d.period));
  drawBelt(d.belt);
  $('prizes').hidden = !d.prizes;
  $('prizes').innerHTML = d.prizes ? '<b>PRIZES</b>' + esc(d.prizes) : '';
  $('viewerNote').textContent = d.viewer.name ? 'Signed in as ' + d.viewer.name : '';
  if (!d.players.length) {
    $('board').innerHTML = '<tbody><tr><td class="muted">Nobody is on the leaderboard yet.' + (d.viewer.manage ? ' Add players below.' : '') + '</td></tr></tbody>';
    return;
  }
  const beltTitle = d.belt && d.belt.over ? 'Won the ' + d.belt.years + ' Season Belt' : 'Holds the Season Belt';
  const head = '<thead><tr><th>#</th><th>Player</th><th class="num">Cards</th><th class="num">Minutes</th><th class="num hide-sm">Days</th>' +
    '<th class="num hide-sm">New</th><th class="num hide-sm">Best day</th>' + (season ? '<th class="num hide-sm">Belt days</th>' : '') +
    '<th class="num">Streak</th><th class="num hide-sm">Updated</th></tr></thead>';
  const rows = d.players.map(p => '<tr class="' + (p.me ? 'me' : '') + '">' +
    '<td>' + (p.rank ? '<span class="rank r' + p.rank + '">' + p.rank + '</span>' : '') + '</td>' +
    '<td>' + esc(p.name) +
    (p.belt ? ' <span title="' + esc(beltTitle) + '">' + BELT + '<span class="visually-hidden"> (' + esc(beltTitle) + ')</span></span>' : '') +
    (p.me ? ' <span class="muted">(you)</span>' : '') +
    (p.sitsOut ? ' <span class="muted">(sits out)</span>' : '') + '</td>' +
    '<td class="num cards">' + fmt(p.reviews) + '</td>' +
    '<td class="num">' + fmt(p.minutes) + '</td>' +
    '<td class="num hide-sm">' + p.days + '</td>' +
    '<td class="num hide-sm">' + fmt(p.newCards) + '</td>' +
    '<td class="num hide-sm">' + fmt(p.best) + '</td>' +
    (season ? '<td class="num hide-sm">' + (p.sitsOut ? '' : p.beltDays || '') + '</td>' : '') +
    '<td class="num">' + (p.streak ? p.streak + ' d' : '') + '</td>' +
    '<td class="num hide-sm muted">' + ago(p.lastSyncAt) + '</td></tr>').join('');
  $('board').innerHTML = head + '<tbody>' + rows + '</tbody>';
}

async function load () {
  try {
    const d = await api('/kshsaa-anki/data?period=' + STATE.period + '&back=' + STATE.back);
    $('signin').hidden = true;
    $('boardBox').hidden = false;
    drawBoard(d);
    if (d.viewer.manage && !STATE.manage) { STATE.manage = true; $('manage').hidden = false; $('prizesText').value = d.prizes; loadPlayers(); }
  } catch (e) {
    if (e.status === 401) { $('signin').hidden = false; $('boardBox').hidden = true; } else { $('periodLabel').textContent = 'Could not load the board: ' + e.message; }
  }
}

async function signIn (code) {
  $('signinMsg').textContent = '';
  try {
    await api('/kshsaa-anki/signin', { code });
    await load();
  } catch (e) {
    $('signin').hidden = false;
    $('signinMsg').textContent = e.message;
  }
}

function showCode (name, code) {
  const box = $('codeBox');
  box.hidden = false;
  box.innerHTML = '<div class="mb-1">Code for <b>' + esc(name) + '</b>, shown only this once:</div>' +
    '<span class="code" id="newCode">' + esc(code) + '</span> <button type="button" class="btn btn-outline-secondary btn-sm ms-2" id="copyCode">Copy</button>' +
    '<div class="muted mt-1">They paste it into the add-on, the same code on every computer they study on, and use it to sign in here. ' +
    'Lost it? Press New code to make another; the old one stops working on every computer.</div>';
  $('copyCode').addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => { $('copyCode').textContent = 'Copied'; }, () => {});
  });
}

// The Season Belt panel: the latest season's dates while it lasts; once it
// has ended, empty boxes for the next one.
function drawSeasonForm (seasons, today) {
  const latest = seasons[seasons.length - 1];
  const open = Boolean(latest && latest.to >= today);
  $('seasonFrom').value = open ? latest.from : '';
  $('seasonTo').value = open ? latest.to : '';
  $('removeSeason').hidden = !open;
  $('seasonNote').textContent = !latest
    ? 'No season yet. The Season tab and the belt show up once one is saved.'
    : open
      ? (latest.from > today ? 'Starts ' : 'Running since ') + longDay(latest.from) + '. Changing the dates changes this season.'
      : 'The last season ended ' + longDay(latest.to) + '. Dates saved here start the next one, and the last one stays on the Season tab.';
}

async function loadPlayers () {
  try {
    const d = await api('/kshsaa-anki/players');
    $('rosterNames').innerHTML = d.roster.map(n => '<option value="' + esc(n) + '">').join('');
    const older = p => Boolean(p.addon && d.addon && p.addon !== d.addon);
    const behind = d.players.filter(older);
    $('addonNote').hidden = !behind.length;
    $('addonNote').textContent = behind.length
      ? behind.map(p => p.name).join(', ') + (behind.length > 1 ? ' have' : ' has') + ' an older add-on, which sends only the last 60 days, so the season misses what they studied before that. ' +
        'In Anki: Tools → Add-ons → Check for Updates, then restart Anki.'
      : '';
    drawSeasonForm(d.seasons, d.today);
    if (!d.players.length) { $('playerTable').innerHTML = ''; return; }
    $('playerTable').innerHTML = '<thead><tr><th>Player</th><th>Last sent</th><th class="hide-sm">Anki</th><th class="hide-sm">Add-on</th><th>In the race</th><th></th></tr></thead><tbody>' +
      d.players.map(p => '<tr><td>' + esc(p.name) + '</td><td class="muted">' + ago(p.lastSyncAt) + '</td><td class="muted hide-sm">' + esc(p.anki || '') + '</td>' +
        '<td class="muted hide-sm">' + esc(p.addon || '') + (older(p) ? ' <span class="badge text-bg-warning">update</span>' : '') + '</td>' +
        '<td><input type="checkbox" class="form-check-input" data-race="' + p.id + '"' + (p.sitsOut ? '' : ' checked') +
        ' aria-label="' + esc(p.name) + ' is in the belt race"></td>' +
        '<td class="text-end text-nowrap"><button type="button" class="btn btn-outline-secondary btn-sm" data-code="' + p.id + '" data-name="' + esc(p.name) + '">New code</button> ' +
        '<button type="button" class="btn btn-outline-danger btn-sm" data-remove="' + p.id + '" data-name="' + esc(p.name) + '">Remove</button></td></tr>').join('') + '</tbody>';
  } catch (e) {
    $('manageMsg').textContent = e.message;
  }
}

document.querySelectorAll('[data-period]').forEach(b => b.addEventListener('click', () => { STATE.period = b.dataset.period; STATE.back = 0; load(); }));
$('earlier').addEventListener('click', () => { STATE.back++; load(); });
$('later').addEventListener('click', () => { if (STATE.back > 0) { STATE.back--; load(); } });
$('signinForm').addEventListener('submit', e => { e.preventDefault(); signIn($('codeInput').value); });

$('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('manageMsg').textContent = '';
  try {
    const d = await api('/kshsaa-anki/players', { name: $('addName').value });
    $('addName').value = '';
    showCode(d.name, d.code);
    loadPlayers();
    load();
  } catch (err) {
    $('manageMsg').textContent = err.message;
  }
});

$('playerTable').addEventListener('click', async e => {
  const button = e.target.closest('button');
  if (!button) return;
  $('manageMsg').textContent = '';
  try {
    if (button.dataset.code) {
      if (!confirm('Make a new code for ' + button.dataset.name + '? The old one stops working, in the add-on on every computer that uses it. ' +
        'Only for a lost code: one code works on any number of computers.')) return;
      const d = await api('/kshsaa-anki/players/' + button.dataset.code + '/code', {});
      showCode(d.name, d.code);
    } else if (button.dataset.remove) {
      if (!confirm('Take ' + button.dataset.name + ' off the leaderboard, with all their counts?')) return;
      await api('/kshsaa-anki/players/' + button.dataset.remove + '/delete', {});
      $('codeBox').hidden = true;
    }
    loadPlayers();
    load();
  } catch (err) {
    $('manageMsg').textContent = err.message;
  }
});

// ticking "In the race" saves at once
$('playerTable').addEventListener('change', async e => {
  const box = e.target.closest('[data-race]');
  if (!box) return;
  $('manageMsg').textContent = '';
  try {
    await api('/kshsaa-anki/players/' + box.dataset.race + '/race', { racing: box.checked });
    load();
  } catch (err) {
    box.checked = !box.checked;
    $('manageMsg').textContent = err.message;
  }
});

$('seasonForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('seasonMsg').textContent = '';
  try {
    await api('/kshsaa-anki/season', { from: $('seasonFrom').value, to: $('seasonTo').value });
    loadPlayers();
    load();
  } catch (err) {
    $('seasonMsg').textContent = err.message;
  }
});

$('removeSeason').addEventListener('click', async () => {
  if (!confirm('Remove this season? Its belt goes with it. The cards stay on the boards.')) return;
  $('seasonMsg').textContent = '';
  try {
    await api('/kshsaa-anki/season/remove', {});
    loadPlayers();
    load();
  } catch (err) {
    $('seasonMsg').textContent = err.message;
  }
});

$('savePrizes').addEventListener('click', async () => {
  try {
    await api('/kshsaa-anki/prizes', { prizes: $('prizesText').value });
    $('prizesMsg').textContent = 'Saved.';
    load();
  } catch (e) {
    $('prizesMsg').textContent = e.message;
  }
});

// Copy the AnkiWeb number; where copying is blocked, select it for Ctrl+C
$('copyAddonId').addEventListener('click', () => {
  const button = $('copyAddonId');
  const id = $('addonId').textContent.trim();
  (navigator.clipboard ? navigator.clipboard.writeText(id) : Promise.reject(new Error('no clipboard'))).then(
    () => { button.textContent = 'Copied'; },
    () => { getSelection().selectAllChildren($('addonId')); button.textContent = 'Press Ctrl+C'; }
  );
});

// The add-on's Open the leaderboard sends the code after the #, which never
// reaches the server's logs; sign in with it and take it out of the address.
const fromAddon = new URLSearchParams(location.hash.slice(1)).get('code');
if (fromAddon) {
  history.replaceState(null, '', location.pathname);
  signIn(fromAddon);
} else {
  load();
}
</script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
