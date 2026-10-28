import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileApi } from '../src/dashboards/profileApi.js';

test('profile API loads the authenticated current user', async () => {
  const calls = [];
  const api = createProfileApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { user: { _id: 'user-1', email: 'user@example.test' } };
  });
  const controller = new AbortController();

  await api.getMe({ signal: controller.signal });
  assert.deepEqual(calls, [{
    endpoint: '/users/me',
    options: { signal: controller.signal },
  }]);
});

test('profile API updates only the caller profile endpoint', async () => {
  const calls = [];
  const api = createProfileApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { user: { displayName: 'Example', avatarUrl: '' } };
  });
  const body = { displayName: 'Example', avatarUrl: '' };

  await api.updateMe(body);
  assert.deepEqual(calls, [{
    endpoint: '/users/me',
    options: { method: 'PUT', body },
  }]);
});
