'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { chatLimiter } = require('../../middleware/rateLimiter');
const { validate, schemas } = require('../../middleware/validate');
const { sendMessage, getHistory, clearHistory, listModels } = require('./chat.controller');

/**
 * /api/chat
 * All routes require a valid JWT.
 */
router.post('/',           authenticate, chatLimiter, validate(schemas.chatMessageSchema), sendMessage);
router.get('/models',      authenticate, listModels);
router.get('/history',     authenticate, validate(schemas.chatHistoryQuerySchema, 'query'), getHistory);
router.delete('/history',  authenticate, validate(schemas.chatHistoryQuerySchema, 'query'), clearHistory);

module.exports = router;
