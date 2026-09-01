import { users } from './collections.js';

/**
 * Records the timestamp of the one-time emailed link most recently issued to a
 * user. Overwriting it is what invalidates any earlier link, so only the newest
 * email ever works.
 *
 * This lives on the user document rather than in server memory so that a link
 * still works after the server restarts (it restarts daily) and on whichever
 * instance happens to serve the click.
 * @param {ObjectId} userId
 * @param {string} field - the user-document field holding this kind of token
 * @param {number} timestamp - milliseconds since the epoch
 * @returns {Promise<boolean>} true if the user exists and the token was stored
 */
async function setEmailToken (userId, field, timestamp) {
  const result = await users.updateOne(
    { _id: userId },
    { $set: { [field]: timestamp } }
  );
  return result.matchedCount === 1;
}

export default setEmailToken;
