# Changelog — Overnight Improvements (Website)

Branch: `overnight-improvements`. Companion to the bot repo's audit. Risky / domain-
dependent items are in `REVIEW_NEEDED.md`.

## Phase 1 — Discovery

Static marketing site: 13 HTML pages, `styles.css` (~300KB), `script.js` (~48KB), a
JS-rendered dashboard (`dashboard-app.js` ~250KB), `build.mjs` (clean-css + terser +
html-minifier → `dist/`), Cloudflare Pages Functions (`functions/` reverse-proxy
`/api/*` + `/auth/*` to the bot backend), `vercel.json` + `_headers`. Vanilla JS, no
framework. Dev deps: clean-css, html-minifier-terser, terser (lockfile present).

## Phase 5 — Security (audited, no changes needed)

- **No secrets in any frontend file** (html/js/config.js/dashboard-app.js). `config.js`
  holds only public config (public Discord OAuth client_id, public links). Backend
  secrets live in `backend/.env.example` as placeholders with a "don't commit real
  values" warning. `.env.example` (frontend) is placeholder-only with a clear
  public-config warning.
- **Security headers are excellent** (`vercel.json` + `_headers`): CSP (default-src
  'self', script-src 'self' — blocks inline-script XSS), HSTS (1yr + subdomains),
  X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy,
  Permissions-Policy. No changes warranted.

## Phase 6 — Frontend & UX

- **Accessibility:** added `aria-hidden="true"` to the 28 decorative feature icons
  (`features.html` ×17, `premium.html` ×9, `index.html` ×2). They sit next to
  descriptive `<h3>` labels, so hiding the redundant icon from screen readers is the
  WCAG best-practice (the empty `alt=""` was already technically compliant; this is
  the polish). Verified: 17/9/2 applied, no double-apply, tags intact.
- **Reviewed, already solid:** every page has `<title>`, meta description, `<html
  lang>`, a favicon, one `<h1>`, correct heading order, semantic landmarks, and
  `loading="lazy"` on screenshots. Core SEO + a11y are in good shape.
- **Deferred to REVIEW_NEEDED.md (don't guess):** Open Graph `og:image` + `og:url` +
  `<link rel=canonical>` and Twitter cards need the **confirmed production domain**
  (`config.js` currently points at a `*.pages.dev` hash that looks like a preview) —
  applying them blind would risk bad canonicals/social cards. Exact tags to drop in
  are provided there. Also: `terser` dev-dep bump.
