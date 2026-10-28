'use strict';

const mongoose = require('mongoose');
const Project = require('../../models/Project');
const WorkspaceFile = require('../../models/WorkspaceFile');
const WorkspaceFileQuota = require('../../models/WorkspaceFileQuota');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * GET /api/projects
 * Returns only the authenticated user's projects, newest-first.
 */
const listProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json(projects);
});

/**
 * POST /api/projects
 * Creates a new project owned by the authenticated user.
 * Body: { title: string, description?: string }
 */
const createProject = asyncHandler(async (req, res) => {
  const title = (req.body.title || '').toString().trim();
  if (!title) {
    return res.status(400).json({ error: 'Project title is required.' });
  }

  const project = await Project.create({
    title,
    description: (req.body.description || '').toString().trim(),
    userId: req.user._id,
  });

  res.status(201).json(project);
});

/**
 * PUT /api/projects/:id
 * Updates title and/or description — only if the project belongs to the caller.
 */
const updateProject = asyncHandler(async (req, res) => {
  const updates = {};

  if (typeof req.body.title === 'string') {
    const title = req.body.title.trim();
    if (!title) return res.status(400).json({ error: 'Project title cannot be blank.' });
    updates.title = title;
  }
  if (typeof req.body.description === 'string') {
    updates.description = req.body.description.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update.' });
  }

  // Ownership enforced: only match documents that belong to this user
  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    updates,
    { new: true, runValidators: true }
  );

  if (!project) return res.status(404).json({ error: 'Project not found.' });
  res.json(project);
});

/**
 * DELETE /api/projects/:id
 * Permanently deletes a project — only if it belongs to the caller.
 */
const deleteProject = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let project;
  try {
    await session.withTransaction(async () => {
      project = await Project.findOneAndDelete(
        { _id: req.params.id, userId: req.user._id },
        { session }
      );
      if (!project) return;

      await WorkspaceFile.deleteMany({ projectId: project._id }, { session });
      await WorkspaceFileQuota.deleteOne({ projectId: project._id }, { session });
    });
  } catch (error) {
    if (
      error?.code === 20 ||
      /Transaction numbers are only allowed on a replica set member or mongos/i.test(error?.message || '')
    ) {
      const transactionError = new Error('Project deletion requires MongoDB transaction support.');
      transactionError.statusCode = 503;
      throw transactionError;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!project) return res.status(404).json({ error: 'Project not found.' });
  res.json({ message: 'Project deleted successfully.' });
});

module.exports = { listProjects, createProject, updateProject, deleteProject };
