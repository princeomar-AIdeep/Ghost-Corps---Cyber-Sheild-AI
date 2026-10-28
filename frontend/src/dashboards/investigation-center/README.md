# Investigation Center frontend

This feature is isolated under `investigation-center/`. Its page is mounted by the existing workspace sidebar; it reuses the app shell, shared toast, and `src/lib/api.js` request client. The supplied hero and world map assets are feature-local copies.

## Backend connection points

`services/investigationApi.js` contains the integration adapter. Endpoint values are intentionally `null`; provide agreed paths there when the backend contract exists. No network request runs until a path is configured. Requests go through the existing `apiRequest` client and accept an `AbortSignal`.

Available integration functions: `fetchInvestigationStatistics`, `fetchCaseStatusDistribution`, `fetchRecentInvestigationCases`, `fetchGlobalActivityEvents`, `fetchTopAnomalyTypes`, `fetchInvestigationTimeline`, `fetchEvidenceTypeDistribution`, `fetchEvidenceItems`, `createInvestigation`, and `fetchInvestigationReports`.

Suggested response shapes (documented as frontend contracts in `types/investigation.js`):

- Statistics: `{ totalCases, openCases, evidenceItems, analyzedEndpoints, detectedAnomalies }`, all numeric values from the service.
- Distributions: arrays of `{ category, count }`.
- Cases: arrays of `{ id, title, severity, status, createdAt }`.
- Activity map events: arrays of `{ id, latitude, longitude, severity, occurredAt }`.
- Timeline: arrays of `{ id, title, occurredAt, description? }`.
- Evidence: arrays of `{ id, name, mediaType, collectedAt }`.
- Create-case accepts a backend-approved payload; reports return the backend's agreed report schema.

The UI currently does not request these endpoints and presents empty, waiting-for-backend states. The world-map packet animation is illustrative decoration only: it does not use event data and is not a live activity indicator. Respect `prefers-reduced-motion` is built in.
