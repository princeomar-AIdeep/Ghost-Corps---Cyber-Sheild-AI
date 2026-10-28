/**
 * Backend-owned AI Defense response contracts.
 * @typedef {{ policyViolations: number, activeIncidents: number, resolvedIncidents: number, systemUptime: number }} DefenseStatistics
 * @typedef {{ id: string, occurredAt: string, type: string, severity: string, status: string, action?: string }} DefenseIncident
 * @typedef {{ id: string, name: string, enabled: boolean, violationCount: number }} SafetyPolicy
 * @typedef {{ id: string, name: string, steps: Array<{ id: string, label: string, status: string }> }} ResponsePlaybook
 * @typedef {{ id: string, incidentId: string, label: string, occurredAt: string, status: string }} IncidentTimelineEvent
 */
export {}
