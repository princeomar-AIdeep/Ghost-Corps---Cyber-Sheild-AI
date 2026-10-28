'use strict';

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.PORT = '5001';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const Project = require('../src/models/Project');
const { terminalService, TerminalServiceError } = require('../src/modules/terminal/terminal.service');

jest.mock('../src/models/Project', () => ({
  findOne: jest.fn(),
}));

jest.mock('../src/modules/terminal/terminal.service', () => {
  class MockTerminalServiceError extends Error {
    constructor(code, message, statusCode) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  return {
    TerminalServiceError: MockTerminalServiceError,
    terminalService: {
      submit: jest.fn(),
      getStatus: jest.fn(),
      cancel: jest.fn(),
    },
  };
});

const PROJECT_ID = '65a1b2c3d4e5f67890123456';
const USER_ID = '65f1b2c3d4e5f67890123456';
const JOB_ID = '273fa85b-4c88-4c3c-9167-1e54cb1e0b01';
const app = createApp();

function authorization(userId = USER_ID) {
  const token = jwt.sign(
    { tokenUse: 'access', sub: userId, email: 'terminal@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

function jobPath(jobId = JOB_ID, projectId = PROJECT_ID) {
  return `/api/projects/${projectId}/terminal/jobs/${jobId}`;
}

describe('terminal job API', () => {
  let logSpy;

  beforeEach(() => {
    Project.findOne.mockResolvedValue({ _id: PROJECT_ID, userId: USER_ID });
    terminalService.submit.mockResolvedValue({ jobId: JOB_ID, status: 'queued' });
    terminalService.getStatus.mockResolvedValue({ jobId: JOB_ID, status: 'running' });
    terminalService.cancel.mockResolvedValue({ jobId: JOB_ID, status: 'cancellation_requested' });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('requires authentication before project lookup or broker operations', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(401);
    expect(Project.findOne).not.toHaveBeenCalled();
    expect(terminalService.submit).not.toHaveBeenCalled();
  });

  it('rejects malformed project IDs before ownership lookup', async () => {
    const response = await request(app)
      .post('/api/projects/not-an-object-id/terminal/jobs')
      .set(authorization())
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(400);
    expect(Project.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['missing task type', {}],
    ['unknown task type', { taskType: 'shell_command' }],
    ['legacy free-form command', { command: 'do not execute this' }],
    ['unsupported command syntax', { command: 'pwd; id' }],
    ['task type and command together', { taskType: 'project_test', command: 'npm test' }],
    ['wrong task type shape', { taskType: ['project_test'] }],
  ])('rejects invalid submission: %s', async (_label, body) => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send(body);

    expect(response.statusCode).toBe(400);
    expect(Project.findOne).not.toHaveBeenCalled();
    expect(terminalService.submit).not.toHaveBeenCalled();
  });

  it('requires project ownership before job submission', async () => {
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(404);
    expect(terminalService.submit).not.toHaveBeenCalled();
  });

  it('submits only the validated task type and returns broker acceptance', async () => {
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(202);
    expect(response.body).toEqual({ jobId: JOB_ID, status: 'queued' });
    expect(terminalService.submit).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      taskType: 'project_test',
    });
  });

  it('accepts a supported command for the owned project without logging command text', async () => {
    const command = 'npm run lint';
    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send({ command });

    expect(response.statusCode).toBe(202);
    expect(terminalService.submit).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      command,
    });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(command);
  });

  it('fails closed when the broker is unavailable without logging submitted source or secrets', async () => {
    terminalService.submit.mockRejectedValueOnce(new TerminalServiceError(
      'TERMINAL_UNAVAILABLE',
      'Terminal execution is unavailable.',
      503
    ));

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(503);
    expect(response.body.code).toBe('TERMINAL_UNAVAILABLE');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('Authorization');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('stdout');
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('stderr');
  });

  it('returns a safe timeout response when the worker adapter times out', async () => {
    terminalService.submit.mockRejectedValueOnce(new TerminalServiceError(
      'TERMINAL_TIMEOUT',
      'The terminal broker did not respond before the request timed out.',
      504
    ));

    const response = await request(app)
      .post(`/api/projects/${PROJECT_ID}/terminal/jobs`)
      .set(authorization())
      .send({ taskType: 'project_test' });

    expect(response.statusCode).toBe(504);
    expect(response.body).toEqual({
      code: 'TERMINAL_TIMEOUT',
      error: 'The terminal broker did not respond before the request timed out.',
    });
  });

  it('checks project ownership before job status access', async () => {
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)
      .get(jobPath())
      .set(authorization());

    expect(response.statusCode).toBe(404);
    expect(terminalService.getStatus).not.toHaveBeenCalled();
  });

  it('rejects malformed job IDs before broker status lookup', async () => {
    const response = await request(app)
      .get(jobPath('not-a-uuid'))
      .set(authorization());

    expect(response.statusCode).toBe(400);
    expect(terminalService.getStatus).not.toHaveBeenCalled();
  });

  it('passes authenticated owner and project scope to status lookup', async () => {
    const response = await request(app)
      .get(jobPath())
      .set(authorization());

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ jobId: JOB_ID, status: 'running' });
    expect(terminalService.getStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      jobId: JOB_ID,
    });
  });

  it('checks project ownership before job cancellation', async () => {
    Project.findOne.mockResolvedValueOnce(null);
    const response = await request(app)
      .delete(jobPath())
      .set(authorization());

    expect(response.statusCode).toBe(404);
    expect(terminalService.cancel).not.toHaveBeenCalled();
  });

  it('passes authenticated owner and project scope to cancellation', async () => {
    const response = await request(app)
      .delete(jobPath())
      .set(authorization());

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ jobId: JOB_ID, status: 'cancellation_requested' });
    expect(terminalService.cancel).toHaveBeenCalledWith({
      userId: USER_ID,
      projectId: PROJECT_ID,
      jobId: JOB_ID,
    });
  });

  it('returns unavailable status when status or cancellation cannot reach a broker', async () => {
    terminalService.getStatus.mockRejectedValue(new TerminalServiceError(
      'TERMINAL_UNAVAILABLE',
      'Terminal execution is unavailable.',
      503
    ));
    terminalService.cancel.mockRejectedValue(new TerminalServiceError(
      'TERMINAL_UNAVAILABLE',
      'Terminal execution is unavailable.',
      503
    ));

    const status = await request(app).get(jobPath()).set(authorization());
    const cancel = await request(app).delete(jobPath()).set(authorization());
    expect(status.statusCode).toBe(503);
    expect(status.body.code).toBe('TERMINAL_UNAVAILABLE');
    expect(cancel.statusCode).toBe(503);
    expect(cancel.body.code).toBe('TERMINAL_UNAVAILABLE');
  });
});
