// The scoreboard window: a second screen for the projector, opened from the
// reader or the Octopus Arcade. It follows the tab that opened it and shows a
// normal round's scores, question, and clock, or an arcade game. The page is
// only markup and styles; client/kshsaa/scoreboard/page.js draws it, and
// client/kshsaa/second-screen.js is how a tab tells it what to show.

import { Router } from 'express';

const router = Router();

const PAGE = `<!DOCTYPE html>
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
 #bProgress{font-weight:800}
 #bProgress.pop{animation:pop .65s cubic-bezier(.2,1.6,.4,1);transform-origin:left center}
 @keyframes pop{0%{transform:scale(1.35);color:var(--gold)}100%{transform:none}}
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
 .t-key:empty{display:none}
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
 .f-a+.f-a{margin-top:.15em}
 .f-a.f-miss{color:#8a1c2b}
 .lang-line{display:flex;align-items:baseline;gap:.5em;line-height:1.15}
 .lang-line+.lang-line{margin-top:.25em}
 .lang-tag{flex:0 0 auto;font-family:'Segoe UI',system-ui,sans-serif;font-weight:700;color:#8a8886;font-size:.32em;letter-spacing:.08em}
 #bNext{position:fixed;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;pointer-events:none}
 #bNext .n-card{background:rgba(10,15,31,.94);border:.6vmin solid var(--gold);border-radius:2.4vmin;padding:2.6vh 6vw;
   text-align:center;box-shadow:0 0 8vmin rgba(255,201,51,.35)}
 #bNext.show .n-card{animation:nextcard var(--n-ms,1.8s) ease-out forwards}
 .n-big{font-size:clamp(3rem,11vw,11rem);font-weight:900;letter-spacing:.04em;line-height:1;text-transform:uppercase}
 .n-sub{font-size:clamp(1.2rem,3.6vw,3.6rem);font-weight:800;color:var(--gold);margin-top:1.2vh}
 .n-sub:empty{display:none}
 @keyframes nextcard{0%{opacity:0;transform:scale(.6)}12%{opacity:1;transform:scale(1.05)}20%{transform:none}
   80%{opacity:1}100%{opacity:0}}
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
<div id="bNext" class="hidden" aria-hidden="true"><div class="n-card"><div class="n-big"></div><div class="n-sub"></div></div></div>
<div id="overlay" class="hidden"></div>
<button type="button" id="fsBtn">Full screen</button>
<script type="module" src="/kshsaa/scoreboard/page.js"></script>
</body></html>`;

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(PAGE);
});

export default router;
