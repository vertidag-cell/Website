# AGENTS.md — Arkoris Website (arkoris.net)

**Read this first.** For any AI assistant or coding agent (Claude, ChatGPT / Codex, Cursor, …)
working in this repo.

This is the **public static site** for the **Arkoris** Discord bot. The bot + Owner Control Center
live in the sibling repo **`vertidag-cell/QuicksArk`** (see its `AGENTS.md` for the full picture).

---

## 📣 Community / changelog updates — STANDING INSTRUCTION

Post user-facing updates (bug fixes, new features) to the Discord **support channel, ID
`1514347542777958471`**. You can't post to Discord directly — **draft a player-facing embed** and
have the owner send it from the bot's **Owner panel → Announce tab**
(`https://quicksark.squareweb.app/owner/` → **Announce**, which already defaults to that channel).
Same convention as QuicksArk's `AGENTS.md`.

---

## What this repo is

- Static, **framework-free** site: hand-written HTML pages sharing `styles.css`, `script.js`, and a
  **public** `config.js` (`window.SITE_CONFIG`). Built/minified by `build.mjs`, deployed to
  **Cloudflare Pages** (auto-deploys on push to **`main`**).
- The customer **dashboard** is a vanilla-JS SPA (`dashboard.html` → `dashboard-app.js`) that calls
  `/api/*` and `/auth/*`, which **Cloudflare Pages Functions** (`functions/`) reverse-proxy to the
  bot's backend (`quicksark.squareweb.app`) so the session cookie stays first-party.

## How code ships

No working local `git`/`gh` here — pushes are done via the **GitHub REST API with `curl`** using an
owner-supplied fine-grained PAT. Pushing to **`main`** auto-deploys to production. Be surgical.

## Rules that bite

- **`config.js` is PUBLIC** (it ships in page HTML). **Never** put secrets in it (tokens, client
  secrets, webhook secrets, DB URLs). It says so at the top of the file — respect it.
- **Strict CSP** lives in `_headers` (and mirrored in `vercel.json`). If you add a third-party script
  or endpoint, you must allowlist it there or the browser blocks it (e.g. the Cloudflare Web
  Analytics beacon needed `static.cloudflareinsights.com` + `cloudflareinsights.com`).
- Keep `_headers` and `vercel.json` CSPs **in sync** to avoid drift.
- The owner is **non-technical** — explain in plain language, step by step, and say exactly what to
  paste where.

## Dashboard CSS / mobile (each was a real bug — don't relearn them)

- **Two stylesheets, order matters.** `dashboard.html` loads `styles.css` (shared marketing + base
  dashboard layout) **then** `dashboard.css` (the `dsx-` reskin layer, scoped under `body.dash-app`).
  `dashboard.css` loads **last**, so put dashboard overrides there — and **scope them with a
  `.dash-app` prefix** (`.dash-app .dash-layout`, specificity 0,2,0) so they reliably beat the bare
  `styles.css` rules (0,1,0).
- **A `@media` rule does NOT win just because it's "more specific" — media queries add ZERO
  specificity.** So a *later*, un-media-queried rule of equal specificity silently overrides your
  mobile rule at every width. This bit hard: `styles.css` re-declared `.dash-layout` with a fixed
  ~248px sidebar grid column and no media query, **after** the `@media (max-width:980px)` collapse to
  `1fr`. Result: phones kept reserving a 248px phantom column for the (off-screen, fixed-drawer)
  sidebar → page wider than the viewport → mobile browser **shrink-to-fits (zooms out) and renders
  off-center**. Fix lived in `dashboard.css` (`.dash-app .dash-layout { grid-template-columns: 1fr }`
  gated `<=980px`). **When a mobile layout looks zoomed-out/off-center, suspect horizontal overflow
  (a child wider than the viewport), not a missing breakpoint.** `overflow-x:hidden` on html/body
  only clips paint — it doesn't stop a wide in-flow child from widening the layout.
- **Cache-busters are mandatory.** `dashboard.html` references `dashboard.css?v=N`, `dashboard-app.js?v=N`,
  `config.js?v=N`. **Bump `?v=N` whenever you change that file** or phones (which cache CSS/JS hard)
  keep serving the stale version and your fix appears to "not work."
- The sidebar→drawer + single-column collapse already exists at **`<=980px`**; most component grids
  (`picker-grid`, `rm-add-grid`, `setup-progress-grid`, `cc-grid`, `dsx-ov-*`) collapse on their own.
  Keep mobile changes **additive + phone-gated** so desktop (>980px) is untouched.

## Further reading

`PRODUCT.md` (audience + design principles), `AUDIT_REPORT.md` (security/UX audit), and the QuicksArk
repo's `AGENTS.md`.
