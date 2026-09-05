// Cloudflare Pages Function — serves storefront images on this origin.
//
//   /store-img/bot/<id>.<ext>   → images the bot stores in its database
//                                 (uploaded via /api/store-upload). Proxied
//                                 from the bot and cached at the edge for a
//                                 year — ids are random + immutable, so the
//                                 bot serves each picture about once per PoP.
//   /store-img/store/<key>      → images in the optional R2 bucket bound as
//                                 `STORE_BUCKET` (404 when no bucket is bound).

const BACKEND = "https://quicksark.squareweb.app";
const BOT_RE = /^bot\/([a-f0-9]{24}\.(?:png|jpe?g|webp|gif))$/i;
const R2_RE = /^store\/[a-f0-9]{8,}\.(png|jpe?g|webp|gif)$/i;

export async function onRequest(context) {
  const { env, params, request } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const key = (Array.isArray(params.path) ? params.path.join("/") : String(params.path || "")).replace(/^\/+/, "");
  if (!key || key.includes("..")) return new Response("Bad request", { status: 400 });

  // ── Bot-hosted images ──
  const bot = BOT_RE.exec(key);
  if (bot) {
    const file = bot[1].toLowerCase();
    const cache = caches.default;
    const cacheKey = new Request(new URL(`/store-img/bot/${file}`, request.url).toString(), { method: "GET" });
    let resp = await cache.match(cacheKey);
    if (!resp) {
      let up;
      try {
        up = await fetch(`${BACKEND}/store-img/bot/${file}`, { cf: { cacheEverything: true, cacheTtl: 31536000 } });
      } catch {
        return new Response("Image temporarily unavailable", { status: 502, headers: { "cache-control": "no-store" } });
      }
      if (!up.ok) return new Response("Not found", { status: up.status === 404 ? 404 : 502, headers: { "cache-control": "no-store" } });
      const headers = new Headers();
      headers.set("content-type", up.headers.get("content-type") || "application/octet-stream");
      const etag = up.headers.get("etag");
      if (etag) headers.set("etag", etag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("x-content-type-options", "nosniff");
      headers.set("content-disposition", "inline");
      resp = new Response(up.body, { status: 200, headers });
      context.waitUntil(cache.put(cacheKey, resp.clone()));
    }
    const inm = request.headers.get("if-none-match");
    const tag = resp.headers.get("etag");
    if (inm && tag && inm === tag) return new Response(null, { status: 304, headers: resp.headers });
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: resp.headers });
    return resp;
  }

  // ── R2 images (optional bucket) ──
  if (!env.STORE_BUCKET) return new Response("Not found", { status: 404 });
  if (!R2_RE.test(key)) return new Response("Bad request", { status: 400 });

  const obj = await env.STORE_BUCKET.get(key);
  if (!obj || !obj.body) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (obj.httpEtag) headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");

  // Honour conditional requests so browsers can revalidate cheaply.
  const inm = request.headers.get("if-none-match");
  if (inm && obj.httpEtag && inm === obj.httpEtag) return new Response(null, { status: 304, headers });

  return new Response(obj.body, { headers });
}
