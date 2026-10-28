import test from 'node:test'
import assert from 'node:assert/strict'
import { createGitHubApi } from '../src/dashboards/githubApi.js'

test('GitHub connection status uses the authenticated endpoint and validates its response', async () => {
  const calls = []
  const api = createGitHubApi(async (endpoint, options) => {
    calls.push({ endpoint, options })
    return { available: true, connected: false }
  })
  const signal = new AbortController().signal

  assert.deepEqual(await api.getConnection({ signal }), { available: true, connected: false })
  assert.deepEqual(calls, [{ endpoint: '/github/connection', options: { signal } }])
  await assert.rejects(
    createGitHubApi(async () => ({ available: 'yes', connected: false })).getConnection(),
    /did not match the API contract/
  )
})

test('GitHub authorization starts with a POST and accepts only GitHub OAuth destinations', async () => {
  const calls = []
  const api = createGitHubApi(async (endpoint, options) => {
    calls.push({ endpoint, options })
    return { authorizationUrl: 'https://github.com/login/oauth/authorize?state=opaque' }
  })

  await api.startAuthorization()
  assert.deepEqual(calls, [{ endpoint: '/github/connect', options: { method: 'POST' } }])
  await assert.rejects(
    createGitHubApi(async () => ({ authorizationUrl: 'https://evil.example/authorize' })).startAuthorization(),
    /not an approved GitHub destination/
  )
})

test('GitHub repository listing validates and returns only repository metadata', async () => {
  const api = createGitHubApi(async (endpoint) => {
    assert.equal(endpoint, '/github/repositories')
    return {
      repositories: [{
        id: 7,
        name: 'demo',
        fullName: 'octo/demo',
        private: true,
        htmlUrl: 'https://github.com/octo/demo',
        defaultBranch: 'main',
      }],
    }
  })

  assert.deepEqual(await api.listRepositories(), {
    repositories: [{
      id: 7,
      name: 'demo',
      fullName: 'octo/demo',
      private: true,
      htmlUrl: 'https://github.com/octo/demo',
      defaultBranch: 'main',
    }],
  })
  await assert.rejects(
    createGitHubApi(async () => ({
      repositories: [{ id: 1, fullName: 'octo/demo', private: false, htmlUrl: 'https://evil.example', defaultBranch: 'main' }],
    })).listRepositories(),
    /unapproved URL/
  )
})

test('GitHub API requires a shared authenticated request function', () => {
  assert.throws(() => createGitHubApi(), /request function is required/)
})
