// Cloudflare Pages Function — serves storefront product images from the R2
// bucket bound as `STORE_BUCKET` (uploaded via functions/api/store-upload.js).
// Same-origin (arkoris.net/store-img/<key>), long-cached, immutable. Returns 404
// when R2 isn't configured or the object is missing.

export async function onRequest(context) {
  const { env, params, request } = context;
  if (!env.STORE_BUCKET) return new Response("Not found", { status: 404 });

  const key = (Array.isArray(params.path) ? params.path.join("/") : String(params.path || "")).replace(/^\/+/, "");
  // Confine reads to the upload prefix; reject traversal / odd keys.
  if (!key || key.includes("..") || !/^store\/[a-f0-9]{8,}\.(png|jpe?g|webp|gif)$/i.test(key)) {
    return new Response("Bad request", { status: 400 });
  }

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
