'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { isRevoked } = require('../utils/tokenRevocation');
const { securityLog } = require('../utils/securityLog');

function verifyOptions() {
  const opts = { algorithms: ['HS256'] };
  if (env.jwtIssuer) opts.issuer = env.jwtIssuer;
  if (env.jwtAudience) opts.audience = env.jwtAudience;
  return opts;
}

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.jwtSecret, verifyOptions());
    if (
      payload.tokenUse !== 'access' ||
      typeof payload.sub !== 'string' || !payload.sub.trim() ||
      typeof payload.email !== 'string' || !payload.email.trim() ||
      !['user', 'admin'].includes(payload.role) ||
      !Number.isFinite(payload.exp)
    ) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    if (isRevoked(payload.jti)) {
      securityLog('auth.token_revoked', { sub: payload.sub }, req);
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    req.user = {
      _id: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti,
      exp: payload.exp,
      tv: payload.tv || 0,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      securityLog('authz.denied', { role: req.user.role, need: roles }, req);
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, verifyOptions };
