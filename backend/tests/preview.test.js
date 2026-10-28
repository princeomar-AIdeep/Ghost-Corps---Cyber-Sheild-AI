'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const Project = require('../src/models/Project');
const WorkspaceFile = require('../src/models/WorkspaceFile');
const { previewService, PreviewServiceError } = require('../src/modules/preview/preview.service');

jest.mock('../src/models/Project', () => ({
  findOne: jest.fn(),
}));

jest.mock('../src/models/WorkspaceFile', () => ({
  exists: jest.fn(),
}));

jest.mock('../src/modules/preview/preview.service', () => {
  const actual = jest.requireActual('../src/modules/preview/preview.service');
  class MockPreviewServiceError extends Error {
    constructor(code, message, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    ...actual,
    PreviewServiceError: MockPreviewServiceError,
    previewService: {
      start: jest.fn(),
      getStatus: jest.fn(),
      stop: jest.fn(),
    },
  };
});

const PROJECT_ID = '65a1b2c3d4e5f67890123456';
const USER_ID = '65f1b2c3d4e5f67890123456';
const SESSION_ID = '273fa85b-4c88-4c3c-9167-1e54cb1e0b01';
const app = createApp();

function authorization(userId = USER_ID) {
  const token = jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'preview@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

function sessionPath(sessionId = SESSION_ID) {
  return `/api/projects/${PROJECT_ID}/preview/sessions/${sessionId}`;
}

describe('project preview API boundary', () => {
  let logSpy;

  beforeEach(() => {
    Project.findOne.mockResolvedValue({ _id: PROJECT_ID, userId: USER_ID });
    WorkspaceFile.exists.mockResolvedValue({ _id: 'file-id' });
    previewService.start.mockRejectedValue(new PreviewServiceError(
      'PREVIEW_UNAVAILABLE',
      'Live Preview is unavailable because an approved isolated preview service is not configured.',
      503
    ));
    previewService.getStatus.mockRejectedValue(new PreviewServiceError(
      'PREVIEW_UNAVAILABLE',
      'Live Preview is unavailable because an approved isolated preview service is not configured.',
      503
    ));
    previewService.stop.mockRejectedValue(new PreviewServiceError(
      'PREVIEW_UNAVAILABLE',
      'Live Preview is unavailable because an approved isolated preview service is not configured.',
      503
    ));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('requires authentication before project or workspace access', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/preview/sessions`)
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(401);
    expect(Project.findOne).not.toHaveBeenCalled();
    expect(WorkspaceFile.exists).not.toHaveBeenCalled();
  });

  it('rejects malformed project IDs before ownership lookup', async () => {
    const response = await request(app)
      .post('/api/projects/not-an-id/preview/sessions')
      .set(authorization())
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(400);
    expect(Project.findOne).not.toHaveBeenCalled();
  });

  it('rejects projects the caller does not own', async () => {
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/preview/sessions`)
      .set(authorization())
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(404);
    expect(WorkspaceFile.exists).not.toHaveBeenCalled();
    expect(previewService.start).not.toHaveBeenCalled();
  });

  it.each([
    ['missing project type', { entryPath: 'index.html' }],
    ['unsupported project type', { projectType: 'node_server', entryPath: 'index.html' }],
    ['arbitrary command field', { projectType: 'vite_react', entryPath: 'index.html', command: 'run this' }],
    ['arbitrary port field', { projectType: 'vite_react', entryPath: 'index.html', port: 8080 }],
    ['path traversal', { projectType: 'vite_react', entryPath: '../secret.html' }],
    ['dot-segment path', { projectType: 'vite_react', entryPath: 'src/./index.html' }],
    ['non-HTML entry path', { projectType: 'vite_react', entryPath: 'src/main.js' }],
    ['absolute path', { projectType: 'vite_react', entryPath: '/index.html' }],
  ])('rejects %s without consulting project files or the preview service', async (_label, body) => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/preview/sessions`)
      .set(authorization())
      .send(body);

    expect(response.statusCode).toBe(400);
    expect(WorkspaceFile.exists).not.toHaveBeenCalled();
    expect(previewService.start).not.toHaveBeenCalled();
  });

  it('requires the selected entry file to exist in the owned project workspace', async () => {
    WorkspaceFile.exists.mockResolvedValueOnce(null);
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/preview/sessions`)
      .set(authorization())
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(404);
    expect(WorkspaceFile.exists).toHaveBeenCalledWith({ projectId: PROJECT_ID, path: 'index.html' });
    expect(previewService.start).not.toHaveBeenCalled();
  });

  it('returns unavailable rather than claiming a preview started without isolated infrastructure', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/preview/sessions`)
      .set(authorization())
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(503);
    expect(response.body.code).toBe('PREVIEW_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('sessionId');
    expect(response.body).not.toHaveProperty('url');
    expect(previewService.start).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      projectType: 'vite_react',
      entryPath: 'index.html',
    });
  });

  it('mounts the same fail-closed preview contract under /api/v1', async () => {
    const response = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/preview/sessions`)
      .set(authorization())
      .send({ projectType: 'vite_react', entryPath: 'index.html' });

    expect(response.statusCode).toBe(503);
    expect(response.body.code).toBe('PREVIEW_UNAVAILABLE');
  });

  it.each([
    ['status', 'get', 'getStatus'],
    ['stop', 'delete', 'stop'],
  ])('requires project ownership before preview %s requests', async (_label, method, serviceMethod) => {
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)[method](sessionPath()).set(authorization());

    expect(response.statusCode).toBe(404);
    expect(previewService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('rejects malformed session IDs before calling preview status or stop', async () => {
    for (const method of ['get', 'delete']) {
      const response = await request(app)
        [method](sessionPath('not-a-uuid'))
        .set(authorization());
      expect(response.statusCode).toBe(400);
    }
    expect(previewService.getStatus).not.toHaveBeenCalled();
    expect(previewService.stop).not.toHaveBeenCalled();
  });

  it('returns unavailable for status and stop when no isolated service is configured', async () => {
    const status = await request(app).get(sessionPath()).set(authorization());
    const stopped = await request(app).delete(sessionPath()).set(authorization());

    expect(status.statusCode).toBe(503);
    expect(status.body.code).toBe('PREVIEW_UNAVAILABLE');
    expect(stopped.statusCode).toBe(503);
    expect(stopped.body.code).toBe('PREVIEW_UNAVAILABLE');
    expect(previewService.getStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
    });
    expect(previewService.stop).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      sessionId: SESSION_ID,
    });
  });
});
