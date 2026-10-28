'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');

jest.mock('../src/modules/codingAssistant/codingAssistant.service', () => {
  class MockCodingAssistantError extends Error {
    constructor(code, message, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    CodingAssistantError: MockCodingAssistantError,
    codingAssistantService: { suggest: jest.fn() },
  };
});

const { codingAssistantService, CodingAssistantError } = require('../src/modules/codingAssistant/codingAssistant.service');
const app = createApp();
const PROJECT_ID = '65a1b2c3d4e5f67890123456';
const USER_ID = '65f1b2c3d4e5f67890123456';

function authorization(userId = USER_ID) {
  const token = jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'coding-assistant@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

describe('project coding assistant API', () => {
  beforeEach(() => {
    codingAssistantService.suggest.mockResolvedValue({
      provider: 'openai',
      explanation: 'Review this proposed change.',
      suggestions: [],
      excludedFiles: [],
      reviewRequired: true,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('requires authentication before calling the assistant service', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/assistant/suggestions`)
      .send({ prompt: 'Review source.', filePaths: ['src/index.js'] });

    expect(response.statusCode).toBe(401);
    expect(codingAssistantService.suggest).not.toHaveBeenCalled();
  });

  it('rejects malformed requests and project IDs', async () => {
    const malformed = await request(app)
      .post(`/api/projects/${PROJECT_ID}/assistant/suggestions`)
      .set(authorization())
      .send({ prompt: '', filePaths: ['../.env'] });
    const invalidProject = await request(app)
      .post('/api/projects/not-an-id/assistant/suggestions')
      .set(authorization())
      .send({ prompt: 'Review source.', filePaths: ['src/index.js'] });

    expect(malformed.statusCode).toBe(400);
    expect(invalidProject.statusCode).toBe(400);
    expect(codingAssistantService.suggest).not.toHaveBeenCalled();
  });

  it('rejects oversized HTTP request bodies before assistant processing', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/assistant/suggestions`)
      .set(authorization())
      .send({
        prompt: 'Review source.',
        filePaths: ['src/index.js'],
        extra: 'x'.repeat(1024 * 1024),
      });

    expect(response.statusCode).toBe(413);
    expect(codingAssistantService.suggest).not.toHaveBeenCalled();
  });

  it('uses the authenticated subject and returns a review-required suggestion shape', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/assistant/suggestions`)
      .set(authorization())
      .send({ prompt: 'Review source.', filePaths: ['src/index.js'] });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      provider: 'openai',
      explanation: 'Review this proposed change.',
      reviewRequired: true,
    });
    expect(codingAssistantService.suggest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      userId: USER_ID,
      prompt: 'Review source.',
      filePaths: ['src/index.js'],
      signal: expect.any(AbortSignal),
    }));
  });

  it('returns typed safe provider errors without exposing internal details', async () => {
    codingAssistantService.suggest.mockRejectedValueOnce(new CodingAssistantError(
      'AI_PROVIDER_UNAVAILABLE',
      'The coding assistant is unavailable because no AI provider is configured.',
      503
    ));
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/assistant/suggestions`)
      .set(authorization())
      .send({ prompt: 'Review source.', filePaths: ['src/index.js'] });

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: 'The coding assistant is unavailable because no AI provider is configured.',
      code: 'AI_PROVIDER_UNAVAILABLE',
    });
  });
});
