'use strict';

const Project = require('../../models/Project');
const asyncHandler = require('../../utils/asyncHandler');
const { securityLog } = require('../../utils/securityLog');
const { terminalService, TerminalServiceError } = require('./terminal.service');

const UNAVAILABLE_MESSAGE = 'Terminal execution is unavailable because an approved isolated execution broker is not configured.';

function validateProjectId(projectId) {
  if (typeof projectId !== 'string' || !/^[a-f\d]{24}$/i.test(projectId)) {
    const error = new Error('Invalid project ID.');
    error.statusCode = 400;
    throw error;
  }
}

function sendServiceError(res, error) {
  if (!(error instanceof TerminalServiceError)) throw error;
  return res.status(error.statusCode).json({
    code: error.code,
    error: error.code === 'TERMINAL_UNAVAILABLE'
      ? UNAVAILABLE_MESSAGE
      : error.message,
  });
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

const submitTerminalJob = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await requireOwnedProject(projectId, req.user._id);

  try {
    const job = await terminalService.submit({
      userId: req.user._id,
      projectId,
      ...(req.body.taskType ? { taskType: req.body.taskType } : { command: req.body.command }),
    });
    securityLog('terminal.job_submitted', {
      projectId,
      jobId: job.jobId,
      executionType: req.body.taskType || 'command',
      outcome: 'accepted',
    }, req);
    return res.status(202).json(job);
  } catch (error) {
    if (error instanceof TerminalServiceError) {
      securityLog('terminal.job_rejected', {
        projectId,
        executionType: req.body.taskType || 'command',
        reason: error.code,
      }, req);
      return sendServiceError(res, error);
    }
    throw error;
  }
});

const getTerminalJob = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await requireOwnedProject(projectId, req.user._id);

  try {
    const job = await terminalService.getStatus({
      userId: req.user._id,
      projectId,
      jobId: req.params.jobId,
    });
    return res.json(job);
  } catch (error) {
    if (error instanceof TerminalServiceError) return sendServiceError(res, error);
    throw error;
  }
});

const cancelTerminalJob = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  await requireOwnedProject(projectId, req.user._id);

  try {
    const result = await terminalService.cancel({
      userId: req.user._id,
      projectId,
      jobId: req.params.jobId,
    });
    securityLog('terminal.job_cancelled', {
      projectId,
      jobId: req.params.jobId,
      outcome: 'accepted',
    }, req);
    return res.json(result);
  } catch (error) {
    if (error instanceof TerminalServiceError) {
      securityLog('terminal.job_cancel_rejected', {
        projectId,
        jobId: req.params.jobId,
        reason: error.code,
      }, req);
      return sendServiceError(res, error);
    }
    throw error;
  }
});

module.exports = {
  submitTerminalJob,
  getTerminalJob,
  cancelTerminalJob,
  requireOwnedProject,
  UNAVAILABLE_MESSAGE,
};
