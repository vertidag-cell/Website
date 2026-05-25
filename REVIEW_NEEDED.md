# Review Needed — Website

Changes I deliberately did **not** apply (they need a human decision or risk
user-facing/SEO impact). Each has the exact fix ready to drop in.

## 1. Open Graph image, canonical, og:url, Twitter cards — needs production domain
**Why skipped:** these require an absolute, *stable* URL. `config.js` →
`websiteUrl: "https://50bf9296.website-1h0.pages.dev/"` looks like a Cloudflare
Pages **preview** hash, not the final domain. A wrong canonical/og:url hurts SEO and
social previews, so I won't guess.

**Once the production domain is confirmed**, add to each page's `<head>` (replace
`https://DOMAIN`):
```html
<link rel="canonical" href="https://DOMAIN/<page>.html" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://DOMAIN/<page>.html" />
<meta property="og:image" content="https://DOMAIN/assets/logo.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="<same as og:title>" />
<meta name="twitter:description" content="<same as meta description>" />
<meta name="twitter:image" content="https://DOMAIN/assets/logo.png" />
```
Also add `og:description` to the 11 pages missing it (only `index.html` +
`pricing.html` have it). Consider a 1200×630 social image instead of the logo.

## 2. `terser` dev-dependency is behind
`package.json` allows `^5.36.0`; latest is ~5.47.x (lockfile already resolves newer).
Build-only (never shipped to the frontend), so low risk — but it changes the build
toolchain, so verify a `npm run build` + visual diff of `dist/` before merging.

## 3. (Optional) CSP `style-src 'unsafe-inline'`
Present to allow Google Fonts + CSS custom properties. Fine for a marketing site;
tightening it (nonces/hashes) is a larger change with little payoff here. Noted only
for completeness.
