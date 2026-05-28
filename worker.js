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

function proxy(request, url) {
  const target = BACKEND + url.pathname + url.search;
  return fetch(new Request(target, request), { redirect: "manual" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return proxy(request, url);
    }

    if (path.startsWith("/auth/")) {
      if (ALLOWED_AUTH_PATHS.has(path)) {
        return proxy(request, url);
      }
      return new Response("Not found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
