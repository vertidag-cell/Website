// Cloudflare Pages Function — pretty per-store links: arkoris.net/s/<slug>.
// Resolves the slug to a guild id via the proxied bot API and 302-redirects to
// the real storefront (store.html?guild=<id>). No DNS / subdomains needed.

export async function onRequest(context) {
  const { params, request } = context;
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = String(raw || "").trim().toLowerCase();
  const origin = new URL(request.url).origin;

  if (!/^[a-z0-9-]{2,32}$/.test(slug)) {
    return Response.redirect(origin + "/servers.html", 302);
  }
  try {
    const r = await fetch(origin + "/api/dashboard/store/resolve?slug=" + encodeURIComponent(slug), { headers: { Accept: "application/json" } });
    if (r.ok) {
      const b = await r.json().catch(() => null);
      if (b && b.guildId) return Response.redirect(origin + "/store.html?guild=" + encodeURIComponent(b.guildId), 302);
    }
  } catch { /* fall through to 404 */ }

  return new Response("Store not found. Check the link, or browse all stores at /servers.html", {
    status: 404, headers: { "content-type": "text/plain" },
  });
}
