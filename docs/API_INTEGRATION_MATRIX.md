# API Integration Matrix

| Dashboard or feature | Existing frontend action | API endpoint and method | Auth | Model / service | Status | Tests | Remaining work |
|---|---|---|---|---|---|---|---|
| Health | (ops) | `GET /api/health` | No | Process | Implemented and verified | `health.test.js` | None |
| Readiness | (ops) | `GET /api/ready` | No | MongoDB connection state | Implemented and verified | `health.test.js` | 503 in non-test when DB is down |
| Register | AuthPage create account + OTP | `POST /api/auth/send-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/register` | No | User, SMTP, OTP store | Implemented but needs SMTP for the UI OTP step | `auth.test.js`, `otp.test.js` | SMTP configuration |
| Login | AuthPage sign in | `POST /api/auth/login` | No | User, JWT | Implemented and verified | `auth.test.js` | Optional `REQUIRE_OTP_LOGIN` |
| Forgot password | AuthPage reset | `POST /api/auth/send-otp` (reset), `POST /api/auth/reset-password` | No | User, SMTP | Implemented and verified | `otp.test.js` | SMTP |
| Session | `/dashboard` + logout | `GET /api/auth/me`, `POST /api/auth/logout` | JWT | JWT jti list | Implemented and verified | `auth.test.js` | Shared revocation store for multi-instance |
| Projects | New/Edit/Delete Project modals | `GET/POST /api/projects`, `PUT/DELETE /api/projects/:id` | JWT | Project | Connected; edit/delete target the selected project | `projects.test.js` | None |
| Tasks | Add Task, checkbox | `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/:id` | JWT | Task | Add and completion updates use the existing owner-scoped routes | `tasks.test.js` | Task title-edit modal has no active UI entry point |
| Chat / Kira | Dashboard chat box | `POST /api/chat`, `GET/DELETE /api/chat/history` | JWT | ChatMessage, OpenAI/Gemini | Implemented and verified (demo without keys) | `chat.test.js`, `security.test.js` | Real model output requires a paid/valid key |
| URL / code scan | Scan URL / Scan Code modals | `POST /api/scans` | JWT | Scan (heuristic ± AI text) | Implemented and verified as **heuristic** | `scans.test.js`, `security.test.js` | Does not crawl or exploit the target |
| File analyze modal | Analyze File | None (toast points to Image Scanner) | — | — | Partially implemented | — | Wire modal to `/api/scans/image` if desired |
| Image scanner | Security Testing Lab upload | `POST /api/scans/image` | JWT | Scan | Implemented and verified as **heuristic** | (covered via schema + image controller) | Not antivirus |
| Reports | Create Report modal and Reports section | `POST/GET /api/reports`, `DELETE /api/reports/:id` | JWT | Report, Scan | Connected; report list/delete UI uses existing owner-scoped routes | `reports.test.js`, frontend reports API tests | Report output is a persisted text summary, not a PDF |
| Profile | Profile section form | `GET/PUT /api/users/me` | JWT | User | Connected for the current user's display name and avatar URL | `users.test.js`, frontend profile API tests | Account deletion is intentionally not exposed here |
| USB monitor | UsbMonitor Scan Drive | `POST /api/usb/alert` | JWT | Scan + mailer | Implemented as **filename heuristic** | `usb.test.js` | Needs a native agent for real USB events |
| Security Testing Lab | URL/code forms, recent scans, activity, saved metrics, report shortcut | `GET/POST /api/scans`, `POST /api/reports` | JWT | Scan, Report | Connected to existing heuristic scan/report contracts | `scans.test.js`, `reports.test.js`, frontend API tests | Not full DAST, dependency scanning, or a malware scanner |
| Threat Intelligence: Suspicious URLs shortcut | Opens the existing authorized URL scan modal | `POST /api/scans` via existing modal | JWT | Scan heuristic | Connected as a heuristic scan shortcut, not threat intelligence | `scans.test.js` | No threat feeds, IOC lookup, fraud analytics, or verified reputation |
| AI Command Center tools | Code Explainer and Threat Summarizer prepare prompts for existing chat; Report Generator opens report modal | `POST /api/chat`, `POST /api/reports` | JWT | ChatMessage, configured AI provider, Report | Connected to existing assistant/report flows | `chat.test.js`, `reports.test.js` | Chat is demo-labeled when no provider is configured; no project context is attached automatically |
| Threat Intelligence Center | Threat feeds, IOC, fraud, sources, maps | endpoints `null` | — | — | Missing except Suspicious URLs heuristic shortcut | — | Needs a real intelligence provider/contract; do not fake feeds |
| Investigation Center | New Investigation, Recent Cases | `GET/POST /api/investigations/cases`, `PUT /api/investigations/cases/:caseId` | JWT | InvestigationCase, optional owner-checked Project | Connected for user-entered case records only | `investigations.test.js` | No evidence upload/storage, forensic analysis, activity maps, anomaly detection, timeline, or generated reports |
| Identity & Network | Access policies, sessions, network events | `null` | — | — | Missing except User Management opens the caller's Profile page | — | No IAM/session/network event model or routes |
| AI Defense & Response | Service availability | `GET /api/ai-defense/status` | JWT | Explicit unavailable capability response | Connected to fail-closed status only | `aiDefense.test.js` | No policy enforcement, incident management, containment, response engine, or audit event service |
| Automation Hub | Create Workflow, Workflows list | `GET/POST /api/automation/workflows` | JWT | AutomationWorkflow | Connected for owner-scoped disabled drafts only | `automation.test.js`, frontend automation API tests | No workflow steps/targets, scheduler, templates, execution, or run history; drafts cannot execute |
| `/api/v1/*` | unused by frontend | Mirrors `/api/*` | Same | Same | Implemented | health dual path | Frontend still uses `/api` |

Aliases: `/api` and `/api/v1` mount the same routers.
