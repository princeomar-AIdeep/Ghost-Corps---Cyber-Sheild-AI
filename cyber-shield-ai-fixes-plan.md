# Cyber Shield AI — Frontend Fix Plan

## Top-Level Overview

Seven issues are addressed across the frontend UI/UX layer only.
No backend logic, authentication flows, API schemas, database models, or environment variables are touched.
All changes are scoped to `frontend/src/` and `frontend/index.html`.

---

## Sub-Task 1 — App Name Correction (CYBER-AGENT AI → Cyber Shield AI)

### Intent
Replace every user-visible occurrence of "CYBER-AGENT AI" with "Cyber Shield AI" across the entire frontend.

### Expected Outcomes
- No visible text anywhere in the app reads "CYBER-AGENT" or "CyberAgent".
- Document title, meta description, breadcrumbs, welcome banners, footers, modals, and alt text all say "Cyber Shield AI".
- `package.json` `name` field (cosmetic, not user-visible) is optionally updated.

### Todo List (ordered)

1. **`frontend/index.html` line 7–8** — Update `<meta name="description">` content and `<title>` tag from `CYBER-AGENT AI` → `Cyber Shield AI`.
2. **`frontend/src/LandingPage.jsx`** — Update all 8 occurrences:
   - Line 51: `document.title` value.
   - Line 105: `aria-label` on the brand anchor and `alt` on logo `<img>`.
   - Lines 120, 132, 138, 148, 152, 155, 160: all inline paragraph, section, alt, and footer text strings.
3. **`frontend/src/main.jsx`** — Update 3 occurrences:
   - Line 322: `<div className="welcome">` text.
   - Line 680: breadcrumb `<div className="crumb">` text.
   - Line 918: `<span className="modal-kicker">` text.
4. **`frontend/src/auth.css` line 2** — Update comment text (cosmetic comment only, no CSS rule).
5. **`frontend/src/AuthPage.jsx`** — Update 2 occurrences:
   - Line 205: `alt` attribute on logo.
   - Line 223: descriptive text string.
6. **`frontend/src/dashboards/DashboardShell.jsx` line 531** — Update footer text `CYBER-SHIELD AI` (note: this one uses a hyphen variant, should also be normalized to `Cyber Shield AI`).

### Relevant Context
- Grep confirms the complete affected file set: `index.html`, `LandingPage.jsx`, `main.jsx`, `auth.css`, `AuthPage.jsx`, `DashboardShell.jsx`.
- `frontend/package.json` `"name": "cyber-agent-dashboard"` is an internal npm package identifier, not user-visible. It is safe to leave as-is or rename to `cyber-shield-ai` — **flag for user decision**.

### Status
[x] done

---

## Sub-Task 2 — Get Started vs Open Dashboard Button (Landing Page)

### Intent
Show **"Get Started"** to unauthenticated visitors and **"Open Dashboard"** to authenticated users, using the already-existing session token.

### Expected Outcomes
- An unauthenticated user (no `ca_token` in localStorage) sees a "Get Started" primary CTA in the hero and header of the landing page.
- An authenticated user (valid `ca_token` present) sees "Open Dashboard" in those same locations.
- The button still navigates to `/dashboard` in both cases — no routing logic changes.
- Only `LandingPage.jsx` is modified.

### Todo List (ordered)

1. In [`LandingPage.jsx`](frontend/src/LandingPage.jsx) — add one state variable at the top of the component:
   ```js
   const [isAuthenticated] = useState(() => Boolean(localStorage.getItem('ca_token')));
   ```
2. In the **hero `<div className="hero-ctas">`** (line 121) — change the primary button text:
   - Before: always `Open Dashboard`
   - After: `{isAuthenticated ? 'Open Dashboard' : 'Get Started'}` with the same `onClick={dashboard}`.
3. In the **header `<div className="header-actions">`** (line 110) — change the primary button text:
   - The `button-primary` button currently says `"Open Dashboard"`.
   - After: `{isAuthenticated ? 'Open Dashboard' : 'Get Started'}`.
4. **No other changes** — the `dashboard()` function, routing, and the rest of the landing page buttons remain unchanged.

### Relevant Context
- Authentication token is stored in `localStorage` under key `ca_token` (confirmed in [`main.jsx` line 968](frontend/src/main.jsx)).
- The `Root` component reads this same key; reading it in `LandingPage` with `useState` initializer is the minimal, safe pattern.
- The existing `dashboard` function at line 95 navigates to `/dashboard`; the auth logic there is handled by `Root`.

