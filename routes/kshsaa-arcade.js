// Octopus Arcade: Friday fun rounds for any number of teams on one lockout
// system - Last Team Standing, Bounty Hunter, Lightning Round, and Chaos Mode.
//
// This route only serves two pages: the moderator's setup and console, and
// the scoreboard window for the projector. The game is client code in
// client/kshsaa/arcade/ (rules in engine.js and modes/, the console in
// console.js, the scoreboard in board.js), so none of it runs inside these
// template literals. Questions come from the round builder's practice sets,
// which do not count them as read, and arcade games are not saved to stats.

import { Router } from 'express';
import { CATEGORIES, levelControls } from './kshsaa-round.js';
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
    ${levelControls()}
    <div class="form-label fw-semibold mb-1">Categories</div>
    <div class="d-flex flex-wrap gap-3 mb-1">
      ${CATEGORIES.map((c, i) => `<div class="form-check">
        <input class="form-check-input cat" type="checkbox" id="cat-${i}" value="${c}"${c === 'World Language' ? '' : ' checked'}>
        <label class="form-check-label" for="cat-${i}">${c}</label></div>`).join('')}
    </div>
    <div class="small text-secondary">World Language questions are held up, not read: the console puts their text on the scoreboard.</div>

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
          &middot; <kbd>S</kbd> question on scoreboard</div>
      </div>
    </div>
  </div>
