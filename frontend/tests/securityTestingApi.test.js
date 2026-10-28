import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSecurityTestingApi,
  getSecurityTestingToolModal,
  mapScanActivity,
  SECURITY_TESTING_ENDPOINTS,
} from '../src/dashboards/security-testing-lab/services/securityTestingApi.js';

test('security testing scan history uses the authenticated shared /scans contract', async () => {
  const calls = [];
  const api = createSecurityTestingApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return [{ _id: 'scan-1', status: 'complete', risk: 'Low' }];
  });
  const controller = new AbortController();

  const records = await api.fetchRecentScans({ signal: controller.signal });
  assert.equal(SECURITY_TESTING_ENDPOINTS.recentScans, '/scans');
  assert.deepEqual(records, [{ _id: 'scan-1', status: 'complete', risk: 'Low' }]);
  assert.deepEqual(calls, [{
    endpoint: '/scans',
    options: { method: 'GET', body: undefined, signal: controller.signal },
  }]);
});

test('scan activity exposes persisted statuses without inventing progress values', () => {
  assert.deepEqual(mapScanActivity([
    { _id: 'scan-running', status: 'running', risk: 'High' },
    { _id: 'scan-done', status: 'complete', risk: 'Low' },
    { _id: 'scan-pending', status: 'pending', risk: 'Unknown' },
    { _id: 'scan-invalid', status: 'invented', risk: 'Critical' },
  ]), [
    { scanId: 'scan-running', status: 'running', severity: 'high', updatedAt: undefined },
    { scanId: 'scan-done', status: 'complete', severity: 'low', updatedAt: undefined },
    { scanId: 'scan-pending', status: 'queued', severity: 'unknown', updatedAt: undefined },
  ]);
});

test('unsupported security testing endpoints fail without making a request', async () => {
  const request = async () => assert.fail('unexpected request');
  const api = createSecurityTestingApi(request);

  await assert.rejects(api.fetchSecurityScanStatistics(), /has not been configured/);
});

test('heuristic URL check opens the supported URL scan modal, not a general vulnerability scanner', () => {
  assert.equal(getSecurityTestingToolModal('Heuristic URL Check'), 'Scan URL');
  assert.equal(getSecurityTestingToolModal('Dependency Check'), null);
});

test('security testing API requires an injected authenticated request function', () => {
  assert.throws(() => createSecurityTestingApi(), /request function is required/);
});
