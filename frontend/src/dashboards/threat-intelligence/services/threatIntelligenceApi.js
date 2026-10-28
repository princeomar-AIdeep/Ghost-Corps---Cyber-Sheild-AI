import { apiRequest } from '../../../lib/api.js'

/**
 * Set each value to the agreed relative API path when the backend contract is
 * available. Null values intentionally prevent requests to assumed endpoints.
 */
export const THREAT_INTELLIGENCE_ENDPOINTS = Object.freeze({
  statistics: null,
  recentThreats: null,
  feeds: null,
  categories: null,
  sources: null,
  mapEvents: null,
  indicatorSearch: null,
  suspiciousUrlAnalysis: null,
  fraudIndicators: null,
  reports: null,
})

async function requestThreatData(key, { signal, method = 'GET', body } = {}) {
  const endpoint = THREAT_INTELLIGENCE_ENDPOINTS[key]
  if (!endpoint) {
    throw new Error(`Threat intelligence endpoint "${key}" has not been configured.`)
  }
  return apiRequest(endpoint, { method, body, signal })
}

export const fetchThreatStatistics = (options) => requestThreatData('statistics', options)
export const fetchRecentThreats = (options) => requestThreatData('recentThreats', options)
export const fetchThreatIntelligenceFeeds = (options) => requestThreatData('feeds', options)
export const fetchThreatCategories = (options) => requestThreatData('categories', options)
export const fetchThreatSources = (options) => requestThreatData('sources', options)
export const fetchGlobalThreatMapEvents = (options) => requestThreatData('mapEvents', options)
export const searchIndicatorsOfCompromise = (query, options = {}) => requestThreatData('indicatorSearch', { ...options, method: 'POST', body: { query } })
export const analyzeSuspiciousUrl = (url, options = {}) => requestThreatData('suspiciousUrlAnalysis', { ...options, method: 'POST', body: { url } })
export const fetchFraudIndicators = (options) => requestThreatData('fraudIndicators', options)
export const fetchThreatReports = (options) => requestThreatData('reports', options)

