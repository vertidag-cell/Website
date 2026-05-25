# Quick's ARK Bot — Marketing Website

Static marketing site + customer dashboard for Quick's ARK Bot. Vanilla HTML/CSS/JS
(no framework), built with a small Node script and deployed to Cloudflare Pages / Vercel.

## Stack
- **Pages:** 13 static HTML pages (`index`, `features`, `pricing`, `premium`, `pop`,
  `branding`, `demos`, `faq`, `support`, `privacy`, `terms`, `dashboard`, `xp-leaderboard`).
- **Styling:** one `styles.css` (CSS custom properties, dark/red gaming theme).
- **JS:** `script.js` (nav, animations), `config.js` (public site config wired via
  `data-link`/`data-text`), `dashboard-app.js` + `dashboard-boot.js` (JS-rendered
  customer dashboard), `xp-leaderboard.js`.
- **Edge functions:** `functions/api/[[path]].js` + `functions/auth/[[path]].js`
  reverse-proxy `/api/*` and `/auth/*` to the bot backend so session/OAuth cookies stay
  first-party (mobile-Safari safe).

## Setup
```bash
npm install      # dev tooling only (clean-css, terser, html-minifier-terser)
```
There is **no runtime install** — the site ships static files. Public config lives in
`config.js`; copy `.env.example` → `.env` only if you wire the optional `PUBLIC_*` build
vars. **Never put secrets in the frontend** — see the warning block in `.env.example`
and `backend/.env.example` (backend secrets stay server-side only).

## Build
```bash
npm run build    # → dist/ : minifies HTML/CSS/JS, copies assets + _headers + vercel.json
```
`build.mjs` auto-discovers root `*.html`/`*.js`/`*.css`, minifies them, and copies static
files + `assets/` into `dist/`.

## Deploy
- **Cloudflare Pages / Vercel:** publish `dist/`. Security headers (CSP, HSTS,
  X-Frame-Options, etc.) come from `_headers` (Cloudflare) and `vercel.json` (Vercel) —
  keep the two in sync.
- The edge functions proxy to the bot backend (`https://quicksark.squareweb.app`).

## Security notes
- The frontend contains **only public config** (public Discord OAuth client id, public
  links). No tokens/secrets. CSP blocks inline scripts.
- See `CHANGELOG.md` (audit log) and `REVIEW_NEEDED.md` (deferred items: production-domain
  OG/canonical tags, `terser` bump).
