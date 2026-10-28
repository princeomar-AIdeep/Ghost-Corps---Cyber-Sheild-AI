/** @typedef {{ totalUsers: number, activeSessions: number, blockedAccessAttempts: number, trustedDevices: number, networkAnomalies: number }} IdentitySecurityStatistics */
/** @typedef {{ id: string, occurredAt: string, user: string, action: string, resource: string, status: string }} AccessActivity */
/** @typedef {{ id: string, latitude: number, longitude: number, occurredAt: string, eventType: string, status: 'normal'|'suspicious'|'blocked' }} NetworkAccessEvent */
/** @typedef {{ method: string, count: number, enabled: boolean }} AuthenticationMethod */
/** @typedef {{ trusted: number, untrusted: number, new: number, blocked: number, highRisk: number, other: number }} DeviceTrustDistribution */
/** @typedef {{ timestamp: string, allowed: number, blocked: number, suspicious: number, vpn: number }} NetworkTrafficPoint */
/** @typedef {{ activeUsers: number, inactiveUsers: number, privilegedUsers: number, externalUsers: number, blockedUsers: number, others: number }} IdentityAccessOverview */

