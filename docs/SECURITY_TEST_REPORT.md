# Security Test Report

**Date:** 2026-10-25  
**Environment:** local Windows, Jest with mocked Mongoose, `NODE_ENV=test` (`.env` not loaded)

## Baseline (before this pass)

Command: `cd backend && npm test`  
Result: **8 suites, 98 tests passed** (exit 0, ~25s)

Limitation: chat/report tests still issued live OpenAI/Gemini HTTP calls because `app.js` reloaded `.env`. Those calls failed (quota / missing model) and fell back to demo, so assertions still passed. That is **not** evidence that AI integration was verified.

## After this pass

Command and counts are filled after execution in the same session.

Expected new suites: `otp.test.js`, `usb.test.js`, `security.test.js` plus extra cases in auth, users, and health.

Frontend: `cd frontend && npm run build`

## What tests cover

- Register/login validation, mass-assignment strip, generic login errors
- Password letter+number rule
- Logout jti revocation
- OTP hash verify, reuse, attempts, cooldown, no code in HTTP body
- Missing/invalid JWT, alg=none
- Private URL rejection
- USB HTML escape and no email leak
- User delete cascade mock
- Chat demo + prompt-injection payload does not echo secrets
- Health / ready / 404

## What tests do not cover

- Live MongoDB
- Live SMTP delivery
- Live OpenAI/Gemini quality
- Browser E2E
- Multi-instance token revocation
- Real USB hardware

Do not treat a green Jest run as proof of those items.
