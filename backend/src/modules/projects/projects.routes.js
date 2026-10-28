'use strict';

const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
} = require('./projects.controller');

/**
 * /api/projects
 *
 * All routes require a valid JWT (Phase 3 auth enforcement).
 * Ownership checks are enforced inside the controller via userId filter.
 */
router.get('/',    authenticate, listProjects);
router.post('/',   authenticate, validate(schemas.createProjectSchema), createProject);
router.put('/:id', authenticate, validate(schemas.updateProjectSchema), updateProject);
router.delete('/:id', authenticate, deleteProject);

module.exports = router;
