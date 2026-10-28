const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')

export class FileScanError extends Error {
  constructor(message, state, code = 'FILE_SCAN_FAILED') {
    super(message)
    this.name = 'FileScanError'
    this.state = state
    this.code = code
  }
}

export function createFileScanApi({
  endpoint = `${API_BASE}/scans/image`,
  createXhr = () => new XMLHttpRequest(),
  createFormData = () => new FormData(),
} = {}) {
  return {
    scan(file, token, onStage = () => {}) {
      if (!file || typeof file.size !== 'number') {
        return Promise.reject(new FileScanError('Choose a file first.', 'failed', 'FILE_REQUIRED'))
      }
      if (typeof token !== 'string' || !token) {
        return Promise.reject(new FileScanError('Authentication is required.', 'failed', 'AUTH_REQUIRED'))
      }

      const form = createFormData()
      form.append('file', file, file.name)
      const xhr = createXhr()
      xhr.timeout = 150000

      return new Promise((resolve, reject) => {
        const fail = (message, state = 'failed', code) => reject(new FileScanError(message, state, code))
        xhr.open('POST', endpoint)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.upload.addEventListener('load', () => onStage('scanning'))
        xhr.addEventListener('error', () => fail('Could not reach the antivirus service.'))
        xhr.addEventListener('timeout', () => fail('Antivirus scan timed out.', 'unavailable', 'ANTIVIRUS_TIMEOUT'))
        xhr.addEventListener('abort', () => fail('The file scan was cancelled.'))
        xhr.addEventListener('load', () => {
          let data
          try {
            data = JSON.parse(xhr.responseText)
          } catch {
            fail('The scan service returned an invalid response.')
            return
          }

          if ((xhr.status === 503 && data?.code !== 'SCAN_PERSISTENCE_FAILED')
            || ['ANTIVIRUS_UNAVAILABLE', 'ANTIVIRUS_TIMEOUT'].includes(data?.code)) {
            fail(data.error || 'Antivirus scanner is unavailable.', 'unavailable', data.code)
            return
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            fail(data.error || 'File scan failed.', 'failed', data.code)
            return
          }
          if (!data?.scan?._id || !['clean', 'infected'].includes(data?.antivirus?.verdict)
            || data.status !== data.antivirus.verdict || typeof data.antivirus.engine !== 'string') {
            fail('The scan service did not return a confirmed antivirus result.')
            return
          }

          onStage(data.antivirus.verdict)
          resolve(data)
        })
        onStage('uploading')
        xhr.send(form)
      })
    },
  }
}

export const fileScanApi = createFileScanApi()
