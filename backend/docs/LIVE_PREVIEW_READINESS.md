# Live Preview Readiness

## Current status

The Student/Developer Dashboard preview panel is intentionally unavailable and
states that project code has not been run. No isolated preview service, worker,
deployment manifest, or preview-specific configuration exists in this
repository. The backend preview API is an authenticated, owner-scoped contract
that fails closed with `PREVIEW_UNAVAILABLE`; it does not serve project files,
create a session, or execute code.

The only accepted project type in the contract is `static_web`, with an
HTML entry file already present in the authenticated user's project workspace.
This is a request boundary, not proof that the project is safe to render.
Static HTML can contain JavaScript and must be served from an isolated origin
and runtime, not from Express or the application origin.

## API contract

- `POST /api/projects/:projectId/preview/sessions` requests a preview for
  `{ "projectType": "static_web", "entryPath": "index.html" }`.
- `GET /api/projects/:projectId/preview/sessions/:sessionId` requests status.
- `DELETE /api/projects/:projectId/preview/sessions/:sessionId` requests stop.
- Equivalent routes are mounted under `/api/v1`.

Routes require authentication and the strict rate limiter. Each operation
checks project ownership. Start validates the type and relative HTML path,
then verifies the entry file exists in that project before calling the
service. The service forwards only the authenticated user/project scope,
validated type/path, and opaque server-generated session ID. It never forwards
commands, ports, host paths, or source contents.

The adapter boundary applies a 10-second API request timeout and abort signal.
That timeout does not enforce a preview runtime's lifetime or prove a remote
session was terminated; the isolated broker/runtime must enforce independent
wall-clock and resource limits.

## Requirements before enabling preview

- Deploy an isolated preview broker/runtime separately from Express. Give it a
  separate least-privilege identity; do not expose Docker or its socket to the
  API process.
- Authenticate broker communication and verify user/project/session ownership
  on every start, status, and stop request. Persist session associations,
  quotas, expiration, cancellation, and cleanup outside the API process.
- Support only explicitly reviewed project types. Do not accept arbitrary
  commands, package scripts, images, ports, host paths, or user-selected
  runtime settings.
- Mount only the selected project's files read-only where possible. Keep
  application secrets, environment files, credentials, host files, and other
  project workspaces unavailable to preview jobs.
- Serve previews on a separate untrusted origin with browser isolation
  controls. Do not proxy arbitrary user-selected ports through the API or
  allow previews to access application cookies or internal services.
- Enforce CPU, memory, process, storage, file-count, concurrent-session,
  bandwidth, output, and wall-clock limits in the runtime. Ensure stop,
  expiration, and resource cleanup are enforced even if API requests time out.
- Deny network egress by default, including cloud metadata, MongoDB, internal
  services, and application credentials. Independently verify the deployed
  network policy and isolation controls before enabling an adapter.

No real preview runtime is configured. Keep the service unconfigured until
these controls are implemented and independently verified.
