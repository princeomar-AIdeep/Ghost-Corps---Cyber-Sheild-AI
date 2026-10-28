'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const RegistrationPreAuth = require('../../models/RegistrationPreAuth');
const env = require('../../config/env');
const asyncHandler = require('../../utils/asyncHandler');
const { sendMail } = require('../../utils/mailer');
const { storeOtp, verifyOtp, clearOtp } = require('../../utils/otp');
const { revokeJti } = require('../../utils/tokenRevocation');
const { securityLog } = require('../../utils/securityLog');
const { recordAuthEvent } = require('../identity/sessionEvents');

let dummyHashPromise;

function dummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('not-a-real-password', 12);
  }
  return dummyHashPromise;
}

function signToken(user) {
  const options = {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
    jwtid: crypto.randomUUID(),
  };
  if (env.jwtIssuer) options.issuer = env.jwtIssuer;
  if (env.jwtAudience) options.audience = env.jwtAudience;

  return jwt.sign(
    { tokenUse: 'access', sub: user._id.toString(), email: user.email, role: user.role },
    env.jwtSecret,
    options
  );
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (!/^\S+@\S+\.\S+$/.test(email)) return false;
  if (process.env.REQUIRE_GMAIL === 'true' && !email.toLowerCase().endsWith('@gmail.com')) return false;
  return true;
}

function otpEmailHtml(otp, action) {
  return `
    <div style="font-family:Arial,sans-serif;background:#030b11;color:#e0edf5;padding:24px;border-radius:10px;max-width:480px">
      <h2 style="color:#0bd4ef;margin:0 0 8px">CYBER-AGENT AI — Verification Code</h2>
      <p style="color:#9ab8c6;margin:0 0 20px">Use this one-time code to ${action}. It expires in 10 minutes.</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#fff;text-align:center;padding:20px;background:#06141d;border-radius:8px;border:1px solid #1b4359">${otp}</div>
      <p style="margin:20px 0 0;color:#506070;font-size:11px">Do not share this code. If you did not request it, ignore this email.</p>
    </div>`;
}

const sendOtp = asyncHandler(async (req, res) => {
  const { email, scope } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: process.env.REQUIRE_GMAIL === 'true'
        ? 'Only Gmail addresses are accepted.'
        : 'Enter a valid email address.',
    });
  }

  if (scope === 'login' || scope === 'reset') {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: 'If that account exists, a code has been sent.' });
    }
  }

  const stored = storeOtp(email, scope);
  if (!stored.ok) {
    return res.status(429).json({ error: stored.error });
  }

  const actions = { register: 'complete your registration', login: 'sign in', reset: 'reset your password' };

  const mailResult = await sendMail({
    to: email,
    subject: 'Your CYBER-AGENT AI verification code',
    html: otpEmailHtml(stored.otp, actions[scope]),
  });

  if (!mailResult.ok) {
    clearOtp(email, scope);
    securityLog('otp.delivery_failed', { scope }, req);
    const error = mailResult.reason === 'not_configured'
      ? `Email delivery is unavailable. ${mailResult.message}`
      : mailResult.message || 'Email delivery failed. Check SMTP settings and provider availability.';
    return res.status(500).json({ error });
  }

  securityLog('otp.sent', { scope }, req);
  res.json({ message: 'Verification code sent to your email.' });
});

const verifyOtpEndpoint = asyncHandler(async (req, res) => {
  const { email, scope, otp } = req.body;

  if (!isValidEmail(email) || !otp || !scope) {
    return res.status(400).json({ error: 'email, scope, and otp are required.' });
  }

  const result = verifyOtp(email, scope, otp);
  if (!result.ok) return res.status(400).json({ error: result.error });

  const preAuthOptions = { expiresIn: '15m', algorithm: 'HS256', jwtid: crypto.randomUUID() };
  const preAuthToken = jwt.sign(
    { tokenUse: 'otp-preauth', preAuth: true, email: email.toLowerCase(), scope },
    env.jwtSecret,
    preAuthOptions
  );
  if (scope === 'register') {
    const { exp } = jwt.decode(preAuthToken);
    await RegistrationPreAuth.create({
      jti: preAuthOptions.jwtid,
      email: email.toLowerCase(),
      expiresAt: new Date(exp * 1000),
    });
  }

  res.json({ verified: true, preAuthToken });
});

