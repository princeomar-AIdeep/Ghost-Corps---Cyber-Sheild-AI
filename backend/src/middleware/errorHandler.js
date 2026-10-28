'use strict';

const env = require('../config/env');

function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join('; ') });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }

  const status = err.statusCode || err.status || 500;
  const isProd = env.nodeEnv === 'production';
  const body = {
    error: status >= 500 && isProd ? 'Internal server error.' : (err.message || 'Internal server error.'),
  };

  if (req.correlationId) body.correlationId = req.correlationId;

  if (env.nodeEnv === 'development' && err.stack) {
    body.stack = err.stack;
  }

  if (status >= 500) {
    console.error('[error]', { correlationId: req.correlationId, message: err.message });
  }

  res.status(status).json(body);
}

module.exports = errorHandler;
