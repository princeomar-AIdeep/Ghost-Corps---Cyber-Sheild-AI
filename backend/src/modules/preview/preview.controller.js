'use strict';

const Project = require('../../models/Project');
const WorkspaceFile = require('../../models/WorkspaceFile');
const asyncHandler = require('../../utils/asyncHandler');
const { securityLog } = require('../../utils/securityLog');
const {
  PreviewServiceError,
  previewService,
  validatePreviewRequest,
} = require('./preview.service');

function validateProjectId(projectId) {
  if (typeof projectId !== 'string' || !/^[a-f\d]{24}$/i.test(projectId)) {
    const error = new Error('Invalid project ID.');
    error.statusCode = 400;
    throw error;
  }
}

async function requireOwnedProject(projectId, userId) {
  validateProjectId(projectId);
  const project = await Project.findOne({ _id: projectId, userId });
  if (!project) {
    const error = new Error('Project not found.');
    error.statusCode = 404;
    throw error;
  }
}

function sendPreviewError(res, error) {
  if (!(error instanceof PreviewServiceError)) throw error;
  return res.status(error.statusCode).json({ code: error.code, error: error.message });
}

const startPreview = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await requireOwnedProject(projectId, req.user._id);

  try {
    validatePreviewRequest(req.body);
  } catch (error) {
    if (error instanceof PreviewServiceError) return sendPreviewError(res, error);
    throw error;
  }

  const entryExists = await WorkspaceFile.exists({
    projectId,
    path: req.body.entryPath,
  });
  if (!entryExists) return res.status(404).json({ error: 'Preview entry file not found.' });

  try {
    const session = await previewService.start({
      userId: req.user._id,
      projectId,
      projectType: req.body.projectType,
      entryPath: req.body.entryPath,
    });
    securityLog('preview.session_start_requested', {
      projectId,
      sessionId: session.sessionId,
      projectType: req.body.projectType,
    }, req);
    return res.status(202).json(session);
  } catch (error) {
    if (error instanceof PreviewServiceError) {
      securityLog('preview.session_start_rejected', { projectId, reason: error.code }, req);
      return sendPreviewError(res, error);
    }
    throw error;
  }
});

async function requireOwnedProjectForSession(req) {
  await requireOwnedProject(req.params.projectId, req.user._id);
  return {
    userId: req.user._id,
    projectId: req.params.projectId,
    sessionId: req.params.sessionId,
  };
}

const getPreviewStatus = asyncHandler(async (req, res) => {
  const scope = await requireOwnedProjectForSession(req);
  try {
    return res.json(await previewService.getStatus(scope));
  } catch (error) {
    if (error instanceof PreviewServiceError) return sendPreviewError(res, error);
    throw error;
  }
});

const stopPreview = asyncHandler(async (req, res) => {
  const scope = await requireOwnedProjectForSession(req);
  try {
    const result = await previewService.stop(scope);
    securityLog('preview.session_stop_requested', {
      projectId: scope.projectId,
      sessionId: scope.sessionId,
    }, req);
    return res.json(result);
  } catch (error) {
    if (error instanceof PreviewServiceError) {
      securityLog('preview.session_stop_rejected', {
        projectId: scope.projectId,
        reason: error.code,
      }, req);
      return sendPreviewError(res, error);
    }
    throw error;
  }
});

module.exports = { startPreview, getPreviewStatus, stopPreview, requireOwnedProject };
