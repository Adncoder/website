import banList from './moderation/banned-usernames.js';
import { sendEmail } from './email.js';

import getUserField from '../database/account-info/get-user-field.js';
import getUserId from '../database/account-info/get-user-id.js';
import consumeEmailToken from '../database/account-info/consume-email-token.js';
import setEmailToken from '../database/account-info/set-email-token.js';
import updateUser from '../database/account-info/update-user.js';
import verifyEmail from '../database/account-info/verify-email.js';

import { createHash } from 'crypto';
import jsonwebtoken from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
const { sign, verify } = jsonwebtoken;

const baseURL = process.env.BASE_URL ?? (process.env.NODE_ENV === 'production' ? 'https://www.qbreader.org' : 'http://localhost:3000');

const salt = process.env.SALT ? process.env.SALT : 'salt';
const secret = process.env.SECRET ? process.env.SECRET : 'secret';

/**
 * Fields on the user document holding the timestamp of the most recent emailed
 * link of each kind. The timestamp proves the link was clicked within 15
 * minutes and that it is the newest link issued; storing it on the document
 * rather than in server memory is what lets a link survive a server restart
 * (this server restarts daily) and work on any instance.
 */
const VERIFY_EMAIL_FIELD = 'verifyEmailTokenTimestamp';
const RESET_PASSWORD_FIELD = 'resetPasswordTokenTimestamp';

/** How long an emailed link stays usable. */
const LINK_EXPIRATION_TIME = 1000 * 60 * 15; // 15 minutes

/**
 * Checks a one-time link's signature and that it is addressed to this user.
 * @param {String} userId
 * @param {String} token
 * @returns {Number | null} the timestamp the link carries, or null if invalid.
 */
function decodeLinkTimestamp (userId, token) {
  return verify(token, secret, (err, decoded) => {
    if (err) {
      return null;
    }

    const timestamp = parseInt(decoded.timestamp);
    if (isNaN(timestamp)) {
      return null;
    }

    if (decoded.user_id !== userId) {
      return null;
    }

    return timestamp;
  });
}

/**
 * Spends a one-time link: confirms it is the live one for this user and clears
 * it, then applies the expiry window. An expired link is still spent, so it
 * cannot be replayed.
 * @param {String} userId
 * @param {String} token
 * @param {String} field
 * @returns {Promise<ObjectId | null>} the user's id if the link was good.
 */
async function consumeLink (userId, token, field) {
  const timestamp = decodeLinkTimestamp(userId, token);
  if (timestamp === null) {
    return null;
  }

  let id;
  try { id = new ObjectId(userId); } catch (e) { return null; }

  if (!await consumeEmailToken(id, field, timestamp)) {
    return null;
  }

  if (Date.now() - timestamp > LINK_EXPIRATION_TIME) {
    return null;
  }

  return id;
}

/**
 * Check whether or not the given username and password are valid.
 * @param {String} username - username of the user you are trying to retrieve.
 * @param {String} password - plaintext password to check.
 * @returns {Promise<Boolean>}
 */
export async function checkPassword (username, password) {
  return await getUserField(username, 'password') === saltAndHashPassword(password);
}

/**
 * Checks that the token is valid and stores the corrent username.
 * `checkToken` guarantees that the username is in the database if the token is valid.
 * @param {String} username
 * @param {String} token
 * @returns {Boolean} True if the token is valid, and false otherwise.
 */
export function checkToken (username, token, checkEmailVerification = false) {
  return verify(token, secret, (err, decoded) => {
    if (err) {
      return false;
    } else {
      return (decoded.username === username) && (!checkEmailVerification || decoded.verifiedEmail);
    }
  });
}

/**
 * Creates a new token for the given username.
 * This token may be used for authentication purposes.
 * @param {String} username
 * @returns A JWT token.
 */
export function generateToken (username, verifiedEmail = false) {
  return sign({ username, verifiedEmail }, secret, { expiresIn: '7d' });
}

