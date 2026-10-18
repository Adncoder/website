// Keeping arcade games in this browser, so a refresh never loses one. Games
// sit in localStorage keyed by id, so two arcade tabs running two rooms stay
// apart, and each tab remembers its own game in sessionStorage, which survives
// a refresh. Which game the projector shows is second-screen.js's job; the
// scoreboard window hears each save through onGameSaved.

const GAME = 'kshsaa-arcade-game:';
const SETUP = 'kshsaa-arcade-setup';
const MY_GAME = 'kshsaa-arcade-current';
// games untouched this long are cleared out
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

// storage can be missing or refuse (private windows, full quota), and the
// arcade has to keep running either way
function area (name) {
  try { return window[name]; } catch (e) { return null; }
}

function read (storage, key) {
  try {
    const text = storage && storage.getItem(key);
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return null;
  }
}

function write (storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function remove (storage, key) {
  try { storage.removeItem(key); } catch (e) {}
}

/** @returns {?import('./engine.js').Game} */
export const loadGame = id => read(area('localStorage'), GAME + id);
/** @returns {boolean} false if it could not be saved */
export const saveGame = game => write(area('localStorage'), GAME + game.id, game);
export const forgetGame = id => remove(area('localStorage'), GAME + id);

/**
 * Every saved game, newest first.
 * @returns {import('./engine.js').Game[]}
 */
export function savedGames (now = Date.now()) {
  const storage = area('localStorage');
  if (!storage) return [];
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(GAME)) keys.push(key);
  }
  const games = [];
  for (const key of keys) {
    const game = read(storage, key);
    if (!game || now - (game.updatedAt || 0) > KEEP_MS) remove(storage, key);
    else games.push(game);
  }
  return games.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const myGameId = () => read(area('sessionStorage'), MY_GAME);
export const setMyGameId = id => id ? write(area('sessionStorage'), MY_GAME, id) : remove(area('sessionStorage'), MY_GAME);

/**
 * Calls back whenever another window saves a game. The storage event fires
 * only in the other windows, which is exactly the scoreboard's case.
 * @param {(id: string, game: ?import('./engine.js').Game) => void} onGame
 */
export function onGameSaved (onGame) {
  window.addEventListener('storage', e => {
    if (e.key && e.key.startsWith(GAME) && e.newValue) onGame(e.key.slice(GAME.length), read(area('localStorage'), e.key));
  });
}

export const loadSetup = () => read(area('localStorage'), SETUP);
export const saveSetup = setup => write(area('localStorage'), SETUP, setup);
