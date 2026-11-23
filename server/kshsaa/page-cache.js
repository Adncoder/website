// Keeps what a tab's data request worked out until the data under it changes.
// The Overview, Insights, and Tournaments tabs each work their numbers out
// from every game, which takes Render's small server a few seconds, so
// opening one again would otherwise mean waiting again.
//
// Any POST to the stats, tournaments, or question bank routes counts as a
// change once it finishes (noteChanges): saving or editing a game, the
// roster, the squads, notes, a question. It bumps a counter here at once, and
// one in the database, so the backup site, which shares the database, works
// its numbers out again too. A kept result also expires after an hour.
//
// It takes the collection that holds the counter (kshsaa_settings), so tests
// can pass a stand-in.

const COUNTER = 'dataVersion';

/**
 * @param {object} store - a collection with findOne and updateOne
 * @param {{maxEntries?: number, maxAgeMs?: number, now?: function(): number}} [options]
 * @returns {{get: function(string, function(): (object|Promise<object>)): Promise<object>,
 *   noteChanges: function(object, object, function): void}}
 */
export function makePageCache (store, { maxEntries = 24, maxAgeMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const kept = new Map();
  // changes made through this server, counted before the database's counter
  // can be read back
  let local = 0;

  const version = async () => {
    const doc = await store.findOne({ _id: COUNTER });
    return (doc?.version ?? 0) + ':' + local;
  };

  return {
    /**
     * What compute() works out for key: kept from before when nothing has
     * changed since, else worked out now. Requests that arrive while it is
     * being worked out share the one result.
     */
    async get (key, compute) {
      const v = await version();
      const hit = kept.get(key);
      if (hit && hit.version === v && now() - hit.at < maxAgeMs) return hit.value;
      const value = Promise.resolve().then(compute);
      kept.delete(key);
      kept.set(key, { version: v, at: now(), value });
      // the oldest goes first once there are too many
      while (kept.size > maxEntries) kept.delete(kept.keys().next().value);
      // a failure is not kept, so the next request tries again
      value.catch(() => { if (kept.get(key)?.value === value) kept.delete(key); });
      return value;
    },

    /** Express middleware: after any POST, whatever was kept is out of date. */
    noteChanges (req, res, next) {
      if (req.method !== 'POST') return next();
      // once the reply is sent, or the browser gave up on it, which can
      // still leave a change made
      let counted = false;
      const count = () => {
        if (counted) return;
        counted = true;
        local++;
        Promise.resolve(store.updateOne({ _id: COUNTER }, { $inc: { version: 1 } }, { upsert: true })).catch(() => {});
      };
      res.on('finish', count);
      res.on('close', count);
      next();
    }
  };
}
