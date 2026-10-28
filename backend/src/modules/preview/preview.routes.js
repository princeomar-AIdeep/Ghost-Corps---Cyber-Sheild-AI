'use strict';

const Joi = require('joi');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../../middleware/auth');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const { startPreview, getPreviewStatus, stopPreview } = require('./preview.controller');

const projectIdSchema = Joi.object({
  projectId: Joi.string().pattern(/^[a-f\d]{24}$/i).required(),
});

const sessionParamsSchema = Joi.object({
  projectId: Joi.string().pattern(/^[a-f\d]{24}$/i).required(),
  sessionId: Joi.string().guid({ version: ['uuidv4'] }).required(),
});

const startPreviewSchema = Joi.object({
  projectType: Joi.string().valid('vite_react').required(),
  entryPath: Joi.string().pattern(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w./-]+\.html?$/i).max(512).required(),
}).unknown(false);

router.use(authenticate);
router.post('/sessions', strictLimiter, validate(projectIdSchema, 'params'), validate(startPreviewSchema), startPreview);
router.get('/sessions/:sessionId', validate(sessionParamsSchema, 'params'), getPreviewStatus);
router.delete('/sessions/:sessionId', strictLimiter, validate(sessionParamsSchema, 'params'), stopPreview);

const previewAccessRouter = require('express').Router();
const { previewService } = require('./preview.service');
previewAccessRouter.use('/:token', (req, res) => previewService.proxy(req.params.token, req, res));

module.exports = router;
module.exports.previewAccessRouter = previewAccessRouter;
