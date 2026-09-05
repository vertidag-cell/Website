// Cloudflare Pages Function — product image upload for the storefront.
//
// Two storage backends, picked automatically:
//
//   1. Cloudflare R2 (optional): when an R2 bucket is bound to this Pages
//      project as `STORE_BUCKET`, the file is stored there and served by
//      functions/store-img/[[path]].js as /store-img/store/<key>.
//   2. Bot-hosted (default, zero setup): otherwise the bytes are forwarded to
//      the bot's dashboard API (POST /api/dashboard/guilds/:guild/store/images,
//      same login session + CSRF header as every other dashboard call), which
//      stores them in its database. They're served through /store-img/bot/<id>
//      on this origin (edge-cached proxy to the bot), so the URL is permanent —
//      unlike Discord attachment links, which expire.
//
// Either way the response is { url } — a same-origin https image URL the
// dashboard saves on the product/category/banner.
//
// This exact-path function takes precedence over the catch-all /api/[[path]].js
// proxy, so /api/store-upload is handled here.

const BACKEND = "https://quicksark.squareweb.app";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const R2_MAX_BYTES = 5 * 1024 * 1024;
const BOT_MAX_BYTES = 2 * 1024 * 1024; // must match the bot's imageService.MAX_BYTES

function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[ct];
  if (!ext) return json({ error: "bad_type", detail: "png, jpg, webp or gif only" }, 415);

  const url = new URL(request.url);
  const origin = url.origin;

  // ── Bot-hosted storage (no R2 bound) ──
  if (!env.STORE_BUCKET) {
    const guild = (url.searchParams.get("guild") || "").trim();
    if (!/^\d{15,21}$/.test(guild)) return json({ error: "bad_guild", detail: "Missing server id." }, 400);

    const buf = await request.arrayBuffer();
    if (buf.byteLength > BOT_MAX_BYTES) return json({ error: "too_large", detail: "Max 2 MB per image." }, 413);
    if (buf.byteLength < 64) return json({ error: "empty" }, 400);

    // Same credentials the dashboard uses: the first-party session cookie and
    // the session-bound CSRF header. The bot enforces login + manage-guild +
    // premium on that route, so nothing extra is decided here.
    const headers = new Headers({ "content-type": ct, accept: "application/json" });
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const csrf = request.headers.get("x-arkoris-csrf");
    if (csrf) headers.set("x-arkoris-csrf", csrf);
    if (env.PROXY_SECRET) headers.set("X-Arkoris-Proxy", env.PROXY_SECRET);

    let resp;
    try {
      resp = await fetch(`${BACKEND}/api/dashboard/guilds/${guild}/store/images`, { method: "POST", headers, body: buf, redirect: "manual" });
    } catch {
      return json({ error: "backend_unavailable", detail: "The bot is restarting — try again in a moment." }, 502);
    }
    const body = await resp.json().catch(() => null);
    if (!resp.ok || !body || typeof body.path !== "string" || !/^\/store-img\/bot\/[a-f0-9]{24}\.(png|jpe?g|webp|gif)$/i.test(body.path)) {
      const status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
      const detail = body && (body.detail || body.message);
      return json({ error: (body && body.error) || "upload_failed", detail: detail || undefined }, status);
    }
    return json({ url: `${origin}${body.path}`, storage: "bot" });
  }

  // ── Cloudflare R2 ──
  // Require a logged-in dashboard session: forward the cookie (+ proxy secret)
  // to the bot's /me. The session cookie is SameSite=Lax, so a cross-site
  // forgery can't carry it — this is the CSRF guard too.
  try {
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    if (env.PROXY_SECRET) headers.set("X-Arkoris-Proxy", env.PROXY_SECRET);
    const me = await fetch(BACKEND + "/api/dashboard/me", { headers });
    if (!me.ok) return json({ error: "not_logged_in" }, 401);
  } catch {
    return json({ error: "auth_check_failed" }, 502);
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength > R2_MAX_BYTES) return json({ error: "too_large", detail: "max 5 MB" }, 413);
  if (buf.byteLength < 64) return json({ error: "empty" }, 400);

  const key = `store/${randHex(16)}.${ext}`;
  try {
    await env.STORE_BUCKET.put(key, buf, { httpMetadata: { contentType: ct } });
  } catch (e) {
    return json({ error: "store_failed", detail: String(e && e.message || e).slice(0, 120) }, 502);
  }
  return json({ url: `${origin}/store-img/${key}`, storage: "r2" });
}
