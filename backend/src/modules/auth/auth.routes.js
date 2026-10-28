'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { validate, schemas } = require('../../middleware/validate');
const { register, login, getMe, logout, sendOtp, verifyOtpEndpoint, resetPassword } = require('./auth.controller');

// Public routes — rate-limited
router.post('/register',       strictLimiter, validate(schemas.registerSchema), register);
router.post('/login',          strictLimiter, validate(schemas.loginSchema),    login);
router.post('/send-otp',       strictLimiter, validate(schemas.sendOtpSchema), sendOtp);
router.post('/verify-otp',     strictLimiter, validate(schemas.verifyOtpSchema), verifyOtpEndpoint);
router.post('/reset-password', strictLimiter, validate(schemas.resetPasswordSchema), resetPassword);

// Protected routes
router.get('/me',     authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
