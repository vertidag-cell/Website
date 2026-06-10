// Cloudflare Pages Function — reverse-proxies Discord OAuth requests
// (/auth/discord/login, /auth/discord/callback, /auth/logout, /auth/session)
// to the bot's Square Cloud backend.
//
// Proxying /auth/* through this same origin keeps the OAuth `state` and the
// session cookie FIRST-PARTY, so login no longer breaks on mobile browsers
// that block third-party cookies. See functions/api/[[path]].js.

const BACKEND = 'https://quicksark.squareweb.app';

// Only these exact auth paths are ever proxied to the backend — nothing else
// reaches it through this function (closes it as an open relay).
const ALLOWED = new Set([
  '/auth/discord/login',
  '/auth/discord/callback',
  '/auth/logout',
  '/auth/session',
  '/auth/csrf', // session-bound CSRF token for state-changing dashboard calls
]);

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (!ALLOWED.has(url.pathname)) {
    return new Response('Not found', { status: 404 });
  }

  // `redirect: 'manual'` is essential here: the backend answers
  // /auth/discord/login with a 302 to discord.com and /auth/discord/callback
  // with a 302 back to the dashboard. Those redirects must reach the browser.
  const target = BACKEND + url.pathname + url.search;
  const proxied = new Request(target, request);
  // Never forward browser Authorization headers to the backend — dashboard
  // auth is cookie-based; anything in Authorization here is not ours to leak.
  proxied.headers.delete('Authorization');
  // Shared secret proving this request came through the arkoris.net proxy.
  // Set PROXY_SECRET on the Pages project + backend to activate; fails open until then.
  if (context.env && context.env.PROXY_SECRET) proxied.headers.set('X-Arkoris-Proxy', context.env.PROXY_SECRET);
  return fetch(proxied, { redirect: 'manual' });
}
