'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { CodingAssistantError, codingAssistantService } = require('./codingAssistant.service');

const createSuggestions = asyncHandler(async (req, res, next) => {
  const controller = new AbortController();
  const abortIfDisconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', abortIfDisconnected);

  try {
    const result = await codingAssistantService.suggest({
      projectId: req.params.projectId,
      userId: req.user._id,
      prompt: req.body.prompt,
      filePaths: req.body.filePaths,
      signal: controller.signal,
    });
    if (!res.writableEnded) return res.json(result);
  } catch (error) {
    if (error instanceof CodingAssistantError) {
      if (!res.writableEnded) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      return;
    }
    return next(error);
  } finally {
    res.off('close', abortIfDisconnected);
  }
});

module.exports = { createSuggestions };