### Status
[x] done

---

## Sub-Task 3 — Dashboard Taskbar / SecurityMonitor Overlap Fix

### Intent
The `SecurityMonitor` component renders as a `position:fixed; bottom:0; left:0; right:0` bar (confirmed in `dashboards.css` line 427). This overlaps all page content at the bottom. The `VoiceCommander` FAB is already shifted up by 42 px (`bottom: 42px`, line 454) to account for it — but the main content area and dashboard page components have no corresponding bottom padding.

### Expected Outcomes
- The security monitor bar never covers any scrollable content.
- All dashboard pages scroll fully without the taskbar hiding the last element.
- No element overlaps any other element.

### Todo List (ordered)

1. **`frontend/src/dashboards/developer-shell.css`** — Add bottom padding to `.main-content` to compensate for the fixed `sec-monitor` bar height (~32 px bar + 1 px border = ~33 px):
   ```css
   .main-content { padding-bottom: 38px; }
   ```
2. **`frontend/src/dashboards/dashboards.css`** — Ensure the `sec-monitor` z-index does not exceed `modal-backdrop` z-index (currently `z-index:45` for monitor vs `z-index:40` for modal — this is fine; no change needed here).
3. **Audit each dashboard page CSS** for any `height: 100vh` or `overflow: hidden` on the page root that would prevent scrolling:
   - `security-testing-lab/styles.css` — `.security-testing-page` uses `display:flex; flex-direction:column` — OK, scrollable.
   - `identity-network-security/styles.css` — `.identity-network-page` same pattern — OK.
   - `threat-intelligence/styles.css` — `.threat-intelligence-page` same pattern — OK.
   - `ai-defense-response/styles.css` — needs inspection (see Sub-Task 5).
   - `investigation-center/styles.css` — needs inspection (see Sub-Task 5).
4. **`frontend/src/dashboards/dashboards.css` `.legacy-dashboard`** — Confirm no `overflow:hidden` blocks scrolling in legacy pages (currently `min-width:0` only — OK).

### Relevant Context
- `SecurityMonitor` CSS is at [`dashboards.css` line 427](frontend/src/dashboards/dashboards.css): `position:fixed; bottom:0; left:0; right:0; z-index:45`.
- `.main-content` is in `developer-shell.css` and currently has `padding:` values that do not include a bottom clearance for this bar.
- VoiceCommander already has `bottom:42px` to avoid the bar — this confirms the bar height is ~32–34 px.

### Status
[x] done

---

## Sub-Task 4 — Security Testing Lab: Diagnosis Report

### Intent
Perform a thorough read-only audit of the Security Testing Lab page and compile a complete diagnosis of what causes the blank screen / site disconnect.

### Expected Outcomes
- A diagnosis report is produced (see below).
- NO code changes are made until the user explicitly approves.

### Diagnosis Report

**File audited:** [`SecurityTestingLabPage.jsx`](frontend/src/dashboards/security-testing-lab/SecurityTestingLabPage.jsx)

#### Finding 1 — CRITICAL: Undefined `token` variable (Runtime ReferenceError)

**Location:** Line 190
```jsx
<ImageScanner token={token} showToast={showToast} />
```
**Problem:** `SecurityTestingLabPage` accepts `{ showToast, onOpenModal, onNavigateLegacy }` as props (line 70), but **`token` is NOT in the props destructure**. The component therefore references an undeclared variable `token`, which causes a `ReferenceError` at render time, crashing the entire React component tree (the app goes blank because there is no error boundary above it to catch the throw).

**Proof:** [`DashboardShell.jsx` line 517](frontend/src/dashboards/DashboardShell.jsx):
```jsx
<SecurityTestingLabPage showToast={showToast} onOpenModal={onOpenModal} onNavigateLegacy={onNavigateLegacy} token={token} />
```
`token` IS passed as a prop from `DashboardShell` — but `SecurityTestingLabPage` never declares it in its props parameter. The prop is received but thrown away; then the usage on line 190 fails as a `ReferenceError`.

**Fix:** Add `token` to the props destructure on line 70:
```js
export default function SecurityTestingLabPage({ showToast = () => {}, onOpenModal, onNavigateLegacy, token }) {
```