/**
 *
 * @param {String} password
 * @returns Base64 encoded hashed password.
 */
export function saltAndHashPassword (password) {
  password = salt + password + salt;
  const hash = createHash('sha256').update(password).digest('base64');
  const hash2 = createHash('sha256').update(hash).digest('base64');
  const hash3 = createHash('sha256').update(hash2).digest('base64');
  return hash3;
}

export async function sendResetPasswordEmail (username) {
  const email = await getUserField(username, 'email');
  const userId = await getUserId(username);
  if (!userId || !email) {
    return false;
  }

  const timestamp = Date.now();
  const token = sign({ user_id: userId, timestamp }, secret);
  const url = `${baseURL}/auth/verify-reset-password?user_id=${userId}&token=${token}`;

  const info = await sendEmail({
    to: email,
    subject: 'QBReader: Reset your password',
    text: `Click this link to reset your password: ${url} This link will expire in 15 minutes. Only the most recent link will work. If you did not request this email, please ignore it. Do not reply to this email; this inbox is unmonitored.`,
    html: `<p>Click this link to reset your password: <a href="${url}">${url}</a></p> <p>This link will expire in 15 minutes. Only the most recent link will work. If you did not request this email, please ignore it.</p> <i>Do not reply to this email; this inbox is unmonitored.</i>`
  });

  if (!info) {
    return false;
  }

  // console.log(`Email sent: ${info.response}`);
  return await setEmailToken(userId, RESET_PASSWORD_FIELD, timestamp);
}

export async function sendVerificationEmail (username) {
  const email = await getUserField(username, 'email');
  const userId = await getUserId(username);
  if (!userId || !email) {
    return false;
  }

  const timestamp = Date.now();
  const token = sign({ user_id: userId, timestamp }, secret);
  const url = `${baseURL}/auth/verify-email?user_id=${userId}&token=${token}`;

  const info = await sendEmail({
    to: email,
    subject: 'QBReader: Verify your email address',
    text: `Click this link to verify your email address: ${url} This link will expire in 15 minutes. Only the most recent link will work. If you did not request this email, please ignore it. Do not reply to this email; this inbox is unmonitored.`,
    html: `<p>Click this link to verify your email address: <a href="${url}">${url}</a></p> <p>This link will expire in 15 minutes. Only the most recent link will work. If you did not request this email, please ignore it.</p> <i>Do not reply to this email; this inbox is unmonitored.</i>`
  });

  if (!info) {
    return false;
  }

  // console.log(`Email sent: ${info.response}`);
  return await setEmailToken(userId, VERIFY_EMAIL_FIELD, timestamp);
}

export function updatePassword (username, newPassword) {
  return updateUser(username, { password: saltAndHashPassword(newPassword) });
}

/**
 *
 * @param {string} email
 * @returns {boolean} True if the email is valid, and false otherwise.
 */
export function validateEmail (email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 *
 * @param {string} username
 * @returns {boolean} True if the username is valid, and false otherwise.
 */
export function validateUsername (username) {
  if (!username || typeof username !== 'string') {
    return false;
  }

  if (banList.includes(username.toLowerCase())) {
    return false;
  }

  if (username.length < 1 || username.length > 20) {
    return false;
  }

  // TODO: put more validation here

  return true;
}

/**
 * @param {String} userId
 * @param {String} token
 * @returns {Promise<Boolean>} true once the address is marked verified.
 */
export async function verifyEmailLink (userId, token) {
  const id = await consumeLink(userId, token, VERIFY_EMAIL_FIELD);
  if (!id) {
    return false;
  }

  // awaited, so the caller never reports success for a write that failed
  const result = await verifyEmail(id);
  return result.matchedCount === 1;
}

/**
 * @param {String} userId
 * @param {String} token
 * @returns {Promise<Boolean>}
 */
export async function verifyResetPasswordLink (userId, token) {
  return Boolean(await consumeLink(userId, token, RESET_PASSWORD_FIELD));
}
