import test from 'node:test'
import assert from 'node:assert/strict'
import { validateInvestigationCasesResponse } from '../src/dashboards/investigation-center/services/investigationResponse.js'
import { updateInvestigationCase } from '../src/dashboards/investigation-center/services/investigationApi.js'

test('investigation case response accepts the backend contract', () => {
  const response = {
    cases: [{ _id: 'case-1', title: 'Review alert', status: 'open' }],
    totalCases: 1,
    openCases: 1,
  }
  assert.equal(validateInvestigationCasesResponse(response), response)
})

test('investigation case response rejects malformed counts instead of reporting zero', () => {
  for (const response of [
    { cases: [], totalCases: '0', openCases: 0 },
    { cases: [], totalCases: 1, openCases: 2 },
    { cases: [{ _id: 'case-1', title: 'Case' }], totalCases: 0, openCases: 0 },
    { cases: [{ title: 'Case' }], totalCases: 1, openCases: 0 },
  ]) {
    assert.throws(
      () => validateInvestigationCasesResponse(response),
      /did not match the API contract/
    )
  }
})

test('case status update calls the authenticated backend route and requires confirmation', async () => {
  const originalFetch = globalThis.fetch
  const originalStorage = globalThis.localStorage
  const calls = []
  globalThis.localStorage = { getItem: () => 'test-access-token' }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      json: async () => ({ _id: 'case-1', status: 'resolved' }),
    }
  }

  try {
    const result = await updateInvestigationCase('case-1', { status: 'resolved' })
    assert.deepEqual(result, { _id: 'case-1', status: 'resolved' })
    assert.equal(calls[0].url.endsWith('/investigations/cases/case-1'), true)
    assert.equal(calls[0].options.method, 'PUT')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-access-token')
    assert.equal(calls[0].options.body, JSON.stringify({ status: 'resolved' }))

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ _id: 'case-1', status: 'open' }),
    })
    await assert.rejects(
      updateInvestigationCase('case-1', { status: 'resolved' }),
      /did not confirm the requested changes/
    )
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalStorage
  }
})