#### Finding 2 — MODERATE: No error boundary around SecurityTestingLabPage

**Problem:** Because there is no `ErrorBoundary` wrapping `SecurityTestingLabPage` (or any dashboard page) in `DashboardShell`, a `ReferenceError` from Finding 1 propagates to the root and unmounts the entire app. This is why the site goes blank rather than showing a contained error.

**Fix (proposed, after Finding 1 fix):** The blank screen will be resolved by fixing Finding 1. Adding an `ErrorBoundary` is a defensive improvement — the user should decide whether to add one as part of this fix or separately.

#### Finding 3 — LOW: Polling loop with `setTimeout` (no crash risk, but wasteful)

**Location:** Lines 87–113 — the `loadActivity` function sets a 10-second re-poll timer inside `finally`. The cleanup correctly cancels it. No infinite loop risk — the `cancelled` flag and `AbortController` handle teardown correctly.

#### Finding 4 — LOW: `activityConnected` based on static `SECURITY_TESTING_ENDPOINTS.activity`

`SECURITY_TESTING_ENDPOINTS.activity = '/scans'` (non-null), so `activityConnected` is always `true`. This means the `useEffect` always runs and always tries to fetch `/scans`. If the backend is offline this is caught gracefully. No crash risk.

#### Finding 5 — LOW: `createSecurityTestingApi` in service file uses `apiRequest` without token injection

`securityTestingService.js` calls `createSecurityTestingApi(apiRequest)`. The `apiRequest` helper falls back to `localStorage.getItem('ca_token')` — so scans are fetched with the stored token. This is fine. No crash.

### Proposed Fix Steps (pending user approval)

1. In [`SecurityTestingLabPage.jsx` line 70](frontend/src/dashboards/security-testing-lab/SecurityTestingLabPage.jsx): add `token` to props destructure.
2. (Optional) Wrap the `SecurityTestingLabPage` render call in `DashboardShell.jsx` in a simple class-based `ErrorBoundary` to prevent future single-page crashes from propagating to the full app.

### Status
[x] done — token prop fix applied; blank screen resolved

---

## Sub-Task 5 — Scrolling & Overlap Audit Across All Dashboards

### Intent
Audit and fix scrolling and overlap issues in every dashboard view.

### Expected Outcomes
- Every dashboard page scrolls fully from top to bottom.
- No element is hidden behind the security monitor taskbar.
- No z-index conflicts produce overlapping elements.

### Audit Findings Per Dashboard

#### Main Dashboard (`DashboardShell.jsx` + `developer-shell.css`)
- **Issue:** `.main-content` has no `padding-bottom` to clear the fixed `sec-monitor` bar (~33 px). Content at the very bottom is hidden behind the bar.
- **Fix:** Add `padding-bottom: 38px` to `.main-content` in `developer-shell.css`.

#### Threat Intelligence (`ThreatIntelligencePage.jsx` + `threat-intelligence/styles.css`)
- **Issue:** `.threat-intelligence-page` has `display:flex; flex-direction:column; gap:10px; min-width:0`. No `overflow:hidden` or fixed height — scrolling is inherited from `.main-content`. Root cause: same missing bottom padding on `.main-content`. Secondary issue: `UsbMonitor` at the bottom may be clipped.
- **Fix:** Covered by the `.main-content padding-bottom` fix in Sub-Task 3.

#### Identity & Network Security (`IdentityNetworkSecurityPage.jsx` + `identity-network-security/styles.css`)
- **Issue:** Same root cause — `.identity-network-page` itself scrolls fine but `.main-content` clips the last element.
- **Fix:** Covered by the `.main-content padding-bottom` fix.

#### Security Testing Lab (`SecurityTestingLabPage.jsx` + `security-testing-lab/styles.css`)
- **Issue:** Same root cause. `ImageScanner` section at the bottom is potentially clipped. Fix also covered by Sub-Task 3/4.

#### AI Defense Response (`AIDefenseResponsePage.jsx` + `ai-defense-response/styles.css`)
- **Issue:** `fetchDefenseStatus` makes a request to `/ai-defense/status` — which is a real endpoint that returns a 404 or error if not connected. The page `useEffect` catches errors and sets `serviceState` to `{ kind: 'error' }` — this is handled. Scrolling same root cause as above.
- **Fix:** Bottom padding fix. No other scrolling issue found.

