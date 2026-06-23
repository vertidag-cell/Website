// Cloudflare Pages Function — reverse-proxies dashboard API requests to the
// bot's Square Cloud backend.
//
// Why this exists: the dashboard frontend (this Pages site) and the bot
// backend live on different domains. A cross-site session cookie is blocked
// by mobile Safari/Chrome, which broke dashboard login on phones. By proxying
// /api/* through this same origin, the session cookie stays FIRST-PARTY and
// login works everywhere.

const BACKEND = 'https://quicksark.squareweb.app';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Defense-in-depth: only ever forward the dashboard API surface. This
  // function is routed for /api/* already, but the explicit check guarantees
  // it can never act as an open relay to other backend paths.
  if (!url.pathname.startsWith('/api/')) {
    return new Response('Not found', { status: 404 });
  }

  // Rebuild the request against the backend URL. `redirect: 'manual'` keeps
  // any 3xx (e.g. Discord OAuth) flowing back to the browser instead of being
  // followed here. The Host header is set automatically from the target URL.
  const target = BACKEND + url.pathname + url.search;
  const proxied = new Request(target, request);
  // Never forward browser Authorization headers to the backend — dashboard
  // auth is cookie-based; anything in Authorization here (stray Basic Auth,
  // extensions) is not ours to leak.
  proxied.headers.delete('Authorization');
  // Shared secret proving this request came through the arkoris.net proxy.
  // Set PROXY_SECRET on the Pages project + backend to activate; fails open until then.
  if (context.env && context.env.PROXY_SECRET) proxied.headers.set('X-Arkoris-Proxy', context.env.PROXY_SECRET);

  // Normalize upstream failures into JSON so the dashboard never has to render a
  // raw HTML error page. When the Square Cloud backend is restarting/crashed it
  // serves an HTML offline page (content-type text/html, 5xx); passing that
  // through breaks the "/api/* always returns JSON" contract and the dashboard
  // would dump the raw markup into an error card. Only error responses (>=400)
  // with a non-JSON content-type are rewritten — every 2xx and 3xx (including
  // OAuth 302s) passes through untouched so cookies, redirects, and normal JSON
  // are unaffected. A hard fetch failure (backend unreachable) becomes a 502.
  let resp;
  try {
    resp = await fetch(proxied, { redirect: 'manual' });
  } catch (e) {
    return backendUnavailable(502);
  }
  const ct = resp.headers.get('content-type') || '';
  if (resp.status >= 400 && !ct.includes('application/json')) {
    return backendUnavailable(resp.status || 502);
  }
  return resp;
}

function backendUnavailable(status) {
  return new Response(
    JSON.stringify({ error: 'backend_unavailable', status: status }),
    { status: status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
  );
}
