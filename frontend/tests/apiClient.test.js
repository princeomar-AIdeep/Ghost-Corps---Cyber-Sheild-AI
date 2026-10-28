import assert from 'node:assert/strict'
import test from 'node:test'
import { apiRequest } from '../src/lib/api.js'

test('surfaces the backend provider error and status instead of raw JSON', async () => {
  const previousFetch = globalThis.fetch
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = { getItem: () => 'test-token' }
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    text: async () => JSON.stringify({
      error: 'Gemini quota or rate limit was reached. Check Google AI Studio usage and retry later.',
      code: 'AI_PROVIDER_RATE_LIMITED',
    }),
  })

  try {
    await assert.rejects(apiRequest('/chat', { method: 'POST' }), (error) => {
      assert.match(error.message, /Gemini quota or rate limit was reached/)
      assert.match(error.message, /HTTP 429/)
      assert.equal(error.status, 429)
      assert.equal(error.code, 'AI_PROVIDER_RATE_LIMITED')
      return true
    })
  } finally {
    globalThis.fetch = previousFetch
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})
