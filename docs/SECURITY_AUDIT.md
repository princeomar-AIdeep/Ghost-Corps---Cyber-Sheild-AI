# Security Audit — CYBER-AGENT AI

**Scope:** `cyber-codex-main/CYBER CODE PRINCE` backend and frontend API integration  
**Date:** 2026-10-25  
**Method:** Source review plus automated tests (mocked MongoDB; no production data; no third-party scanning)

This audit records confirmed issues found in source and the remediation implemented in this pass. It does not claim that the application is free of remaining risk.

## Findings

| ID | Severity | Status | Evidence | Remediation |
|---|---|---|---|---|
| AUD-01 | High | Fixed | `app.js` loaded `.env` during Jest runs, so `delete process.env.OPENAI_API_KEY` did not prevent live provider calls. Baseline chat tests hit OpenAI 429 and Gemini 404. | Skip `dotenv` when `NODE_ENV=test`. Chat/scan/report AI paths also no-op in test. |
| AUD-02 | High | Fixed | `auth.controller.js` logged the OTP when SMTP failed. | Delivery failures log a security event without the code; OTP is cleared. |
| AUD-03 | High | Fixed | OTP stored in plaintext in an in-memory Map. | HMAC-SHA256 of the code with `JWT_SECRET` as pepper; compare with `timingSafeEqual`. |
| AUD-04 | Medium | Fixed | `registerSchema` / `loginSchema` stripped `preAuthToken` via `stripUnknown`, so frontend OTP tokens never reached register/login. | Allow `preAuthToken` on those schemas. |
| AUD-05 | Medium | Fixed | Logout acknowledged the client but did not invalidate the JWT. | Sign with `jti`; in-process revocation list checked in `authenticate`. |
| AUD-06 | Medium | Fixed | Password reset returned 404 when the email was unknown (account enumeration). | Generic success message after a valid reset token. |
| AUD-07 | Medium | Fixed | Duplicate-key handler returned the field name. | Generic 409: “A record with that value already exists.” |
| AUD-08 | Medium | Fixed | `mailer.js` set `tls.rejectUnauthorized: false`. | Use default TLS verification. |
| AUD-09 | Medium | Fixed | USB alert HTML interpolated `deviceLabel` and filenames; JSON included the user email. | HTML-escape fields; do not return the email. |
| AUD-10 | Medium | Fixed | `DELETE /api/users/me` claimed all data was removed but only deleted the User document. | Cascade-delete projects, tasks, scans, reports, and chat messages. |
| AUD-11 | Medium | Fixed | JWT verify did not restrict algorithms. | `jwt.verify(..., { algorithms: ['HS256'] })`. |
| AUD-12 | Medium | Fixed | URL “scans” accepted loopback/private hosts (SSRF footgun if fetching were added). | Reject loopback, RFC1918, and link-local hosts. **The scanner still does not fetch the URL.** |
| AUD-13 | Low | Fixed | OTP had no resend cooldown. | 60-second cooldown. |
| AUD-14 | Low | Fixed | Image scan advertised 10 MB while JSON body limit was 1 MB. | 12 MB JSON limit only on `/api/scans/image`. |
| AUD-15 | Low | Fixed | Chat/report AI used unbounded `fetch` without timeout; Gemini model id was stale. | 15s timeout via `fetchJson`; Gemini `gemini-2.0-flash`. |
| AUD-16 | Low | Fixed | Health response included `env` (NODE_ENV). | Removed. Added `/api/ready`. |
| AUD-17 | Info | Documented | Specialized dashboards (threat intel, investigation, identity, AI defense) have `null` endpoints by design. | Security Testing Lab activity now maps to `/api/scans`. Others remain unconfigured rather than faking data. |
| AUD-18 | Info | Documented | USB monitoring is a user-selected folder plus filename heuristics, not OS USB device control. | API returns `osMonitor: false`. |
| AUD-19 | Info | Documented | File/image scans are heuristic signature checks, not antivirus. | Responses set `analysisType: 'heuristic'` / `antivirus: false`. |
| AUD-20 | Info | Open | JWT revocation is in-process only. Multi-instance deployments need a shared store. | Documented. |
| AUD-21 | Info | Open | OTP store is in-process. Multi-instance needs Redis. | Documented. |
| AUD-22 | Info | Open | No refresh-token rotation. Access JWT default lifetime is 7 days. | Documented. |
| AUD-23 | Info | Open | SMTP must be configured for the frontend registration OTP step. | Honest 500 if mail cannot be sent. |

## Threat-model notes

- **Injection:** Joi `stripUnknown` on validated writes; Mongoose `sanitizeFilter` enabled; controllers use explicit field maps, not client query objects.
- **XSS:** API returns JSON. USB emails escape HTML. React dashboard should keep using text nodes (no `dangerouslySetInnerHTML` added).
- **AuthZ:** Resource queries include `userId: req.user._id` from the JWT, not from the body.
- **SSRF:** User URLs are not fetched. Private/loopback URL scan targets are rejected.
- **AI:** Provider keys stay on the server. User text is wrapped as untrusted. Demo replies are labeled `demo: true`. No shell/tool execution endpoint exists.

## Regression tests

See `backend/tests/otp.test.js`, `backend/tests/security.test.js`, `backend/tests/usb.test.js`, and extended auth/users/health tests.
