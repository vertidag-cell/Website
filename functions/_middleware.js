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
// It ALSO serves the customer dashboard PAGE no-store. The static assets ship
// with a 4h cache, which used to make deploys look stale (the cached HTML kept
// pointing at old ?v= asset refs). The dashboard's JS/CSS links carry ?v=N
// cache-busters, so keeping just the HTML fresh makes every deploy visible
// immediately. (The old /dashboard-next preview gate lived here — the redesign
// is now THE dashboard, so the preview page, its assets, and the Basic Auth
// gate are gone.)
export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname.endsWith('.pages.dev')) {
    return Response.redirect('https://arkoris.net' + url.pathname + url.search, 301);
  }

  if (isDashboardPage(url.pathname)) {
    return noStore(await context.next());
  }

  return context.next();
}

// The dashboard page only, with or without the .html suffix, case-insensitively.
function isDashboardPage(pathname) {
  const p = pathname.toLowerCase();
  return p === '/dashboard' || p === '/dashboard.html';
}

// Re-wrap a response with a no-store cache policy so it's always fresh.
function noStore(res) {
  const fresh = new Response(res.body, res);
  fresh.headers.set('Cache-Control', 'no-store, must-revalidate');
  return fresh;
}
