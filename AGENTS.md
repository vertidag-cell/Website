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

## Further reading

`PRODUCT.md` (audience + design principles), `AUDIT_REPORT.md` (security/UX audit), and the QuicksArk
repo's `AGENTS.md`.
