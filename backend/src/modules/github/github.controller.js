'use strict';

const {
  GitHubIntegrationError,
  githubService,
} = require('./github.service');

function handleError(err, res, next) {
  if (err instanceof GitHubIntegrationError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  return next(err);
}

async function getConnectionStatus(req, res, next) {
  try {
    const status = await githubService.getStatus(req.user._id);
    return res.json(status);
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function startAuthorization(req, res, next) {
  try {
    const result = await githubService.startAuthorization(req.user._id);
    return res.json(result);
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function completeAuthorization(req, res, next) {
  try {
    await githubService.completeAuthorization(req.githubCallback);
    return res.redirect(303, githubService.getDashboardReturnUrl('connected'));
  } catch (err) {
    if (err instanceof GitHubIntegrationError) {
      try {
        return res.redirect(303, githubService.getDashboardReturnUrl('error'));
      } catch (redirectError) {
        return handleError(redirectError, res, next);
      }
    }
    return handleError(err, res, next);
  }
}

async function listRepositories(req, res, next) {
  try {
    const result = await githubService.listRepositories(req.user._id);
    return res.json(result);
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function listBranches(req, res, next) {
  try {
    return res.json(await githubService.listBranches(req.user._id, req.params.owner, req.params.repository));
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function getRepositoryFile(req, res, next) {
  try {
    const file = await githubService.getRepositoryFile(
      req.user._id,
      req.params.owner,
      req.params.repository,
      req.validatedGitHubQuery.path,
      req.validatedGitHubQuery.ref
    );
    return res.json(file);
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function commitRepositoryFile(req, res, next) {
  try {
    const result = await githubService.commitRepositoryFile(
      req.user._id,
      req.params.owner,
      req.params.repository,
      req.body
    );
    return res.json(result);
  } catch (err) {
    return handleError(err, res, next);
  }
}

async function disconnect(req, res, next) {
  try {
    const result = await githubService.disconnect(req.user._id);
    return res.json(result);
  } catch (err) {
    return handleError(err, res, next);
  }
}

module.exports = {
  getConnectionStatus,
  startAuthorization,
  completeAuthorization,
  listRepositories,
  listBranches,
  getRepositoryFile,
  commitRepositoryFile,
  disconnect,
};
