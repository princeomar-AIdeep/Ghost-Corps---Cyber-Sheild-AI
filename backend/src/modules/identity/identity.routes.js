'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const {
  getOverview,
  listSessions,
  listActivity,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getZeroTrust,
  getNetworkStatus,
} = require('./identity.controller');

router.use(authenticate);
router.get('/overview', validate(schemas.identityRangeQuerySchema, 'query'), getOverview);
router.get('/sessions', listSessions);
router.get('/activity', validate(schemas.identityRangeQuerySchema, 'query'), listActivity);
router.get('/policies', listPolicies);
router.post('/policies', validate(schemas.createAccessPolicySchema), createPolicy);
router.patch(
  '/policies/:policyId',
  validate(schemas.accessPolicyParamsSchema, 'params'),
  validate(schemas.updateAccessPolicySchema),
  updatePolicy
);
router.delete(
  '/policies/:policyId',
  validate(schemas.accessPolicyParamsSchema, 'params'),
  deletePolicy
);
router.get('/zero-trust', getZeroTrust);
router.get('/network', getNetworkStatus);

module.exports = router;
