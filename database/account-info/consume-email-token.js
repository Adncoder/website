import { users } from './collections.js';

/**
 * Atomically checks that the given one-time link is the live one for this user
 * and clears it in the same operation, so a link is usable at most once even if
 * it is clicked twice at the same moment.
 * @param {ObjectId} userId
 * @param {string} field - the user-document field holding this kind of token
 * @param {number} timestamp - the timestamp carried by the link being checked
 * @returns {Promise<boolean>} true if the link was the live one and is now spent
 */
async function consumeEmailToken (userId, field, timestamp) {
  const result = await users.updateOne(
    { _id: userId, [field]: timestamp },
    { $unset: { [field]: '' } }
  );
  return result.modifiedCount === 1;
}

export default consumeEmailToken;
