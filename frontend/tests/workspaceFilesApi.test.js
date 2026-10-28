import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceFilesApi } from '../src/dashboards/workspaceFilesApi.js';

test('workspace file API maps listing and reading to the project-scoped GET endpoints', async () => {
  const calls = [];
  const request = async (endpoint, options) => {
    calls.push({ endpoint, options });
    return {};
  };
  const api = createWorkspaceFilesApi(request);
  const controller = new AbortController();

  await api.list('project/1', { token: 'test-token', signal: controller.signal });
  await api.read('project/1', 'src/App.jsx', { token: 'test-token' });

  assert.deepEqual(calls, [
    {
      endpoint: '/projects/project%2F1/files',
      options: { token: 'test-token', signal: controller.signal },
    },
    {
      endpoint: '/projects/project%2F1/files/file?path=src%2FApp.jsx',
      options: { token: 'test-token' },
    },
  ]);
});

test('workspace file API uses the Phase 1 create, update, rename, and delete contracts', async () => {
  const calls = [];
  const api = createWorkspaceFilesApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return {};
  });

  await api.create('project-1', 'src/App.jsx', 'new content', { token: 'test-token' });
  await api.update('project-1', 'src/App.jsx', 'saved content', { token: 'test-token' });
  await api.rename('project-1', 'src/App.jsx', 'src/Main.jsx', { token: 'test-token' });
  await api.delete('project-1', 'src/Main.jsx', { token: 'test-token' });

  assert.deepEqual(calls, [
    {
      endpoint: '/projects/project-1/files',
      options: { token: 'test-token', method: 'POST', body: { path: 'src/App.jsx', content: 'new content' } },
    },
    {
      endpoint: '/projects/project-1/files/file',
      options: { token: 'test-token', method: 'PUT', body: { path: 'src/App.jsx', content: 'saved content' } },
    },
    {
      endpoint: '/projects/project-1/files/rename',
      options: { token: 'test-token', method: 'POST', body: { fromPath: 'src/App.jsx', toPath: 'src/Main.jsx' } },
    },
    {
      endpoint: '/projects/project-1/files/file',
      options: { token: 'test-token', method: 'DELETE', body: { path: 'src/Main.jsx' } },
    },
  ]);
});

test('workspace file API requests the authenticated source archive as a blob', async () => {
  const calls = [];
  const api = createWorkspaceFilesApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return new Blob(['archive']);
  });

  const archive = await api.exportSource('project/1', { token: 'test-token' });

  assert.ok(archive instanceof Blob);
  assert.deepEqual(calls, [{
    endpoint: '/projects/project%2F1/files/export',
    options: { token: 'test-token', responseType: 'blob' },
  }]);
});

test('workspace file API requires a request function', () => {
  assert.throws(() => createWorkspaceFilesApi(), /request function is required/);
});
