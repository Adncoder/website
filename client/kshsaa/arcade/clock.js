// The answer clock and Lightning Round's game clock, kept as plain data so they
// save with the game and the scoreboard window can run its own copy: the time
// left when the clock last stopped, and when it started running since.

/**
 * @typedef {object} Clock
 * @property {number} limit - ms it resets to
 * @property {number} left - ms left when it last stopped
 * @property {?number} since - Date.now() when it started running, null while stopped
 */

/** @returns {Clock} */
export const newClock = ms => ({ limit: ms, left: ms, since: null });

/** @returns {number} ms left */
export const clockLeft = (clock, now = Date.now()) =>
  clock.since == null ? clock.left : Math.max(0, clock.left - (now - clock.since));

export const stopClock = (clock, now = Date.now()) => ({ ...clock, left: clockLeft(clock, now), since: null });

/** Starts it, from the top if it had run out. */
export function startClock (clock, now = Date.now()) {
  if (clock.since != null) return clock;
  return { ...clock, left: clock.left > 0 ? clock.left : clock.limit, since: now };
}

/** Adds time, leaving it running or stopped as it was. */
export function addTime (clock, ms, now = Date.now()) {
  return { ...clock, left: clockLeft(clock, now) + ms, since: clock.since == null ? null : now };
}

/** "8.2" for the answer clock, "2:41" for anything a minute or longer. */
export function formatClock (ms) {
  if (ms < 60000) return (Math.ceil(ms / 100) / 10).toFixed(1);
  const seconds = Math.ceil(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
