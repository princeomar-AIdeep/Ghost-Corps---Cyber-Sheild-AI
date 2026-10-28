'use strict';

/**
 * In-process JWT revocation list (jti → expiry ms).
 * Suitable for a single Node process. Multi-instance deployments need Redis.
 */

const revoked = new Map();

function sweep() {
  const now = Date.now();
  for (const [jti, expMs] of revoked) {
    if (expMs <= now) revoked.delete(jti);
  }
}

function revokeJti(jti, expUnixSeconds) {
  if (!jti) return;
  const expMs = typeof expUnixSeconds === 'number'
    ? expUnixSeconds * 1000
    : Date.now() + 7 * 24 * 60 * 60 * 1000;
  revoked.set(jti, expMs);
}

function isRevoked(jti) {
  if (!jti) return false;
  const expMs = revoked.get(jti);
  if (!expMs) return false;
  if (expMs <= Date.now()) {
    revoked.delete(jti);
    return false;
  }
  return true;
}

function resetRevocationsForTests() {
  revoked.clear();
}

setInterval(sweep, 60 * 1000).unref?.();

module.exports = { revokeJti, isRevoked, resetRevocationsForTests };
