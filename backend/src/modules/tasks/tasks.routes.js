'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} = require('./tasks.controller');

/**
 * /api/tasks
 *
 * All routes require a valid JWT (Phase 3 auth enforcement).
 * Ownership checks are enforced inside the controller via userId filter.
 */
router.get('/',    authenticate, listTasks);
router.post('/',   authenticate, validate(schemas.createTaskSchema), createTask);
router.put('/:id', authenticate, validate(schemas.updateTaskSchema), updateTask);
router.delete('/:id', authenticate, deleteTask);

module.exports = router;