</div>
<div id="toast" role="status" aria-live="polite"></div>
<script type="module" src="/kshsaa/arcade/console.js"></script>
</body></html>`;

const BOARD = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scoreboard</title>
<link rel="icon" href="/kshsaa/logo.svg" type="image/svg+xml">
<style>
 :root{--bg:#0a0f1f;--panel:#141b31;--line:#26304f;--ink:#f5f7fc;--muted:#97a3c2;--gold:#ffc933;--red:#ff4f63;
   --green:#38d98a;--blue:#58a6ff;--violet:#b98cff}
 *{box-sizing:border-box}
 html,body{height:100%;margin:0}
 body{background:radial-gradient(ellipse at top,#16203d 0,var(--bg) 65%);color:var(--ink);display:flex;flex-direction:column;
   overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
 .hidden{display:none!important}
 #bHead{display:flex;align-items:center;gap:2.2vw;padding:1.6vh 2.4vw .8vh;font-size:clamp(.9rem,2vw,2rem);white-space:nowrap}
 #bMode{font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
 #bProgress{color:var(--muted)}
 #bStatus{font-weight:800;color:var(--blue);overflow:hidden;text-overflow:ellipsis}
 #bStatus.rebound{color:var(--violet)}
 #bStatus.buzz{color:var(--gold)}
 #bStatus.right{color:var(--green)}
 .spacer{flex:1}
 #bRound{font-weight:800;font-variant-numeric:tabular-nums;font-size:clamp(1.4rem,3.4vw,3.4rem)}
 #bRound.low{color:var(--red)}
 #bClock{font-weight:800;font-variant-numeric:tabular-nums;font-size:clamp(2rem,5.5vw,5.5rem);line-height:1;min-width:3ch;text-align:right}
 #bClock.low{color:var(--gold)}
 #bClock.done{color:var(--red)}
 #bMod{margin:0 2.4vw 1vh;padding:1vh 1.6vw;border-radius:1.2vmin;background:linear-gradient(90deg,#5b21b6,#c026d3);
   display:flex;align-items:center;gap:1.4vw;font-size:clamp(1rem,2.4vw,2.4rem)}
 #bMod .m-icon{font-size:1.4em;line-height:1}
 #bMod .m-label{font-weight:900;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
 #bMod.slam{animation:slam .6s cubic-bezier(.2,1.6,.4,1)}
 @keyframes slam{0%{transform:scale(1.5);opacity:0}100%{transform:none;opacity:1}}
 #tiles{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));
   grid-auto-rows:minmax(0,1fr);gap:1.6vmin;padding:.6vh 2.4vw 1.6vh}
 .tile{position:relative;container-type:size;background:var(--panel);border:.5vmin solid var(--line);border-radius:2vmin;
   display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2cqh;padding:3cqh 4cqw;overflow:hidden;
   transition:border-color .25s,background-color .25s,box-shadow .25s}
 .t-key{position:absolute;top:3cqh;left:3cqw;font-family:Consolas,monospace;font-weight:700;font-size:max(.8rem,7cqmin);
   color:var(--muted);border:1px solid var(--line);border-radius:.4em;padding:0 .35em}
 .t-tag{position:absolute;top:3cqh;right:3cqw;font-weight:900;font-size:max(.9rem,9cqmin);line-height:1.2}
 .t-name{font-weight:800;text-align:center;line-height:1.05;font-size:clamp(1.2rem,min(13cqw,22cqh),7rem);overflow-wrap:break-word;max-width:100%}
 .t-lives{font-size:clamp(1rem,min(12cqw,20cqh),6rem);line-height:1;letter-spacing:.06em;color:var(--red);
   text-shadow:0 0 2vmin rgba(255,79,99,.35);white-space:nowrap}
 .t-lives .gone{color:#2c3658;text-shadow:none}
 .t-points{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:700;font-size:clamp(.9rem,min(7cqw,11cqh),3rem)}
 .points-mode .t-points{color:var(--ink);font-weight:900;line-height:1;font-size:clamp(1.6rem,min(22cqw,32cqh),10rem)}
 .tile.buzzed{border-color:var(--gold);background:#2c2611;box-shadow:0 0 5vmin rgba(255,201,51,.55)}
 .tile.buzzed .t-tag{color:var(--gold)}
 .tile.right{border-color:var(--green);background:#0f2a1f}
 .tile.right .t-tag{color:var(--green)}
 .tile.locked>:not(.stamp):not(.float):not(.t-tag){opacity:.4}
 .tile.locked .t-tag{color:var(--red)}
 .tile.shielded{box-shadow:inset 0 0 0 .7vmin var(--blue)}
 .tile.shielded.buzzed{box-shadow:inset 0 0 0 .7vmin var(--blue),0 0 5vmin rgba(255,201,51,.55)}
 .tile.out{background:#0d1222;border-color:#1a2138}
 .tile.out>:not(.stamp):not(.float){opacity:.28;filter:grayscale(1)}
 .tile.winner{border-color:var(--gold)}
 .stamp{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;font-weight:900;
   letter-spacing:.08em;color:var(--red);font-size:min(30cqw,48cqh);transform:rotate(-12deg);text-shadow:0 0 3vmin rgba(255,79,99,.5)}
 .tile.out .stamp{display:flex}
 .tile.knockout{animation:knockout 1.4s ease-out}
 .tile.knockout .stamp{animation:stamp .55s .75s both cubic-bezier(.2,1.5,.4,1)}
 @keyframes knockout{0%{transform:none;background:#5a0f1d}8%{transform:translate(-2.5%,1%) rotate(-2deg)}
   16%{transform:translate(2.5%,-1%) rotate(2deg)}24%{transform:translate(-2%,0) rotate(-1.5deg)}
   32%{transform:translate(2%,0) rotate(1.5deg)}45%{transform:none;background:#5a0f1d}100%{background:#0d1222}}
 @keyframes stamp{0%{transform:rotate(-12deg) scale(3);opacity:0}100%{transform:rotate(-12deg) scale(1);opacity:1}}
 .tile.hit{animation:hit .6s}
 @keyframes hit{0%,100%{transform:none}20%{transform:translateX(-2%)}40%{transform:translateX(2%)}
   60%{transform:translateX(-1%)}80%{transform:translateX(1%)}}
 .tile.heal{animation:heal .9s}
 @keyframes heal{0%{box-shadow:0 0 0 0 rgba(56,217,138,.85)}100%{box-shadow:0 0 0 5vmin rgba(56,217,138,0)}}
 .tile.revive{animation:revive 1.1s}
 @keyframes revive{0%{transform:scale(.85);filter:brightness(2.2)}60%{transform:scale(1.05)}100%{transform:none}}
 .tile.buzzpop{animation:buzzpop .35s}
 @keyframes buzzpop{50%{transform:scale(1.06)}}
 .float{position:absolute;left:50%;top:42%;font-weight:900;white-space:nowrap;font-size:min(15cqw,24cqh);pointer-events:none;
   animation:floatup 1.9s ease-out forwards;text-shadow:0 .4vmin 1.5vmin rgba(0,0,0,.7)}
 .float.good{color:var(--green)}
 .float.bad{color:var(--red)}
 .float.info{color:var(--blue)}
 @keyframes floatup{0%{opacity:0;transform:translate(-50%,20%) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.1)}
   100%{opacity:0;transform:translate(-50%,-90%) scale(1)}}
 #bFoot{flex:0 0 auto;margin:0 2.4vw 1.6vh;padding:1.2vh 1.6vw;border-radius:1.4vmin;background:#f7f4ea;color:#151515;overflow:hidden}
 #bFit{font-family:Georgia,'Times New Roman',serif;line-height:1.3}
 .f-a{font-family:'Segoe UI',system-ui,sans-serif;font-weight:800;color:#0b5d33}
 .f-a .f-label{font-size:.55em;letter-spacing:.12em;color:#6b6b6b;margin-right:.5em;vertical-align:middle}
 .f-q+.f-a{margin-top:.45em}
 #overlay{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;
   text-align:center;background:rgba(6,9,20,.88);padding:4vh 6vw}
 .o-big{font-size:clamp(3rem,11vw,11rem);font-weight:900;letter-spacing:.08em;line-height:1}
 .o-small{font-size:clamp(1rem,2.6vw,2.6rem);color:var(--muted)}
 .o-rules{font-size:clamp(1rem,2.1vw,2.1rem);text-align:left;max-width:75vw;margin:3vh 0 0;line-height:1.4}
 .o-trophy{font-size:clamp(4rem,13vw,13rem);line-height:1;animation:bob 2s ease-in-out infinite}
 .o-name{font-size:clamp(2.5rem,9vw,9rem);font-weight:900;color:var(--gold);line-height:1.05;
   text-shadow:0 0 4vmin rgba(255,201,51,.5);animation:winpop .9s cubic-bezier(.2,1.5,.4,1)}
 .o-list{margin-top:3vh;font-size:clamp(1rem,2.2vw,2.2rem)}
 .o-list div{margin:.15em 0}
 .o-list .o-rank{display:inline-block;min-width:2.5em;color:var(--muted)}
 @keyframes bob{50%{transform:translateY(-5%)}}
 @keyframes winpop{0%{transform:scale(.3);opacity:0}100%{transform:none;opacity:1}}
 .confetti{position:fixed;top:-4vh;width:1.1vmin;height:2.2vmin;border-radius:.2vmin;z-index:11;pointer-events:none;
   animation:fall linear forwards}
 @keyframes fall{to{transform:translateY(112vh) rotate(720deg)}}
 .empty{grid-column:1/-1;align-self:center;text-align:center;color:var(--muted);font-size:clamp(1.2rem,2.6vw,2.6rem)}
 #fsBtn{position:fixed;right:1vw;bottom:1vh;z-index:20;background:#1d2645;color:var(--ink);border:1px solid var(--line);
   border-radius:.4rem;padding:.4rem .8rem;font:inherit;font-size:.9rem;opacity:.7;cursor:pointer}
 #fsBtn:hover{opacity:1}
 @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>
</head><body>
<div id="bHead">
  <div id="bMode"></div>
  <div id="bProgress"></div>
  <div id="bStatus"></div>
  <div class="spacer"></div>
  <div id="bRound" class="hidden"></div>
  <div id="bClock"></div>
</div>
<div id="bMod" class="hidden"></div>
<div id="tiles"></div>
<div id="bFoot" class="hidden"><div id="bFit"></div></div>
<div id="overlay" class="hidden"></div>
<button type="button" id="fsBtn">Full screen</button>
<script type="module" src="/kshsaa/arcade/board.js"></script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(CONSOLE);
});

router.get('/board', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(BOARD);
});

export default router;
