# Audit Report — Website (arkoris.net)

Branch: `audit-improvements` · Date: 2026-06-10 · Scope: security, visuals/UX, and the proxy
integration with the QuicksArk bot backend. The bot-side report lives in
`QuicksArk/AUDIT_REPORT.md`.

## 1. Architecture summary

Static, framework-free site: ~16 hand-written HTML pages sharing `styles.css` (token-driven —
`:root` design variables, ~102 custom properties), `script.js` (nav/scroll/demo widgets), and a
public `config.js` (`window.SITE_CONFIG`, applied via `data-link`/`data-text`; deliberately holds
no secrets). The customer dashboard is a vanilla-JS SPA (`dashboard.html` → `dashboard-boot.js`
watchdog → `dashboard-app.js`); `dashboard-next.*` is a private redesign preview (noindex,
robots-blocked, Basic Auth gate intentionally disabled by owner decision).

**Deploy:** Cloudflare Pages (`.github/workflows/deploy.yml` → `build.mjs` minifies to `dist/` →
`wrangler pages deploy`). Server-side logic = Pages Functions: `functions/_middleware.js`
(pages.dev→arkoris.net 301, preview no-store), `functions/api/[[path]].js` +
`functions/auth/[[path]].js` reverse-proxy to `https://quicksark.squareweb.app`, attaching
`X-Arkoris-Proxy` from the `PROXY_SECRET` env. `/auth/*` proxying is allowlisted to exactly 4
paths. `worker.js`/`wrangler.jsonc` are an alternative non-public single-Worker deploy;
`vercel.json` is inert portability config; `_redirects` hard-404s `/.env*`, `/backend/*`, etc.
`backend/` is non-deployed scaffold documenting the bot-side Express wiring.

**Auth flow:** login → proxied `/auth/discord/login` → Discord → bot callback → redirect with a
one-time id in the URL fragment → SPA strips it from history and POSTs `/auth/session` → first-
party `quicksark_sid` cookie. All SPA calls go through one `api()` helper (credentials:include,
8s timeout, structured errors).

## 2. Security findings

### Verified clean (current branch)

- **XSS:** `dashboard-app.js` renders through a central `h()` DOM builder; `escapeHtml` is applied
  at the data boundaries and `ebMarkdown` escapes **before** markdown transforms (checked at
  :1556). `servers.js` and `xp-leaderboard.js` escape all backend-sourced fields, regex-validate
  invite URLs / guild ids, and use CSP-safe image fallbacks (no inline `onerror`). The 21
  `innerHTML` uses in `script.js` only ever receive static demo strings (traced: `setChannel`
  callers pass literals). No exploitable sink found.
- **Secrets:** none in tree or git history (pickaxe scans); `.env` ignored; `config.js` documents
  its public-only contract; `_redirects` blocks `/backend/*` and `/.env*`; `PROXY_SECRET` lives
  only in Cloudflare env, never in client JS.
- **Headers:** `_headers` sets CSP (`script-src 'self'`, no inline), nosniff, HSTS+preload,
  frame-ancestors none, Permissions-Policy; `/config.js` is no-store (cache-poisoning defense).
- **Dependencies:** `npm audit` → 0 vulnerabilities (build-time devDeps only; site ships no
  framework JS).

### Findings that are already addressed by open **PR #1** (`codex/security-hardening`) — recommendation: merge it, with two caveats

| Sev | Finding (current `main`) | PR #1 fix |
|---|---|---|
| Medium | No CSRF token layer on state-changing dashboard calls — protection currently rests on the bot's sameSite=Lax cookie + origin guard (solid, but single-layered) | Adds `/auth/csrf` + `X-Arkoris-CSRF` header with retry |
| Low | Proxy forwards the browser `Authorization` header to the backend (leaks preview Basic-Auth credentials if the gate is ever re-enabled) | Strips `Authorization` in both proxies + worker |
| Low | CSP `connect-src 'self' https:` is broader than needed | Tightens to `'self' https://quicksark.squareweb.app`, adds `object-src 'none'` |

**Caveat A (owner decision conflict):** PR #1 re-enables the `dashboard-next` Basic Auth gate and
**fails closed** when `PREVIEW_PASS` is unset. You disabled this gate on purpose (login re-prompt
annoyance). Either set `PREVIEW_PASS` before merging or drop the `functions/_middleware.js` +
`worker.js` preview hunks from the PR.

**Caveat B (deploy order):** the PR's frontend sends `X-Arkoris-CSRF` and calls `/auth/csrf`, but
the **real** backend (QuicksArk `src/web/dashboard/*`) doesn't implement that route — the PR only
updates the non-deployed `backend/` scaffold. The frontend fails open (empty token), so merging is
safe, but CSRF tokens enforce nothing until the equivalent middleware is ported into QuicksArk and
deployed to Square Cloud. Until then the existing Lax-cookie + origin-guard protection carries it.

This audit deliberately did **not** modify the files PR #1 touches (`_headers`, `vercel.json`,
`functions/*`, `worker.js`, `dashboard-app.js`, `dashboard-next-app.js`, `backend/*`) to avoid
merge conflicts with work you already have in flight.

### Flagged, not changed

1. `worker.js` duplicates the Pages Functions proxy/gate logic — drift risk between the two deploy
   paths (PR #1 edits both consistently; keep doing that, or retire `worker.js` if the Pages
   project is permanent).
2. `.gitignore` ignores `*.env.example` while `.env.example.local` (placeholder-only, verified) is
   tracked — harmless inconsistency; tidy when convenient.
3. OAuth `?error=` query params land on `dashboard.html` — confirm the SPA surfaces them as a
   user-visible message (lives in `dashboard-app.js`, a PR #1 file, so verified-not-changed here).

## 3. Code improvements made

- `index.html` — `fetchpriority="high"` on the hero image (the landing page's LCP). Commit
  `bf827da`.

## 4. Visual / UX audit result

The standard checklist is **already satisfied** — this site has had real design passes:

- Design tokens: `:root` variable system (~102 custom properties), themed consistently.
- Accessibility: 8 `:focus-visible` rules, 25 `prefers-reduced-motion` references, native
  `<details>` FAQ (keyboard/AT-correct), `aria-expanded` nav toggle, `aria-hidden` on decorative
  elements, descriptive `alt` on every content image.
- States: loading / empty / error all present on the data pages (`servers.js`,
  `xp-leaderboard.js`), with honest copy; `dashboard-boot.js` watchdog swaps in an error card if
  the SPA fails to boot.
- Performance: every below-fold image `loading="lazy"` with explicit width/height (no CLS); build
  minifies HTML/CSS/JS; hero now `fetchpriority="high"`.

No redesign churn was made on purpose — the dark tactical identity is intentional and cohesive.

## 5. Prioritized TODO

1. Decide PR #1 (merge with Caveat A resolved; schedule the QuicksArk-side CSRF port from Caveat B).
2. Confirm `PROXY_SECRET` is set on the Cloudflare Pages project (pairs with the bot-side check).
3. Retire or clearly mark `worker.js` as secondary to prevent proxy-logic drift.
4. Verify the dashboard surfaces `?error=expired_login` / `login_failed` to users.

## 6. Secrets to rotate

**None** — nothing hardcoded in tree or history.

## 7. Verification

`npm run build` → clean, 26 files to `dist/`. No JS touched except one HTML attribute; no
functional surface changed.
