/**
 * Backend paths are intentionally unset. Populate only after agreeing the
 * security testing API contract; this adapter never assumes server routes.
 */
export const SECURITY_TESTING_ENDPOINTS = Object.freeze({
  overview: null,
  activity: '/scans',
  statistics: null,
  recentScans: '/scans',
  vulnerabilityCategories: null,
  severityDistribution: null,
  topVulnerabilities: null,
  reports: '/reports',
  startScan: '/scans',
})

export function getSecurityTestingToolModal(title) {
  if (title === 'Heuristic URL Check') return 'Scan URL'
  if (title === 'Code Security Analysis') return 'Scan Code'
  if (title === 'Scan Reports') return 'Create Report'
  return null
}

export function mapScanActivity(scans) {
  if (!Array.isArray(scans)) return []
  return scans.map((scan) => ({
    scanId: String(scan._id || scan.id || ''),
    status: scan.status === 'error' ? 'failed' : scan.status === 'pending' ? 'queued' : scan.status,
    severity: String(scan.risk || 'info').toLowerCase(),
    updatedAt: scan.updatedAt,
  })).filter((item) => item.scanId && ['queued', 'running', 'complete', 'failed'].includes(item.status))
}

export function createSecurityTestingApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A security testing request function is required.')
  }

  async function requestSecurityData(key, { signal, method = 'GET', body } = {}) {
    const endpoint = SECURITY_TESTING_ENDPOINTS[key]
    if (!endpoint) throw new Error(`Security testing endpoint "${key}" has not been configured.`)
    return request(endpoint, { method, body, signal })
  }

  return {
    fetchScanOverview: (options) => requestSecurityData('overview', options),
    /** Maps persisted /api/scans records into ScanActivityEvent objects. */
    fetchScanActivity: async (options) => mapScanActivity(await requestSecurityData('activity', options)),
    fetchSecurityScanStatistics: (options) => requestSecurityData('statistics', options),
    fetchRecentScans: (options) => requestSecurityData('recentScans', options),
    fetchVulnerabilityCategories: (options) => requestSecurityData('vulnerabilityCategories', options),
    fetchSeverityDistribution: (options) => requestSecurityData('severityDistribution', options),
    fetchTopVulnerabilities: (options) => requestSecurityData('topVulnerabilities', options),
    fetchScanReports: (options) => requestSecurityData('reports', options),
    startSecurityScan: (scanRequest, options = {}) => requestSecurityData('startScan', { ...options, method: 'POST', body: scanRequest }),
  }
}
