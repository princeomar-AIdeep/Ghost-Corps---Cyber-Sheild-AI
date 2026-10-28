'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { listWorkflows, createWorkflowDraft } = require('./automation.controller');

router.get('/workflows', authenticate, listWorkflows);
router.post('/workflows', authenticate, validate(schemas.createAutomationWorkflowSchema), createWorkflowDraft);

module.exports = router;
