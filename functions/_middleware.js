// Cloudflare Pages middleware (runs for every request to this Pages project).
//
// The project serves two hostnames: arkoris.net (canonical) and the
// auto-assigned website-1h0.pages.dev preview. We 301 any *.pages.dev host to
// arkoris.net so the site is only ever used/indexed on the real domain.
//
// IMPORTANT: this only matches the .pages.dev host. arkoris.net (and any other
// custom domain) falls straight through to context.next(), so normal serving,
// /api/* and /auth/* proxying are completely unaffected.
//
// It ALSO gates the private dashboard preview (/dashboard-next.html) behind
// HTTP Basic Auth. See the preview block below. Only that one page is gated;
// every other path is served exactly as before.
export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname.endsWith('.pages.dev')) {
    return Response.redirect('https://arkoris.net' + url.pathname + url.search, 301);
  }

  // --- Dashboard preview --------------------------------------------------
  // The redesigned dashboard lives at /dashboard-next.html. The HTTP Basic Auth
  // password gate is currently DISABLED (the re-prompt on every Discord-login
  // round-trip was too annoying while iterating). The page is reachable by URL,
  // but it's still noindex + robots-disallowed, and the real dashboard data
  // requires Discord login (OAuth-gated backend) — so no server data is exposed,
  // only the in-progress redesign UI / mock screens.
  //
  // To RE-ENABLE the password: uncomment the requirePreviewAuth() lines below
  // (the helper is still defined further down) and set PREVIEW_PASS on the Pages
  // project. We still serve the page no-store so deploys always show fresh.
  if (isPreviewPage(url.pathname)) {
    // const gate = requirePreviewAuth(context.request, context.env);
    // if (gate) return gate;
    return noStore(await context.next());
  }
  // Preview-only JS/CSS: public, but also no-store so we never serve a stale
  // build while iterating on the redesign (no ?v= bumping needed).
  if (isPreviewAsset(url.pathname)) {
    return noStore(await context.next());
  }

  return context.next();
}

// Matches the preview page only, with or without the .html suffix, case-
// insensitively. Does NOT match dashboard-next-app.js / dashboard-next.css.
function isPreviewPage(pathname) {
  const p = pathname.toLowerCase();
  return p === '/dashboard-next' || p === '/dashboard-next.html';
}

// The preview's own JS/CSS (not the gated page).
function isPreviewAsset(pathname) {
  const p = pathname.toLowerCase();
  return p === '/dashboard-next-app.js' || p === '/dashboard-next.css';
}

// Re-wrap a response with a no-store cache policy so it's always fresh.
function noStore(res) {
  const fresh = new Response(res.body, res);
  fresh.headers.set('Cache-Control', 'no-store, must-revalidate');
  return fresh;
}

// Returns a Response to short-circuit with (401/503), or null when the request
// is authorized and should fall through to serve the page.
function requirePreviewAuth(request, env) {
  const expected = env && env.PREVIEW_PASS;
  const expectedUser = (env && env.PREVIEW_USER) || 'admin';

  // FAIL CLOSED: if no password is configured, never serve the preview. This
  // guarantees the page can't be public-by-accident before the secret is set.
  if (!expected) {
    return new Response(
      'Dashboard preview is locked. Set the PREVIEW_PASS environment variable on the Cloudflare Pages project to enable it.',
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : '';
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expected)) {
      return null; // authorized
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Arkoris Dashboard Preview", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

// Length-then-XOR compare to avoid leaking the password via response timing.
function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
