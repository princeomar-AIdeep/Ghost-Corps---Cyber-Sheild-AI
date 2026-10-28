'use strict';

const mongoose = require('mongoose');
const AccessPolicy = require('../../models/AccessPolicy');
const AuthSession = require('../../models/AuthSession');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');

const RANGE_MS = {
  today: () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  },
  week: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  month: () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  all: () => new Date(0),
};

function rangeStart(range) {
  const key = String(range || 'week').toLowerCase();
  const resolver = RANGE_MS[key] || RANGE_MS.week;
  return resolver();
}

function ownerQuery(req) {
  return { userId: req.user._id };
}

function publicPolicy(doc) {
  return {
    _id: doc._id,
    name: doc.name,
    description: doc.description || '',
    effect: doc.effect,
    resource: doc.resource,
    enabled: doc.enabled,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function publicSession(doc) {
  return {
    _id: doc._id,
    event: doc.event,
    deviceLabel: doc.deviceLabel,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt,
    current: Boolean(doc.jti && doc.jti === doc.currentJti),
  };
}

const getOverview = asyncHandler(async (req, res) => {
  const since = rangeStart(req.validatedQuery?.range);
  const userId = req.user._id;
  const filter = { userId, createdAt: { $gte: since } };

  const [user, loginCount, failedCount, logoutCount, activeSessionCount, policyCount, trustedDeviceCount] = await Promise.all([
    User.findById(userId).select('email role displayName assistantName createdAt').lean(),
    AuthSession.countDocuments({ ...filter, event: 'login' }),
    AuthSession.countDocuments({ ...filter, event: 'login_failed' }),
    AuthSession.countDocuments({ ...filter, event: 'logout' }),
    AuthSession.countDocuments({
      userId,
      event: 'login',
      revokedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }),
    AccessPolicy.countDocuments({ userId, enabled: true }),
    AuthSession.distinct('userAgentHash', { userId, event: 'login' }),
  ]);

  if (!user) return res.status(404).json({ error: 'User not found.' });

  res.json({
    source: 'account_records',
    capability: 'rules_based',
    note: 'These figures are limited to the signed-in account. They are not an enterprise identity provider or network IDS.',
    range: req.validatedQuery?.range || 'week',
    statistics: {
      totalUsers: 1,
      activeSessions: activeSessionCount,
      blockedAccessAttempts: failedCount,
      trustedDevices: Array.isArray(trustedDeviceCount) ? trustedDeviceCount.filter(Boolean).length : 0,
      networkAnomalies: 0,
    },
    authenticationMethods: [
      { method: 'Password', count: loginCount, available: true },
      { method: 'Multi-Factor Authentication', count: 0, available: false, note: 'OTP can be required via REQUIRE_OTP_LOGIN; it is not a separate enrolled authenticator store.' },
      { method: 'SSO (Single Sign-On)', count: 0, available: false },
      { method: 'Biometric', count: 0, available: false },
      { method: 'API Tokens', count: 0, available: false, note: 'Access uses short-lived JWTs, not a stored API-token inventory.' },
    ],
    accessOverview: {
      activeUsers: 1,
      inactiveUsers: 0,
      privilegedUsers: user.role === 'admin' ? 1 : 0,
      externalUsers: 0,
      blockedUsers: 0,
    },
    activityCounts: { login: loginCount, logout: logoutCount, login_failed: failedCount },
    enabledPolicies: policyCount,
  });
});

const listSessions = asyncHandler(async (req, res) => {
  const sessions = await AuthSession.find(ownerQuery(req))
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({
    source: 'account_records',
    sessions: sessions.map((session) => publicSession({ ...session, currentJti: req.user.jti })),
  });
});

const listActivity = asyncHandler(async (req, res) => {
  const since = rangeStart(req.validatedQuery?.range);
  const events = await AuthSession.find({ ...ownerQuery(req), createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({
    source: 'account_records',
    activity: events.map((event) => ({
      time: event.createdAt,
      user: req.user.email,
      action: event.event,
      resource: 'identity',
      status: event.event === 'login_failed' ? 'blocked' : event.revokedAt ? 'revoked' : 'ok',
      deviceLabel: event.deviceLabel,
    })),
  });
});

const listPolicies = asyncHandler(async (req, res) => {
  const policies = await AccessPolicy.find(ownerQuery(req)).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ source: 'account_records', policies: policies.map(publicPolicy) });
});

const createPolicy = asyncHandler(async (req, res) => {
  const policy = await AccessPolicy.create({
    userId: req.user._id,
    name: req.body.name,
    description: req.body.description || '',
    effect: req.body.effect || 'allow',
    resource: req.body.resource || 'workspace',
    enabled: req.body.enabled !== false,
  });
  res.status(201).json(publicPolicy(policy));
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policyId = req.params.policyId;
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }
  const updates = {};
  for (const key of ['name', 'description', 'effect', 'resource', 'enabled']) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update.' });
  }
  const policy = await AccessPolicy.findOneAndUpdate(
    { _id: policyId, userId: req.user._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!policy) return res.status(404).json({ error: 'Access policy not found.' });
  res.json(publicPolicy(policy));
});

const deletePolicy = asyncHandler(async (req, res) => {
  const policyId = req.params.policyId;
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    return res.status(400).json({ error: 'Invalid ID format.' });
  }
  const policy = await AccessPolicy.findOneAndDelete({ _id: policyId, userId: req.user._id });
  if (!policy) return res.status(404).json({ error: 'Access policy not found.' });
  res.json({ message: 'Access policy deleted.' });
});

const getZeroTrust = asyncHandler(async (req, res) => {
  const remaining = Number.isFinite(req.user.exp)
    ? Math.max(0, req.user.exp - Math.floor(Date.now() / 1000))
    : null;
  const currentSession = req.user.jti
    ? await AuthSession.findOne({ userId: req.user._id, jti: req.user.jti, event: 'login' }).lean()
    : null;
  const denyPolicies = await AccessPolicy.countDocuments({
    userId: req.user._id,
    enabled: true,
    effect: 'deny',
    resource: { $in: ['identity', 'workspace'] },
  });

  const checks = [
    { id: 'authenticated', passed: true, detail: 'A valid access token was presented.' },
    { id: 'token_purpose', passed: true, detail: 'Token use is restricted to access.' },
    { id: 'token_not_expired', passed: remaining === null || remaining > 0, detail: remaining === null ? 'Expiry could not be determined.' : `Token remaining lifetime is ${remaining} seconds.` },
    { id: 'session_recorded', passed: Boolean(currentSession), detail: currentSession ? 'This token identifier has a recorded login session.' : 'No login session record exists for this token yet.' },
    { id: 'no_local_deny_policy', passed: denyPolicies === 0, detail: denyPolicies ? 'An enabled deny policy applies to identity or workspace.' : 'No enabled deny policy blocks this account locally.' },
  ];

  res.json({
    source: 'session_policy',
    capability: 'rules_based',
    note: 'This is an application-layer access check for the signed-in user. It is not a network Zero Trust product.',
    allow: checks.every((check) => check.passed),
    checks,
  });
});

const getNetworkStatus = asyncHandler(async (_req, res) => {
  res.json({
    available: false,
    source: 'none',
    capability: 'not_available',
    traffic: [],
    events: [],
    reason: 'No network sensor, packet capture, or flow collector is connected. Traffic charts are not invented.',
  });
});

module.exports = {
  getOverview,
  listSessions,
  listActivity,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getZeroTrust,
  getNetworkStatus,
};
