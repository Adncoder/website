// The Anki leaderboard (/kshsaa-anki): how many cards each player studies in
// Anki, week by week and month by month, with whatever prizes the team puts
// up. Counts come from an Anki add-on (server/kshsaa/anki-addon/, downloaded
// from /kshsaa-anki/addon) that sends each day's numbers with the player's
// code; the numbers themselves are worked out in server/kshsaa/anki-board.js.
//
// A player signs in to the board with the same code their add-on uses, so
// the board is not public; a stats or reader sign-in sees it too. The stats
// password adds players, makes their codes, and sets the prizes. Codes are
// stored only as hashes, so a lost code is replaced, never looked up.
//
// Collections: kshsaa_anki_players { name, nameKey, codeHash, createdAt,
// lastSyncAt, anki, addon }, kshsaa_anki_days { _id: player id + '|' + day,
// player, day, reviews, cards, newCards, seconds, updatedAt }, and
// kshsaa_settings { _id: 'anki', prizes }.

import { Router } from 'express';
import { readFileSync, readdirSync } from 'fs';
import { ObjectId } from 'mongodb';
import { qbreader } from '../database/databases.js';
import { requireAuth, roleOf } from './kshsaa-stats.js';
import {
  SYNC_DAYS_BACK, addDays, buildBoard, cleanSync, codeHash, newCode, normalizeCode, periodRange, standingOf, syncServers, todayKey
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
const ADDON_MOD = 1795478400; // version 1.1
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
 * The board for a week or a month, from the stored days.
 * @param {'week'|'month'} period
 * @param {number} back - 0 for the current one
 */
async function boardFor (period, back) {
  const today = todayKey();
  const range = periodRange(period, back, today);
  const oldest = [range.from, addDays(today, -SYNC_DAYS_BACK)].sort()[0];
  const [list, stored] = await Promise.all([
    players.find({}, { projection: { codeHash: 0 } }).toArray(),
    days.find({ day: { $gte: oldest } }).toArray()
  ]);
  return { range, rows: buildBoard(list, stored, range, today) };
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
    // stored day in that window has none now
    await days.deleteMany({ player: id, day: { $gte: sent.from, $nin: sent.days.map(d => d.day) } });
    if (sent.days.length) {
      await days.bulkWrite(sent.days.map(d => ({
        updateOne: { filter: { _id: id + '|' + d.day }, update: { $set: { player: id, ...d, updatedAt: new Date() } }, upsert: true }
      })));
    }
    await players.updateOne({ _id: player._id }, { $set: { lastSyncAt: new Date(), anki: text(req.body?.anki, 20), addon: text(req.body?.addon, 20) } });
    const [week, month] = await Promise.all([boardFor('week', 0), boardFor('month', 0)]);
    res.json({ ok: true, name: player.name, days: sent.days.length, week: standingOf(week.rows, id), month: standingOf(month.rows, id) });
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
  const period = req.query.period === 'month' ? 'month' : 'week';
  const back = Math.min(52, Math.max(0, parseInt(req.query.back, 10) || 0));
  const [{ range, rows }, saved] = await Promise.all([boardFor(period, back), settings.findOne({ _id: 'anki' })]);
  const me = viewer.player ? String(viewer.player._id) : null;
  res.set('Cache-Control', 'no-store');
  res.json({
    period,
    back,
    ...range,
    prizes: saved?.prizes || '',
    viewer: { name: viewer.player?.name || null, manage: viewer.role === 'stats' },
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
      id: String(p._id), name: p.name, createdAt: p.createdAt, lastSyncAt: p.lastSyncAt || null, anki: p.anki || null
    })),
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

router.post('/prizes', requireAuth, async (req, res) => {
  const prizes = String(req.body?.prizes ?? '').trim().slice(0, 1000);
  await settings.updateOne({ _id: 'anki' }, { $set: { prizes, updatedAt: new Date() } }, { upsert: true });
  res.json({ ok: true, prizes });
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
    <div id="prizes" class="prizes" hidden></div>
    <div class="panel">
      <div class="periodbar">
        <div class="btn-group" role="group" aria-label="Period">
          <button type="button" class="btn btn-outline-primary btn-sm" data-period="week">Week</button>
          <button type="button" class="btn btn-outline-primary btn-sm" data-period="month">Month</button>
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
      <li>That's it. Your counts go out when Anki opens, when you finish studying, after you sync, and every half hour while Anki stays open. Studying on a phone counts once the computer's Anki syncs, so if you leave Anki open, press Sync now and then.</li>
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
    </div>
    <div class="panel">
      <label for="prizesText" class="fw-semibold mb-1">Prizes</label>
      <p class="muted mb-2">Shown above the board. Say what the top spots win and when, for example &ldquo;Most cards in December: two hours of calculus tutoring from Andrew.&rdquo;</p>
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
const STATE = { period: 'week', back: 0, manage: false };

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

function drawBoard (d) {
  $('periodLabel').textContent = d.label + (d.back ? '' : (d.period === 'week' ? ' (this week)' : ' (this month)'));
  $('later').disabled = d.back === 0;
  document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b.dataset.period === d.period));
  $('prizes').hidden = !d.prizes;
  $('prizes').innerHTML = d.prizes ? '<b>PRIZES</b>' + esc(d.prizes) : '';
  $('viewerNote').textContent = d.viewer.name ? 'Signed in as ' + d.viewer.name : '';
  if (!d.players.length) {
    $('board').innerHTML = '<tbody><tr><td class="muted">Nobody is on the leaderboard yet.' + (d.viewer.manage ? ' Add players below.' : '') + '</td></tr></tbody>';
    return;
  }
  const head = '<thead><tr><th>#</th><th>Player</th><th class="num">Cards</th><th class="num">Minutes</th><th class="num hide-sm">Days</th>' +
    '<th class="num hide-sm">New</th><th class="num hide-sm">Best day</th><th class="num">Streak</th><th class="num hide-sm">Updated</th></tr></thead>';
  const rows = d.players.map(p => '<tr class="' + (p.me ? 'me' : '') + '">' +
    '<td>' + (p.rank ? '<span class="rank r' + p.rank + '">' + p.rank + '</span>' : '') + '</td>' +
    '<td>' + esc(p.name) + (p.me ? ' <span class="muted">(you)</span>' : '') + '</td>' +
    '<td class="num cards">' + fmt(p.reviews) + '</td>' +
    '<td class="num">' + fmt(p.minutes) + '</td>' +
    '<td class="num hide-sm">' + p.days + '</td>' +
    '<td class="num hide-sm">' + fmt(p.newCards) + '</td>' +
    '<td class="num hide-sm">' + fmt(p.best) + '</td>' +
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

async function loadPlayers () {
  try {
    const d = await api('/kshsaa-anki/players');
    $('rosterNames').innerHTML = d.roster.map(n => '<option value="' + esc(n) + '">').join('');
    if (!d.players.length) { $('playerTable').innerHTML = ''; return; }
    $('playerTable').innerHTML = '<thead><tr><th>Player</th><th>Last sent</th><th class="hide-sm">Anki</th><th></th></tr></thead><tbody>' +
      d.players.map(p => '<tr><td>' + esc(p.name) + '</td><td class="muted">' + ago(p.lastSyncAt) + '</td><td class="muted hide-sm">' + esc(p.anki || '') + '</td>' +
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
