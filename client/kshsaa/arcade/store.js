// Keeping arcade games in this browser, so a refresh never loses one, and
// telling the scoreboard window what changed. Games sit in localStorage keyed
// by id, so two arcade tabs running two rooms stay apart. Each tab remembers
// its own game in sessionStorage (which survives a refresh), and has its own
// channel: the scoreboard window it opened follows that channel to whichever
// game the tab has open, so a new game shows up on the projector by itself.

const GAME = 'kshsaa-arcade-game:';
const CHANNEL = 'kshsaa-arcade-channel:';
const SETUP = 'kshsaa-arcade-setup';
const MY_GAME = 'kshsaa-arcade-current';
const MY_CHANNEL = 'kshsaa-arcade-my-channel';
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

/** This tab's channel to its scoreboard window. */
export function myChannel () {
  let channel = read(area('sessionStorage'), MY_CHANNEL);
  if (!channel) {
    channel = Math.random().toString(36).slice(2, 10);
    write(area('sessionStorage'), MY_CHANNEL, channel);
  }
  return channel;
}

export const pointChannel = (channel, id) => write(area('localStorage'), CHANNEL + channel, id);
export const channelGameId = channel => read(area('localStorage'), CHANNEL + channel);

/**
 * Calls back with the channel's game whenever its console saves it or opens
 * another one. The storage event fires only in the other windows, which is
 * exactly the scoreboard's case.
 * @param {string} channel
 * @param {(game: ?import('./engine.js').Game) => void} onGame
 */
export function watchChannel (channel, onGame) {
  window.addEventListener('storage', e => {
    if (e.key === CHANNEL + channel) onGame(loadGame(channelGameId(channel)));
    else if (e.key === GAME + channelGameId(channel) && e.newValue) onGame(read(area('localStorage'), e.key));
  });
}

export const loadSetup = () => read(area('localStorage'), SETUP);
export const saveSetup = setup => write(area('localStorage'), SETUP, setup);
