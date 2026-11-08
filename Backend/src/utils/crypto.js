// Backend/src/utils/crypto.js
const crypto = require('crypto');
const createError = require('http-errors');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  const raw = process.env.AKULAKU_ENC_KEY;
  if (!raw) {
    throw createError(500, 'AKULAKU_ENC_KEY is not configured');
  }
  // Derive a stable 32-byte key from the configured secret.
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a plaintext string. Returns `iv:authTag:ciphertext` (all base64).
 */
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * Decrypt a value produced by encryptSecret.
 */
function decryptSecret(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw createError(500, 'Malformed encrypted secret');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
