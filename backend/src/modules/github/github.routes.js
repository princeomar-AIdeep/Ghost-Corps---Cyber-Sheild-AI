'use strict';

const router = require('express').Router();
const Joi = require('joi');
const { authenticate } = require('../../middleware/auth');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const controller = require('./github.controller');

const callbackSchema = Joi.object({
  state: Joi.string().pattern(/^[A-Za-z0-9_-]{43}$/).required(),
  code: Joi.string().max(2048).optional(),
  error: Joi.string().max(100).optional(),
}).or('code', 'error');
const repositoryParamsSchema = Joi.object({
  owner: Joi.string().pattern(/^[A-Za-z0-9-]{1,39}$/).required(),
  repository: Joi.string().pattern(/^[A-Za-z0-9._-]{1,100}$/).required(),
});
const repositoryFileQuerySchema = Joi.object({
  path: Joi.string().max(512).required(),
  ref: Joi.string().pattern(/^[\w./-]{1,255}$/).optional(),
}).unknown(false);
const commitFileSchema = Joi.object({
  path: Joi.string().max(512).required(),
  content: Joi.string().max(1_000_000).required(),
  message: Joi.string().trim().min(1).max(200).required(),
  branch: Joi.string().pattern(/^[\w./-]{1,255}$/).required(),
  sha: Joi.string().pattern(/^[a-f\d]{40}$/i).optional(),
}).unknown(false);

function validateRepositoryFileQuery(req, res, next) {
  const { error, value } = repositoryFileQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) return res.status(400).json({ error: 'Invalid repository file query.' });
  req.validatedGitHubQuery = value;
  return next();
}

function validateCallback(req, res, next) {
  const { error, value } = callbackSchema.validate(req.query, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) return res.status(400).json({ error: 'Invalid GitHub authorization callback.' });
  req.githubCallback = value;
  return next();
}

router.get('/callback', strictLimiter, validateCallback, controller.completeAuthorization);
router.get('/connection', authenticate, controller.getConnectionStatus);
router.delete('/connection', authenticate, strictLimiter, controller.disconnect);
router.post('/connect', authenticate, strictLimiter, controller.startAuthorization);
router.get('/repositories', authenticate, strictLimiter, controller.listRepositories);
router.get('/repositories/:owner/:repository/branches', authenticate, strictLimiter, validate(repositoryParamsSchema, 'params'), controller.listBranches);
router.get('/repositories/:owner/:repository/contents', authenticate, strictLimiter, validate(repositoryParamsSchema, 'params'), validateRepositoryFileQuery, controller.getRepositoryFile);
router.put('/repositories/:owner/:repository/contents', authenticate, strictLimiter, validate(repositoryParamsSchema, 'params'), validate(commitFileSchema), controller.commitRepositoryFile);

module.exports = router;
