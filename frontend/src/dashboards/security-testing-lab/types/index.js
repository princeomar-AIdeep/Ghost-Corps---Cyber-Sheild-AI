/** @typedef {{ totalScans: number, vulnerabilitiesFound: number, criticalIssues: number, averageRiskScore: number|null, resolvedIssues: number }} SecurityScanStatistics */
/** @typedef {{ id: string, scannedAt: string, application: string, scanType: string, status: string, vulnerabilities: number, risk: 'critical'|'high'|'medium'|'low'|'info' }} SecurityScanRecord */
/** @typedef {{ activeScans: number, severityCounts: Record<'critical'|'high'|'medium'|'low'|'info', number> }} ScanOverview */
/** @typedef {{ scanId: string, progress: number, status: 'queued'|'running'|'complete'|'failed', severity?: 'critical'|'high'|'medium'|'low'|'info', updatedAt?: string }} ScanActivityEvent */
/** @typedef {{ category: string, count: number }} VulnerabilityCategory */
/** @typedef {{ severity: 'critical'|'high'|'medium'|'low'|'info', count: number }} SeverityCount */
/** @typedef {{ id: string, name: string, severity: string, affected: string, status: string }} TopVulnerability */
/** @typedef {{ id: string, name: string, status: string, createdAt?: string, downloadUrl?: string }} ScanReport */

