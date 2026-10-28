import test from 'node:test'
import assert from 'node:assert/strict'
import { createFileScanApi, FileScanError } from '../src/dashboards/fileScanApi.js'

function makeApi({ status = 201, body, networkError = false } = {}) {
  const calls = []
  const api = createFileScanApi({
    endpoint: '/api/scans/image',
    createFormData: () => ({ append: (...args) => calls.push({ field: 'append', args }) }),
    createXhr: () => {
      const listeners = new Map()
      const uploadListeners = new Map()
      const xhr = {
        upload: { addEventListener: (name, callback) => uploadListeners.set(name, callback) },
        addEventListener: (name, callback) => listeners.set(name, callback),
        open: (...args) => calls.push({ field: 'open', args }),
        setRequestHeader: (...args) => calls.push({ field: 'header', args }),
        send: (form) => {
          calls.push({ field: 'send', form })
          if (networkError) listeners.get('error')()
          else {
            uploadListeners.get('load')()
            xhr.status = status
            xhr.responseText = JSON.stringify(body)
            listeners.get('load')()
          }
        },
      }
      return xhr
    },
  })
  return { api, calls }
}

const cleanResponse = {
  scan: { _id: 'scan-1' },
  status: 'clean',
  antivirus: { verdict: 'clean', engine: 'ClamAV', engineVersion: '1.5.4' },
}

const infectedResponse = {
  scan: { _id: 'scan-2' },
  status: 'infected',
  antivirus: { verdict: 'infected', engine: 'ClamAV', detectionName: 'Eicar-Test-Signature' },
}

test('uploads a file as multipart with bearer auth and reports upload then scan stages', async () => {
  const { api, calls } = makeApi({ body: cleanResponse })
  const stages = []
  const file = { name: 'sample.pdf', size: 12 }

  const result = await api.scan(file, 'session-token', (stage) => stages.push(stage))

  assert.equal(result.antivirus.verdict, 'clean')
  assert.deepEqual(stages, ['uploading', 'scanning', 'clean'])
  assert.deepEqual(calls.find((call) => call.field === 'append').args, ['file', file, 'sample.pdf'])
  assert.deepEqual(calls.find((call) => call.field === 'header').args, ['Authorization', 'Bearer session-token'])
})

test('preserves infected verdicts and reports threat detected state', async () => {
  const { api } = makeApi({ body: infectedResponse })
  const stages = []
  await api.scan({ name: 'eicar.txt', size: 68 }, 'session-token', (stage) => stages.push(stage))
  assert.deepEqual(stages, ['uploading', 'scanning', 'infected'])
})

test('reports scanner unavailable without converting it into a clean result', async () => {
  const { api } = makeApi({ status: 503, body: { code: 'ANTIVIRUS_UNAVAILABLE', error: 'Scanner unavailable.' } })
  await assert.rejects(api.scan({ name: 'sample.txt', size: 1 }, 'session-token'), (error) => {
    assert.ok(error instanceof FileScanError)
    assert.equal(error.state, 'unavailable')
    return true
  })
})

test('does not mislabel scan-history persistence failures as scanner outages', async () => {
  const { api } = makeApi({ status: 503, body: { code: 'SCAN_PERSISTENCE_FAILED', error: 'Could not save result.' } })
  await assert.rejects(api.scan({ name: 'sample.txt', size: 1 }, 'session-token'), (error) => {
    assert.ok(error instanceof FileScanError)
    assert.equal(error.state, 'failed')
    return true
  })
})

test('rejects malformed or incomplete scan responses', async () => {
  const { api } = makeApi({ body: { status: 'clean', antivirus: { verdict: 'clean' } } })
  await assert.rejects(api.scan({ name: 'sample.txt', size: 1 }, 'session-token'), /confirmed antivirus result/)
})

test('reports network errors as failed scans and requires authentication', async () => {
  const { api } = makeApi({ networkError: true })
  await assert.rejects(api.scan({ name: 'sample.txt', size: 1 }, 'session-token'), /Could not reach/)
  await assert.rejects(api.scan({ name: 'sample.txt', size: 1 }, ''), /Authentication is required/)
})
