import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalApi } from '../src/dashboards/terminalApi.js';

test('terminal submission uses the project-scoped typed task endpoint', async () => {
  const calls = [];
  const unavailable = new Error('TERMINAL_UNAVAILABLE');
  const api = createTerminalApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    throw unavailable;
  });

  await assert.rejects(
    api.submit('project/1', 'project_test', { token: 'test-token' }),
    unavailable
  );
  assert.deepEqual(calls, [{
    endpoint: '/projects/project%2F1/terminal/jobs',
    options: {
      token: 'test-token',
      method: 'POST',
      body: { taskType: 'project_test' },
    },
  }]);
});

test('supported command submission uses the authenticated project-scoped job endpoint', async () => {
  const calls = [];
  const api = createTerminalApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { jobId: 'job-id', status: 'queued' };
  });

  await api.submitCommand('project-1', 'npm test', { token: 'test-token' });

  assert.deepEqual(calls, [{
    endpoint: '/projects/project-1/terminal/jobs',
    options: {
      token: 'test-token',
      method: 'POST',
      body: { command: 'npm test' },
    },
  }]);
});

test('terminal status and cancellation requests target opaque job IDs', async () => {
  const calls = [];
  const api = createTerminalApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { jobId: 'job-id' };
  });
  const jobId = '273fa85b-4c88-4c3c-9167-1e54cb1e0b01';

  await api.getStatus('project-1', jobId, { token: 'status-token' });
  await api.cancel('project-1', jobId, { token: 'cancel-token' });

  assert.deepEqual(calls, [
    {
      endpoint: `/projects/project-1/terminal/jobs/${jobId}`,
      options: { token: 'status-token' },
    },
    {
      endpoint: `/projects/project-1/terminal/jobs/${jobId}`,
      options: { token: 'cancel-token', method: 'DELETE' },
    },
  ]);
});

test('terminal API requires a shared request function', () => {
  assert.throws(() => createTerminalApi(), /request function is required/);
});
