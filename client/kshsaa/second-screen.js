// The second screen: a scoreboard window for the projector that follows one
// tab and shows whatever that tab is running, a normal round in the reader or
// a game in the Octopus Arcade. The tab writes what to show to localStorage
// under its channel, and the window (scoreboard/page.js) redraws on the storage
// event. The channel lives in sessionStorage, so it survives a reload, "Next
// round with these teams", and a move from the reader to the arcade tab, and
// the window keeps following. Same browser on the same computer only.

const CHANNEL = 'kshsaa-screen-channel';
const SCREEN = 'kshsaa-screen:';
// what a tab last showed is cleared out once it is this old
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

// storage can be missing or refuse (private windows, a full quota), and a round
// has to go on without its second screen either way
function area (name) {
  try { return window[name]; } catch (e) { return null; }
}

function clearOld (storage) {
  const now = Date.now();
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(SCREEN)) keys.push(key);
  }
  for (const key of keys) {
    let at = 0;
    try { at = JSON.parse(storage.getItem(key)).at || 0; } catch (e) {}
    if (now - at > KEEP_MS) storage.removeItem(key);
  }
}

/** This tab's channel, made the first time it is asked for. */
export function screenChannel () {
  const session = area('sessionStorage');
  let channel = null;
  try { channel = session.getItem(CHANNEL); } catch (e) {}
  if (!channel) {
    channel = Math.random().toString(36).slice(2, 10);
    try {
      session.setItem(CHANNEL, channel);
      clearOld(area('localStorage'));
    } catch (e) {}
  }
  return channel;
}

export const screenUrl = () => '/kshsaa-scoreboard?channel=' + encodeURIComponent(screenChannel());

/**
 * Opens this tab's scoreboard window, or brings it back if it is open.
 * @returns {boolean} false if the browser blocked it
 */
export function openScreen () {
  return Boolean(window.open(screenUrl(), 'kshsaa-screen-' + screenChannel(), 'popup,width=1280,height=760'));
}

/**
 * Puts something on this tab's scoreboard window.
 * @param {{kind: 'match'|'arcade'}} view - a reader's round as page.js reads
 *   it, or { kind: 'arcade', id } for an arcade game, which the window loads
 *   from the arcade's own storage
 */
export function showOnScreen (view) {
  try {
    area('localStorage').setItem(SCREEN + screenChannel(), JSON.stringify({ ...view, at: Date.now() }));
  } catch (e) {}
}

/** What a channel shows, or null. */
export function readScreen (channel) {
  try {
    return JSON.parse(area('localStorage').getItem(SCREEN + channel) || 'null');
  } catch (e) {
    return null;
  }
}

/** Calls back whenever the channel's tab shows something new. */
export function watchScreen (channel, onChange) {
  window.addEventListener('storage', e => {
    if (e.key === SCREEN + channel) onChange();
  });
}
