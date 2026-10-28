# Identity & Network Security frontend integration

This feature uses the shared JSON client in `src/lib/api.js`. Paths in `services/identityNetworkApi.js` are deliberately `null` until backend contracts are agreed. Dashboard metrics, access records, map events and traffic values remain empty until real responses are available.

## Operations and expected response shapes

The adapter expects direct object or array responses (not an assumed `{ data: ... }` envelope). Update the adapter to match the backend's agreed response format.

| Function | Request | Expected response |
| --- | --- | --- |
| `fetchIdentitySecurityStatistics` | GET | `IdentitySecurityStatistics` |
| `fetchIdentityAccessOverview` | GET | `IdentityAccessOverview` |
| `fetchNetworkAccessEvents` | GET | `NetworkAccessEvent[]` with coordinates and event status |
| `fetchRecentAccessActivity` | GET | `AccessActivity[]` |
| `fetchAuthenticationMethods` | GET | `AuthenticationMethod[]` |
| `fetchDeviceTrustDistribution` | GET | `DeviceTrustDistribution` |
| `fetchNetworkTrafficOverview` | GET | `NetworkTrafficPoint[]` |
| `fetchAccessPolicies` | GET | agreed access policy array |
| `fetchIdentityUsers` | GET | agreed user array |
| `fetchActiveSessions` | GET | agreed session array |

JSDoc response typedefs are in `types/index.js`. Every operation accepts an optional `AbortSignal` in its options argument. The existing `VITE_API_BASE_URL` and `apiRequest` integration are reused; no route, authentication flow, or server response envelope is assumed.

The supplied world-map artwork is used as the map base. Moving packets are decorative overlays aligned to its routes, not live event locations. The animation respects `prefers-reduced-motion` and remains explicitly labeled as illustrative until a network event service is connected.