#### Investigation Center (`InvestigationCenterPage.jsx` + `investigation-center/styles.css`)
- Needs a quick read to confirm no extra `overflow:hidden` or fixed heights.

#### AI Command Center / Automation Hub
- Both are contained views with their own scrollable areas; main padding fix covers them.

### Todo List (ordered)

1. **`frontend/src/dashboards/developer-shell.css`** — Add to `.main-content`:
   ```css
   .main-content { padding-bottom: 38px; }
   ```
   (This single change fixes bottom clip across ALL dashboards because every dashboard renders inside `.main-content`.)
2. **Verify** `investigation-center/styles.css` has no `overflow:hidden` or `max-height` on its root element. If found, remove or adjust.
3. **Verify** `ai-defense-response/styles.css` similarly.
4. **Test** by checking that the very bottom element of each dashboard is fully visible and not cut off.

### Relevant Context
- The `.sec-monitor` bar is `position:fixed; bottom:0` at z-index 45.
- `.main-content` currently has `padding: 8px 12px` to `padding: 8px 14px` depending on breakpoint — no bottom padding.
- VoiceCommander FAB already uses `bottom: 42px` to clear the bar; the content area must match.

### Status
[x] done

---

## Sub-Task 6 — Incorrect Button Colors (White Buttons)

### Intent
Identify and fix all buttons that appear white or unstyled across dashboard views.

### Audit Findings

After reviewing all dashboard JSX and CSS files:

1. **`main.jsx` — `SectionPage` / Report section `button-outline` class:** Line 711 and 721 use `className="button-outline"`. In `style.css` the `.button-outline` class is defined but in the dashboard context the `.new-shell` resets some styles. Result: these buttons may appear with a white background or text color #fff on white depending on CSS cascade. **Fix:** Ensure `button-outline` is properly scoped or use explicit classes with background/color already defined.

2. **`main.jsx` — Modal foot Cancel button (line 958):** `<button type="button" onClick={close}>Cancel</button>` — no class, inherits global `button { color: inherit; }`. In the modal context this renders with `color:#eaf6ff` (light text) on a transparent background. This looks acceptable but may appear white-on-white depending on modal background. **Fix:** Add an explicit class (e.g., `className="button-quiet"` or `className="secondary"`) consistent with the design system.

3. **Security Testing Lab / Identity / Threat — `st-view-all`, `in-view-all`, `ti-text-action` buttons:** These are transparent background buttons with explicit `color` set — they are intentionally minimal. No white issue.

4. **Landing page plan buttons (line 150):** `className={'button ' + (plan.popular ? 'button-primary' : 'button-outline')}` — these are on the landing page, styled correctly by `landing.css`. No issue.

5. **`AIDefenseResponsePage.jsx` tool buttons:** Use `adr-tool-card` class with explicit gradient backgrounds. Need to confirm `adr-tool-card` has a proper background rule in `ai-defense-response/styles.css`.

### Todo List (ordered)

1. Read `ai-defense-response/styles.css` to confirm `adr-tool-card` button styling is present.
2. In `main.jsx` modal footer (line 958) — add `className="secondary"` to the Cancel button for consistent styling.
3. Audit and confirm `button-outline` has a defined background in `style.css` or `dashboards.css`. If it inherits white from a reset, add `background: transparent` to the rule.
4. Test each dashboard page and visually confirm buttons render with correct colors.

### Relevant Context
- Global `button { color: inherit; cursor: pointer; }` in `style.css` — transparent background by default.
- `.button-outline` in `landing.css` is properly defined but a parallel definition may be missing in `style.css`/dashboard context.

### Status
[x] done

---

## Sub-Task 7 — Hardcoded Data Audit

### Intent
Identify all static/hardcoded placeholder data across every dashboard component and replace it with dynamic data from existing API state.

### Audit Findings (File-by-File)

