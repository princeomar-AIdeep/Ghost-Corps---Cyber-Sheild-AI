import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationApi } from '../src/dashboards/automationApi.js';

test('automation API lists owner-scoped workflow drafts through the shared request', async () => {
  const calls = [];
  const api = createAutomationApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { workflows: [], totalDrafts: 0 };
  });
  const controller = new AbortController();

  await api.listWorkflows({ signal: controller.signal });
  assert.deepEqual(calls, [{
    endpoint: '/automation/workflows',
    options: { signal: controller.signal },
  }]);
});

test('automation API creates a workflow draft without implying execution', async () => {
  const calls = [];
  const payload = { name: 'Weekly review', frequency: 'weekly' };
  const api = createAutomationApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { ...payload, status: 'draft', enabled: false };
  });

  const result = await api.createWorkflowDraft(payload);
  assert.deepEqual(calls, [{
    endpoint: '/automation/workflows',
    options: { method: 'POST', body: payload },
  }]);
  assert.equal(result.status, 'draft');
  assert.equal(result.enabled, false);
});

test('automation API requires the shared request function', () => {
  assert.throws(() => createAutomationApi(), /request function is required/);
});
