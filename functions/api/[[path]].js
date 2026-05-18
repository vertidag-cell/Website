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
  const target = BACKEND + url.pathname + url.search;

  // Rebuild the request against the backend URL. `redirect: 'manual'` keeps
  // any 3xx (e.g. Discord OAuth) flowing back to the browser instead of being
  // followed here. The Host header is set automatically from the target URL.
  const proxied = new Request(target, request);
  return fetch(proxied, { redirect: 'manual' });
}
