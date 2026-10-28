import { apiRequest } from '../../../lib/api.js'

/** Endpoint paths intentionally remain unset until the backend contract is agreed. */
export const IDENTITY_NETWORK_ENDPOINTS = Object.freeze({
  statistics: null,
  accessOverview: null,
  networkEvents: null,
  recentActivity: null,
  authenticationMethods: null,
  deviceTrust: null,
  networkTraffic: null,
  accessPolicies: null,
  users: null,
  sessions: null,
})

async function requestIdentityData(key, { signal, method = 'GET', body } = {}) {
  const endpoint = IDENTITY_NETWORK_ENDPOINTS[key]
  if (!endpoint) throw new Error(`Identity and network endpoint "${key}" has not been configured.`)
  return apiRequest(endpoint, { method, body, signal })
}

export const fetchIdentitySecurityStatistics = (options) => requestIdentityData('statistics', options)
export const fetchIdentityAccessOverview = (options) => requestIdentityData('accessOverview', options)
export const fetchNetworkAccessEvents = (options) => requestIdentityData('networkEvents', options)
export const fetchRecentAccessActivity = (options) => requestIdentityData('recentActivity', options)
export const fetchAuthenticationMethods = (options) => requestIdentityData('authenticationMethods', options)
export const fetchDeviceTrustDistribution = (options) => requestIdentityData('deviceTrust', options)
export const fetchNetworkTrafficOverview = (options) => requestIdentityData('networkTraffic', options)
export const fetchAccessPolicies = (options) => requestIdentityData('accessPolicies', options)
export const fetchIdentityUsers = (options) => requestIdentityData('users', options)
export const fetchActiveSessions = (options) => requestIdentityData('sessions', options)

