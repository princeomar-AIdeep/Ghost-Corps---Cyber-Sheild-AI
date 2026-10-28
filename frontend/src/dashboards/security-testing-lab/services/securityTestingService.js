import { apiRequest } from '../../../lib/api.js'
import { createSecurityTestingApi } from './securityTestingApi.js'

export const {
  fetchScanOverview,
  fetchScanActivity,
  fetchSecurityScanStatistics,
  fetchRecentScans,
  fetchVulnerabilityCategories,
  fetchSeverityDistribution,
  fetchTopVulnerabilities,
  fetchScanReports,
  startSecurityScan,
} = createSecurityTestingApi(apiRequest)