const register = asyncHandler(async (req, res) => {
  const { email, password, displayName, preAuthToken } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: process.env.REQUIRE_GMAIL === 'true'
        ? 'Only Gmail addresses are accepted.'
        : 'Enter a valid email address.',
    });
  }

  if (preAuthToken) {
    let payload;
    try {
      payload = jwt.verify(preAuthToken, env.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      return res.status(400).json({ error: 'Verification token expired. Please request a new OTP.' });
    }

    if (payload.tokenUse !== 'otp-preauth' || !payload.preAuth ||
      payload.email !== email.toLowerCase() || payload.scope !== 'register' ||
      typeof payload.jti !== 'string' || !Number.isInteger(payload.exp)) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    const consumed = await RegistrationPreAuth.findOneAndDelete({
      jti: payload.jti,
      email: email.toLowerCase(),
    });
    if (!consumed) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }
  }

  if ((env.nodeEnv === 'production' || process.env.REQUIRE_OTP_REGISTER === 'true') && !preAuthToken) {
    return res.status(400).json({ error: 'Email verification required before registration.' });
  }

  const user = new User({ email, passwordHash: password, displayName: displayName || '' });
  await user.save();
  const token = signToken(user);
  await recordAuthEvent(req, { userId: user._id, token, event: 'login' });
  securityLog('auth.register', { role: 'user' }, req);
  res.status(201).json({ token, user: user.toPublicJSON() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password, preAuthToken } = req.body;

  const user = await User.findOne({ email: email?.toLowerCase() }).select('+passwordHash');
  const isValid = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, await dummyHash()).then(() => false);

  if (!user || !isValid) {
    if (user?._id) {
      await recordAuthEvent(req, { userId: user._id, event: 'login_failed' });
    }
    securityLog('auth.login_failed', {}, req);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (process.env.REQUIRE_OTP_LOGIN === 'true') {
    if (!preAuthToken) {
      return res.status(400).json({ error: 'OTP verification required.', otpRequired: true });
    }
    try {
      const payload = jwt.verify(preAuthToken, env.jwtSecret, { algorithms: ['HS256'] });
      if (payload.tokenUse !== 'otp-preauth' || !payload.preAuth || payload.email !== email.toLowerCase() || payload.scope !== 'login') {
        return res.status(400).json({ error: 'Invalid or expired OTP token.' });
      }
    } catch {
      return res.status(400).json({ error: 'OTP token expired. Please request a new code.', otpRequired: true });
    }
  }

  const token = signToken(user);
  await recordAuthEvent(req, { userId: user._id, token, event: 'login' });
  securityLog('auth.login', { role: user.role }, req);
  res.json({ token, user: user.toPublicJSON() });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toPublicJSON() });
});

const logout = asyncHandler(async (req, res) => {
  revokeJti(req.user.jti, req.user.exp);
  await recordAuthEvent(req, { userId: req.user._id, event: 'logout' });
  securityLog('auth.logout', {}, req);
  res.json({ message: 'Logged out successfully. Discard your token client-side.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, newPassword, preAuthToken } = req.body;

  if (!preAuthToken) return res.status(400).json({ error: 'OTP verification required to reset password.' });

  try {
    const payload = jwt.verify(preAuthToken, env.jwtSecret, { algorithms: ['HS256'] });
    if (payload.tokenUse !== 'otp-preauth' || !payload.preAuth || payload.email !== email?.toLowerCase() || payload.scope !== 'reset') {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }
  } catch {
    return res.status(400).json({ error: 'Verification token expired. Please request a new OTP.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (user) {
    user.passwordHash = newPassword;
    await user.save();
    securityLog('auth.password_reset', {}, req);
  }

  res.json({ message: 'If that account exists, the password has been reset. You can sign in with the new password.' });
});

module.exports = { register, login, getMe, logout, sendOtp, verifyOtpEndpoint, resetPassword };
