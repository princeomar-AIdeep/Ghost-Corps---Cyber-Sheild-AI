# GitHub integration readiness

The backend currently provides only a server-side GitHub App user-authorization foundation and a read-only repository listing contract. No frontend integration, repository content access, file synchronization, Git operation, webhook, or deployment behavior is included.

## Required setup

1. Create a GitHub App and enable user authorization.
2. Configure only the approved read-only repository permissions. Repository metadata is required for listing; do not enable write permissions for this phase.
3. Register the exact HTTPS callback URL `https://<backend-host>/api/github/callback` in the GitHub App and configure the same URL on the backend. Local development may use an HTTP callback only on loopback.
4. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, and `GITHUB_DASHBOARD_URL` in the ignored `backend/.env`. `GITHUB_DASHBOARD_URL` must be the frontend URL ending in `/dashboard`; it must use HTTPS except for loopback development. The callback redirects there with only a generic `github=connected` or `github=error` marker.
5. Generate a separate random 32-byte encryption key, store its 64-character hexadecimal representation as `GITHUB_TOKEN_ENCRYPTION_KEY`, and back it up securely. Do not reuse the JWT secret. Losing or changing the key makes existing encrypted GitHub connections unusable.
6. Restart the backend after configuration. OAuth and GitHub API behavior has not been tested against real GitHub credentials in this phase.

The client ID and secret are used only by the backend. The OAuth state is a random value whose SHA-256 hash is stored with its initiating user and a ten-minute expiry; callback consumption is atomic and single-use. Access tokens are stored only as AES-256-GCM ciphertext, IV, and authentication tag. Callback URLs are excluded from HTTP request logging because GitHub includes its one-time code and state in the query string. After callback redirect, the frontend rechecks authenticated connection status and loads repository metadata if connected.

The authenticated repository endpoint lists up to 100 repositories available to the connected GitHub user. It returns a small allowlist of repository metadata and never returns the access token. GitHub App permissions still need to be configured in GitHub; missing backend configuration fails closed.

No GitHub App ID or private key is required for this user-authorization flow. App installation-token operations are not implemented.

If the GitHub App is configured to issue expiring user access tokens, refresh-token rotation is not implemented yet; the read-only API will stop working when such an access token expires. Add encrypted refresh-token storage and rotation before enabling that setting.
