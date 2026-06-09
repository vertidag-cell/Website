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

    // Private dashboard preview gate — mirrors functions/_middleware.js so the
    // preview is never served ungated regardless of which deploy path is live.
    // Secret lives in PREVIEW_PASS (Worker env/secret), never in the bundle.
    const lower = path.toLowerCase();
    if (lower === "/dashboard-next" || lower === "/dashboard-next.html") {
      const gate = requirePreviewAuth(request, env);
      if (gate) return gate;
    }

    return env.ASSETS.fetch(request);
  },
};

// Returns a 401/503 Response to short-circuit, or null when authorized.
function requirePreviewAuth(request, env) {
  const expected = env && env.PREVIEW_PASS;
  const expectedUser = (env && env.PREVIEW_USER) || "admin";
  if (!expected) {
    return new Response(
      "Dashboard preview is locked. Set the PREVIEW_PASS environment variable on the Worker to enable it.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try { decoded = atob(header.slice(6)); } catch { decoded = ""; }
    const sep = decoded.indexOf(":");
    const user = sep >= 0 ? decoded.slice(0, sep) : "";
    const pass = sep >= 0 ? decoded.slice(sep + 1) : "";
    if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expected)) {
      return null;
    }
  }
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Arkoris Dashboard Preview", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function timingSafeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
