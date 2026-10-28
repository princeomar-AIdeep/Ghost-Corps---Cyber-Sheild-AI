'use strict';

const User = require('../../models/User');
const Project = require('../../models/Project');
const Task = require('../../models/Task');
const Scan = require('../../models/Scan');
const Report = require('../../models/Report');
const ChatMessage = require('../../models/ChatMessage');
const AuthSession = require('../../models/AuthSession');
const AccessPolicy = require('../../models/AccessPolicy');
const asyncHandler = require('../../utils/asyncHandler');
const { revokeJti } = require('../../utils/tokenRevocation');
const { securityLog } = require('../../utils/securityLog');

function isSafeAvatarUrl(url) {
  if (!url) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
  ) {
    return false;
  }
  return true;
}

const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toPublicJSON() });
});

const updateProfile = asyncHandler(async (req, res) => {
  const updates = {};

  if (typeof req.body.displayName === 'string') {
    const name = req.body.displayName.trim();
    if (name.length > 100) return res.status(400).json({ error: 'Display name must be 100 characters or fewer.' });
    updates.displayName = name;
  }

  if (typeof req.body.avatarUrl === 'string') {
    const url = req.body.avatarUrl.trim();
    if (url && !isSafeAvatarUrl(url)) {
      return res.status(400).json({ error: 'avatarUrl must be a valid public http/https URL.' });
    }
    updates.avatarUrl = url;
  }
  if (typeof req.body.assistantName === 'string') {
    updates.assistantName = req.body.assistantName.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update (displayName, avatarUrl, assistantName).' });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updates,
    { new: true, runValidators: true }
  );

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toPublicJSON() });
});

const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await Promise.all([
    Project.deleteMany({ userId }),
    Task.deleteMany({ userId }),
    Scan.deleteMany({ userId }),
    Report.deleteMany({ userId }),
    ChatMessage.deleteMany({ userId }),
    AuthSession.deleteMany({ userId }),
    AccessPolicy.deleteMany({ userId }),
  ]);
  const user = await User.findByIdAndDelete(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  revokeJti(req.user.jti, req.user.exp);
  securityLog('user.deleted', {}, req);
  res.json({ message: 'Account deleted. Related project, task, scan, report, and chat records were removed.' });
});

module.exports = { getProfile, updateProfile, deleteAccount };
