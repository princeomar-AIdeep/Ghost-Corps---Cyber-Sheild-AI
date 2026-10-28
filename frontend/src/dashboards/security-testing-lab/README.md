# Security Testing Lab frontend integration

This dashboard reuses the shared authenticated JSON client in `src/lib/api.js`. Scan activity and recent scan history use the existing `/scans` API. Other security-testing analytics endpoints remain unset because the backend does not provide those contracts. No scan data, vulnerability findings, status labels, or metrics are fabricated.

## Operations and response shapes

The adapter currently expects direct object or array responses (not an assumed `{ data: ... }` envelope). Update the adapter when the backend's actual response format is agreed.

| Function | Request | Expected response |
| --- | --- | --- |
| `fetchScanOverview` | GET | `ScanOverview` with active scan count and severity counts |
| `fetchScanActivity` | GET `/scans`, polled every 10 seconds | Maps persisted scan records to `ScanActivityEvent[]` for the Scan Overview visualization |
| `fetchSecurityScanStatistics` | GET | `SecurityScanStatistics` |
| `fetchRecentScans` | GET `/scans` | Persisted user-owned scan records |
| `fetchVulnerabilityCategories` | GET | `VulnerabilityCategory[]` |
| `fetchSeverityDistribution` | GET | `SeverityCount[]` |
| `fetchTopVulnerabilities` | GET | `TopVulnerability[]` |
| `fetchScanReports` | GET | `ScanReport[]` |
| `startSecurityScan` | POST agreed request body | Agreed scan job/result response |

All operations accept an optional `AbortSignal` in their options argument. The existing `VITE_API_BASE_URL` configuration and authentication flow are reused.

The Vulnerability Scan and Code Security Analysis cards open the existing authorized URL/code scan forms. Scan Reports opens the existing report-generation form. These scans use the backend's lightweight heuristics and optional AI enrichment; they are not full vulnerability assessments. Dependency checks, web application testing, dedicated API testing, and vulnerability analytics remain unavailable. The UI reports saved scan statistics and recent records from `/scans` only.

## Data-driven Scan Overview visualization

`SECURITY_TESTING_ENDPOINTS.activity` and `recentScans` both use the authenticated `/scans` route. The response is mapped from persisted backend scan documents; activity severity reflects the scan's `risk` field, not per-finding statistics. Markers are created only from known backend statuses; progress is a display mapping from status, not a live engine percentage. The active count and scan-risk counts are derived from the same records. The UI polls every 10 seconds and aborts the in-flight request when the dashboard unmounts. When the endpoint fails or returns no records, the interface shows an unavailable or empty state; it does not imply a scan is running. `prefers-reduced-motion` disables movement transitions.
