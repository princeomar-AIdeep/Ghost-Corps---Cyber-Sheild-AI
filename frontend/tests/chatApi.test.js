import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatApi } from '../src/dashboards/chatApi.js';
import { createSubmissionLock } from '../src/dashboards/chatService.js';

test('chat API sends authenticated mode and session data', async () => {
  const calls = [];
  const api = createChatApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { reply: 'Real provider response.' };
  });
  const payload = { message: 'Explain this code.', sessionId: 'session/1', mode: 'code_explainer' };

  await api.send(payload, { token: 'test-token' });

  assert.deepEqual(calls, [{
    endpoint: '/chat',
    options: { token: 'test-token', method: 'POST', body: payload },
  }]);
});

test('generative AI sends its validated mode and returns the provider result', async () => {
  const generatedText = 'Generated content from the configured provider.';
  const calls = [];
  const api = createChatApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return { reply: generatedText, demo: false };
  });
  const payload = {
    message: 'Write a brief security awareness introduction.',
    sessionId: 'session-2',
    mode: 'generative',
  };

  const result = await api.send(payload, { token: 'test-token' });

  assert.deepEqual(calls, [{
    endpoint: '/chat',
    options: { token: 'test-token', method: 'POST', body: payload },
  }]);
  assert.deepEqual(result, { reply: generatedText, demo: false });
});

test('chat submission lock prevents duplicate authenticated chat requests', async () => {
  const lock = createSubmissionLock();
  const calls = [];
  let completeFirst;
  const api = createChatApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return new Promise((resolve) => {
      completeFirst = () => resolve({ reply: 'Provider response.', demo: false });
    });
  });
  const payload = {
    message: 'Create a short introduction.',
    sessionId: 'session-3',
    mode: 'generative',
  };
  const first = lock.run(() => api.send(payload, { token: 'test-token' }));

  assert.equal(lock.pending, true);
  assert.equal(await lock.run(() => api.send(payload, { token: 'test-token' })), false);
  assert.equal(calls.length, 1);
  completeFirst();
  assert.deepEqual(await first, { reply: 'Provider response.', demo: false });
  assert.equal(lock.pending, false);
  assert.deepEqual(calls, [{
    endpoint: '/chat',
    options: { token: 'test-token', method: 'POST', body: payload },
  }]);
});

test('chat history and clearing are scoped to the encoded session ID', async () => {
  const calls = [];
  const api = createChatApi(async (endpoint, options) => {
    calls.push({ endpoint, options });
    return [];
  });

  await api.history('session/1', { token: 'history-token' });
  await api.clearHistory('session/1', { token: 'clear-token' });

  assert.deepEqual(calls, [
    { endpoint: '/chat/history?sessionId=session%2F1', options: { token: 'history-token' } },
    {
      endpoint: '/chat/history?sessionId=session%2F1',
      options: { token: 'clear-token', method: 'DELETE' },
    },
  ]);
});

test('chat API requires the shared request function', () => {
  assert.throws(() => createChatApi(), /request function is required/);
});
