'use strict';

const crypto = require('crypto');

const ID_RE = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Attach a request correlation ID. Incoming X-Request-Id is accepted only
 * if it matches a conservative charset (prevents log injection).
 */
function correlationId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && ID_RE.test(incoming)
    ? incoming
    : crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { correlationId };
