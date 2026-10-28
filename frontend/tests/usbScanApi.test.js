import test from 'node:test'
import assert from 'node:assert/strict'
import { collectDirectoryFiles, createUsbScanApi } from '../src/dashboards/usbScanApi.js'

function directory(entries) {
  return {
    async *entries() {
      yield* entries
    },
  }
}

function file(name, size = 10, type = '') {
  return {
    kind: 'file',
    async getFile() {
      return { name, size, type }
    },
  }
}

test('collects file metadata recursively and preserves relative paths', async () => {
  const nestedDirectory = directory([['install.exe', file('install.exe', 42, 'application/octet-stream')]])
  nestedDirectory.kind = 'directory'
  const files = await collectDirectoryFiles(directory([
    ['autorun.inf', file('autorun.inf', 12)],
    ['nested', nestedDirectory],
  ]))

  assert.deepEqual(files, [
    { name: 'autorun.inf', size: 12, type: '' },
    { name: 'nested/install.exe', size: 42, type: 'application/octet-stream' },
  ])
})

test('stops collecting when the backend-supported file count is exceeded', async () => {
  const entries = Array.from({ length: 3 }, (_, index) => [`file-${index}.txt`, file(`file-${index}.txt`)])
  await assert.rejects(collectDirectoryFiles(directory(entries), 2), /more than 2 files/)
})

test('reports file metadata read failures instead of substituting empty metadata', async () => {
  const unreadable = { kind: 'file', getFile: async () => { throw new Error('permission denied') } }
  await assert.rejects(collectDirectoryFiles(directory([['private.txt', unreadable]])), /Could not read file metadata/)
})

test('posts authenticated metadata and validates the backend scan response', async () => {
  const files = [{ name: 'nested/autorun.inf', size: 12, type: '' }]
  const response = {
    deviceLabel: 'USB Drive',
    filesScanned: 1,
    threats: [{ name: 'nested/autorun.inf', severity: 'Critical' }],
    warnings: [],
    risk: 'Critical',
    emailSent: false,
    analysisType: 'heuristic-filenames',
  }
  const calls = []
  const api = createUsbScanApi(async (...args) => {
    calls.push(args)
    return response
  })

  assert.equal(await api.scan('USB Drive', files, 'access-token'), response)
  assert.deepEqual(calls, [[
    '/usb/alert',
    { method: 'POST', body: { deviceLabel: 'USB Drive', files }, token: 'access-token' },
  ]])
})

test('does not convert missing authentication or malformed backend results into success', async () => {
  const api = createUsbScanApi(async () => ({
    deviceLabel: 'USB Drive',
    filesScanned: 0,
    threats: [],
    warnings: [],
    risk: 'Low',
    emailSent: false,
    analysisType: 'heuristic-filenames',
  }))

  await assert.rejects(api.scan('USB Drive', [], ''), /Authentication is required/)
  await assert.rejects(api.scan('USB Drive', [{ name: 'file.txt', size: 1 }], 'access-token'), /invalid response/)
})
