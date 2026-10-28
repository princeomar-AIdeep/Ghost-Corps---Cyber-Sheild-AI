'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

jest.mock('../src/models/Project', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/WorkspaceFile', () => ({
  find: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

const Project = require('../src/models/Project');
const WorkspaceFile = require('../src/models/WorkspaceFile');
const { createCodingAssistantLimiter } = require('../src/middleware/rateLimiter');
const express = require('express');
const request = require('supertest');
const {
  loadSelectedWorkspaceFiles,
} = require('../src/modules/workspaceFiles/workspaceFiles.service');
const {
  createCodingAssistantService,
  providerConfiguration,
  validateSuggestionOutput,
  requestProvider,
} = require('../src/modules/codingAssistant/codingAssistant.service');

const PROJECT_ID = '65a1b2c3d4e5f67890123456';
const USER_ID = '65f1b2c3d4e5f67890123456';
const DIFF = '--- a/src/index.js\n+++ b/src/index.js\n@@ -1 +1 @@\n-old\n+new';
const JSON_SUGGESTION = JSON.stringify({
  explanation: 'Use the safer implementation.',
  suggestions: [{ path: 'src/index.js', diff: DIFF }],
});

function providerResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
  };
}

function mockWorkspaceFiles(files) {
  WorkspaceFile.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(files) });
}

