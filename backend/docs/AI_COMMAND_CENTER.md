# AI Command Center integration

## Provider setup

The AI Command Center uses the authenticated `/api/chat` service. Set a server-side
provider key in `backend/.env`; never put provider credentials in frontend
environment variables or source code.

1. Create a Gemini API key at <https://aistudio.google.com/app/apikey>.
2. Set `GEMINI_API_KEY` in `backend/.env`; `/api/chat` uses Gemini only.
3. Optionally set `GEMINI_MODEL`; the default is `gemini-2.5-flash`.
4. Restart the backend and verify its health endpoint. A real provider response
   requires a valid key, model access, network connectivity, and available quota.
5. `OPENAI_API_KEY` is not used by chat. It remains optional for coding assistant
   and report-summary features when Gemini is not configured.

The chat route rejects likely credential material in prompts, applies
authentication and rate limits, and returns an explicit categorized Gemini
unavailable response instead of a fabricated answer when Gemini fails. Chat history is
associated with the authenticated user and the browser session identifier.

## Feature boundaries

- AI Assistant sends prompts to the authenticated chat endpoint and persists
  actual provider responses and session history.
- Code Explainer, Threat Summarizer, and Security Assistant submit distinct
  instructions to the same chat endpoint; they do not execute code, run scans,
  or claim that a threat was verified.
- Generative AI and Productivity use the same provider-backed chat service.
- Autonomous Agent currently produces a review-only plan. It has no execution
  worker, tools, or autonomous side effects.
- Agent Tasks displays the user's existing saved tasks; it does not create or
  execute tasks autonomously.
- Report Generator creates a persistent report from stored scans. Its stored
  counts and heuristic risk labels are real database values, but are not
  verified threat detections. The AI executive summary is best-effort.

## Verification

Backend contract and provider behavior are covered by mocked Jest tests. These
tests do not verify live provider credentials, external network access, MongoDB
availability, or browser rendering. No provider key or database record is
required for the default test suite.
