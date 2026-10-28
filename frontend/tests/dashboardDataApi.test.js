import test from 'node:test'
import assert from 'node:assert/strict'
import { createDashboardDataApi } from '../src/dashboards/dashboardDataApi.js'

test('loads dashboard lists from the authenticated API endpoints', async () => {
  const calls = []
  const api = createDashboardDataApi(async (endpoint) => {
    calls.push(endpoint)
    return {
      '/projects': [{ _id: 'project-1' }],
      '/tasks': { tasks: [{ _id: 'task-1' }] },
      '/scans': [],
    }[endpoint]
  })

  assert.deepEqual(await api.loadOverview(), {
    projects: [{ _id: 'project-1' }],
    tasks: [{ _id: 'task-1' }],
    scans: [],
  })
  assert.deepEqual(calls, ['/projects', '/tasks', '/scans'])
})

test('loads projects when tasks fail', async () => {
  const api = createDashboardDataApi(async (endpoint) => {
    if (endpoint === '/tasks') throw new Error('Tasks unavailable')
    if (endpoint === '/projects') return [{ _id: 'project-1' }]
    return []
  })

  const [projects, tasks, scans] = await Promise.allSettled([
    api.loadProjects(),
    api.loadTasks(),
    api.loadScans(),
  ])

  assert.deepEqual(projects, { status: 'fulfilled', value: [{ _id: 'project-1' }] })
  assert.equal(tasks.status, 'rejected')
  assert.match(tasks.reason.message, /Tasks unavailable/)
  assert.deepEqual(scans, { status: 'fulfilled', value: [] })
})

test('loads projects when scans fail', async () => {
  const api = createDashboardDataApi(async (endpoint) => {
    if (endpoint === '/scans') throw new Error('Scans unavailable')
    if (endpoint === '/projects') return [{ _id: 'project-1' }]
    return { tasks: [{ _id: 'task-1' }] }
  })

  const [projects, tasks, scans] = await Promise.allSettled([
    api.loadProjects(),
    api.loadTasks(),
    api.loadScans(),
  ])

  assert.deepEqual(projects, { status: 'fulfilled', value: [{ _id: 'project-1' }] })
  assert.deepEqual(tasks, { status: 'fulfilled', value: [{ _id: 'task-1' }] })
  assert.equal(scans.status, 'rejected')
  assert.match(scans.reason.message, /Scans unavailable/)
})

test('rejects malformed dashboard list responses rather than treating them as empty', async () => {
  const api = createDashboardDataApi(async (endpoint) => (
    endpoint === '/projects' ? { error: 'Unauthorized' } : []
  ))

  await assert.rejects(api.loadOverview(), /projects response did not match the API contract/)
})

test('propagates HTTP and network failures from the API client', async () => {
  const api = createDashboardDataApi(async () => {
    throw new Error('API GET /projects → 401')
  })

  await assert.rejects(api.loadOverview(), /401/)
})

test('updates a task only when the backend confirms the requested values', async () => {
  const calls = []
  const api = createDashboardDataApi(async (endpoint, options) => {
    calls.push({ endpoint, options })
    return { _id: 'task-1', done: true }
  })
  const saved = await api.updateTask('task-1', { done: true })

  assert.deepEqual(saved, { _id: 'task-1', done: true })
  assert.deepEqual(calls, [{
    endpoint: '/tasks/task-1',
    options: { method: 'PUT', body: { done: true } },
  }])
})

test('rejects task updates not confirmed by the backend response', async () => {
  const api = createDashboardDataApi(async () => ({ _id: 'task-1', done: false }))

  await assert.rejects(
    api.updateTask('task-1', { done: true }),
    /did not confirm the requested changes/
  )
})

test('requires an API request function', () => {
  assert.throws(() => createDashboardDataApi(), /request function is required/)
})
