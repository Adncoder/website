// What every view on the scoreboard window shares: a tile per team, sized to
// the screen, little animations, the text strip along the bottom, and clearing
// the screen between one round or game and the next.

export const $ = id => document.getElementById(id);
// team names are free text and reach innerHTML
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const signed = n => (n > 0 ? '+' : '−') + Math.abs(n);

let tiles = [];

/** The tile for team i. */
export const tileAt = i => tiles[i];

// Columns that make the tiles as big as they can be at a comfortable shape on
// whatever screen this is: four teams sit two by two on a 16:9 projector
// rather than as four tall strips.
export function layoutTiles () {
  const n = tiles.length;
  if (!n) return;
  const { width, height } = $('tiles').getBoundingClientRect();
  let best = 1;
  let bestSize = 0;
  for (let cols = 1; cols <= n; cols++) {
    const size = Math.min(width / cols / 1.2, height / Math.ceil(n / cols));
    if (size > bestSize) [best, bestSize] = [cols, size];
  }
  $('tiles').style.setProperty('--cols', best);
}

/**
 * @param {number} n - teams
 * @param {'lives-mode'|'points-mode'} kind - which number is the big one
 */
export function buildTiles (n, kind) {
  const box = $('tiles');
  box.className = kind;
  box.innerHTML = '';
  tiles = Array.from({ length: n }, () => {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = '<div class="t-key"></div><div class="t-tag"></div><div class="t-name"></div>' +
      '<div class="t-lives"></div><div class="t-points"></div><div class="stamp">OUT</div>';
    box.appendChild(el);
    return el;
  });
  layoutTiles();
}

/** Restarts a CSS animation on an element. */
export function animate (el, name, ms = 1600) {
  el.classList.remove(name);
  // reading the layout restarts the animation
  el.getBoundingClientRect();
  el.classList.add(name);
  setTimeout(() => el.classList.remove(name), ms);
}

/** A number (or word) that rises off a tile and fades. */
export function float (el, text, kind) {
  const f = document.createElement('div');
  f.className = 'float ' + kind;
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 2000);
}

/**
 * Shows text along the bottom at the largest size that fits.
 * @param {string} html
 * @param {number} share - the most of the screen's height it may take
 * @param {number} biggest - the largest font size, in px
 */
export function fitFoot (html, share, biggest) {
  const foot = $('bFoot');
  $('bFit').innerHTML = html;
  foot.classList.remove('hidden');
  const most = window.innerHeight * share;
  let lo = 14;
  let hi = biggest;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    $('bFit').style.fontSize = mid + 'px';
    if (foot.scrollHeight <= most) lo = mid;
    else hi = mid;
  }
  $('bFit').style.fontSize = lo + 'px';
  // the tiles just lost room
  layoutTiles();
}

export function hideFoot () {
  $('bFoot').classList.add('hidden');
  layoutTiles();
}

/** A clean screen for whatever comes on next. */
export function resetBoard () {
  for (const id of ['bMode', 'bProgress', 'bStatus', 'bClock', 'bRound']) $(id).textContent = '';
  for (const id of ['bMod', 'bFoot', 'overlay', 'bRound']) $(id).classList.add('hidden');
  $('bStatus').className = '';
  $('bClock').className = '';
  $('tiles').innerHTML = '';
  tiles = [];
  document.title = 'Scoreboard';
}

/** A screen with nothing on it but a line of text. */
export function empty (text) {
  resetBoard();
  $('tiles').innerHTML = '<div class="empty">' + esc(text) + '</div>';
}
