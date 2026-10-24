// Octopus Arcade: Friday fun rounds for any number of teams on one lockout
// system - Last Team Standing, Bounty Hunter, Lightning Round, Chaos Mode, and
// Quizbowl.
//
// This route only serves the moderator's setup and console. The game is client
// code in client/kshsaa/arcade/ (rules in engine.js and modes/, the console in
// console.js), so none of it runs inside this template literal, and its
// projector view is the shared scoreboard window (routes/kshsaa-scoreboard.js).
// Questions come from the round builder's practice sets, which do not count
// them as read, and from qbreader.org (Sports, Pop Culture, and all of
// Quizbowl); arcade games are not saved to stats.

import { Router } from 'express';
import { CATEGORIES, levelControls } from './kshsaa-round.js';
import { EXTRA_CATEGORIES } from '../client/kshsaa/arcade/qbreader.js';
import { KSHSAA_HEAD, kshsaaNav, readTabs } from '../server/kshsaa/nav.js';

const router = Router();

const options = (from, to, selected) => Array.from({ length: to - from + 1 }, (x, i) => from + i)
  .map(n => `<option value="${n}"${n === selected ? ' selected' : ''}>${n}</option>`).join('');

const CONSOLE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Octopus Arcade</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
${KSHSAA_HEAD}
<style>
 .arcade{max-width:1200px;margin:0 auto}
 .mode-card{cursor:pointer;position:relative}
 .mode-card input{position:absolute;opacity:0;pointer-events:none}
 .mode-card .card{border-width:2px;transition:border-color .15s,background-color .15s}
 .mode-card input:checked + .card{border-color:#0d6efd;background:#f0f6ff}
 .mode-card input:focus-visible + .card{outline:2px solid #0d6efd;outline-offset:2px}
 .team-row{max-width:34rem}
 .team-row .tnum{min-width:2.4rem;justify-content:center;font-weight:600}
 .team-row .tkey{max-width:3.4rem;text-align:center;font-family:Consolas,monospace;font-weight:700}
 .mod-off{opacity:.45}
 .q-text{font-family:Georgia,'Times New Roman',serif;font-size:1.35rem;line-height:1.45;white-space:pre-wrap}
 .q-text .power-zone{font-weight:700}
 .q-text .power-mark{background:#ffe08a;padding:0 .15em;border-radius:.2em;font-weight:700}
 .bpart{display:flex;gap:.7rem;padding:.45rem .6rem;border:2px solid transparent;border-radius:.45rem}
 .bpart+.bpart{margin-top:.3rem}
 .bpart .q-text{font-size:1.15rem}
 .bpart .q-answer{font-size:1rem}
 .bpart .bnum{font-weight:700;min-width:2.2rem;color:#6c757d}
 .bpart.now{border-color:#0d6efd;background:#f0f6ff}
 .bpart.right .bnum{color:#2f9e62}
 .bpart.wrong .bnum{color:#a4262c}
 .bpart.right,.bpart.wrong{opacity:.75}
 .q-answer{font-size:1.15rem}
 #qAnswer{font-weight:700}
 .clock{font-size:2rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:4.6rem;line-height:1}
 .clock.low{color:#a4500f}
 .clock.done{color:#a4262c}
 .clock.flash{animation:flash .45s ease-in-out 3}
 @keyframes flash{50%{opacity:.2}}
 .round-clock{font-weight:700;font-variant-numeric:tabular-nums;font-size:1.25rem}
 .mod-card{border-radius:.5rem;padding:.6rem .9rem;background:linear-gradient(90deg,#5b21b6,#a21caf);color:#fff;margin-bottom:.75rem}
 .mod-card .mod-icon{font-size:1.3rem}
 .ruling{border-radius:.5rem;padding:1rem;background:#f6f8fb;border:1px solid #dfe5ef;min-height:6rem}
 .ruling .big{font-size:1.3rem}
 .ruling kbd{background:#1f2733}
 .trow{display:flex;align-items:center;gap:.6rem;padding:.5rem .6rem;border:2px solid #e3e7ef;border-radius:.5rem;
   margin-bottom:.4rem;background:#fff;cursor:pointer;user-select:none}
 .trow:hover{border-color:#b9c4d8}
 .trow .k{font-family:Consolas,monospace;font-weight:700;background:#1f2733;color:#fff;border-radius:.3rem;
   min-width:1.8rem;text-align:center;padding:0 .35rem}
 .trow .n{font-weight:700;flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
 .trow .h{color:#d63447;letter-spacing:.06em;font-size:1.15rem;white-space:nowrap}
 .trow .h .gone{color:#d9dde6}
 .trow .p{font-variant-numeric:tabular-nums;color:#4a5568;min-width:2.6rem;text-align:right}
 .trow .st{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;min-width:3.6rem;text-align:right}
 .trow .adj{padding:0 .4rem;text-decoration:none}
 .trow.buzzed{border-color:#f0b400;background:#fff8e1}
 .trow.locked{opacity:.6}
 .trow.out{opacity:.5;background:#f3f4f6}
 .trow.right{border-color:#2f9e62;background:#eefaf3}
 .trow.refused{animation:refused .4s}
 @keyframes refused{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
 .adjust{display:flex;flex-wrap:wrap;gap:.3rem;margin:-.15rem 0 .55rem 2.6rem}
 .log{max-height:15rem;overflow:auto}
 .log li{padding:.1rem 0;border-bottom:1px solid #f0f2f6}
 .more{position:relative}
 .more>summary{list-style:none}
 .more>summary::-webkit-details-marker{display:none}
 .more-menu{position:absolute;right:0;top:calc(100% + .25rem);z-index:20;background:#fff;border:1px solid #d0d6e2;
   border-radius:.4rem;box-shadow:0 6px 20px rgba(0,0,0,.12);padding:.3rem;min-width:15rem;display:flex;flex-direction:column}
 .more-menu button{text-align:left}
 #toast{position:fixed;left:50%;bottom:1.25rem;transform:translateX(-50%);background:#1f2733;color:#fff;padding:.6rem 1rem;
   border-radius:.4rem;font-size:.95rem;opacity:0;pointer-events:none;transition:opacity .2s;z-index:3000;max-width:90vw}
 #toast.on{opacity:1}
</style>
</head><body>

${kshsaaNav('/kshsaa-play', 1200)}

<div class="container-fluid pb-4 arcade">
  <div id="readHead">
    <h1 class="h4">Read a round</h1>
    ${readTabs('/kshsaa-arcade')}
  </div>

  <div id="setup">
    <p class="text-secondary small mb-3">Fun rounds for any number of teams on one lockout system. Pick a game, name
      the teams, and start: lives, points, eliminations, and the winner are kept for you, and a second window puts the
      scoreboard on the projector. Arcade games are not saved to team stats, and their questions still count as unread.</p>

    <div id="resumeBox" class="alert alert-info py-2 d-none"></div>

    <h2 class="h6 fw-semibold">Game</h2>
    <div class="row g-2 mb-2" id="modes"></div>
    <ul class="small text-secondary mb-4" id="modeRules"></ul>

    <h2 class="h6 fw-semibold mb-1">Teams</h2>
    <div class="small text-secondary mb-2">A team's key is what you press when its light comes on, or what a USB
      buzzer system types for it. Once a team is out, its key does nothing.</div>
    <div id="teamRows"></div>
    <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" id="addTeam">+ Add a team</button>
      <select class="form-select form-select-sm d-none" id="lineupGame" style="max-width:28rem"
        aria-label="Team names from a recent game"></select>
    </div>

    <h2 class="h6 fw-semibold mt-4">Rules</h2>
    <div class="row g-3 align-items-end mb-2">
      <div class="col-auto" id="livesBox">
        <label class="form-label small mb-1" for="lives">Starting lives</label>
        <select class="form-select form-select-sm" id="lives">${options(1, 9, 3)}</select>
      </div>
      <div class="col-auto">
        <label class="form-label small mb-1" for="questionCount">Questions</label>
        <input type="number" class="form-control form-control-sm" id="questionCount" min="5" max="100" value="40" style="width:6rem">
      </div>
      <div class="col-auto" id="minutesBox">
        <label class="form-label small mb-1" for="minutes">Minutes</label>
        <select class="form-select form-select-sm" id="minutes">${options(1, 10, 3)}</select>
      </div>
    </div>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="rebounds" checked>
      <label class="form-check-label" for="rebounds">Rebounds: after a wrong answer, the other teams may buzz</label>
    </div>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="showAnswers" checked>
      <label class="form-check-label" for="showAnswers">Show each answer on the scoreboard once its question is done</label>
    </div>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="powerUps">
      <label class="form-check-label" for="powerUps">Power-ups <span class="small text-secondary" id="powerUpsHint"></span></label>
    </div>
    <div id="modifierBox" class="ms-4 small"></div>

    <h2 class="h6 fw-semibold mt-4">Questions</h2>
    <div class="alert alert-info py-2 small d-none" id="quizbowlHint">Quizbowl reads whole tossups and bonuses from
      qbreader.org: middle school sets for Beginner, easy high school for JV, and regular high school for Varsity.
      Quizbowl has no World Language, and the math menu does not apply.</div>
    ${levelControls()}
    <div class="form-label fw-semibold mb-1">Categories</div>
    <div class="d-flex flex-wrap gap-3 mb-1">
      ${CATEGORIES.concat(EXTRA_CATEGORIES).map((c, i) => `<div class="form-check">
        <input class="form-check-input cat" type="checkbox" id="cat-${i}" value="${c}"${c === 'World Language' || EXTRA_CATEGORIES.includes(c) ? '' : ' checked'}>
        <label class="form-check-label" for="cat-${i}">${c}</label></div>`).join('')}
    </div>
    <div class="small text-secondary">World Language questions are held up, not read: the console puts their text on the scoreboard.
      Sports and Pop Culture (movies, music, TV, video games) come from qbreader.org's school sets of the last eight
      years, shortened to the level the way the other quizbowl questions here are.</div>

    <button type="button" class="btn btn-primary mt-4" id="start">Get questions &amp; set up the game</button>
    <span class="ms-2 small" id="status"></span>
  </div>

  <div id="game" class="d-none">
    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
      <span class="fs-5 fw-bold" id="gMode"></span>
      <span class="text-secondary" id="gProgress"></span>
      <span class="round-clock d-none" id="gRoundClock" title="Time left in the game"></span>
      <button type="button" class="btn btn-sm btn-outline-secondary d-none" data-do="addtime" id="addTimeBtn">+30 s</button>
      <span class="ms-auto"></span>
      <button type="button" class="btn btn-sm btn-outline-primary" data-do="board">Open scoreboard window</button>
      <button type="button" class="btn btn-sm btn-primary" data-do="pause" id="pauseBtn">Start (P)</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-do="undo" id="undoBtn">Undo (Z)</button>
      <details class="more" id="moreMenu">
        <summary class="btn btn-sm btn-outline-secondary">More &#9662;</summary>
        <div class="more-menu">
          <button type="button" class="btn btn-sm btn-light" data-do="more">Add 10 more questions</button>
          <button type="button" class="btn btn-sm btn-light" data-do="throwout">Throw out this question</button>
          <button type="button" class="btn btn-sm btn-light" data-do="reset">Reset: every team back to the start</button>
          <button type="button" class="btn btn-sm btn-light" data-do="end">End the game now</button>
          <button type="button" class="btn btn-sm btn-light" data-do="newgame">New game</button>
        </div>
      </details>
    </div>
    <div id="saveWarn" class="alert alert-danger py-2 small d-none">This browser would not save the game, so a refresh
      would lose it. Keep this tab open.</div>
    <div id="notes"></div>

    <div class="row g-3">
      <div class="col-lg-7">
        <div id="modCard" class="mod-card d-none"></div>
        <div class="card"><div class="card-body">
          <div class="d-flex flex-wrap gap-2 small text-secondary mb-2">
            <span id="qMeta" class="fw-semibold"></span><span class="ms-auto" id="qSource"></span>
          </div>
          <div id="qText" class="q-text"></div>
          <div class="q-answer mt-3"><span class="small text-secondary fw-semibold me-1">ANSWER</span><span id="qAnswer"></span></div>
          <div id="bonusBox" class="mt-3 pt-3 border-top d-none"></div>
          <div class="d-flex flex-wrap align-items-center gap-2 mt-3 pt-3 border-top">
            <span id="clock" class="clock">10.0</span>
            <button type="button" class="btn btn-sm btn-outline-primary" data-do="clock" id="clockBtn">Start clock (Space)</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-do="plusfive"
              title="Add five seconds">+5 s</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-do="clockreset"
              title="Back to this question's full limit">Reset</button>
            <div class="form-check form-switch mb-0 ms-auto">
              <input class="form-check-input" type="checkbox" id="projectQ">
              <label class="form-check-label small" for="projectQ">Question on scoreboard (S)</label>
            </div>
            <select class="form-select form-select-sm d-none" id="modSelect" style="width:auto"
              aria-label="This question's power-up" title="Change this question's power-up, before anyone buzzes"></select>
          </div>
        </div></div>
        <div id="ruling" class="ruling mt-3" aria-live="polite"></div>
      </div>
      <div class="col-lg-5">
        <div class="small text-secondary mb-1">Click a team, or press its key, when its light comes on. &plusmn; fixes a team by hand.</div>
        <div id="teamList"></div>
        <details class="mt-3" open>
          <summary class="small fw-semibold">History <span class="fw-normal text-secondary">(Undo takes back the top line)</span></summary>
          <ul id="log" class="list-unstyled small log mt-1"></ul>
        </details>
        <div class="small text-secondary mt-2">Keys: team keys buzz &middot; <kbd>C</kbd> correct &middot; <kbd>W</kbd> wrong
          &middot; <kbd>N</kbd> next &middot; <kbd>Z</kbd> undo &middot; <kbd>P</kbd> pause &middot; <kbd>Space</kbd> clock
          &middot; <kbd>S</kbd> question on scoreboard<span id="qbKeys" class="d-none"> &middot; in Quizbowl, <kbd>F</kbd> power,
          <kbd>W</kbd> neg, <kbd>X</kbd> wrong at the end, and on a bonus <kbd>C</kbd> or <kbd>W</kbd> for each part</span></div>
      </div>
    </div>
  </div>
</div>
<div id="toast" role="status" aria-live="polite"></div>
<script type="module" src="/kshsaa/arcade/console.js"></script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(CONSOLE);
});

export default router;