describe('workspace-aware coding assistant service', () => {
  beforeEach(() => {
    Project.findOne.mockResolvedValue({ _id: PROJECT_ID, userId: USER_ID });
    mockWorkspaceFiles([{ path: 'src/index.js', content: 'const value = 1;' }]);
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODEL;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('checks ownership before querying only explicitly selected project files', async () => {
    await expect(loadSelectedWorkspaceFiles(PROJECT_ID, USER_ID, ['src/index.js']))
      .resolves.toEqual({
        files: [{ path: 'src/index.js', content: 'const value = 1;' }],
        excludedPaths: [],
      });
    expect(Project.findOne).toHaveBeenCalledWith({ _id: PROJECT_ID, userId: USER_ID });
    expect(WorkspaceFile.find).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      path: { $in: ['src/index.js'] },
    });
  });

  it('does not query files for a project the caller does not own', async () => {
    Project.findOne.mockResolvedValueOnce(null);

    await expect(loadSelectedWorkspaceFiles(PROJECT_ID, USER_ID, ['src/index.js']))
      .rejects.toMatchObject({ statusCode: 404, message: 'Project not found.' });
    expect(WorkspaceFile.find).not.toHaveBeenCalled();
  });

  it('rejects path traversal before querying workspace files', async () => {
    await expect(loadSelectedWorkspaceFiles(PROJECT_ID, USER_ID, ['../other/.env']))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(WorkspaceFile.find).not.toHaveBeenCalled();
  });

  it('fails when any explicitly selected path is missing', async () => {
    mockWorkspaceFiles([]);

    await expect(loadSelectedWorkspaceFiles(PROJECT_ID, USER_ID, ['src/missing.js']))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('excludes sensitive paths and secret-like contents from provider context', async () => {
    mockWorkspaceFiles([
      { path: '.env', content: 'SECRET_VALUE=not-for-model' },
      { path: 'src/config.js', content: 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv' },
      { path: 'src/index.js', content: 'export const safe = true;' },
    ]);
    const result = await loadSelectedWorkspaceFiles(PROJECT_ID, USER_ID, [
      '.env',
      'src/config.js',
      'src/index.js',
    ]);

    expect(result).toEqual({
      files: [{ path: 'src/index.js', content: 'export const safe = true;' }],
      excludedPaths: ['.env', 'src/config.js'],
    });
    expect(JSON.stringify(result.files)).not.toContain('not-for-model');
    expect(JSON.stringify(result.files)).not.toContain('sk-proj-');
  });

  it('requires a configured provider and never fabricates a fallback suggestion', async () => {
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files: [{ path: 'src/index.js', content: 'safe' }], excludedPaths: [] }),
      fetchImpl: jest.fn(),
    });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review this file.',
      filePaths: ['src/index.js'],
    })).rejects.toMatchObject({
      code: 'AI_PROVIDER_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('does not send secret-like prompts to an AI provider', async () => {
    const fetchImpl = jest.fn();
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files: [{ path: 'src/index.js', content: 'safe' }], excludedPaths: [] }),
      fetchImpl,
      getProviderConfig: () => ({ provider: 'openai', key: 'test-key' }),
    });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Please use api_key=do-not-send-this-value',
      filePaths: ['src/index.js'],
    })).rejects.toMatchObject({ code: 'AI_PROMPT_CONTAINS_SECRET', statusCode: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only selected safe context to the configured OpenAI provider and returns a review-only diff', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key-never-real';
    const fetchImpl = jest.fn().mockResolvedValue(providerResponse({
      choices: [{ message: { content: JSON_SUGGESTION } }],
    }));
    const service = createCodingAssistantService({
      loadFiles: async (projectId, userId, paths) => {
        expect(projectId).toBe(PROJECT_ID);
        expect(userId).toBe(USER_ID);
        expect(paths).toEqual(['src/index.js']);
        return { files: [{ path: 'src/index.js', content: 'const old = true;' }], excludedPaths: [] };
      },
      fetchImpl,
    });

    const result = await service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Suggest a safer change.',
      filePaths: ['src/index.js'],
    });

    expect(result).toEqual({
      provider: 'openai',
      explanation: 'Use the safer implementation.',
      suggestions: [{ path: 'src/index.js', diff: DIFF }],
      excludedFiles: [],
      reviewRequired: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    const providerRequest = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(providerRequest.messages[1].content).toContain('src/index.js');
    expect(providerRequest.messages[1].content).toContain('const old = true;');
    expect(providerRequest.tools).toBeUndefined();
    expect(WorkspaceFile.create).not.toHaveBeenCalled();
    expect(WorkspaceFile.findOneAndUpdate).not.toHaveBeenCalled();
    expect(WorkspaceFile.findOneAndDelete).not.toHaveBeenCalled();
  });

  it('does not place the Gemini API key in its request URL', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-fallback-key-never-real';
    process.env.GEMINI_API_KEY = 'test-gemini-key-never-real';
    const fetchImpl = jest.fn().mockResolvedValue(providerResponse({
      candidates: [{ content: { parts: [{ text: JSON_SUGGESTION }] } }],
    }));
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files: [{ path: 'src/index.js', content: 'safe' }], excludedPaths: [] }),
      fetchImpl,
    });

    await service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review.',
      filePaths: ['src/index.js'],
    });

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
    );
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-gemini-key-never-real');
  });

  it('uses the configured Gemini fallback after a primary 503 and returns the model used', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-never-real';
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(providerResponse({ error: { status: 'UNAVAILABLE' } }, false, 503))
      .mockResolvedValueOnce(providerResponse({
        candidates: [{ content: { parts: [{ text: JSON_SUGGESTION }] } }],
      }));
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files: [{ path: 'src/index.js', content: 'safe' }], excludedPaths: [] }),
      fetchImpl,
    });

    const result = await service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review.',
      filePaths: ['src/index.js'],
    });

    expect(result.model).toBe('gemini-3.6-flash');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    ]);
  });

  it('uses a fresh timeout window for the configured Gemini fallback', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-never-real';
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash';
    const createTimeoutSignal = jest.fn()
      .mockReturnValueOnce(AbortSignal.abort())
      .mockReturnValueOnce(new AbortController().signal);
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'AbortError' }))
      .mockResolvedValueOnce(providerResponse({
        candidates: [{ content: { parts: [{ text: JSON_SUGGESTION }] } }],
      }));
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files: [{ path: 'src/index.js', content: 'safe' }], excludedPaths: [] }),
      fetchImpl,
      createTimeoutSignal,
    });

    const result = await service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review.',
      filePaths: ['src/index.js'],
    });

    expect(result.model).toBe('gemini-3.6-flash');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(createTimeoutSignal).toHaveBeenCalledTimes(2);
  });

  it('enforces prompt, selected file count, per-file, and aggregate context byte limits', async () => {
    const loadFiles = jest.fn(async (projectId, userId, paths) => ({
      files: paths.map((path) => ({ path, content: 'x'.repeat(64 * 1024 + 1) })),
      excludedPaths: [],
    }));
    const fetchImpl = jest.fn();
    const service = createCodingAssistantService({
      loadFiles,
      fetchImpl,
      getProviderConfig: () => ({ provider: 'openai', key: 'test-key' }),
    });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'x'.repeat(4097),
      filePaths: ['src/index.js'],
    })).rejects.toMatchObject({ code: 'AI_PROMPT_TOO_LARGE', statusCode: 413 });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review.',
      filePaths: Array.from({ length: 11 }, (_, index) => `src/${index}.js`),
    })).rejects.toMatchObject({ code: 'AI_INVALID_REQUEST', statusCode: 400 });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review.',
      filePaths: ['src/index.js'],
    })).rejects.toMatchObject({ code: 'AI_FILE_TOO_LARGE', statusCode: 413 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects aggregate context over the fixed byte limit', async () => {
    const files = ['src/a.js', 'src/b.js', 'src/c.js'].map((path) => ({
      path,
      content: 'x'.repeat(45 * 1024),
    }));
    const service = createCodingAssistantService({
      loadFiles: async () => ({ files, excludedPaths: [] }),
      fetchImpl: jest.fn(),
      getProviderConfig: () => ({ provider: 'openai', key: 'test-key' }),
    });

    await expect(service.suggest({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review these files.',
      filePaths: files.map((file) => file.path),
    })).rejects.toMatchObject({ code: 'AI_CONTEXT_TOO_LARGE', statusCode: 413 });
  });

  it('rejects diffs that target unselected files or have malformed structure', () => {
    expect(() => validateSuggestionOutput(JSON.stringify({
      explanation: 'Change file.',
      suggestions: [{ path: 'src/other.js', diff: '--- a/src/other.js\n+++ b/src/other.js\n@@ -1 +1 @@\n-a\n+b' }],
    }), new Set(['src/index.js']))).toThrow(
      expect.objectContaining({ code: 'AI_INVALID_OUTPUT' })
    );

    expect(() => validateSuggestionOutput('```json\n{}\n```', new Set(['src/index.js'])))
      .toThrow(expect.objectContaining({ code: 'AI_INVALID_OUTPUT' }));
  });

  it('rejects provider output that appears to contain credential material', () => {
    expect(() => validateSuggestionOutput(JSON.stringify({
      explanation: 'The key is api_key="sensitive-value-123".',
      suggestions: [],
    }), new Set(['src/index.js']))).toThrow(
      expect.objectContaining({ code: 'AI_INVALID_OUTPUT' })
    );
  });

  it('classifies provider credential rejection, rate limits, timeout, and malformed output safely', async () => {
    const providerConfig = { provider: 'openai', key: 'test-key' };
    const common = { providerConfig, prompt: 'Review.', files: [{ path: 'src/index.js', content: 'safe' }] };

    await expect(requestProvider({
      ...common,
      fetchImpl: jest.fn().mockResolvedValue(providerResponse({}, false, 401)),
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_CONFIGURATION_ERROR', statusCode: 503 });

    await expect(requestProvider({
      ...common,
      fetchImpl: jest.fn().mockResolvedValue(providerResponse({}, false, 429)),
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_RATE_LIMITED', statusCode: 429 });

    await expect(requestProvider({
      ...common,
      createTimeoutSignal: () => AbortSignal.abort(),
      fetchImpl: jest.fn().mockRejectedValue(Object.assign(new Error('timeout detail'), { name: 'AbortError' })),
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_TIMEOUT', statusCode: 504 });

    await expect(requestProvider({
      ...common,
      fetchImpl: jest.fn().mockResolvedValue(providerResponse({ choices: [{ message: { content: 'not JSON' } }] })),
    }).then((raw) => validateSuggestionOutput(raw, new Set(['src/index.js']))))
      .rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT', statusCode: 502 });
  });

  it('cancels provider response bodies that exceed the response byte limit', async () => {
    let cancelled = false;
    const response = {
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
    };

    await expect(requestProvider({
      providerConfig: { provider: 'openai', key: 'test-key' },
      prompt: 'Review.',
      files: [{ path: 'src/index.js', content: 'safe' }],
      fetchImpl: jest.fn().mockResolvedValue(response),
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', statusCode: 502 });
    expect(cancelled).toBe(true);
  });

  it('does not reveal provider or key values in provider errors', async () => {
    const key = 'test-key-never-echo';
    process.env.OPENAI_API_KEY = key;
    expect(providerConfiguration()).toEqual({ provider: 'openai', key });
    const result = await requestProvider({
      providerConfig: { provider: 'openai', key },
      prompt: 'safe prompt',
      files: [{ path: 'src/index.js', content: 'safe content' }],
      fetchImpl: jest.fn().mockRejectedValue(new Error(`provider rejected ${key}`)),
    }).catch((error) => error);

    expect(result.message).toBe('The AI provider could not complete the request.');
    expect(result.message).not.toContain(key);
  });

  it('applies the configured per-user request rate limit', async () => {
    const app = express();
    app.get('/limited', (req, res, next) => {
      req.user = { _id: USER_ID };
      next();
    }, createCodingAssistantLimiter(() => false), (req, res) => res.sendStatus(200));

    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await request(app).get('/limited'));
    }

    expect(responses.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(responses[10].statusCode).toBe(429);
    expect(responses[10].body).toEqual({
      error: 'Coding assistant rate limit reached. Please wait and try again.',
      code: 'AI_RATE_LIMITED',
    });
  });
});
