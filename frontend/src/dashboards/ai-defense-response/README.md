# AI Defense & Response

The feature is organized in this folder and mounted through the existing workspace navigation. It reuses the existing app shell, toast handling, and `src/lib/api.js` client. The banner image is stored in `assets/ai-defense-hero.png`.

## Backend integration

`services/aiDefenseApi.js` exports the API adapter. `AI_DEFENSE_ENDPOINTS` intentionally contains `null` placeholders; set values only after endpoint paths and contracts are agreed with the backend team. Requests use the existing `apiRequest` helper and accept abort signals. No requests run automatically while endpoint values remain unset.

Integration functions: `fetchDefenseStatistics`, `fetchResponseOverview`, `fetchRecentIncidents`, `fetchSafetyPolicies`, `fetchResponsePlaybooks`, `fetchIncidentTimeline`, `fetchAuditTrails`, `createSafetyPolicy`, and `containIncident`.

Suggested backend-owned response contracts (see `types/aiDefense.js`):

- Statistics: `{ policyViolations, activeIncidents, resolvedIncidents, systemUptime }`.
- Incidents: `{ id, occurredAt, type, severity, status, action? }`.
- Safety policy: `{ id, name, enabled, violationCount }`.
- Playbook: `{ id, name, steps: [{ id, label, status }] }`.
- Timeline event: `{ id, incidentId, label, occurredAt, status }`.

The current interface uses em dashes, empty tables, and waiting-for-backend labels. The radar is decorative and does not indicate a connected response engine. Statuses and metrics should be populated only from service responses.
