'use strict';

const Joi = require('joi');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  listFiles,
  readFile,
  createFile,
  updateFile,
  renameFile,
  deleteFile,
  exportSource,
} = require('./workspaceFiles.controller');

const createFileSchema = Joi.object({
  path: Joi.string().required(),
  content: Joi.string().required().allow(''),
});

const updateFileSchema = Joi.object({
  path: Joi.string().required(),
  content: Joi.string().required().allow(''),
});

const renameFileSchema = Joi.object({
  fromPath: Joi.string().required(),
  toPath: Joi.string().required(),
});

const deleteFileSchema = Joi.object({
  path: Joi.string().required(),
});

router.use(authenticate);
router.get('/', listFiles);
router.get('/export', exportSource);
router.get('/file', readFile);
router.post('/', validate(createFileSchema), createFile);
router.put('/file', validate(updateFileSchema), updateFile);
router.post('/rename', validate(renameFileSchema), renameFile);
router.delete('/file', validate(deleteFileSchema), deleteFile);

module.exports = router;
