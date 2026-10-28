'use strict';

const { randomUUID } = require('crypto');
const { validatePath } = require('../workspaceFiles/workspaceFiles.controller');
const { createLocalPreviewBroker } = require('./localPreviewBroker');

const DEFAULT_PREVIEW_TIMEOUT_MS = 70_000;
const ALLOWED_PROJECT_TYPES = new Set(['vite_react']);
const ALLOWED_SESSION_STATES = new Set(['starting', 'ready', 'failed', 'stopped', 'expired']);

class PreviewServiceError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'PreviewServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function unavailable() {
  return new PreviewServiceError(
    'PREVIEW_UNAVAILABLE',
    'Live Preview is unavailable because an approved isolated preview service is not configured.',
    503
  );
}

function validPreviewBaseUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const localHttpAllowed = process.env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !['https:', ...(localHttpAllowed ? ['http:'] : [])].includes(url.protocol)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function brokerFailure() {
  return new PreviewServiceError(
    'PREVIEW_SERVICE_ERROR',
    'The isolated preview service could not complete the request.',
    502
  );
}

function brokerTimeout() {
  return new PreviewServiceError(
    'PREVIEW_TIMEOUT',
    'The isolated preview service did not respond before the request timed out.',
    504
  );
}

function validatePreviewRequest({ projectType, entryPath } = {}) {
  if (!ALLOWED_PROJECT_TYPES.has(projectType)) {
    throw new PreviewServiceError(
      'PREVIEW_UNSUPPORTED_PROJECT_TYPE',
      'Only vite_react projects are supported for preview.',
      400
    );
  }

  try {
    validatePath(entryPath);
  } catch {
    throw new PreviewServiceError('PREVIEW_INVALID_ENTRY_PATH', 'Invalid preview entry path.', 400);
  }
  if (!/\.html?$/i.test(entryPath)) {
    throw new PreviewServiceError(
      'PREVIEW_INVALID_ENTRY_PATH',
      'The preview entry path must reference an HTML file.',
      400
    );
  }
}

function createPreviewService(previewClient = createLocalPreviewBroker(), { timeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('Preview service timeout must be a positive integer.');
  }

  async function invoke(method, payload) {
    if (!previewClient || previewClient.available === false || typeof previewClient[method] !== 'function') throw unavailable();

    const controller = new AbortController();
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(brokerTimeout());
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        Promise.resolve().then(() => previewClient[method](payload, { signal: controller.signal })),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof PreviewServiceError) throw error;
      throw brokerFailure();
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async start({ userId, projectId, projectType, entryPath } = {}) {
      validatePreviewRequest({ projectType, entryPath });
      const sessionId = randomUUID();
      const accepted = await invoke('start', { sessionId, userId, projectId, projectType, entryPath });
      if (accepted !== true) throw brokerFailure();
      return { sessionId, status: 'starting' };
    },

    async getStatus({ userId, projectId, sessionId } = {}) {
      const result = await invoke('getStatus', { userId, projectId, sessionId });
      if (!result || !ALLOWED_SESSION_STATES.has(result.status)) throw brokerFailure();
      const response = { sessionId, status: result.status };
      if (result.status === 'ready') {
        let previewUrl;
        try { previewUrl = new URL(result.previewUrl); } catch { throw brokerFailure(); }
        const publicBaseUrl = validPreviewBaseUrl(process.env.PREVIEW_PUBLIC_BASE_URL);
        if (!publicBaseUrl || previewUrl.origin !== publicBaseUrl.origin
          || previewUrl.username || previewUrl.password || !/^\/api\/preview-access\/[A-Za-z0-9_-]{43}\/$/.test(previewUrl.pathname)) {
          throw brokerFailure();
        }
        response.previewUrl = previewUrl.toString();
      }
      if (typeof result.stderr === 'string') response.stderr = result.stderr.slice(0, 4096);
      return response;
    },

    async stop({ userId, projectId, sessionId } = {}) {
      const stopped = await invoke('stop', { userId, projectId, sessionId });
      if (stopped !== true) throw brokerFailure();
      return { sessionId, status: 'stopped' };
    },

    proxy(token, req, res) {
      if (!previewClient || typeof previewClient.proxy !== 'function') {
        return res.status(503).json({ code: 'PREVIEW_UNAVAILABLE', error: 'Live Preview is unavailable.' });
      }
      return previewClient.proxy(token, req, res);
    },
  };
}

const previewService = createPreviewService();

module.exports = {
  createPreviewService,
  previewService,
  PreviewServiceError,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  ALLOWED_PROJECT_TYPES,
  validatePreviewRequest,
  validPreviewBaseUrl,
};
