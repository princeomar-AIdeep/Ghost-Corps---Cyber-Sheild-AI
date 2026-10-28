'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const skipInTest = () => env.nodeEnv === 'test';

function createApiLimiter({
  windowMs = env.rateLimitWindowMs,
  max = env.rateLimitMax,
  skip = skipInTest,
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: { error: 'Too many requests. Please try again later.' },
  });
}

const apiLimiter = createApiLimiter();

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.authRateLimitMax || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many requests to this endpoint. Please wait and try again.' },
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Chat rate limit reached. Please wait and try again.' },
});

function createCodingAssistantLimiter(skip = skipInTest) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `user:${req.user._id}`,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: { error: 'Coding assistant rate limit reached. Please wait and try again.', code: 'AI_RATE_LIMITED' },
  });
}

const codingAssistantLimiter = createCodingAssistantLimiter();

module.exports = { apiLimiter, createApiLimiter, strictLimiter, chatLimiter, codingAssistantLimiter, createCodingAssistantLimiter };
