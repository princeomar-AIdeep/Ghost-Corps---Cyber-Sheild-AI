'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { listCases, createCase, updateCase } = require('./investigations.controller');

router.get('/cases', authenticate, listCases);
router.post('/cases', authenticate, validate(schemas.createInvestigationCaseSchema), createCase);
router.put(
  '/cases/:caseId',
  authenticate,
  validate(schemas.investigationCaseParamsSchema, 'params'),
  validate(schemas.updateInvestigationCaseSchema),
  updateCase
);

module.exports = router;
