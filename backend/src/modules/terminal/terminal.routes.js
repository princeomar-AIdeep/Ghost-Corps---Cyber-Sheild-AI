'use strict';

const Joi = require('joi');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { parseSupportedCommand } = require('./terminal.commands');
const {
  submitTerminalJob,
  getTerminalJob,
  cancelTerminalJob,
} = require('./terminal.controller');

const jobIdSchema = Joi.object({
  projectId: Joi.string().pattern(/^[a-f\d]{24}$/i).required(),
  jobId: Joi.string().guid({ version: ['uuidv4'] }).required(),
});

const submitJobSchema = Joi.object({
  taskType: Joi.string().valid('project_test', 'project_build'),
  command: Joi.string().trim().min(1).max(256).custom((value, helpers) => {
    try {
      parseSupportedCommand(value);
      return value;
    } catch {
      return helpers.error('any.invalid');
    }
  }).messages({ 'any.invalid': 'The requested terminal command is not supported.' }),
}).xor('taskType', 'command').unknown(false);

router.use(authenticate);
router.post('/jobs', strictLimiter, validate(submitJobSchema), submitTerminalJob);
router.get('/jobs/:jobId', validate(jobIdSchema, 'params'), getTerminalJob);
router.delete('/jobs/:jobId', strictLimiter, validate(jobIdSchema, 'params'), cancelTerminalJob);

module.exports = router;
