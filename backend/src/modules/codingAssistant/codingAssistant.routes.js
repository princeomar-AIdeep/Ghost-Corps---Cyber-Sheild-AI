'use strict';

const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../../middleware/auth');
const { codingAssistantLimiter } = require('../../middleware/rateLimiter');
const { validate, schemas } = require('../../middleware/validate');
const { createSuggestions } = require('./codingAssistant.controller');

router.post(
  '/suggestions',
  authenticate,
  codingAssistantLimiter,
  validate(schemas.codingAssistantProjectParamsSchema, 'params'),
  validate(schemas.codingAssistantSchema),
  createSuggestions
);

module.exports = router;
