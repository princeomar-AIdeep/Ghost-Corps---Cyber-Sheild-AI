'use strict';

const morgan = require('morgan');
const env = require('../config/env');

/**
 * Creates an HTTP request logger using morgan.
 *
 * - Development: 'dev' format (coloured, concise)
 * - Production:  'combined' format (Apache-style, for log aggregation)
 *
 * Sensitive headers (Authorization, Cookie) are never logged —
 * morgan only logs request-line, status, size, and timing.
 */
function isSensitiveOAuthCallback(req) {
  const requestTarget = req.originalUrl || req.url || '';
  return /^\/api\/(?:v1\/)?github\/callback(?:\?|$)/.test(requestTarget)
    || /^\/api\/(?:v1\/)?preview-access\/[A-Za-z0-9_-]{43}(?:\/|\?|$)/.test(requestTarget);
}

const httpLogger = morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', {
  skip: isSensitiveOAuthCallback,
});

module.exports = {
  httpLogger,
  isSensitiveOAuthCallback,
};
