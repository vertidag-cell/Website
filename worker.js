// Cloudflare Worker entry — consolidates the two Pages Functions
// (functions/api/[[path]].js and functions/auth/[[path]].js) so this deploy
// works as a single Worker with static assets bound under env.ASSETS.
//
// Routing:
//   /api/*                                       → proxy to backend
//   /auth/discord/{login,callback}, /auth/logout, /auth/session → proxy
//   /auth/* anything else                        → 404 (closes open relay)
//   everything else                               → static assets from /dist
//
// `redirect: "manual"` is critical: backend answers /auth/discord/login with
// a 302 to discord.com and /auth/discord/callback with a 302 back to the
// dashboard. Those must reach the browser.

const BACKEND = "https://quicksark.squareweb.app";

const ALLOWED_AUTH_PATHS = new Set([
  "/auth/discord/login",
  "/auth/discord/callback",
  "/auth/logout",
  "/auth/session",
]);

function proxy(request, url, env) {
  const target = BACKEND + url.pathname + url.search;
  const proxied = new Request(target, request);
  // Shared secret so the Square Cloud backend can verify the request actually
  // came through this Cloudflare proxy (arkoris.net) and reject direct hits to
  // the squareweb.app origin. Set PROXY_SECRET on BOTH this Worker and the
  // backend; until then the backend fails open and nothing changes.
  if (env && env.PROXY_SECRET) proxied.headers.set("X-Arkoris-Proxy", env.PROXY_SECRET);
  return fetch(proxied, { redirect: "manual" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Canonical domain: bounce the *.pages.dev preview to arkoris.net so the
    // site is only ever served (and indexed) on the real domain.
    if (url.hostname.endsWith(".pages.dev")) {
      return Response.redirect("https://arkoris.net" + path + url.search, 301);
    }

    if (path.startsWith("/api/")) {
      return proxy(request, url, env);
    }

    if (path.startsWith("/auth/")) {
      if (ALLOWED_AUTH_PATHS.has(path)) {
        return proxy(request, url, env);
      }
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
