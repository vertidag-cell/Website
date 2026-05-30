// Cloudflare Pages middleware (runs for every request to this Pages project).
//
// The project serves two hostnames: arkoris.net (canonical) and the
// auto-assigned website-1h0.pages.dev preview. We 301 any *.pages.dev host to
// arkoris.net so the site is only ever used/indexed on the real domain.
//
// IMPORTANT: this only matches the .pages.dev host. arkoris.net (and any other
// custom domain) falls straight through to context.next(), so normal serving,
// /api/* and /auth/* proxying are completely unaffected.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname.endsWith('.pages.dev')) {
    return Response.redirect('https://arkoris.net' + url.pathname + url.search, 301);
  }
  return context.next();
}
