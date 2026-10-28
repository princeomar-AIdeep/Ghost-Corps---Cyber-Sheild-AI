# Terminal Worker Readiness

## Current behavior

The API accepts the fixed `project_test` and `project_build` workflows and a
restricted command set (`pwd`, `ls` within the workspace, Node/npm version
checks, `npm test`, and `npm run <script>`). It requires authentication,
applies the strict rate limiter to job creation and cancellation, and verifies
project ownership before submitting, checking, or cancelling a job.

The default broker launches an ephemeral Docker container using the configured
`TERMINAL_SANDBOX_IMAGE` (default `cyber-shield-terminal:node22`). It uses a
network-disabled container, read-only root filesystem, dropped capabilities,
non-root user, CPU/memory/process limits, bounded output, and a per-job timeout.
Only project files are copied into a temporary workspace; `.env`, `.git`, and
`node_modules` are excluded. Job state is held in the API process and expires
after ten minutes, so it is not durable across restarts.

## Requirements before enabling execution

- Provide Docker access to the backend and build/install the approved sandbox
  image. Do not expose the Docker socket to containers or users.
- Keep the parser's fixed command/argument allowlist; do not add arbitrary
  shell strings, arguments, host paths, ports, or user-selected images.
- Give each job an isolated, ephemeral workspace containing only that
  authorized project's files. Do not mount host paths, other projects, Docker
  sockets, or application environment/secrets into jobs.
- Enforce CPU, memory, process, disk, file-count, output, concurrency, and wall
  clock limits in the worker. Termination and cleanup must be enforced by the
  worker/broker even if the API request disconnects or times out.
- Deny network egress by default. Do not provide job access to internal
  services, cloud metadata, MongoDB, or application credentials.
- Keep the image and Docker runtime patched, and verify the isolation,
  resource-limits, cancellation, timeout, and cleanup behavior when upgrading
  the runtime or image. The job map is process-local and not a durable queue.
