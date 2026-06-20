// Cloudflare Pages Function — product image upload for the storefront.
//
// Stores an uploaded image in a Cloudflare R2 bucket bound to this Pages project
// as `STORE_BUCKET`, and returns a same-origin URL served by functions/store-img.
// No AWS SDK, no credentials in code — it uses the native R2 binding API.
//
// OPERATOR SETUP (one-time, to enable uploads):
//   Cloudflare dashboard → Pages project → Settings → Functions → R2 bindings →
//   add a binding with Variable name `STORE_BUCKET` pointing at any R2 bucket.
// Until that binding exists this endpoint returns 501 and the dashboard simply
// falls back to "paste an image URL" — nothing breaks.
//
// This exact-path function takes precedence over the catch-all /api/[[path]].js
// proxy, so /api/store-upload is handled here (and never forwarded to the bot).

const BACKEND = "https://quicksark.squareweb.app";
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 5 * 1024 * 1024;

function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function randHex(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!env.STORE_BUCKET) return json({ error: "upload_not_configured" }, 501);

  // Require a logged-in dashboard session: forward the cookie (+ proxy secret) to
  // the bot's /me. The session cookie is SameSite=Lax, so a cross-site forgery
  // can't carry it — this is the CSRF guard too.
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

  const ct = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[ct];
  if (!ext) return json({ error: "bad_type", detail: "png, jpg, webp or gif only" }, 415);

  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return json({ error: "too_large", detail: "max 5 MB" }, 413);
  if (buf.byteLength < 64) return json({ error: "empty" }, 400);

  const key = `store/${randHex(16)}.${ext}`;
  try {
    await env.STORE_BUCKET.put(key, buf, { httpMetadata: { contentType: ct } });
  } catch (e) {
    return json({ error: "store_failed", detail: String(e && e.message || e).slice(0, 120) }, 502);
  }
  const origin = new URL(request.url).origin;
  return json({ url: `${origin}/store-img/${key}` });
}