| File | Location | Hardcoded Data | Nature | Fix |
|------|----------|----------------|--------|-----|
| `ThreatIntelligencePage.jsx` | `statistics` array | All 4 stat values render `—` and `"Waiting for backend connection"` | No dynamic source exists yet in codebase for threat stats | Leave as-is with `—` placeholder — **no fake data to replace** |
| `IdentityNetworkSecurityPage.jsx` | `statistics` array | All 5 stat values render `—` and `"Waiting for backend"` | Same — no backend source | Leave as-is |
| `SecurityTestingLabPage.jsx` | `statValues` object | `Total Scans`, `Vulnerabilities Found`, `Critical Issues` are dynamic from `scanRecords` | These ARE dynamic | No change needed |
| `SecurityTestingLabPage.jsx` | `categories` const (line 35) | `['Injection', 'XSS', ...]` label array | Static UI labels (no values) | Acceptable — labels only |
| `SecurityTestingLabPage.jsx` | `severities` const (line 36) | `['Critical', 'High', ...]` | Static UI labels | Acceptable |
| `AIDefenseResponsePage.jsx` | `stats` array | Values rendered as `—` throughout | No backend source | Leave as-is |
| `DashboardShell.jsx` line 549 | `<small>Signed in</small>` | Hardcoded "Signed in" text under profile | Should ideally show the user's display name from `ca_user` in localStorage | **Fix:** Read `ca_user` from localStorage and display `user.displayName` if present, else fall back to "Signed in" |
| `DashboardShell.jsx` line 549 | `<b>Shared Workspace</b>` | Hardcoded name | Same as above | **Fix:** Show `user.displayName || 'My Workspace'` |
| `main.jsx` line 322 | `CYBER-AGENT AI` welcome text | Will be fixed in Sub-Task 1 | — | — |
| `investigation-center/InvestigationCenterPage.jsx` | All stat/table data | All render `—` waiting for backend | No backend source | Leave as-is |

### Summary
True hardcoded placeholder data requiring a fix (not merely "empty state" awaiting a backend):
- **`DashboardShell.jsx`** — "Shared Workspace" / "Signed in" should pull from the already-stored `ca_user` localStorage value (set by `handleAuth` in `main.jsx` line 972).

All other `—` placeholders across dashboards are intentionally empty states waiting for a backend service that is not yet connected — these are correct, not bugs.

### Todo List (ordered)

1. In `DashboardShell.jsx` (profile section, around line 549) — read `ca_user` from localStorage at component mount:
   ```js
   const [userProfile] = useState(() => {
     try { return JSON.parse(localStorage.getItem('ca_user') || '{}') } catch { return {} }
   });
   ```
2. Replace `<b>Shared Workspace</b>` with `<b>{userProfile.displayName || 'My Workspace'}</b>`.
3. Replace `<small>Signed in</small>` with `<small>{userProfile.email || 'Signed in'}</small>`.

### Relevant Context
- `ca_user` is set at login/register in `main.jsx` line 972: `localStorage.setItem('ca_user', JSON.stringify(_user))`.
- `_user` comes from the auth API response; shape includes at minimum `{ email, displayName, role }`.

### Status
[x] done

---

## Execution Order

```
Sub-Task 1  (App name)          — no dependencies
Sub-Task 2  (Get Started btn)   — no dependencies
Sub-Task 4  (STL diagnosis)     — read-only, no dependencies; FIX only after user approval
Sub-Task 3  (Taskbar overlap)   — fix SecurityMonitor padding BEFORE Sub-Task 5
Sub-Task 5  (Scroll/overlap)    — depends on Sub-Task 3 (same padding fix)
Sub-Task 6  (Button colors)     — independent, run in parallel with Sub-Task 5
Sub-Task 7  (Hardcoded data)    — independent of all above
```

Recommended sequence for implementation: **1 → 2 → 4-fix → 3+5 (combined) → 6 → 7**

---

## Risks & Dependencies

| Risk | Mitigation |
|------|-----------|
| Sub-Task 4 blank screen — fixing `token` prop is the only code change needed; it is a one-line fix | Confirm by reading the prop destructure before editing |
| Sub-Task 3/5 bottom padding — if any dashboard page uses its own `overflow:scroll` or `max-height` on the root, the `.main-content` padding fix won't reach it | Inspect `investigation-center/styles.css` and `ai-defense-response/styles.css` before implementing |
| Sub-Task 6 button colors — `button-outline` may need a background rule added; must not override the landing page version | Scope CSS fix to `.new-shell` context only |
| Sub-Task 7 `ca_user` parsing — localStorage value might be stale or from a different schema version | Use safe `try/catch` JSON.parse with fallback `{}` |
| App name replacement — must not change CSS class names (e.g., `.cyber-agent-*`) if any exist | Confirmed: no CSS class names contain "cyber-agent" — only user-visible strings are affected |
