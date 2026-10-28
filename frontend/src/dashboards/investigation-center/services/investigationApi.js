import { apiRequest } from '../../../lib/api.js'
export { validateInvestigationCasesResponse } from './investigationResponse.js'

/** Only case records are connected; forensic analysis and evidence storage remain unavailable. */
export const INVESTIGATION_ENDPOINTS = Object.freeze({
  statistics: null,
  caseStatus: null,
  recentCases: '/investigations/cases',
  globalActivity: null,
  anomalyTypes: null,
  timeline: null,
  evidenceTypes: null,
  evidenceItems: null,
  createCase: '/investigations/cases',
  reports: null,
})

async function requestInvestigationData(key, { signal, method = 'GET', body } = {}) {
  const endpoint = INVESTIGATION_ENDPOINTS[key]
  if (!endpoint) throw new Error(`Investigation endpoint "${key}" has not been configured.`)
  return apiRequest(endpoint, { method, body, signal })
}

export const fetchInvestigationStatistics = (options) => requestInvestigationData('statistics', options)
export const fetchCaseStatusDistribution = (options) => requestInvestigationData('caseStatus', options)
export const fetchRecentInvestigationCases = (options) => requestInvestigationData('recentCases', options)
export const fetchGlobalActivityEvents = (options) => requestInvestigationData('globalActivity', options)
export const fetchTopAnomalyTypes = (options) => requestInvestigationData('anomalyTypes', options)
export const fetchInvestigationTimeline = (options) => requestInvestigationData('timeline', options)
export const fetchEvidenceTypeDistribution = (options) => requestInvestigationData('evidenceTypes', options)
export const fetchEvidenceItems = (options) => requestInvestigationData('evidenceItems', options)
export const createInvestigation = (payload, options = {}) => requestInvestigationData('createCase', { ...options, method: 'POST', body: payload })
export const fetchInvestigationReports = (options) => requestInvestigationData('reports', options)
export async function updateInvestigationCase(caseId, updates, options = {}) {
  if (typeof caseId !== 'string' || !caseId) {
    throw new TypeError('A case ID is required.')
  }
  const result = await apiRequest(`/investigations/cases/${encodeURIComponent(caseId)}`, {
    method: 'PUT',
    body: updates,
    signal: options.signal,
  })
  if (
    !result ||
    result._id !== caseId ||
    Object.entries(updates).some(([key, value]) => result[key] !== value)
  ) {
    throw new Error('Investigation case update response did not confirm the requested changes.')
  }
  return result
}
