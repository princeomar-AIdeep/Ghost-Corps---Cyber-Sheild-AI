# Feature API Map
+
+## Core backend
+
+### Authentication and users
+
+- Auth routes: `/api/auth/*`
+- User routes: `/api/users/*`
+- Models: `User`, `GitHubConnection`, `GitHubOAuthState`
+- Security controls: JWT validation, ownership checks, password hashing, OTP handling
+
+### Projects and workspace files
+
+- Routes: `/api/projects/*`
+- Models: `Project`, `WorkspaceFile`, `WorkspaceFileQuota`
+- Features: file CRUD, project ownership, terminal scope, preview scope
+
+### Terminal execution
+
+- Routes: `/api/projects/:projectId/terminal/*`
+- Service: `terminal.service.js`
+- Broker: `localTerminalBroker.js`
+- Model: runtime in-memory job state; no persistent terminal job model in this pass
+
+### Preview lifecycle
+
+- Routes: `/api/projects/:projectId/preview/*`
+- Statuses: queued, building, starting, ready, failed, stopped, unavailable
+- Runtime is contract-level only unless a real preview worker is configured externally
+
+### GitHub integration
+
+- Routes: `/api/github/*`
+- Models: `GitHubConnection`, `GitHubOAuthState`
+- Features: OAuth state, repository listing, import flow, repository actions
+- Requires external GitHub app credentials and callback configuration
+
+### Security and scans
+
+- Routes: `/api/scans`, `/api/reports`, `/api/security/*`
+- Models: `Scan`, `Report`
+- Security controls: validation, ownership checks, audit logs, safe error handling
+
+## Frontend surfaces
+
+- Authentication UI: `frontend/src/AuthPage.jsx`
+- Landing page: `frontend/src/LandingPage.jsx`
+- Dashboard modules: under `frontend/src/dashboards/*`
+- API client modules: under `frontend/src/lib/*` and dashboard-specific services
+
+## Current implementation status
+
+- Terminal isolation: IMPLEMENTED AND TESTED
+- Real preview: BLOCKED — EXTERNAL SETUP REQUIRED
+- GitHub OAuth: BLOCKED — EXTERNAL SETUP REQUIRED
+- Backend app and frontend build: verified in the current workspace
