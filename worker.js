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
  "/auth/csrf", // session-bound CSRF token for state-changing dashboard calls
]);

function proxy(request, url, env) {
  const target = BACKEND + url.pathname + url.search;
  const proxied = new Request(target, request);
  // Never forward browser Authorization headers to the backend — dashboard
  // auth is cookie-based; anything in Authorization here is not ours to leak.
  proxied.headers.delete("Authorization");
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

    // Dashboard page — mirrors functions/_middleware.js. Served no-store so
    // deploys show immediately; the JS/CSS links carry ?v=N cache-busters.
    // (The old /dashboard-next preview + Basic Auth gate are gone — the
    // redesign IS the dashboard now.)
    const lower = path.toLowerCase();
    if (lower === "/dashboard-next" || lower === "/dashboard-next.html") {
      return Response.redirect("https://arkoris.net/dashboard.html", 301);
    }
    if (lower === "/dashboard" || lower === "/dashboard.html") {
      return noStore(await env.ASSETS.fetch(request));
    }

    return env.ASSETS.fetch(request);
  },
};

// Re-wrap a response with a no-store cache policy so the preview is always fresh.
function noStore(res) {
  const fresh = new Response(res.body, res);
  fresh.headers.set("Cache-Control", "no-store, must-revalidate");
  return fresh;
}

// (requirePreviewAuth + its timing-safe compare were removed with the
// /dashboard-next preview — the redesign is the live dashboard now.)
