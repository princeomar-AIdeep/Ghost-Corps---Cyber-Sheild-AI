# Threat Intelligence frontend integration

This feature uses the shared JSON client at `src/lib/api.js`. Endpoint paths are intentionally unset in `services/threatIntelligenceApi.js`; fill them in only after agreeing the backend contract. No threat records, metrics, feed providers, locations, or chart values are supplied by this frontend.

## Operations and expected responses

The service functions currently expect these response shapes. Arrays are direct arrays; no wrapper such as `{ data: ... }` is assumed. Adjust the adapter after the backend response format is agreed.

| Function | Request | Expected response |
| --- | --- | --- |
| `fetchThreatStatistics` | GET | `ThreatStatistics`: `totalThreatsDetected`, `maliciousUrls`, `fraudIndicators`, `activeThreatFeeds`; optional trends keyed by those fields |
| `fetchRecentThreats` | GET | `ThreatRecord[]` |
| `fetchThreatIntelligenceFeeds` | GET | `ThreatFeed[]` |
| `fetchThreatCategories` | GET | `ThreatCategory[]` with category and count |
| `fetchThreatSources` | GET | `ThreatSource[]` with source and count |
| `fetchGlobalThreatMapEvents` | GET | `ThreatMapEvent[]` with event time, coordinates, and risk |
| `searchIndicatorsOfCompromise` | POST `{ query }` | `IndicatorSearchResult[]` |
| `analyzeSuspiciousUrl` | POST `{ url }` | `SuspiciousUrlAnalysis` |
| `fetchFraudIndicators` | GET | `FraudIndicator[]` |
| `fetchThreatReports` | GET | `ThreatReport[]` |

The data contracts are documented as JSDoc typedefs in `types/index.js`. All functions accept an optional `AbortSignal` through the options argument. The shared client's configured API base URL remains controlled by the existing `VITE_API_BASE_URL` setting.

The map panel is a provider-neutral placeholder. Add a map SDK only after selecting a provider and approving any associated dependency or service requirements.

