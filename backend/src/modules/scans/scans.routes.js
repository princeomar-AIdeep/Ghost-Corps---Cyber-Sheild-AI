'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { strictLimiter } = require('../../middleware/rateLimiter');
const { validate, schemas } = require('../../middleware/validate');
const { listScans, createScan, getScan, deleteScan } = require('./scans.controller');
const { scanImage, uploadFile, reserveScanSlot } = require('./imageScan.controller');

/**
 * /api/scans
 * All routes require a valid JWT.
 */
router.get('/',         authenticate, listScans);
router.post('/',        authenticate, strictLimiter, validate(schemas.createScanSchema), createScan);
router.post('/image',   authenticate, strictLimiter, reserveScanSlot, uploadFile, validate(schemas.fileScanSchema), scanImage);
router.get('/:id',      authenticate, getScan);
router.delete('/:id',   authenticate, deleteScan);

module.exports = router;
