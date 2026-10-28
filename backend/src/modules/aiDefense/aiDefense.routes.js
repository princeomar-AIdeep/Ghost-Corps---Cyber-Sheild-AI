'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { getStatus } = require('./aiDefense.controller');

router.get('/status', authenticate, getStatus);

module.exports = router;
