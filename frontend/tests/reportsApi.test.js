import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportsApi } from '../src/dashboards/reportsApi.js';

test('reports API lists authenticated reports and accepts request cancellation', async () => {
  const calls = [];
  const api = createReportsApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return [{ _id: 'report-1', title: 'Report' }];
  });
  const controller = new AbortController();

  await api.list({ signal: controller.signal });
  assert.deepEqual(calls, [{
    endpoint: '/reports',
    options: { signal: controller.signal },
  }]);
});

test('reports API creates a report through the authenticated shared request', async () => {
  const calls = [];
  const payload = { title: 'Security review' };
  const api = createReportsApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { _id: 'report-1', ...payload };
  });

  await api.create(payload, { token: 'test-token' });

  assert.deepEqual(calls, [{
    endpoint: '/reports',
    options: { token: 'test-token', method: 'POST', body: payload },
  }]);
});

test('reports API deletes by an encoded report ID', async () => {
  const calls = [];
  const api = createReportsApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { message: 'Report deleted.' };
  });

  await api.remove('report/one');
  assert.deepEqual(calls, [{
    endpoint: '/reports/report%2Fone',
    options: { method: 'DELETE' },
  }]);
});

test('reports API requires the shared authenticated request function', () => {
  assert.throws(() => createReportsApi(), /request function is required/);
});
