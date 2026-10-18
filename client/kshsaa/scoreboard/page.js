// The scoreboard window (/kshsaa-scoreboard): a second screen for the
// projector that follows one tab - the channel in its URL - and shows whatever
// that tab is running, a normal round from the reader (match.js) or an Octopus
// Arcade game (arcade/board-view.js). See second-screen.js for how the tab
// tells it.

import { readScreen, watchScreen } from '../second-screen.js';
import { loadGame, onGameSaved } from '../arcade/store.js';
import { refitArcade, showArcade, tickArcade } from '../arcade/board-view.js';
import { refitMatch, showMatch, tickMatch } from './match.js';
import { $, empty, layoutTiles, resetBoard } from './tiles.js';

const channel = new URLSearchParams(window.location.search).get('channel') || '';
const WAITING = 'Nothing on this screen yet. Start a round in the reader, or a game in the Octopus Arcade, ' +
  'in the tab that opened this window, and it appears here by itself.';

// what is on the screen now: a kind and which round or game
let current = null;

function follow () {
  const view = readScreen(channel);
  const game = view && view.kind === 'arcade' ? loadGame(view.id) : null;
  const key = view && (view.kind === 'arcade' ? view.id : view.roundId);
  if (!view || (view.kind === 'arcade' && !game) || (view.kind !== 'arcade' && view.kind !== 'match')) {
    current = null;
    empty(WAITING);
    return;
  }
  const same = Boolean(current && current.kind === view.kind && current.key === key);
  if (!same) resetBoard();
  current = { kind: view.kind, key };
  let shown = true;
  if (view.kind === 'arcade') shown = showArcade(game, same);
  else showMatch(view, same);
  if (!shown) {
    current = null;
    empty(WAITING);
  }
}

$('fsBtn').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
};
document.addEventListener('fullscreenchange', () => {
  $('fsBtn').classList.toggle('hidden', Boolean(document.fullscreenElement));
});
// the text that fits depends on the window, which changes going full screen
window.addEventListener('resize', () => {
  layoutTiles();
  if (current) (current.kind === 'arcade' ? refitArcade : refitMatch)();
});

if (!channel) {
  empty('Open this window with the "Scoreboard window" button in the reader or the Octopus Arcade.');
} else {
  follow();
  watchScreen(channel, follow);
  // an arcade game saves itself without its tab showing anything new
  onGameSaved((id, game) => {
    if (!game) return;
    if (current && current.kind === 'arcade' && current.key === id) showArcade(game, true);
    else if (readScreen(channel)?.id === id) follow();
  });
  setInterval(() => {
    if (current) (current.kind === 'arcade' ? tickArcade : tickMatch)();
  }, 100);
}
