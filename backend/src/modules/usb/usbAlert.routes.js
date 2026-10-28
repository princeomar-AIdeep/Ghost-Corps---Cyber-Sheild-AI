'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { validate, schemas } = require('../../middleware/validate');
const { reportUsbDevice } = require('./usbAlert.controller');

router.post('/alert', authenticate, strictLimiter, validate(schemas.usbAlertSchema), reportUsbDevice);

module.exports = router;
