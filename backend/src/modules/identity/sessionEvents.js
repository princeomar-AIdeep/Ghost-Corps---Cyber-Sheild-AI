'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AuthSession = require('../../models/AuthSession');
const env = require('../../config/env');
const { securityLog } = require('../../utils/securityLog');

function hashHint(value) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 32);
}

function deviceLabelFromUserAgent(userAgent) {
  const ua = String(userAgent || '');
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return 'Unknown browser';
}

function clientIp(req) {
  return req.socket?.remoteAddress || req.ip || '';
}

async function recordAuthEvent(req, {
  userId,
  token,
  event,
  expiresAt = null,
} = {}) {
  try {
    let jti = typeof req.user?.jti === 'string' ? req.user.jti : '';
    let tokenExp = expiresAt;
    if (token && !jti) {
      const payload = jwt.decode(token);
      if (payload && typeof payload.jti === 'string') jti = payload.jti;
      if (!tokenExp && Number.isFinite(payload?.exp)) tokenExp = new Date(payload.exp * 1000);
    }
    if (event === 'login_failed' && !jti) jti = `failed:${crypto.randomUUID()}`;
    if (!userId || !jti) return;
    await AuthSession.create({
      userId,
      jti,
      event,
      ipHash: hashHint(clientIp(req)),
      userAgentHash: hashHint(req.get('user-agent')),
      deviceLabel: deviceLabelFromUserAgent(req.get('user-agent')),
      expiresAt: tokenExp,
      revokedAt: event === 'logout' || event === 'revoked' ? new Date() : null,
    });
  } catch (error) {
    securityLog('session.record_failed', { event }, req);
    void error;
  }
}

module.exports = { recordAuthEvent, deviceLabelFromUserAgent, hashHint };
