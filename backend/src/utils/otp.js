'use strict';

/**
 * otp.js — HMAC-SHA256 stored OTPs with expiry, attempt limits, and resend cooldown.
 * In-memory Map is process-local. Use Redis for multi-instance production.
 */

const crypto = require('crypto');
const env = require('../config/env');

const _store = new Map();

function expiryMs() {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60 * 1000;
}

const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

function pepper() {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update('cyber-shield-ai:otp-hmac:v1')
    .digest();
}

function hashOtp(otp, email, scope) {
  return crypto
    .createHmac('sha256', pepper())
    .update(`${scope}:${String(email).toLowerCase()}:${otp}`)
    .digest('hex');
}

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function storeOtp(email, scope) {
  const key = `${scope}:${String(email).toLowerCase()}`;
  const existing = _store.get(key);
  if (existing && Date.now() < existing.resendAfter) {
    const retryAfter = Math.ceil((existing.resendAfter - Date.now()) / 1000);
    return { ok: false, error: `Please wait ${retryAfter} seconds before requesting a new code.`, retryAfter };
  }

  const otp = generateOtp();
  _store.set(key, {
    hash: hashOtp(otp, email, scope),
    expiresAt: Date.now() + expiryMs(),
    attempts: 0,
    resendAfter: Date.now() + RESEND_COOLDOWN_MS,
  });
  return { ok: true, otp };
}

function verifyOtp(email, scope, candidate) {
  const key = `${scope}:${String(email).toLowerCase()}`;
  const entry = _store.get(key);

  if (!entry) return { ok: false, error: 'No OTP found. Please request a new one.' };
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return { ok: false, error: 'OTP has expired. Please request a new one.' };
  }
  entry.attempts += 1;
  if (entry.attempts > MAX_ATTEMPTS) {
    _store.delete(key);
    return { ok: false, error: 'Too many incorrect attempts. Please request a new OTP.' };
  }

  const expected = Buffer.from(entry.hash, 'hex');
  const actual = Buffer.from(hashOtp(String(candidate).trim(), email, scope), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, error: `Incorrect OTP. ${MAX_ATTEMPTS - entry.attempts} attempt(s) remaining.` };
  }

  _store.delete(key);
  return { ok: true };
}

function clearOtp(email, scope) {
  _store.delete(`${scope}:${String(email).toLowerCase()}`);
}

function resetOtpStoreForTests() {
  _store.clear();
}

module.exports = { storeOtp, verifyOtp, clearOtp, resetOtpStoreForTests };
