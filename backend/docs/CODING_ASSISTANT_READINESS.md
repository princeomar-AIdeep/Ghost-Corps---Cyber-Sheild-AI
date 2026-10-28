# Workspace-aware coding assistant

`POST /api/projects/:projectId/assistant/suggestions` (also available under `/api/v1`) is an authenticated, read-only coding-suggestion endpoint. The request supplies a prompt and 1–10 explicit workspace file paths. The backend checks project ownership, loads only those project-scoped files, filters sensitive paths and likely credential material, and returns provider-generated suggestions for human review.

The endpoint does not persist prompts or source, update workspace files, invoke terminal tasks, install packages, use Git, deploy, or expose model tools. The response sets `reviewRequired: true`. Suggested unified diffs must reference selected paths and are never applied automatically.

## Limits and provider behavior

- Prompt: 4 KiB UTF-8.
- Selected paths: 1–10, each at most 512 characters.
- File context: 64 KiB per file, 128 KiB total.
- Provider response: 64 KiB maximum; returned explanation/diff content is bounded to 16 KiB per suggestion.
- Provider request timeout: 15 seconds, with cancellation if the client disconnects.
- Rate limit: 10 requests per authenticated user per 15 minutes, in addition to the API IP limiter.
- Provider keys remain server-side: `GEMINI_API_KEY` selects Gemini `gemini-2.5-flash` by default; otherwise `OPENAI_API_KEY` selects OpenAI `gpt-4o-mini`.
- Missing provider configuration and provider errors return explicit safe errors. This endpoint never substitutes a canned or demo response for a provider reply.

Selected source and the prompt are sent to the configured external AI provider. Do not include information that should not be disclosed to that provider.

Sensitive path and content filters are heuristics. They exclude known secret filenames and patterns but cannot detect all secrets, including novel, encoded, split, or otherwise unrecognized credentials. User prompts, filenames, and file contents are treated as untrusted model input; prompt instructions are not a complete prompt-injection defense. The endpoint has no tools or side-effect capabilities, and its output must be reviewed before any manual use.

Provider behavior is covered with mocked fetch calls. No real provider call or database integration is part of the default test suite.
