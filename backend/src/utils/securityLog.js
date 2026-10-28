'use strict';

/**
 * Structured security-event logger. Never log secrets, OTPs, tokens, or raw PII.
 */

const SENSITIVE = /password|token|otp|secret|authorization|api[_-]?key|cookie/i;

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return SENSITIVE.test(value) ? '[redacted]' : value.replace(/[\r\n\t]+/g, ' ').slice(0, 500);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function securityLog(event, details = {}, req) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    correlationId: req?.correlationId || null,
    ...redact(details),
  };
  console.log('[security]', JSON.stringify(payload));
}

module.exports = { securityLog, redact };
