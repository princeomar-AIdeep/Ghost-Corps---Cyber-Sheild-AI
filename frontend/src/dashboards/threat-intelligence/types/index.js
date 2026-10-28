/**
 * Frontend response contracts for the threat intelligence service.
 * These JSDoc types document the expected data shape without inventing an API
 * endpoint or implying that the backend currently returns these records.
 */

/** @typedef {{ totalThreatsDetected: number, maliciousUrls: number, fraudIndicators: number, activeThreatFeeds: number, trends?: Partial<Record<'totalThreatsDetected'|'maliciousUrls'|'fraudIndicators'|'activeThreatFeeds', number>> }} ThreatStatistics */
/** @typedef {{ id: string, occurredAt: string, type: string, indicator: string, risk: 'high'|'medium'|'low', location?: string, detailUrl?: string }} ThreatRecord */
/** @typedef {{ id: string, name: string, status: string, lastUpdated?: string, indicatorCount?: number }} ThreatFeed */
/** @typedef {{ category: string, count: number }} ThreatCategory */
/** @typedef {{ source: string, count: number }} ThreatSource */
/** @typedef {{ id: string, occurredAt: string, latitude: number, longitude: number, risk: 'high'|'medium'|'low', type?: string }} ThreatMapEvent */
/** @typedef {{ indicator: string, type: string, risk: 'high'|'medium'|'low', verdict: string, analyzedAt?: string }} IndicatorSearchResult */
/** @typedef {{ url: string, risk: 'high'|'medium'|'low', verdict: string, indicators?: string[], analyzedAt?: string }} SuspiciousUrlAnalysis */
/** @typedef {{ id: string, type: string, risk: 'high'|'medium'|'low', description: string, detectedAt?: string }} FraudIndicator */
/** @typedef {{ id: string, title: string, createdAt: string, status: string, url?: string }} ThreatReport */

