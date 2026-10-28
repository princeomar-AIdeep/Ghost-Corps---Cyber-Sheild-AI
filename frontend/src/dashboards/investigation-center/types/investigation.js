/**
 * Frontend data contracts for the future investigation service.
 * Counts/distributions should be numbers supplied by the API, never UI defaults.
 * @typedef {{ totalCases: number, openCases: number, evidenceItems: number, analyzedEndpoints: number, detectedAnomalies: number }} InvestigationStatistics
 * @typedef {{ id: string, title: string, severity: string, status: string, createdAt: string }} InvestigationCase
 * @typedef {{ id: string, latitude: number, longitude: number, severity: 'critical'|'suspicious'|'normal'|'unknown', occurredAt: string }} GlobalActivityEvent
 * @typedef {{ category: string, count: number }} DistributionItem
 * @typedef {{ id: string, title: string, occurredAt: string, description?: string }} InvestigationTimelineItem
 * @typedef {{ id: string, name: string, mediaType: string, collectedAt: string }} EvidenceItem
 */
export {}
