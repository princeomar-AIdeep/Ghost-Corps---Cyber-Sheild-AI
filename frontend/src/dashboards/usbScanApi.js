import { apiRequest } from '../lib/api.js'

export const MAX_USB_SCAN_FILES = 500

export function createUsbScanApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A USB scan request function is required.')
  }

  return {
    async scan(deviceLabel, files, token) {
      if (typeof token !== 'string' || !token) {
        throw new Error('Authentication is required to submit a USB scan.')
      }
      if (!Array.isArray(files) || files.length > MAX_USB_SCAN_FILES) {
        throw new Error(`USB scans support at most ${MAX_USB_SCAN_FILES} files per request.`)
      }

      const result = await request('/usb/alert', {
        method: 'POST',
        body: { deviceLabel, files },
        token,
      })
      if (
        !result ||
        typeof result !== 'object' ||
        result.deviceLabel !== deviceLabel ||
        result.filesScanned !== files.length ||
        !Array.isArray(result.threats) ||
        !Array.isArray(result.warnings) ||
        !['Critical', 'High', 'Low'].includes(result.risk) ||
        typeof result.emailSent !== 'boolean' ||
        result.analysisType !== 'heuristic-filenames'
      ) {
        throw new Error('The USB scan service returned an invalid response.')
      }
      return result
    },
  }
}

export async function collectDirectoryFiles(directoryHandle, maxFiles = MAX_USB_SCAN_FILES) {
  const files = []

  async function visit(handle, parentPath = '') {
    for await (const [name, entry] of handle.entries()) {
      const path = parentPath ? `${parentPath}/${name}` : name
      if (entry.kind === 'directory') {
        await visit(entry, path)
        continue
      }
      if (entry.kind !== 'file') continue

      if (files.length >= maxFiles) {
        throw new Error(`The selected folder contains more than ${maxFiles} files. Scan a smaller folder or split it into smaller folders.`)
      }

      let file
      try {
        file = await entry.getFile()
      } catch {
        throw new Error(`Could not read file metadata for "${path}".`)
      }
      files.push({ name: path, size: file.size, type: file.type || '' })
    }
  }

  await visit(directoryHandle)
  return files
}

export const usbScanApi = createUsbScanApi(apiRequest)
