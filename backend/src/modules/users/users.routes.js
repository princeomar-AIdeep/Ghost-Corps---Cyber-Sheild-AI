'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { getProfile, updateProfile, deleteAccount } = require('./users.controller');

/**
 * /api/users
 * All routes require a valid JWT.
 */
router.get('/me',    authenticate, getProfile);
router.put('/me',    authenticate, validate(schemas.updateProfileSchema), updateProfile);
router.delete('/me', authenticate, deleteAccount);

module.exports = router;
