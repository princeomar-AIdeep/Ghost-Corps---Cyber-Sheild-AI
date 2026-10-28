'use strict';

/**
 * Environment configuration — validates required variables at startup.
 */

// Yahan 'GEMINI_API_KEY' add kar diya hai taaki key miss na ho
const REQUIRED = ['MONGO_URI', 'PORT', 'GEMINI_API_KEY'];
const nodeEnv = process.env.NODE_ENV || 'production';
const validNodeEnvs = ['development', 'test', 'production'];

if (!validNodeEnvs.includes(nodeEnv)) {
  console.error('[env] NODE_ENV must be development, test, or production.');
  process.exit(1);
}

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[env] Missing required environment variables: ${missing.join(', ')}\n` +
    `      Copy backend/.env.example to backend/.env and fill in the values.`
  );
  process.exit(1);
}

function isStrongProductionSecret(secret) {
  if (typeof secret !== 'string' || !/^(?:[a-f\d]{2}){32}$/i.test(secret)) return false;

  const normalized = secret.toLowerCase();
  if (/(placeholder|replace|change.?me|your.?secret|example|default)/i.test(normalized)) return false;

  const bytes = Buffer.from(normalized, 'hex');
  if (new Set(bytes).size < 16) return false;

  for (let blockLength = 1; blockLength <= bytes.length / 2; blockLength += 1) {
    if (bytes.length % blockLength !== 0) continue;
    const block = bytes.subarray(0, blockLength);
    let repeats = true;
    for (let offset = blockLength; offset < bytes.length; offset += blockLength) {
      if (!bytes.subarray(offset, offset + blockLength).equals(block)) {
        repeats = false;
        break;
      }
    }
    if (repeats) return false;
  }

  const ascends = bytes.every((byte, index) => byte === ((bytes[0] + index) & 0xff));
  const descends = bytes.every((byte, index) => byte === ((bytes[0] - index + 256) & 0xff));
  return !ascends && !descends;
}

let jwtSecret = process.env.JWT_SECRET;
if (nodeEnv === 'production') {
  if (!isStrongProductionSecret(jwtSecret)) {
    console.error('[env] Production JWT_SECRET must be exactly 64 hexadecimal characters from a cryptographically secure random source.');
    process.exit(1);
  }
} else if (!jwtSecret) {
  const crypto = require('crypto');
  jwtSecret = crypto.randomBytes(64).toString('hex');
  console.warn(
    '[env] WARNING: JWT_SECRET not set. Using a random in-memory secret.\n' +
    '      All sessions will be invalidated on server restart.\n' +
    '      Set JWT_SECRET in backend/.env for persistent sessions.'
  );
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI,
  nodeEnv,

  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtIssuer: process.env.JWT_ISSUER || null,
  jwtAudience: process.env.JWT_AUDIENCE || null,

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || null,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
};