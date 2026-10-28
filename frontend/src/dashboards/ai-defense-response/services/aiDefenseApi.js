import { apiRequest } from '../../../lib/api.js'

/** Populate these only after the AI Defense service contract is agreed. */
export const AI_DEFENSE_ENDPOINTS = Object.freeze({
  status: '/ai-defense/status',
  statistics: null,
  responseOverview: null,
  recentIncidents: null,
  safetyPolicies: null,
  responsePlaybooks: null,
  incidentTimeline: null,
  auditTrails: null,
  createPolicy: null,
  containIncident: null,
})

async function requestDefense(key, { signal, method = 'GET', body } = {}) {
  const endpoint = AI_DEFENSE_ENDPOINTS[key]
  if (!endpoint) throw new Error(`AI Defense endpoint "${key}" has not been configured.`)
  return apiRequest(endpoint, { method, body, signal })
}

export const fetchDefenseStatistics = (options) => requestDefense('statistics', options)
export const fetchDefenseStatus = (options) => requestDefense('status', options)
export const fetchResponseOverview = (options) => requestDefense('responseOverview', options)
export const fetchRecentIncidents = (options) => requestDefense('recentIncidents', options)
export const fetchSafetyPolicies = (options) => requestDefense('safetyPolicies', options)
export const fetchResponsePlaybooks = (options) => requestDefense('responsePlaybooks', options)
export const fetchIncidentTimeline = (options) => requestDefense('incidentTimeline', options)
export const fetchAuditTrails = (options) => requestDefense('auditTrails', options)
export const createSafetyPolicy = (payload, options = {}) => requestDefense('createPolicy', { ...options, method: 'POST', body: payload })
export const containIncident = (payload, options = {}) => requestDefense('containIncident', { ...options, method: 'POST', body: payload })
