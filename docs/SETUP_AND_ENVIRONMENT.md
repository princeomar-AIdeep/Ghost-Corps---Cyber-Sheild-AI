# Setup and Environment

Do not copy secrets into this file. Use `backend/.env.example` as the template.

## Prerequisites

- Node.js 22.12+ required by the backend
- MongoDB Atlas or local MongoDB
- SMTP credentials if you use registration OTP, password reset, or USB email alerts
- Gemini API key for live Kira chat replies
- Optional OpenAI API key for coding suggestions and report summaries; it is not a chat fallback

## Backend

```bash
cd "cyber-codex-main/CYBER CODE PRINCE/backend"
copy .env.example .env
# Edit .env: set MONGO_URI, PORT, JWT_SECRET, CORS_ORIGINS
npm install
npm test
npm run dev
```

Required variables: `MONGO_URI`, `PORT`. Set `NODE_ENV` explicitly; if omitted, the backend uses production rules.
In production, `JWT_SECRET` must contain exactly 64 hexadecimal characters representing 32 bytes from a cryptographically secure random source. Startup rejects missing values, malformed values, known placeholders, repeated blocks, low-diversity byte values, and simple ascending/descending sequences. These format checks cannot prove how a value was generated. The development example is a placeholder and is rejected in production. In development/test, a missing secret is generated in memory and sessions reset on restart.
Access tokens issued before token-purpose validation was deployed will be rejected; users must sign in again after deployment.
Registration requires a valid email OTP pre-auth token in production, whether or not `REQUIRE_OTP_REGISTER` is set. In development and test, password-only registration remains the default; set `REQUIRE_OTP_REGISTER=true` to require OTP there as well.
Registration OTP pre-auth tokens are persisted in MongoDB and consumed atomically on registration. Ensure the application database user can create the registration pre-auth collection and its TTL index; provision the model indexes before deployment if automatic index creation is disabled. Expired token records are removed asynchronously by MongoDB.

CORS must list the frontend origin, default `http://localhost:5173`.

## Frontend

```bash
cd "cyber-codex-main/CYBER CODE PRINCE/frontend"
copy .env.example .env
# VITE_API_BASE_URL=http://localhost:5000/api
npm install
npm run dev
npm run build
```

Open `http://localhost:5173`. Use **Get Started** → `/dashboard` for login.

## MongoDB

Set `MONGO_URI` to a database you own. The default backend tests mock Mongoose models and do not connect to MongoDB. One separate Investigation/Automation integration test is opt-in and requires all of these shell environment variables:

- `DASHBOARD_TEST_MONGO_URI`: URI for the dedicated `cyber_shield_dashboard_integration_test` database.
- `DASHBOARD_TEST_APPROVED_HOST`: exact Atlas hostname for that test cluster.
- `DASHBOARD_APP_HOST_DENY`: application-cluster hostname; it must differ from the approved test host.

The integration test fails closed unless the URI uses the separately approved Atlas host and exact test database. With these variables absent it is explicitly skipped. Never set these values to production cluster details. The test creates fixtures under random test-only user IDs and removes only records matching those IDs; it does not drop databases or collections.

## Tests and build

```bash
cd backend && npm test
cd frontend && npm run build
```

Jest sets `NODE_ENV=test` so `.env` is not loaded and live AI keys are not used. To run the opt-in dashboard MongoDB integration test, configure the three dedicated test variables in the test process and run:

```bash
cd backend && npx jest --runInBand tests/investigationAutomation.integration.test.js
```

The integration suite reports a skip when no dedicated test configuration is supplied. All other Investigation/Automation route tests use mocked models and are not MongoDB integration tests.

## External keys and OS permissions

| Feature | Requirement | If missing |
|---|---|---|
| Registration OTP / reset email | SMTP_* | API returns 500; no fake “email sent” |
| Kira chat replies | `GEMINI_API_KEY` | Chat returns HTTP 503 with a configuration or provider error; it does not fabricate a reply or fall back to OpenAI |
| Coding suggestions | `GEMINI_API_KEY` or `OPENAI_API_KEY` | The coding assistant returns an explicit provider-unavailable error |
| Report executive summary | Optional `GEMINI_API_KEY` or `OPENAI_API_KEY` | The report uses a deterministic summary of stored scan data |
| USB folder scan | Chrome/Edge File System Access API | User must pick a folder |
| OS-wide USB/process monitor | Separate local agent (not in this repo) | Unavailable |

## Honest limitations

- URL scans do not fetch the target.
- Image scans do not execute files and are not antivirus.
- USB alerts are filename heuristics on a user-selected directory.
- Investigation supports user-entered case metadata only; it does not collect evidence or perform forensic analysis.
- AI Defense status explicitly reports policy enforcement, containment, response, and audit capabilities as unavailable.
- Automation stores disabled workflow drafts only; no scheduler or execution service is available.
- Specialized threat intelligence and identity/network capabilities still require their real backend contracts.
