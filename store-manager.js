// Store Manager — a focused admin app for one guild's web store (?guild=<id>).
// Sidebar shell + a small component system (fields, switches, segmented controls,
// stat tiles, badges, a right slide-over for editing, teaching empty states).
// Reuses the admin store API + the first-party session cookie. CSP-safe: DOM is
// built with el() + addEventListener (no inline handlers).
(function () {
  var root = document.getElementById("sm-root");
  var params = new URLSearchParams(location.search);
  var gid = (params.get("guild") || params.get("g") || "").trim();
  var CCY = { GBP: "£", USD: "$", EUR: "€" };
  // Demo mode (?demo=1): render the whole manager with sample data, no backend.
  // Lets owners preview the admin and serves as a visual reference. Writes no-op.
  var DEMO = params.get("demo") === "1";
  if (DEMO && !gid) gid = "000000000000000000";

  // ── el() hyperscript ──────────────────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElement(tag), i, k, v;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, "");
      else e.setAttribute(k, v);
    }
    for (i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(x)); });
      else e.append(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function money(n, ccy) { return (CCY[ccy] || "") + (Number(n) || 0).toFixed(2); }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }
  function initial(s) { return (String(s || "?").trim().charAt(0) || "?").toUpperCase(); }
  // Compact relative time ("just now" / "2h ago" / "3d ago"); falls back to a
  // date past ~30 days. Input is a SQLite UTC string or ISO.
  function relTime(ts) {
    if (!ts) return "";
    var d = new Date(String(ts).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? "" : "Z"));
    var ms = d.getTime(); if (isNaN(ms)) return "";
    var diff = Date.now() - ms;
    if (diff < 0) diff = 0;
    var m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    if (h < 24) return h + "h ago";
    if (days < 30) return days + "d ago";
    return d.toLocaleDateString();
  }
  function absDate(ts) { if (!ts) return ""; var d = new Date(String(ts).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? "" : "Z")); return isNaN(d.getTime()) ? "" : d.toLocaleString(); }

  // ── icons ─────────────────────────────────────────────────────────────────
  var IP = {
    overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    products: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 7 12 12l8.73-5M12 22V12",
    orders: "M5 2v20l2.5-1.6L10 22l2-1.6L14 22l2.5-1.6L19 22V2l-2.5 1.6L14 2l-2 1.6L10 2 7.5 3.6zM9 8h6M9 12h6M9 16h4",
    coupons: "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4zM14 5v2M14 11v2M14 17v2",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
    payments: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM2 10h20M6 15h4",
    store: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
    plus: "M12 5v14M5 12h14", ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
    coin: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9.5 9a2.5 2.5 0 0 1 5 0M9.5 9v6M14.5 12H9.5", truck: "M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    chart: "M3 3v18h18M7 14l3-3 3 3 5-6", lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
    star: "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z",
    customers: "M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 19v-2a4 4 0 0 0-3-3.87M16 2.1a4 4 0 0 1 0 7.75",
    categories: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    grip: "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
    edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
    trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
    wand: "M12 3 9.9 9.9 3 12l6.9 2.1L12 21l2.1-6.9L21 12l-6.9-2.1z",
  };
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    var p = document.createElementNS(ns, "path"); p.setAttribute("d", IP[name] || IP.store); s.appendChild(p);
    return s;
  }

  // ── API ─────────────────────────────────────────────────────────────────────
  var _csrf = "";
  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/auth/csrf", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (b) { _csrf = (b && b.csrfToken) || ""; return _csrf; }).catch(function () { return ""; });
  }
  function api(path, opts) {
    opts = opts || {};
    if (DEMO) return Promise.resolve({ ok: true, status: 200, body: demoResp(path, opts) });
    var method = (opts.method || "GET").toUpperCase();
    var headers = { Accept: "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    var pre = method === "GET" ? Promise.resolve("") : getCsrf();
    return pre.then(function (tok) {
      if (tok) headers["X-Arkoris-CSRF"] = tok;
      return fetch(path, { method: method, credentials: "include", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        if (r.status === 403 && body && body.error === "csrf_failed" && !opts._retry) { _csrf = ""; return api(path, Object.assign({}, opts, { _retry: true })); }
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  }
  // Sample data for ?demo=1 preview mode.
  var DEMO_ROLES = [{ id: "1", name: "VIP" }, { id: "2", name: "Supporter" }, { id: "3", name: "MVP" }, { id: "4", name: "Founder" }];
  var DEMO_CHANNELS = [{ id: "10", name: "orders" }, { id: "11", name: "staff-fulfilment" }, { id: "12", name: "general" }];
  var DEMO_PRODUCTS = [
    { id: 1, name: "VIP Rank", description: "Coloured name, /kit vip, 2 homes and queue priority.", image_url: null, category: "Ranks", category_id: 111, price_money: 9.99, price_credits: 5000, fulfillment_type: "role", role_id: "1", stock: null, per_user_limit: 1, enabled: true, featured: true, rating: 4.7, reviewCount: 12, soldCount: 142, variants: [{ id: 11, name: "1 month", enabled: true }, { id: 12, name: "3 months", enabled: true }, { id: 13, name: "Lifetime", enabled: true }] },
    { id: 2, name: "MVP Rank", description: "Everything in VIP plus a custom tag and monthly crate.", image_url: null, category: "Ranks", category_id: 111, price_money: 19.99, price_credits: 12000, sale_price_money: 14.99, sale_ends_at: "2026-12-31T23:59:00.000Z", fulfillment_type: "role", role_id: "3", stock: null, per_user_limit: 1, enabled: true, featured: true, soldCount: 58 },
    { id: 3, name: "Giga lvl 150 (imprinted)", description: "Bred, imprinted Giga delivered to your tribe.", image_url: null, category: "Dinos", category_id: 102, price_money: null, price_credits: 8000, fulfillment_type: "manual", delivery_instructions: "Spawn imprinted Giga 150 at buyer base", stock: 5, per_user_limit: null, enabled: true, rating: 5, reviewCount: 3, soldCount: 21 },
    { id: 4, name: "Starter Kit", description: "Metal tools, 200 element, full flak.", image_url: null, category: "Kits", category_id: 103, price_money: 4.99, price_credits: 2500, fulfillment_type: "manual", delivery_instructions: "Hand over starter kit", stock: 0, per_user_limit: null, enabled: true },
    { id: 5, name: "Tribe Logo", description: "Custom in-server tribe banner (hidden while in design).", image_url: null, category: "Cosmetic", category_id: 104, price_money: 6, price_credits: null, fulfillment_type: "manual", delivery_instructions: "Design + deliver banner", stock: null, per_user_limit: null, enabled: false },
    { id: 6, name: "New Player Bundle", description: "VIP rank + a starter kit, sold together at a saving.", image_url: null, category: "Bundles", category_id: 105, price_money: 12.99, price_credits: 6500, fulfillment_type: "manual", stock: null, per_user_limit: null, enabled: true, soldCount: 14, bundle_items: [{ product_id: 1, quantity: 1 }, { product_id: 4, quantity: 1 }] },
  ];
  var DEMO_CATEGORIES = [
    { id: 101, guild_id: gid, parent_id: null, name: "Ranks", description: "Donor ranks and perks.", image_url: null, position: 0, enabled: true, productCount: 0, totalProductCount: 2, children: [
      { id: 111, guild_id: gid, parent_id: 101, name: "VIP tiers", image_url: null, position: 0, enabled: true, productCount: 2 },
    ] },
    { id: 102, guild_id: gid, parent_id: null, name: "Dinos", description: "Bred, imprinted creatures.", image_url: null, position: 1, enabled: true, productCount: 1, totalProductCount: 1, children: [] },
    { id: 103, guild_id: gid, parent_id: null, name: "Kits", description: null, image_url: null, position: 2, enabled: true, productCount: 1, totalProductCount: 1, children: [] },
    { id: 104, guild_id: gid, parent_id: null, name: "Cosmetic", description: null, image_url: null, position: 3, enabled: false, productCount: 1, totalProductCount: 1, children: [] },
    { id: 105, guild_id: gid, parent_id: null, name: "Bundles", description: "Save by buying together.", image_url: null, position: 4, enabled: true, productCount: 1, totalProductCount: 1, children: [] },
  ];
  var DEMO_ORDERS = [
    { id: 312, buyer_user_id: "111", buyer_username: "ApexHunter", rail: "money", total_money: 9.99, currency: "GBP", total_credits: null, status: "completed", coupon_code: null, created_at: "2026-06-19 14:02:00", items: [{ id: 1, name: "VIP Rank", quantity: 1, fulfillment_type: "role", fulfillment_status: "granted" }] },
    { id: 311, buyer_user_id: "112", buyer_username: "RexQueen", rail: "credits", total_credits: 8000, status: "needs_delivery", coupon_code: "SUMMER20", redeem_code: "ARK-7Q2M-4XZ9", redeemed_at: null, created_at: "2026-06-19 12:40:00", customFields: [{ id: "ign", label: "In-game character name", value: "RexQueen" }, { id: "tribe", label: "Tribe name", value: "Apex Predators" }], items: [{ id: 2, name: "Giga lvl 150 (imprinted)", quantity: 1, fulfillment_type: "manual", delivery_instructions: "Spawn imprinted Giga 150 at buyer base", fulfillment_status: "pending" }] },
    { id: 310, buyer_user_id: "113", buyer_username: "MeshGod", rail: "money", total_money: 19.99, currency: "GBP", status: "paid", coupon_code: null, created_at: "2026-06-18 22:10:00", items: [{ id: 3, name: "MVP Rank", quantity: 1, fulfillment_type: "role", fulfillment_status: "granted" }] },
  ];
  var DEMO_COUPONS = [
    { id: 1, code: "SUMMER20", description: "Summer sale", discount_type: "percent", percent_off: 20, amount_off_money: null, amount_off_credits: null, min_subtotal_money: null, min_subtotal_credits: null, max_redemptions: 100, per_user_limit: 1, redeemed_count: 37, starts_at: null, expires_at: "2026-08-31 23:59:59", enabled: true },
    { id: 2, code: "WELCOME5", description: "£5 off first order", discount_type: "fixed", percent_off: null, amount_off_money: 5, amount_off_credits: null, min_subtotal_money: 10, min_subtotal_credits: null, max_redemptions: null, per_user_limit: 1, redeemed_count: 12, starts_at: null, expires_at: null, enabled: true },
  ];
  var DEMO_VARIANTS = [
    { id: 11, product_id: 1, name: "1 month", price_money: 9.99, price_credits: 5000, stock: null, enabled: true },
    { id: 12, product_id: 1, name: "3 months", price_money: 24.99, price_credits: 13000, stock: null, enabled: true },
    { id: 13, product_id: 1, name: "Lifetime", price_money: 59.99, price_credits: null, stock: 10, enabled: true },
  ];
  var DEMO_REVIEWS = [
    { id: 1, product_id: 1, product_name: "VIP Rank", user_id: "111", username: "ApexHunter", rating: 5, comment: "Instant role, brilliant value.", status: "published", created_at: "2026-06-18 10:00:00", reply: "Thanks for the support — enjoy the perks!" },
    { id: 2, product_id: 3, product_name: "Giga lvl 150 (imprinted)", user_id: "112", username: "RexQueen", rating: 4, comment: "Delivered in-game within the hour.", status: "published", created_at: "2026-06-17 14:00:00" },
    { id: 3, product_id: 4, product_name: "Starter Kit", user_id: "113", username: "MeshGod", rating: 2, comment: "Wanted more element in the kit.", status: "hidden", created_at: "2026-06-16 09:00:00" },
  ];
  var DEMO_CFG = { guild_id: gid, enabled: true, title: "Velated PVP Store", description: "Donor ranks, kits and in-game items for the cluster.", announcement: "🔥 Summer sale — 25% off all ranks this weekend!", currency: "GBP", accept_money: true, accept_credits: true, test_mode: true, slug: "velated-pvp", invoice_channel_id: "10", invoice_email: "billing@velated.gg", banner_url: null, accent_color: null, checkout_fields: [{ id: "ign", label: "In-game character name", required: true, placeholder: "e.g. RexQueen" }, { id: "tribe", label: "Tribe name", required: false, placeholder: "" }] };
  var DEMO_SERIES = (function () {
    var m = [18, 24, 12, 30, 22, 9.99, 40, 35, 28, 52, 44, 60, 38, 74], cr = [0, 5000, 0, 8000, 2500, 0, 5000, 12000, 0, 8000, 5000, 0, 2500, 12000];
    return m.map(function (v, i) { return { date: "d" + i, money: v, credits: cr[i], orders: Math.round(v / 9) + (cr[i] ? 1 : 0) }; });
  })();
  var DEMO_TOP = [
    { name: "VIP Rank", qty: 31, money: 309.69, credits: 0 },
    { name: "MVP Rank", qty: 18, money: 359.82, credits: 0 },
    { name: "Giga lvl 150 (imprinted)", qty: 11, money: 0, credits: 88000 },
    { name: "Starter Kit", qty: 7, money: 34.93, credits: 0 },
  ];
  var DEMO_CUSTOMERS = [
    { userId: "111", username: "ApexHunter", orders: 9, money: 184.91, credits: 4000, lastOrderAt: "2026-06-19 14:02:00", firstOrderAt: "2026-03-02 10:00:00" },
    { userId: "112", username: "RexQueen", orders: 6, money: 74.94, credits: 32000, lastOrderAt: "2026-06-19 12:40:00", firstOrderAt: "2026-04-11 18:20:00" },
    { userId: "113", username: "MeshGod", orders: 5, money: 99.95, credits: 0, lastOrderAt: "2026-06-18 22:10:00", firstOrderAt: "2026-05-01 09:00:00" },
    { userId: "114", username: "TribeLeader", orders: 4, money: 59.96, credits: 12000, lastOrderAt: "2026-06-15 08:30:00", firstOrderAt: "2026-05-20 14:00:00" },
    { userId: "115", username: "DodoWrangler", orders: 2, money: 0, credits: 16000, lastOrderAt: "2026-06-10 11:15:00", firstOrderAt: "2026-06-01 11:15:00" },
  ];
  function demoResp(path, opts) {
    if (opts && opts.method && opts.method !== "GET") return { ok: true };
    if (/\/me$/.test(path)) return { user: { id: "0", username: "previewowner", globalName: "Preview Owner" } };
    if (/\/store\/overview/.test(path)) {
      if (params.get("new") === "1") return { config: Object.assign({}, DEMO_CFG, { title: "My New Store", enabled: false }), recentOrders: [], series: [], topProducts: [], topCustomers: [], paymentsConnected: false, stats: { revenueMoney: 0, revenueCredits: 0, paidOrders: 0, needsDelivery: 0, products: 0, enabledProducts: 0, customers: 0, activeCoupons: 0 } };
      var ser = DEMO_SERIES;
      if (/days=30/.test(path)) { ser = []; for (var di = 0; di < 30; di++) { var b = DEMO_SERIES[di % DEMO_SERIES.length]; ser.push({ date: "d" + di, money: b.money, credits: b.credits, orders: b.orders }); } }
      return { config: DEMO_CFG, recentOrders: DEMO_ORDERS, series: ser, topProducts: DEMO_TOP, topCustomers: DEMO_CUSTOMERS.slice(0, 5), paymentsConnected: true, kpis: { days: /days=30/.test(path) ? 30 : 14, revenueMoney: 486.99, revenueCredits: 21000, revenueDelta: 18, orders: 62, ordersDelta: 12, customers: 28, customersDelta: 9, refunds: 1, refundsDelta: -50 }, stats: { revenueMoney: 1284.5, revenueCredits: 96000, paidOrders: 73, needsDelivery: 1, products: DEMO_PRODUCTS.length, enabledProducts: 4, customers: DEMO_CUSTOMERS.length, activeCoupons: 2 }, inventory: { outOfStock: [{ id: 4, name: "Starter Kit" }], lowStock: [{ id: 3, name: "Giga lvl 150 (imprinted)", stock: 5 }] } };
    }
    if (/\/store\/customers/.test(path)) { var cq = decodeURIComponent((path.match(/[?&]q=([^&]*)/) || [])[1] || "").toLowerCase(); return { customers: cq ? DEMO_CUSTOMERS.filter(function (c) { return (c.username || "").toLowerCase().indexOf(cq) >= 0 || String(c.userId).indexOf(cq) >= 0; }) : DEMO_CUSTOMERS }; }
    if (/\/variants/.test(path)) return { variants: DEMO_VARIANTS };
    if (/\/store\/categories/.test(path)) return { categories: DEMO_CATEGORIES };
    if (/\/store\/products/.test(path)) return { products: DEMO_PRODUCTS };
    if (/\/store\/coupons/.test(path)) return { coupons: DEMO_COUPONS };
    if (/\/store\/reviews/.test(path)) { var rst = (path.match(/status=(\w+)/) || [])[1]; return { reviews: rst ? DEMO_REVIEWS.filter(function (r) { return r.status === rst; }) : DEMO_REVIEWS }; }
    if (/\/store\/orders/.test(path)) { var st = (path.match(/status=(\w+)/) || [])[1]; return { orders: st ? DEMO_ORDERS.filter(function (o) { return o.status === st; }) : DEMO_ORDERS }; }
    if (/\/discord\/roles/.test(path)) return { roles: DEMO_ROLES };
    if (/\/discord\/channels/.test(path)) return { channels: DEMO_CHANNELS };
    if (/\/payments\/stripe/.test(path)) return { brandName: "Velated PVP Store", secretKey: { configured: true, source: "guild", last4: "9aF2" }, webhookSecret: { configured: true }, mode: "live", webhookUrl: location.origin + "/webhooks/stripe", isConfigured: true };
    if (/\/payments\/paypal/.test(path)) return { mode: "live", prefer: "orders", brandName: "Velated PVP Store", clientId: { configured: false, source: "unset" }, clientSecret: { configured: false }, webhookId: { configured: false }, webhookUrl: location.origin + "/webhooks/paypal", isConfigured: false };
    return {};
  }

  function A(path) { return "/api/dashboard/guilds/" + gid + path; }
  function loginBounce() { try { sessionStorage.setItem("storeReturn", location.href); } catch (e) {} location.href = "/auth/discord/login"; }

  // ── toasts ──────────────────────────────────────────────────────────────────
  function toast(msg, kind) {
    var t = el("div", { class: "toast" + (kind === "err" ? " err" : "") }, el("span", { class: "dot" }), msg);
    document.body.appendChild(t); setTimeout(function () { t.classList.add("in"); }, 10);
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 250); }, 2700);
  }
  function fullState(iconName, title, body, action) {
    clear(root);
    root.append(el("div", { class: "state-full" }, el("div", null, el("div", { class: "e-ic" }, icon(iconName)), el("h2", null, title), el("p", null, body), action || null)));
  }

  // ── components ────────────────────────────────────────────────────────────
  function field(label, control, opts) {
    opts = opts || {};
    return el("label", { class: "field" }, el("span", { class: "lab" }, label), control,
      opts.hint ? el("span", { class: "hint" }, opts.hint) : null, opts.errEl || null);
  }
  function inp(attrs) { return el("input", Object.assign({ class: "inp" }, attrs)); }
  function prefixInp(prefix, attrs) { return el("div", { class: "inp-prefix" }, el("span", null, prefix), inp(attrs)); }
  function ta(attrs) { return el("textarea", Object.assign({ class: "inp" }, attrs)); }
  function sel(options, selected, attrs) {
    return el("select", Object.assign({ class: "inp" }, attrs || {}), options.map(function (o) {
      // Accept three option shapes: a plain string ("GBP"), a [value, label] pair,
      // or a { value, label } object. A bare string is both the value and label.
      var isObj = o && typeof o === "object";
      var val = Array.isArray(o) ? o[0] : (isObj ? o.value : o);
      var lab = Array.isArray(o) ? o[1] : (isObj ? o.label : o);
      return el("option", { value: val, selected: String(selected) === String(val) }, lab);
    }));
  }
  function switchEl(checked) {
    var input = el("input", { type: "checkbox" }); input.checked = !!checked;
    return { input: input, node: el("label", { class: "sw" }, input, el("span", { class: "track" })) };
  }
  function swRow(title, desc, checked) {
    var s = switchEl(checked);
    return { input: s.input, node: el("div", { class: "sw-row" }, el("div", { class: "meta" }, el("div", { class: "t" }, title), desc ? el("div", { class: "d" }, desc) : null), s.node) };
  }
  function segmented(options, value, onChange) {
    var state = { v: value };
    var wrap = el("div", { class: "seg" });
    options.forEach(function (o) {
      var b = el("button", { type: "button", class: o.value === value ? "on" : "" }, o.label);
      b.addEventListener("click", function () { state.v = o.value; wrap.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); if (onChange) onChange(o.value); });
      wrap.append(b);
    });
    return { node: wrap, value: function () { return state.v; } };
  }
  function badge(text, variant) { return el("span", { class: "badge " + (variant || "") }, text); }
  function panel() { var p = el("div", { class: "panel" }); for (var i = 0; i < arguments.length; i++) if (arguments[i]) p.append(arguments[i]); return p; }
  function panelHead(title, action) { return el("div", { class: "panel-h" }, el("h2", null, title), action || null); }
  function emptyState(iconName, title, text, action, compact) {
    return el("div", { class: "empty" + (compact ? " sm" : "") }, el("div", { class: "e-ic" }, icon(iconName)), el("h3", null, title), el("p", null, text), action || null);
  }
  function btn(label, opts) {
    opts = opts || {};
    var b = el("button", { type: "button", class: "btn " + (opts.variant || "btn-primary"), disabled: opts.disabled, style: opts.style });
    if (opts.icon) b.append(icon(opts.icon));
    b.append(document.createTextNode(label));
    if (opts.onClick) b.addEventListener("click", opts.onClick);
    return b;
  }

  // Slide-over drawer (used instead of centered modals).
  var openScrim = null, onEsc = null;
  function openDrawer(title, bodyNode, footerNode) {
    closeDrawer();
    var scrim = el("div", { class: "scrim" });
    var dr = el("div", { class: "drawer" },
      el("div", { class: "drawer-h" }, el("h2", null, title), el("button", { class: "drawer-x", "aria-label": "Close", onclick: closeDrawer }, "✕")),
      el("div", { class: "drawer-b" }, bodyNode),
      footerNode ? el("div", { class: "drawer-f" }, footerNode) : null);
    scrim.addEventListener("click", closeDrawer);
    document.body.append(scrim, dr);
    requestAnimationFrame(function () { scrim.classList.add("in"); dr.classList.add("in"); });
    openScrim = scrim; openScrim._dr = dr;
    onEsc = function (e) { if (e.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", onEsc);
  }
  function closeDrawer() {
    if (!openScrim) return;
    var scrim = openScrim, dr = scrim._dr; openScrim = null;
    scrim.classList.remove("in"); dr.classList.remove("in");
    setTimeout(function () { scrim.remove(); dr.remove(); }, 260);
    if (onEsc) document.removeEventListener("keydown", onEsc);
  }

  // ── state ───────────────────────────────────────────────────────────────────
  var S = { cfg: null, products: [], categories: [], roles: [], channels: [], stats: {}, recent: [], series: [], top: [], section: "overview", range: 14 };

  // ── boot ──────────────────────────────────────────────────────────────────
  if (!gid || !/^\d{5,25}$/.test(gid)) { fullState("store", "No server selected", "Open the Store Manager from your dashboard.", btn("Go to dashboard", { onClick: function () { location.href = "dashboard.html"; } })); return; }

  api("/api/dashboard/me").then(function (me) {
    if (me.status === 401) { loginBounce(); return Promise.reject("redirect"); }
    return Promise.all([api(A("/store/overview")), api(A("/store/products")), api(A("/discord/roles")), api(A("/discord/channels")), api(A("/store/categories"))]);
  }).then(function (res) {
    if (!res) return;
    var ov = res[0];
    if (ov.status === 403 && ov.body && ov.body.error === "premium_required") { return fullState("lock", "Premium required", "The web store is a Premium feature. Unlock it with /subscribe in Discord.", btn("See Premium", { onClick: function () { location.href = "pricing.html"; } })); }
    if (ov.status === 401 || ov.status === 403) { return fullState("lock", "No access", "You don't manage this server, or your session expired.", btn("Back to dashboard", { onClick: function () { location.href = "dashboard.html"; } })); }
    if (!ov.ok) { return fullState("store", "Couldn't load the store", "Please try again in a moment.", btn("Retry", { onClick: function () { location.reload(); } })); }
    S.cfg = ov.body.config; S.stats = ov.body.stats || {}; S.recent = ov.body.recentOrders || []; S.series = ov.body.series || []; S.top = ov.body.topProducts || []; S.topCustomers = ov.body.topCustomers || []; S.inventory = ov.body.inventory || { outOfStock: [], lowStock: [] }; S.paymentsConnected = !!ov.body.paymentsConnected; S.kpis = ov.body.kpis || null;
    S.products = (res[1].body && res[1].body.products) || [];
    S.roles = (res[2].body && res[2].body.roles) || [];
    S.channels = (res[3].body && res[3].body.channels) || [];
    S.categories = (res[4] && res[4].body && res[4].body.categories) || [];
    render();
  }).catch(function (e) { if (e !== "redirect") fullState("store", "Couldn't reach the backend", "Please try again shortly.", btn("Retry", { onClick: function () { location.reload(); } })); });

  function refreshOverview() { return api(A("/store/overview" + (S.range && S.range !== 14 ? "?days=" + S.range : ""))).then(function (r) { if (r.ok) { S.stats = r.body.stats || {}; S.recent = r.body.recentOrders || []; S.series = r.body.series || []; S.top = r.body.topProducts || []; S.topCustomers = r.body.topCustomers || []; S.inventory = r.body.inventory || { outOfStock: [], lowStock: [] }; S.paymentsConnected = !!r.body.paymentsConnected; S.kpis = r.body.kpis || null; } }); }
  function refreshProducts() { return api(A("/store/products")).then(function (r) { S.products = (r.body && r.body.products) || []; }); }
  function refreshCategories() { return api(A("/store/categories")).then(function (r) { S.categories = (r.body && r.body.categories) || []; }); }
  // Flatten the category tree into <select> options (sub-categories indented).
  function categoryOptions() {
    var opts = [["", "— No category —"]];
    (S.categories || []).forEach(function (t) {
      opts.push([String(t.id), t.name]);
      (t.children || []).forEach(function (ch) { opts.push([String(ch.id), "   ↳ " + ch.name]); });
    });
    return opts;
  }
  function categoryNameById(id) {
    if (id == null) return null;
    var out = null;
    (S.categories || []).forEach(function (t) {
      if (t.id === id) out = t.name;
      (t.children || []).forEach(function (ch) { if (ch.id === id) out = t.name + " → " + ch.name; });
    });
    return out;
  }

  // ── shell render ──────────────────────────────────────────────────────────
  var NAV = [["overview", "Overview", "overview"], ["products", "Products", "products"], ["categories", "Categories", "categories"], ["orders", "Orders", "orders"], ["customers", "Customers", "customers"], ["reviews", "Reviews", "star"], ["coupons", "Coupons", "coupons"], ["settings", "Settings", "settings"], ["payments", "Payments", "payments"]];
  var SECTION_META = {
    overview: ["Overview", "Your store at a glance"], products: ["Products", "What you sell"],
    categories: ["Categories", "Group products into sections and sub-sections"],
    orders: ["Orders", "Fulfil and refund purchases"],
    customers: ["Customers", "Who buys from your store"],
    reviews: ["Reviews", "Customer ratings — hide anything unfair"],
    coupons: ["Coupons", "Discount codes for checkout"], settings: ["Settings", "Store link, currency, invoices, test mode"], payments: ["Payments", "Connect a provider to take real money"],
  };
  function render() {
    clear(root);
    var name = S.cfg.title || "Your store";
    var app = el("div", { class: "sm-app" });

    // Sidebar
    var nav = el("div", { class: "sm-nav" });
    NAV.forEach(function (n) {
      var b = el("button", { class: S.section === n[0] ? "active" : "", onclick: function () { S.section = n[0]; closeMobileNav(); render(); } },
        el("span", { class: "ic" }, icon(n[2])), n[1]);
      if (n[0] === "orders" && S.stats.needsDelivery > 0) b.append(el("span", { class: "pip" }, S.stats.needsDelivery));
      nav.append(b);
    });
    var side = el("aside", { class: "sm-side" },
      el("a", { class: "sm-brand", href: "dashboard.html", style: { textDecoration: "none", color: "inherit" } },
        el("div", { class: "logo fb" }, initial(name)),
        el("div", null, el("div", { class: "nm" }, name), el("div", { class: "sub" }, "Store Manager"))),
      nav,
      el("div", { class: "sm-side-foot" },
        el("a", { href: location.origin + "/store.html?guild=" + gid, target: "_blank", rel: "noopener" }, "View public store ↗"),
        el("a", { href: "dashboard.html" }, "← Back to dashboard")));

    // Main
    var meta = SECTION_META[S.section];
    var content = el("div", { class: "sm-content" });
    var burger = el("button", { class: "sm-burger", "aria-label": "Menu", onclick: function () { app.classList.add("nav-open"); var sc = el("div", { class: "sm-nav-scrim", onclick: closeMobileNav }); app.append(sc); } }, "☰");
    var topbar = el("div", { class: "sm-topbar" }, burger,
      el("div", null, el("h1", null, meta[0]), el("div", { class: "sub" }, meta[1])),
      el("div", { class: "right" },
        el("span", { class: "pill " + (S.cfg.enabled ? "on" : "off") }, S.cfg.enabled ? "Open" : "Closed"),
        btn("View store", { variant: "btn-outline", icon: "ext", onClick: function () { window.open(location.origin + "/store.html?guild=" + gid, "_blank"); } })));
    var main = el("main", { class: "sm-main" }, topbar, content);

    app.append(side, main);
    root.append(app);

    if (S.section === "overview") renderOverview(content);
    else if (S.section === "products") renderProducts(content);
    else if (S.section === "categories") renderCategories(content);
    else if (S.section === "orders") renderOrders(content);
    else if (S.section === "customers") renderCustomers(content);
    else if (S.section === "reviews") renderReviews(content);
    else if (S.section === "coupons") renderCoupons(content);
    else if (S.section === "settings") renderSettings(content);
    else renderPayments(content);
  }
  function closeMobileNav() { var app = document.querySelector(".sm-app"); if (app) { app.classList.remove("nav-open"); var sc = app.querySelector(".sm-nav-scrim"); if (sc) sc.remove(); } }

  // ── OVERVIEW ───────────────────────────────────────────────────────────────
  var _chartId = 0;
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i]; return t; }
  // SVG area chart (CSP-safe: built as markup, injected via innerHTML — no inline JS).
  function areaChart(values, opts) {
    opts = opts || {}; var w = 660, h = 156, pad = 9, base = h - pad, top = pad + 16;
    var n = values.length || 1, max = Math.max.apply(null, values.concat([1]));
    var X = function (i) { return pad + (n === 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad)); };
    var Y = function (v) { return base - (v / max) * (base - top); };
    var pts = values.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); });
    var line = "M" + pts.join(" L");
    var area = line + " L" + X(n - 1).toFixed(1) + "," + base + " L" + X(0).toFixed(1) + "," + base + " Z";
    var id = "scg" + (++_chartId), lx = X(n - 1).toFixed(1), ly = Y(values[n - 1] || 0).toFixed(1);
    var col = opts.color || "var(--accent)";
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + col + '" stop-opacity="0.36"/>'
      + '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>'
      + '<path d="' + area + '" fill="url(#' + id + ')"/>'
      + '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
      + '<circle cx="' + lx + '" cy="' + ly + '" r="3.5" fill="' + col + '" vector-effect="non-scaling-stroke"/></svg>';
    var box = el("div", { class: "chart" }); box.innerHTML = svg; return box;
  }
  function trendPct(series, key) {
    if (!series || series.length < 4) return null;
    var half = Math.floor(series.length / 2), prev = 0, cur = 0;
    series.slice(0, half).forEach(function (d) { prev += d[key] || 0; });
    series.slice(half).forEach(function (d) { cur += d[key] || 0; });
    if (prev === 0) return cur > 0 ? 100 : null;
    return Math.round(((cur - prev) / prev) * 100);
  }

  function renderOverview(c) {
    var s = S.stats, ccy = S.cfg.currency || "GBP", series = S.series || [];
    var d = 0; // stagger delay
    function reveal(node) { node.classList.add("reveal"); node.style.animationDelay = (d += 70) + "ms"; return node; }

    // Guided setup — accurate step states + progress. Shown until the store is
    // actually live (has a product AND is open); a credits-only store needs no
    // payment provider, so that step auto-completes for it.
    var creditsOnly = !!S.cfg.accept_credits && !S.cfg.accept_money;
    var setupSteps = [
      { done: !!S.cfg.title, label: "Name your store", desc: "Give it a title and description buyers will see.", cta: "Name it", go: function () { S.section = "settings"; render(); } },
      { done: s.products > 0, label: "Add your first product", desc: "Price it in real money, server credits, or both.", cta: "Add product", go: function () { S.section = "products"; render(); productDrawer(null); } },
      { done: !!S.paymentsConnected || creditsOnly, label: "Set up payments", desc: "Connect Stripe or PayPal for real money — or sell for server credits with no setup.", cta: "Set up", go: function () { S.section = "payments"; render(); } },
      { done: !!S.cfg.enabled, label: "Open your store", desc: "Flip it live so your community can buy.", cta: "Go live", go: function () { S.section = "settings"; render(); } },
    ];
    var doneN = setupSteps.filter(function (x) { return x.done; }).length;
    var liveReady = s.products > 0 && S.cfg.enabled;
    if (!liveReady) {
      var pct = Math.round((doneN / setupSteps.length) * 100);
      var ol = el("div", { class: "onb-list" });
      setupSteps.forEach(function (st, i) {
        ol.append(el("div", { class: "onb-step" + (st.done ? " done" : "") },
          el("div", { class: "onb-num" }, st.done ? "✓" : String(i + 1)),
          el("div", { class: "grow" }, el("div", { class: "onb-t" }, st.label), el("div", { class: "onb-d" }, st.desc)),
          st.done ? badge("Done", "ok") : btn(st.cta, { variant: "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: st.go })));
      });
      c.append(reveal(panel(panelHead("Set up your store", el("span", { class: "onb-pct" }, pct + "%")),
        el("p", { class: "panel-sub" }, doneN >= setupSteps.length - 1 ? "Almost there — one step to go and you're selling." : "A few quick steps and you're selling."),
        el("div", { class: "onb-bar" }, el("i", { style: { width: pct + "%" } })),
        ol)));
      return;
    }
    // Live store that accepts money but has no provider connected → slim nudge.
    if (S.cfg.accept_money && !S.paymentsConnected) {
      c.append(reveal(el("div", { class: "alert" },
        el("div", { class: "ai" }, icon("payments")),
        el("div", { class: "grow" },
          el("div", { class: "t" }, "Connect a payment provider"),
          el("div", { class: "d" }, "Your store accepts money, but no Stripe/PayPal is connected — buyers can't pay with money until you do.")),
        btn("Set up payments", { onClick: function () { S.section = "payments"; render(); } }))));
    }

    // needs-delivery call to action
    if (s.needsDelivery > 0) {
      c.append(reveal(el("div", { class: "alert" },
        el("div", { class: "ai" }, icon("truck")),
        el("div", { class: "grow" },
          el("div", { class: "t" }, s.needsDelivery === 1 ? "1 order is waiting on you" : s.needsDelivery + " orders are waiting on you"),
          el("div", { class: "d" }, "Customers have paid for in-game items that need hand delivery.")),
        btn("Deliver now", { onClick: function () { S.section = "orders"; render(); } }))));
    }

    // inventory attention — out-of-stock / low-stock products to restock
    var inv = S.inventory || { outOfStock: [], lowStock: [] };
    if ((inv.outOfStock && inv.outOfStock.length) || (inv.lowStock && inv.lowStock.length)) {
      function invChip(item, kind) {
        var label = kind === "out" ? item.name : item.name + " · " + item.stock + " left";
        var b = el("button", { class: "inv-chip " + kind, type: "button", title: "Restock " + item.name }, label);
        b.addEventListener("click", function () { S.pfilter = (item.name || "").split(" — ")[0]; S.section = "products"; render(); });
        return b;
      }
      function invGroup(title, cls, items, kind) {
        var chips = el("div", { class: "inv-chips" });
        items.forEach(function (it) { chips.append(invChip(it, kind)); });
        return el("div", { class: "inv-group" }, el("span", { class: "inv-h " + cls }, title + " (" + items.length + ")"), chips);
      }
      var invBox = el("div", { class: "inv-wrap" });
      if (inv.outOfStock.length) invBox.append(invGroup("Out of stock", "out", inv.outOfStock, "out"));
      if (inv.lowStock.length) invBox.append(invGroup("Low stock", "low", inv.lowStock, "low"));
      c.append(reveal(panel(panelHead("Needs attention · inventory"),
        el("p", { class: "panel-sub" }, "Restock these so customers can keep buying — click one to jump to it."),
        invBox)));
    }

    // Period KPI strip — revenue / orders / customers / refunds with deltas vs
    // the prior equal period (tracks trends over time, like a commercial dash).
    if (S.kpis) {
      var k = S.kpis;
      var deltaChip = function (d, inverse) {
        if (d == null) return null;
        var good = inverse ? d <= 0 : d >= 0;
        var cls = d === 0 ? "flat" : good ? "up" : "down";
        var arr = d > 0 ? "▲ " : d < 0 ? "▼ " : "● ";
        return el("span", { class: "kpi-delta " + cls }, arr + Math.abs(d) + "%");
      };
      var kpiTile = function (label, value, delta, inverse) {
        return el("div", { class: "kpi" }, el("div", { class: "kpi-l" }, label), el("div", { class: "kpi-v" }, value), deltaChip(delta, inverse));
      };
      var kRev = k.revenueMoney > 0 ? money(k.revenueMoney, ccy) : k.revenueCredits > 0 ? "🪙 " + fmt(k.revenueCredits) : money(0, ccy);
      var dlabel = " · " + k.days + "d";
      c.append(reveal(el("div", { class: "kpi-row" },
        kpiTile("Revenue" + dlabel, kRev, k.revenueDelta),
        kpiTile("Orders" + dlabel, fmt(k.orders), k.ordersDelta),
        kpiTile("Customers" + dlabel, fmt(k.customers), k.customersDelta),
        kpiTile("Refunds" + dlabel, fmt(k.refunds), k.refundsDelta, true))));
    }

    // hero revenue + chart, alongside a 2×2 stat grid
    var moneyVals = series.map(function (x) { return x.money; });
    var creditVals = series.map(function (x) { return x.credits; });
    var mSum = sum(moneyVals), cSum = sum(creditVals);
    var useCredits = mSum === 0 && cSum > 0;
    var vals = useCredits ? creditVals : moneyVals;
    var heroBig = useCredits ? ("🪙 " + fmt(cSum)) : money(mSum, ccy);
    var tp = trendPct(series, useCredits ? "credits" : "money");
    var trendCls = tp == null ? "flat" : tp >= 0 ? "up" : "down";
    var trendTxt = tp == null ? "No change yet" : (tp >= 0 ? "▲ " : "▼ ") + Math.abs(tp) + "% vs prior period";
    var ordSum = sum(series.map(function (x) { return x.orders; }));
    var range = S.range || 14;
    var rangeToggle = el("div", { class: "range-toggle" });
    [14, 30].forEach(function (n) {
      rangeToggle.append(el("button", { class: "range-btn" + (range === n ? " on" : ""), onclick: function () { if (range === n) return; S.range = n; refreshOverview().then(function () { render(); }); } }, n + "d"));
    });

    var hero = el("div", { class: "hero-rev" },
      el("div", { class: "hero-head" },
        el("div", { class: "cap" }, (useCredits ? "Credits taken" : "Revenue") + " · last " + range + " days"),
        rangeToggle),
      el("div", { class: "big" }, heroBig),
      el("span", { class: "trend " + trendCls }, trendTxt),
      areaChart(vals, { color: "var(--accent)" }),
      el("div", { class: "hero-sub" },
        el("div", null, el("div", { class: "v" }, money(s.revenueMoney, ccy)), el("div", { class: "l" }, "All-time money")),
        el("div", null, el("div", { class: "v" }, "🪙 " + fmt(s.revenueCredits)), el("div", { class: "l" }, "All-time credits")),
        el("div", null, el("div", { class: "v" }, fmt(ordSum)), el("div", { class: "l" }, "Orders · last " + range + "d"))));

    function go(section) { return function () { S.section = section; render(); }; }
    function gstat(label, value, ic, flag, onGo) {
      var n = el("div", { class: "gstat" + (flag ? " flag" : "") + (onGo ? " clk" : "") },
        el("div", { class: "gi" }, icon(ic)), el("div", { class: "v" }, value), el("div", { class: "l" }, label));
      if (onGo) { n.setAttribute("role", "button"); n.setAttribute("tabindex", "0"); n.addEventListener("click", onGo); n.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGo(); } }); }
      return n;
    }
    var mini = el("div", { class: "ov-mini" },
      gstat("Paid orders", fmt(s.paidOrders), "orders", false, go("orders")),
      gstat("Awaiting delivery", fmt(s.needsDelivery || 0), "truck", s.needsDelivery > 0, go("orders")),
      gstat("Products live", fmt(s.enabledProducts || 0) + " / " + fmt(s.products || 0), "products", false, go("products")),
      gstat("Active coupons", fmt(s.activeCoupons || 0), "coupons", false, go("coupons")));

    c.append(reveal(el("div", { class: "ov-grid" }, hero, mini)));

    // quick actions
    c.append(reveal(panel(panelHead("Quick actions"), el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
      btn("Add product", { icon: "plus", onClick: function () { S.section = "products"; render(); productDrawer(null); } }),
      btn("New coupon", { variant: "btn-outline", onClick: function () { S.section = "coupons"; render(); couponDrawer(null); } }),
      btn("Edit store settings", { variant: "btn-outline", icon: "settings", onClick: function () { S.section = "settings"; render(); } }),
      btn("View public store", { variant: "btn-ghost", icon: "ext", onClick: function () { window.open(location.origin + "/store.html?guild=" + gid, "_blank"); } }),
      btn("Copy store link", { variant: "btn-ghost", onClick: function () { var u = location.origin + "/store.html?guild=" + gid; try { navigator.clipboard.writeText(u).then(function () { toast("Store link copied"); }, function () { toast("Store link copied"); }); } catch (e) { toast("Store link copied"); } } })))));

    // bottom: top products + recent orders
    var top = panel(panelHead("Top sellers"));
    if (!S.top || !S.top.length) top.append(emptyState("chart", "No sales yet", "Your best-selling products will rank here once orders start coming in.", null, true));
    else {
      var maxQ = Math.max.apply(null, S.top.map(function (t) { return t.qty; }).concat([1]));
      var list = el("div", { class: "topp" });
      S.top.forEach(function (t) {
        var rev = t.money > 0 ? money(t.money, ccy) : t.credits > 0 ? "🪙 " + fmt(t.credits) : "";
        list.append(el("div", null,
          el("div", { class: "hd" }, el("span", { class: "nm" }, t.name), el("span", { class: "qv" }, fmt(t.qty) + " sold" + (rev ? " · " + rev : ""))),
          el("div", { class: "bar" }, el("i", { style: { width: Math.max(6, Math.round((t.qty / maxQ) * 100)) + "%" } }))));
      });
      top.append(list);
    }

    // Top customers by spend (mirrors the SellAuth-style "top customers").
    var cust = panel(panelHead("Top customers", (S.topCustomers && S.topCustomers.length) ? btn("View all", { variant: "btn-ghost", onClick: function () { S.section = "customers"; render(); } }) : null));
    if (!S.topCustomers || !S.topCustomers.length) cust.append(emptyState("customers", "No customers yet", "Your biggest spenders will rank here once orders come in.", null, true));
    else {
      var clist = el("div", { class: "topp" });
      S.topCustomers.forEach(function (cu, i) {
        var spend = cu.money > 0 ? money(cu.money, ccy) : cu.credits > 0 ? "🪙 " + fmt(cu.credits) : "—";
        clist.append(el("div", { class: "topc-row" },
          el("span", { class: "topc-rank" }, "#" + (i + 1)),
          el("div", { class: "cust-av sm" }, initial(cu.username || "?")),
          el("div", { class: "topc-main" },
            el("a", { class: "cust-name", href: "https://discord.com/users/" + cu.userId, target: "_blank", rel: "noopener" }, "@" + (cu.username || cu.userId)),
            el("div", { class: "cust-sub" }, cu.orders + " order" + (cu.orders === 1 ? "" : "s"))),
          el("b", { class: "topc-spend" }, spend)));
      });
      cust.append(clist);
    }

    var ord = panel(panelHead("Recent orders", S.recent.length ? btn("View all", { variant: "btn-ghost", onClick: function () { S.section = "orders"; render(); } }) : null));
    if (!S.recent.length) ord.append(emptyState("orders", "No orders yet", "Purchases will appear here the moment customers check out.", null, true));
    else S.recent.forEach(function (o) {
      var total = o.rail === "credits" ? "🪙 " + fmt(o.total_credits) : money(o.total_money, o.currency);
      ord.append(el("div", { class: "sw-row" },
        el("div", { class: "meta" }, el("div", { class: "t" }, "#" + o.id + "  ·  @" + (o.buyer_username || o.buyer_user_id)), el("div", { class: "d", title: absDate(o.created_at) }, (o.coupon_code ? "🎟️ " + o.coupon_code + " · " : "") + relTime(o.created_at))),
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, orderBadge(o.status), el("b", null, total))));
    });

    c.append(reveal(el("div", { class: "ov-cols" }, top, cust)));
    c.append(reveal(ord));
  }
  function orderBadge(status) {
    var m = { completed: ["Completed", "ok"], paid: ["Paid", "ok"], needs_delivery: ["Needs delivery", "warn"], pending: ["Pending", "dim"], cancelled: ["Cancelled", "dim"], refunded: ["Refunded", "info"], failed: ["Failed", "dim"] };
    var x = m[status] || [status, "dim"]; return badge(x[0], x[1]);
  }

  // ── PRODUCTS ───────────────────────────────────────────────────────────────
  function productCard(p, sel, move) {
    var price = el("div", { class: "pr" });
    if (p.sale_price_money != null && p.price_money != null) { price.append(money(p.sale_price_money, S.cfg.currency)); price.append(el("s", { class: "alt", style: { marginLeft: "5px" } }, money(p.price_money, S.cfg.currency))); }
    else if (p.price_money != null) price.append(money(p.price_money, S.cfg.currency));
    if (p.price_money != null && p.price_credits != null) price.append(el("span", { class: "alt" }, "  or  "));
    if (p.price_credits != null) price.append(el("span", { class: p.price_money != null ? "alt" : "" }, "🪙 " + fmt(p.price_credits)));
    var tierCount = (p.variants || []).filter(function (v) { return v.enabled !== false; }).length;
    var img = p.image_url ? el("img", { class: "img", src: p.image_url, alt: "", loading: "lazy" }) : el("div", { class: "img fb" }, initial(p.name));
    var check = null;
    if (sel) {
      var cb = el("input", { type: "checkbox", "aria-label": "Select " + p.name }); cb.checked = !!sel.set[p.id];
      cb.addEventListener("change", function () {
        if (cb.checked) sel.set[p.id] = true; else delete sel.set[p.id];
        var card = cb.closest(".pcard"); if (card) card.classList.toggle("sel", cb.checked);
        sel.onChange();
      });
      check = el("label", { class: "pcard-check" }, cb);
    }
    // Drag-to-reorder handle (only when reordering is active — i.e. not while
    // searching/filtering, same gate as the ▲▼ controls below).
    var dragH = move ? el("span", { class: "pcard-drag", title: "Drag to reorder", draggable: "true", "aria-hidden": "true" }, icon("grip")) : null;
    var attrs = { class: "pcard" + (p.enabled ? "" : " off") + (sel && sel.set[p.id] ? " sel" : ""), "data-id": p.id };
    if (move) attrs["data-sortable"] = "p";
    return el("div", attrs, check, dragH, img,
      el("div", { class: "body" },
        el("div", { class: "nm" }, p.name),
        el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
          (categoryNameById(p.category_id) || p.category) ? badge("🗂 " + (categoryNameById(p.category_id) || p.category), "") : null,
          p.featured ? badge("★ Featured", "ok") : null,
          (p.bundle_items && p.bundle_items.length) ? badge("🎁 Bundle", "info") : null,
          p.sale_price_money != null ? badge("Sale", "warn") : null,
          p.reviewCount ? badge("★ " + Number(p.rating).toFixed(1) + " (" + p.reviewCount + ")", "") : null,
          p.soldCount ? badge("🔥 " + fmt(p.soldCount) + " sold", "info") : null,
          badge(p.fulfillment_type === "role" ? "⚡ Instant role" : "📦 In-game", p.fulfillment_type === "role" ? "ok" : ""),
          tierCount ? badge(tierCount + " tier" + (tierCount === 1 ? "" : "s"), "info") : null,
          p.stock != null ? badge(p.stock > 0 ? p.stock + " left" : "Out of stock", p.stock > 0 ? "dim" : "warn") : null,
          p.enabled ? null : badge("Hidden", "dim")),
        price,
        el("div", { class: "foot" },
          reorderControls(p, move),
          btn("Edit", { variant: "btn-outline", onClick: function () { productDrawer(p); } }),
          btn("Delete", { variant: "btn-ghost", onClick: function () { delProduct(p); } }))));
  }
  function reorderControls(p, move) {
    if (!move) return null;
    var idx = -1; for (var k = 0; k < S.products.length; k++) { if (S.products[k].id === p.id) { idx = k; break; } }
    return el("div", { class: "reorder" },
      el("button", { class: "ro-btn", type: "button", title: "Move up", disabled: idx <= 0, onclick: function () { move(p, -1); } }, "▲"),
      el("button", { class: "ro-btn", type: "button", title: "Move down", disabled: idx < 0 || idx >= S.products.length - 1, onclick: function () { move(p, 1); } }, "▼"));
  }
  // Quick generate: drop a ready-made catalog (categories + products) into the
  // store in one click. Append-only and confirmed, so it never wipes existing work.
  function quickGenerateDrawer() {
    var body = el("div");
    body.append(el("p", { class: "hint", style: { margin: "0 0 14px" } },
      "Pick a ready-made catalog. ⚠️ This REPLACES your store — it removes all current products and categories first, then creates the template's. You can edit prices, add images and reorder afterwards."));
    var listBox = el("div", { class: "tpl-list" }, el("p", { class: "hint" }, "Loading templates…"));
    body.append(listBox);
    openDrawer("Quick generate", body, null);

    api(A("/store/templates")).then(function (r) {
      clear(listBox);
      var tpls = (r.body && r.body.templates) || [];
      if (!tpls.length) { listBox.append(el("p", { class: "hint" }, "No templates available right now.")); return; }
      tpls.forEach(function (t) {
        var applyBtn = btn("Replace store", { icon: "wand", onClick: function () {
          var curProd = (S.products || []).length;
          var curCat = (S.categories || []).reduce(function (n, c) { return n + 1 + ((c.children || []).length); }, 0);
          var warn = (curProd || curCat)
            ? "This REMOVES your current " + curProd + " product" + (curProd === 1 ? "" : "s") + " and " + curCat + " categor" + (curCat === 1 ? "y" : "ies") + ", then adds " + t.products + " products in " + t.categories + " categories. Continue?"
            : "Add " + t.products + " products across " + t.categories + " categories (prices in " + (t.currency || "GBP") + ")?";
          if (!confirm(warn)) return;
          applyBtn.disabled = true; applyBtn.lastChild.nodeValue = "Generating…";
          api(A("/store/template/apply"), { method: "POST", body: { templateId: t.id, replace: true } }).then(function (rr) {
            if (!rr.ok) { applyBtn.disabled = false; applyBtn.lastChild.nodeValue = "Replace store"; toast((rr.body && rr.body.errors && rr.body.errors.join("; ")) || "Couldn't generate the store", "err"); return; }
            var made = (rr.body && rr.body.created) || {}, gone = (rr.body && rr.body.removed) || {};
            if (rr.body && rr.body.currency) S.cfg.currency = rr.body.currency;
            closeDrawer();
            Promise.all([refreshProducts(), refreshCategories()]).then(function () {
              toast((gone.products ? "Replaced — " : "Added ") + (made.products || 0) + " products in " + (made.categories || 0) + " categories");
              S.section = "products"; render();
            });
          });
        } });
        listBox.append(el("div", { class: "tpl-card" },
          el("div", { class: "tpl-meta" },
            el("div", { class: "tpl-name" }, t.name),
            el("div", { class: "tpl-desc" }, t.description || ""),
            el("div", { class: "tpl-stat" }, t.categories + " categories · " + t.products + " products · " + (t.currency || "GBP"))),
          applyBtn));
      });
    });
  }

  function renderProducts(c) {
    var headActions = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      btn("Quick generate", { variant: "btn-ghost", icon: "wand", onClick: function () { quickGenerateDrawer(); } }),
      btn("Add product", { icon: "plus", onClick: function () { productDrawer(null); } }));
    c.append(panel(panelHead("Products (" + S.products.length + ")", headActions),
      el("p", { class: "panel-sub" }, "Each product is sold on your public store. Price in money, credits, or both; deliver an instant Discord role or a manual in-game handover.")));
    if (!S.products.length) {
      var emptyActions = el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" } },
        btn("Quick-generate a catalog", { icon: "wand", onClick: function () { quickGenerateDrawer(); } }),
        btn("Add one manually", { variant: "btn-ghost", icon: "plus", onClick: function () { productDrawer(null); } }));
      c.append(emptyState("products", "No products yet", "Quick-generate a ready-made ARK catalog — categories, products and prices in one click — then tweak it. Or add products one at a time.", emptyActions));
      return;
    }
    // Bulk selection — show/hide many products at once.
    var selected = {};
    function clearSel() { Object.keys(selected).forEach(function (k) { delete selected[k]; }); }
    var bar = el("div", { class: "bulk-bar" }); bar.style.display = "none";
    function refreshBar() {
      var ids = Object.keys(selected);
      if (!ids.length) { bar.style.display = "none"; clear(bar); return; }
      bar.style.display = "flex"; clear(bar);
      var bb = function (label, patch, msg, variant) { return btn(label, { variant: variant || "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { bulkPatch(patch, msg); } }); };
      bar.append(el("span", { class: "bulk-count" }, ids.length + " selected"),
        bb("Show", { enabled: true }, "Products shown"),
        bb("Hide", { enabled: false }, "Products hidden"),
        bb("Feature", { featured: true }, "Products featured"),
        bb("Unfeature", { featured: false }, "Products unfeatured"),
        btn("Set category", { variant: "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () {
          var picker = sel(categoryOptions(), "");
          var foot = el("div", { style: { display: "flex", gap: "8px", width: "100%" } }, el("div", { style: { flex: "1" } }),
            btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }),
            btn("Apply", { onClick: function () { var cid = picker.value ? Number(picker.value) : null; closeDrawer(); bulkPatch({ category_id: cid }, "Category updated"); } }));
          openDrawer("Set category for " + ids.length + " product" + (ids.length === 1 ? "" : "s"),
            el("div", null, field("Category", picker, { hint: "Choose a category (or “No category” to clear) for the selected products." })), foot);
        } }),
        btn("Clear", { variant: "btn-ghost", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { clearSel(); renderGrid(searchEl ? searchEl.value : ""); refreshBar(); } }));
    }
    function bulkPatch(patch, msg) {
      var ids = Object.keys(selected); if (!ids.length) return;
      Promise.all(ids.map(function (id) { return api(A("/store/products/" + id), { method: "PATCH", body: patch }); }))
        .then(function () { clearSel(); toast(msg); refreshProducts().then(function () { render(); }); });
    }
    var selection = { set: selected, onChange: refreshBar };
    function persistOrder() {
      api(A("/store/products/reorder"), { method: "POST", body: { order: S.products.map(function (x) { return x.id; }) } }).then(function (r) { if (!r.ok) toast("Couldn't save order", "err"); });
    }
    // Reorder: swap with the neighbour in S.products and persist the new order.
    function move(p, dir) {
      var idx = -1; for (var k = 0; k < S.products.length; k++) { if (S.products[k].id === p.id) { idx = k; break; } }
      var j = idx + dir;
      if (idx < 0 || j < 0 || j >= S.products.length) return;
      var t = S.products[idx]; S.products[idx] = S.products[j]; S.products[j] = t;
      persistOrder();
      renderGrid(searchEl ? searchEl.value : "");
    }
    var grid = el("div", { class: "pgrid" });
    // Drag-to-reorder the product grid (only meaningful in the unfiltered order;
    // cards drop their drag attrs while searching). makeSortable is attached once
    // — its listeners read the live DOM, so they no-op when no cards are sortable.
    makeSortable(grid, function (ids) {
      var byId = {}; S.products.forEach(function (p) { byId[p.id] = p; });
      var reordered = ids.map(function (id) { return byId[id]; }).filter(Boolean);
      S.products.forEach(function (p) { if (ids.indexOf(p.id) < 0) reordered.push(p); });
      S.products = reordered;
      persistOrder();
      renderGrid(searchEl ? searchEl.value : ""); // refresh ▲▼ disabled states
      toast("Order saved");
    });
    function renderGrid(q) {
      clear(grid);
      q = (q || "").trim().toLowerCase();
      var list = S.products.filter(function (p) { return !q || ((p.name || "") + " " + (categoryNameById(p.category_id) || p.category || "")).toLowerCase().indexOf(q) >= 0; });
      if (!list.length) { grid.append(emptyState("products", "No matches", "No products match your search — try a different term.", null, true)); return; }
      list.forEach(function (p) { grid.append(productCard(p, selection, q ? null : move)); });
    }
    var initialQ = S.pfilter || ""; S.pfilter = null; // deep-link from "Needs attention"
    var searchEl = null;
    if (S.products.length > 3) {
      searchEl = inp({ type: "search", value: initialQ, placeholder: "Search products by name or category…", style: { marginBottom: "14px" } });
      searchEl.addEventListener("input", function () { renderGrid(searchEl.value); });
      c.append(searchEl);
    }
    c.append(bar, grid);
    renderGrid(initialQ);
  }
  function delProduct(p) {
    if (!confirm('Delete "' + p.name + '"? This hides it from the store.')) return;
    api(A("/store/products/" + p.id), { method: "DELETE" }).then(function (r) { if (!r.ok) return toast("Couldn't delete", "err"); refreshProducts().then(function () { toast("Product deleted"); render(); }); });
  }
  // Clone a product (fields + active tiers) as a new HIDDEN product to edit.
  function duplicateProduct(p) {
    var body = {
      name: (p.name || "Product") + " (copy)", description: p.description || null, image_url: p.image_url || null, category: p.category || null,
      price_money: p.price_money != null ? p.price_money : null, price_credits: p.price_credits != null ? p.price_credits : null,
      fulfillment_type: p.fulfillment_type, role_id: p.fulfillment_type === "role" ? (p.role_id || null) : null,
      delivery_instructions: p.fulfillment_type === "manual" ? (p.delivery_instructions || null) : null,
      stock: p.stock != null ? p.stock : null, per_user_limit: p.per_user_limit != null ? p.per_user_limit : null,
      featured: false, enabled: false,
    };
    api(A("/store/products"), { method: "POST", body: body }).then(function (r) {
      if (!r.ok) return toast((r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't duplicate", "err");
      var newId = r.body.product && r.body.product.id;
      var vars = (p.variants || []).filter(function (v) { return v.enabled !== false; });
      function finish() { closeDrawer(); refreshProducts().then(function () { toast("Duplicated — now hidden, edit then show it"); render(); }); }
      if (newId && vars.length) {
        Promise.all(vars.map(function (v) { return api(A("/store/products/" + newId + "/variants"), { method: "POST", body: { name: v.name, price_money: v.price_money, price_credits: v.price_credits, stock: v.stock, role_id: v.role_id, delivery_instructions: v.delivery_instructions } }); })).then(finish);
      } else finish();
    });
  }
  // Tiers / variants editor — lives inside the product drawer (existing product).
  function variantManager(product) {
    var box = el("div", { class: "var-mgr" });
    function load() {
      api(A("/store/products/" + product.id + "/variants")).then(function (r) { render((r.body && r.body.variants) || []); });
    }
    function render(vars) {
      clear(box);
      if (!vars.length) box.append(el("p", { class: "hint", style: { margin: "0 0 6px" } }, "No tiers yet. Add options like “1 month / 3 months / lifetime” — each with its own price and stock. Leave a tier’s price blank to use the product price above."));
      vars.forEach(function (v) {
        var sub = [v.price_money != null ? money(v.price_money, S.cfg.currency) : null, v.price_credits != null ? "🪙" + fmt(v.price_credits) : null, v.stock != null ? v.stock + " in stock" : null].filter(Boolean).join(" · ") || "uses product price";
        box.append(el("div", { class: "var-row" },
          el("div", { class: "grow" }, el("div", { class: "t" }, v.name), el("div", { class: "d" }, sub)),
          btn("Delete", { variant: "btn-ghost", style: { padding: "4px 11px", fontSize: "12px" }, onClick: function (e) {
            var b = e.currentTarget; b.disabled = true;
            api(A("/store/products/" + product.id + "/variants/" + v.id), { method: "DELETE" }).then(function (rr) { if (rr.ok) { toast("Tier removed"); load(); } else { toast("Failed", "err"); b.disabled = false; } });
          } })));
      });
      var nm = inp({ type: "text", placeholder: "Tier name (e.g. 3 months)", maxlength: 80 });
      var pm = inp({ type: "number", step: "0.01", min: "0", placeholder: "Money" });
      var pc = inp({ type: "number", step: "1", min: "0", placeholder: "Credits" });
      var stk = inp({ type: "number", step: "1", min: "0", placeholder: "Stock" });
      var addB = btn("Add tier", { variant: "btn-outline", onClick: function () {
        if (!nm.value.trim()) { toast("Name the tier first", "err"); return; }
        addB.disabled = true;
        api(A("/store/products/" + product.id + "/variants"), { method: "POST", body: { name: nm.value.trim(), price_money: pm.value === "" ? null : Number(pm.value), price_credits: pc.value === "" ? null : Number(pc.value), stock: stk.value === "" ? null : Number(stk.value) } })
          .then(function (rr) { addB.disabled = false; if (!rr.ok) { toast((rr.body && rr.body.errors && rr.body.errors.join("; ")) || "Couldn't add tier", "err"); return; } toast("Tier added"); load(); });
      } });
      box.append(el("div", { class: "var-add" }, nm, el("div", { class: "var-add-row" }, pm, pc, stk, addB)));
    }
    if (DEMO) render(typeof DEMO_VARIANTS !== "undefined" ? DEMO_VARIANTS : []); else load();
    return box;
  }
  function productDrawer(existing) {
    var p = existing || {};
    var name = inp({ type: "text", value: p.name || "", maxlength: 120, placeholder: "VIP Rank" });
    var desc = ta({ value: p.description || "", maxlength: 1000, placeholder: "What the buyer gets…" });
    var img = inp({ type: "url", value: p.image_url || "", placeholder: "https://…/image.png" });
    var prev = el("img", { class: "img-prev", src: p.image_url || "", alt: "", style: { display: p.image_url ? "block" : "none" } });
    img.addEventListener("input", function () { if (/^https:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(img.value)) { prev.src = img.value; prev.style.display = "block"; } else prev.style.display = "none"; });
    var file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
    var upMsg = el("span", { class: "hint", style: { marginLeft: "10px" } });
    var upBtn = btn("⬆ Upload image", { variant: "btn-outline", style: { fontSize: "13px", padding: "7px 13px" }, onClick: function () { file.click(); } });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { upMsg.textContent = "Max 5 MB."; return; }
      upBtn.disabled = true; upMsg.textContent = "Uploading…";
      fetch("/api/store-upload", { method: "POST", credentials: "include", headers: { "content-type": f.type }, body: f })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { s: r.status, b: b }; }); })
        .then(function (o) { if (o.s === 501) upMsg.textContent = "Uploads not set up — paste a URL instead."; else if (!o.b || !o.b.url) upMsg.textContent = (o.b && o.b.detail) || "Upload failed."; else { img.value = o.b.url; img.dispatchEvent(new Event("input")); upMsg.textContent = "Uploaded ✓"; } })
        .catch(function () { upMsg.textContent = "Upload failed."; }).then(function () { upBtn.disabled = false; file.value = ""; });
    });
    var catSel = sel(categoryOptions(), p.category_id != null ? String(p.category_id) : "");
    var catManage = el("button", { type: "button", class: "linklike", onclick: function () { closeDrawer(); S.section = "categories"; render(); } }, "Manage categories →");
    var catField = field("Category", catSel, {
      hint: (S.categories && S.categories.length) ? "Pick a category or sub-category. " : "No categories yet — create some to group your products. ",
    });
    catField.querySelector(".hint").append(catManage);
    var pm = inp({ type: "number", step: "0.01", min: "0", value: p.price_money != null ? p.price_money : "", placeholder: "0.00" });
    var pc = inp({ type: "number", step: "1", min: "0", value: p.price_credits != null ? p.price_credits : "", placeholder: "0" });
    var salePm = inp({ type: "number", step: "0.01", min: "0", value: p.sale_price_money != null ? p.sale_price_money : "", placeholder: "e.g. 14.99" });
    // sale_ends_at is stored ISO/UTC; datetime-local wants local "YYYY-MM-DDTHH:MM".
    function toLocalInput(iso) {
      if (!iso) return "";
      var d = new Date(iso); if (isNaN(d.getTime())) return "";
      var pad = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
    var saleEnds = inp({ type: "datetime-local", value: toLocalInput(p.sale_ends_at) });
    var stock = inp({ type: "number", step: "1", min: "0", value: p.stock != null ? p.stock : "", placeholder: "Unlimited" });
    var lim = inp({ type: "number", step: "1", min: "0", value: p.per_user_limit != null ? p.per_user_limit : "", placeholder: "No limit" });
    var enabled = swRow("Visible in store", "Buyers can see and purchase it", existing ? p.enabled : true);
    var featured = swRow("Featured", "Highlighted and shown first on the storefront", existing ? p.featured : false);

    var roleSel = sel([["", "— pick a role —"]].concat(S.roles.map(function (r) { return [r.id, r.name]; })), p.role_id || "");
    var roleWrap = field("Role to grant", roleSel, { hint: "Auto-added to the buyer the instant they pay" });
    var manWrap = field("In-game / manual item", el("p", { class: "hint", style: { margin: 0 } }, "The buyer gets a redemption code on purchase. They paste it in a ticket; the bot posts what they bought and your team hands it over."));
    var ft = segmented([{ value: "role", label: "Discord role (instant)" }, { value: "manual", label: "Code in ticket" }], p.fulfillment_type === "role" ? "role" : "manual", function (v) { roleWrap.style.display = v === "role" ? "block" : "none"; manWrap.style.display = v === "manual" ? "block" : "none"; });

    // Bundle editor — package other products. Any components → this is a bundle,
    // delivered by handing over each component (the Delivery setting is ignored).
    var bundleRows = (p.bundle_items || []).map(function (bi) { return { product_id: bi.product_id, quantity: bi.quantity || 1 }; });
    var bundleList = el("div", { class: "bundle-editor" });
    function compChoices() {
      return S.products.filter(function (x) { return (!existing || x.id !== existing.id) && !(x.bundle_items && x.bundle_items.length); });
    }
    function syncBundleNote() { bundleNote.style.display = bundleRows.length ? "block" : "none"; }
    function renderBundleRows() {
      clear(bundleList);
      if (!bundleRows.length) bundleList.append(el("p", { class: "hint", style: { margin: "2px 0 10px" } }, "No components — leave empty for a normal product, or add products to sell them together as a bundle."));
      var opts = [["", "— pick a product —"]].concat(compChoices().map(function (x) { return [String(x.id), x.name]; }));
      bundleRows.forEach(function (bi, idx) {
        var psel = sel(opts, String(bi.product_id || ""));
        psel.addEventListener("change", function () { bundleRows[idx].product_id = parseInt(psel.value, 10) || null; });
        var qty = inp({ type: "number", min: "1", max: "99", value: bi.quantity || 1, style: { maxWidth: "84px" } });
        qty.addEventListener("input", function () { bundleRows[idx].quantity = Math.max(1, Math.min(99, parseInt(qty.value, 10) || 1)); });
        var del = el("button", { class: "cf-del", type: "button", title: "Remove" }, "✕");
        del.addEventListener("click", function () { bundleRows.splice(idx, 1); renderBundleRows(); syncBundleNote(); });
        bundleList.append(el("div", { class: "bundle-row" }, psel, el("span", { class: "bundle-x" }, "×"), qty, del));
      });
    }
    var addComp = btn("+ Add component", { variant: "btn-outline", style: { padding: "6px 13px", fontSize: "13px" }, onClick: function () {
      if (bundleRows.length >= 10) { toast("Up to 10 components", "err"); return; }
      if (!compChoices().length) { toast("Add some normal products first", "err"); return; }
      bundleRows.push({ product_id: null, quantity: 1 }); renderBundleRows(); syncBundleNote();
    } });
    var bundleNote = el("p", { class: "hint", style: { margin: "8px 0 0", color: "#c4b5fd" } }, "🎁 This is a bundle — delivered by handing over each component. The Delivery setting below is ignored.");
    renderBundleRows(); syncBundleNote();

    var errEl = el("div", { class: "err" });
    var save = btn(existing ? "Save product" : "Add product", { onClick: function () {
      errEl.textContent = ""; save.disabled = true;
      var b = { name: name.value.trim(), description: desc.value.trim() || null, image_url: img.value.trim() || null, category_id: catSel.value ? Number(catSel.value) : null,
        price_money: pm.value === "" ? null : Number(pm.value), price_credits: pc.value === "" ? null : Number(pc.value),
        sale_price_money: salePm.value === "" ? null : Number(salePm.value),
        sale_ends_at: saleEnds.value ? new Date(saleEnds.value).toISOString() : null,
        fulfillment_type: ft.value(), role_id: ft.value() === "role" ? (roleSel.value || null) : null,
        stock: stock.value === "" ? null : Number(stock.value), per_user_limit: lim.value === "" ? null : Number(lim.value), enabled: enabled.input.checked, featured: featured.input.checked,
        bundle_items: bundleRows.filter(function (bi) { return bi.product_id; }).map(function (bi) { return { product_id: bi.product_id, quantity: bi.quantity || 1 }; }) };
      var req = existing ? api(A("/store/products/" + existing.id), { method: "PATCH", body: b }) : api(A("/store/products"), { method: "POST", body: b });
      req.then(function (r) { if (!r.ok) { errEl.textContent = (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save"; save.disabled = false; return; } closeDrawer(); refreshProducts().then(function () { toast(existing ? "Product saved" : "Product added"); render(); }); });
    } });

    var pmWrap = el("div", { class: "inp-prefix" }, el("span", null, CCY[S.cfg.currency] || ""), pm);
    var salePmWrap = el("div", { class: "inp-prefix" }, el("span", null, CCY[S.cfg.currency] || ""), salePm);
    var body = el("div", null,
      field("Name", name), field("Description", desc),
      field("Image", img, { hint: "Paste an https image URL, or upload below" }), prev, el("div", { style: { margin: "8px 0 16px" } }, upBtn, upMsg, file),
      catField,
      el("div", { class: "grid2" }, field("Price — money", pmWrap, { hint: "Blank = not sold for money" }), field("Price — credits", pc, { hint: "Blank = not sold for credits" })),
      el("div", { class: "grid2" },
        field("Sale price — money (optional)", salePmWrap, { hint: "Markdown under the money price; must be below it." }),
        field("Sale ends (optional)", saleEnds, { hint: "Blank = no end. Markdown drops automatically after this time." })),
      el("div", { class: "field" }, el("span", { class: "lab" }, "Tiers / variants (optional)"),
        existing ? variantManager(existing) : el("p", { class: "hint", style: { margin: 0 } }, "Save this product first, then reopen it to add tiers like 1 month / 3 months / lifetime.")),
      el("div", { class: "field" }, el("span", { class: "lab" }, "Bundle components (optional)"),
        el("p", { class: "hint", style: { margin: "0 0 8px" } }, "Package other products and sell them together at the price above."),
        bundleList, addComp, bundleNote),
      el("div", { class: "field" }, el("span", { class: "lab" }, "How it's delivered"), ft.node), roleWrap, manWrap,
      el("div", { class: "grid2" }, field("Stock", stock, { hint: "Blank = unlimited" }), field("Per-user limit", lim, { hint: "Blank = no limit" })),
      enabled.node, featured.node, errEl);
    roleWrap.style.display = ft.value() === "role" ? "block" : "none"; manWrap.style.display = ft.value() === "manual" ? "block" : "none";
    var foot = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", width: "100%" } },
      existing ? btn("Duplicate", { variant: "btn-ghost", onClick: function () { duplicateProduct(existing); } }) : null,
      el("div", { style: { flex: "1" } }),
      btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }), save);
    openDrawer(existing ? "Edit product" : "New product", body, foot);
  }

  // ── CATEGORIES ───────────────────────────────────────────────────────────────
  // Generic drag-to-reorder for the DIRECT [data-sortable] children of a
  // container. onOrder(ids[]) fires on drop with the new id order. Levels stay
  // independent because we only ever match `:scope > [data-sortable]`.
  function makeSortable(container, onOrder) {
    var dragEl = null;
    function rows() { return Array.prototype.slice.call(container.querySelectorAll(":scope > [data-sortable]")); }
    container.addEventListener("dragstart", function (e) {
      var row = e.target.closest("[data-sortable]");
      if (!row || row.parentNode !== container) return;
      dragEl = row; setTimeout(function () { row.classList.add("dragging"); }, 0);
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", row.getAttribute("data-id") || ""); } catch (_) {}
    });
    container.addEventListener("dragend", function () { if (dragEl) dragEl.classList.remove("dragging"); dragEl = null; });
    container.addEventListener("dragover", function (e) {
      if (!dragEl || dragEl.parentNode !== container) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      var after = null, closest = -Infinity;
      rows().forEach(function (child) {
        if (child === dragEl) return;
        var box = child.getBoundingClientRect();
        var off = e.clientY - box.top - box.height / 2;
        if (off < 0 && off > closest) { closest = off; after = child; }
      });
      if (after == null) container.appendChild(dragEl);
      else container.insertBefore(dragEl, after);
    });
    container.addEventListener("drop", function (e) {
      if (!dragEl || dragEl.parentNode !== container) return;
      e.preventDefault();
      var ids = rows().map(function (n) { return parseInt(n.getAttribute("data-id"), 10); }).filter(function (n) { return !isNaN(n); });
      onOrder(ids);
    });
  }
  function saveCategoryOrder(ids) {
    if (DEMO) return;
    api(A("/store/categories/reorder"), { method: "POST", body: { order: ids } }).then(function (r) { if (!r.ok) toast("Couldn't save order", "err"); });
  }
  function delCategory(cat) {
    var kids = (cat.children || []).length;
    var msg = 'Delete "' + cat.name + '"?'
      + (kids ? "\n\nIts " + kids + " sub-categor" + (kids === 1 ? "y" : "ies") + " will move up to the top level." : "")
      + "\nProducts in it become uncategorised (nothing is deleted).";
    if (!confirm(msg)) return;
    api(A("/store/categories/" + cat.id), { method: "DELETE" }).then(function (r) {
      if (!r.ok) return toast("Couldn't delete", "err");
      refreshCategories().then(function () { toast("Category deleted"); render(); });
    });
  }
  function categoryThumb(cat) {
    if (cat.image_url) return el("div", { class: "cat-thumb", style: { backgroundImage: "url('" + cat.image_url.replace(/'/g, "%27") + "')" } });
    return el("div", { class: "cat-thumb fb" }, initial(cat.name));
  }
  function dragHandle() { return el("span", { class: "drag-handle", title: "Drag to reorder", "aria-hidden": "true" }, icon("grip")); }
  function iconBtn(name, title, onClick) {
    var b = el("button", { class: "icon-btn", type: "button", title: title, "aria-label": title, onclick: onClick });
    b.append(icon(name)); return b;
  }

  function renderCategories(c) {
    var tops = S.categories || [];
    var totalCats = tops.reduce(function (n, t) { return n + 1 + ((t.children || []).length); }, 0);
    c.append(panel(
      panelHead("Categories (" + totalCats + ")", btn("Add category", { icon: "plus", onClick: function () { categoryDrawer(null, null); } })),
      el("p", { class: "panel-sub" }, "Group products into categories, with up to one level of sub-categories. Buyers browse your store by these sections. Drag the handles to reorder; products are assigned from each product’s editor.")));

    if (!tops.length) {
      c.append(emptyState("categories", "No categories yet", "Create your first category — like “Ranks”, “Kits” or “Dinos” — then assign products to it from the product editor. Add sub-categories to organise further.", btn("Add your first category", { icon: "plus", onClick: function () { categoryDrawer(null, null); } })));
      return;
    }

    var list = el("div", { class: "cat-list" });
    tops.forEach(function (t) {
      var count = t.totalProductCount != null ? t.totalProductCount : (t.productCount || 0);
      var head = el("div", { class: "cat-head" },
        dragHandle(),
        categoryThumb(t),
        el("div", { class: "cat-main" },
          el("div", { class: "cat-name" }, t.name, t.enabled === false ? badge("Hidden", "muted") : null),
          el("div", { class: "cat-meta" }, count + " product" + (count === 1 ? "" : "s")
            + ((t.children || []).length ? " · " + t.children.length + " sub-categor" + (t.children.length === 1 ? "y" : "ies") : ""))),
        el("div", { class: "cat-actions" },
          btn("Sub-category", { variant: "btn-outline", icon: "plus", style: { padding: "5px 11px", fontSize: "12.5px" }, onClick: function () { categoryDrawer(null, t.id); } }),
          iconBtn("edit", "Edit category", function () { categoryDrawer(t, null); }),
          iconBtn("trash", "Delete category", function () { delCategory(t); })));

      var card = el("div", { class: "cat-card", "data-sortable": "top", "data-id": t.id }, head);
      head.querySelector(".drag-handle").setAttribute("draggable", "true");

      var kids = t.children || [];
      var subWrap = el("div", { class: "cat-subs" });
      if (kids.length) {
        kids.forEach(function (ch) {
          var ccount = ch.productCount || 0;
          var row = el("div", { class: "cat-sub", "data-sortable": "sub", "data-id": ch.id },
            dragHandle(),
            categoryThumb(ch),
            el("div", { class: "cat-main" },
              el("div", { class: "cat-name" }, ch.name, ch.enabled === false ? badge("Hidden", "muted") : null),
              el("div", { class: "cat-meta" }, ccount + " product" + (ccount === 1 ? "" : "s"))),
            el("div", { class: "cat-actions" },
              iconBtn("edit", "Edit sub-category", function () { categoryDrawer(ch, null); }),
              iconBtn("trash", "Delete sub-category", function () { delCategory(ch); })));
          row.querySelector(".drag-handle").setAttribute("draggable", "true");
          subWrap.append(row);
        });
        makeSortable(subWrap, saveCategoryOrder);
        card.append(subWrap);
      }
      list.append(card);
    });
    makeSortable(list, saveCategoryOrder);
    c.append(list);
  }

  // Create / edit a category. presetParentId pre-selects a parent (used by the
  // "Sub-category" buttons). Top-level categories with children can't themselves
  // be nested (the backend enforces this too) — we disable that in the UI.
  function categoryDrawer(existing, presetParentId) {
    var cat = existing || {};
    var name = inp({ type: "text", value: cat.name || "", maxlength: 60, placeholder: "e.g. Ranks" });
    var desc = ta({ value: cat.description || "", maxlength: 500, placeholder: "Optional — a short blurb shown on the category." });
    var img = inp({ type: "url", value: cat.image_url || "", placeholder: "https://…/image.png" });
    var prev = el("img", { class: "img-prev", src: cat.image_url || "", alt: "", style: { display: cat.image_url ? "block" : "none" } });
    img.addEventListener("input", function () { if (/^https:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(img.value)) { prev.src = img.value; prev.style.display = "block"; } else prev.style.display = "none"; });
    var file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
    var upMsg = el("span", { class: "hint", style: { marginLeft: "10px" } });
    var upBtn = btn("⬆ Upload image", { variant: "btn-outline", style: { fontSize: "13px", padding: "7px 13px" }, onClick: function () { file.click(); } });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { upMsg.textContent = "Max 5 MB."; return; }
      upBtn.disabled = true; upMsg.textContent = "Uploading…";
      fetch("/api/store-upload", { method: "POST", credentials: "include", headers: { "content-type": f.type }, body: f })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { s: r.status, b: b }; }); })
        .then(function (o) { if (o.s === 501) upMsg.textContent = "Uploads not set up — paste a URL instead."; else if (!o.b || !o.b.url) upMsg.textContent = (o.b && o.b.detail) || "Upload failed."; else { img.value = o.b.url; img.dispatchEvent(new Event("input")); upMsg.textContent = "Uploaded ✓"; } })
        .catch(function () { upMsg.textContent = "Upload failed."; }).then(function () { upBtn.disabled = false; file.value = ""; });
    });

    // Parent options: top level + every top-level category except this one.
    var selfHasChildren = !!(existing && (cat.children || []).length);
    var parentOpts = [["", "— Top level —"]].concat((S.categories || [])
      .filter(function (t) { return !existing || t.id !== existing.id; })
      .map(function (t) { return [String(t.id), t.name]; }));
    var curParent = existing ? (cat.parent_id != null ? String(cat.parent_id) : "") : (presetParentId != null ? String(presetParentId) : "");
    var parentSel = sel(parentOpts, curParent);
    var parentHint = "Choose a parent to make this a sub-category, or keep it at the top level.";
    if (selfHasChildren) { parentSel.disabled = true; parentHint = "This category has sub-categories, so it must stay at the top level. Move its sub-categories out first to nest it."; }

    var enabled = swRow("Visible in store", "Buyers can see and browse this category", existing ? cat.enabled !== false : true);

    var errEl = el("div", { class: "err" });
    var save = btn(existing ? "Save category" : "Add category", { onClick: function () {
      errEl.textContent = ""; if (!name.value.trim()) { errEl.textContent = "Give the category a name."; return; }
      save.disabled = true;
      var b = { name: name.value.trim(), description: desc.value.trim() || null, image_url: img.value.trim() || null,
        parent_id: parentSel.disabled ? undefined : (parentSel.value ? Number(parentSel.value) : null), enabled: enabled.input.checked };
      if (b.parent_id === undefined) delete b.parent_id;
      var req = existing ? api(A("/store/categories/" + existing.id), { method: "PATCH", body: b }) : api(A("/store/categories"), { method: "POST", body: b });
      req.then(function (r) {
        if (!r.ok) { errEl.textContent = (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save"; save.disabled = false; return; }
        closeDrawer(); refreshCategories().then(function () { toast(existing ? "Category saved" : "Category added"); render(); });
      });
    } });

    var body = el("div", null,
      field("Name", name),
      field("Description (optional)", desc),
      field("Image / icon", img, { hint: "Paste an https image URL, or upload below" }), prev,
      el("div", { style: { margin: "8px 0 16px" } }, upBtn, upMsg, file),
      field("Parent category", parentSel, { hint: parentHint }),
      enabled.node, errEl);
    var foot = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", width: "100%" } },
      el("div", { style: { flex: "1" } }),
      btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }), save);
    openDrawer(existing ? "Edit category" : (presetParentId != null ? "New sub-category" : "New category"), body, foot);
  }

  // ── ORDERS ─────────────────────────────────────────────────────────────────
  function renderOrders(c) {
    var wrap = panel(panelHead("Orders", btn("Export CSV", { variant: "btn-outline", style: { padding: "6px 13px", fontSize: "13px" }, onClick: function () { exportCsv(); } })));
    c.append(wrap);
    var chips = el("div", { class: "chips" });
    var search = inp({ type: "search", placeholder: "Search by order # or buyer…", style: { margin: "12px 0 4px" } });
    var listBox = el("div");
    wrap.append(chips, search, listBox);
    var current = "all", loaded = [];
    search.addEventListener("input", renderRows);
    // Export the currently-loaded orders (respects the status filter) to CSV.
    function exportCsv() {
      if (!loaded.length) { toast("No orders to export", "err"); return; }
      function cell(v) { v = v == null ? "" : String(v); return '"' + v.replace(/"/g, '""') + '"'; }
      var rows = [["Order", "Date", "Buyer", "Status", "Rail", "Total money", "Currency", "Total credits", "Coupon", "Items", "Delivery details"].map(cell).join(",")];
      loaded.forEach(function (o) {
        var items = (o.items || []).map(function (i) { return i.quantity + "x " + i.name; }).join("; ");
        var details = (o.customFields || []).map(function (f) { return f.label + ": " + f.value; }).join("; ");
        rows.push([o.id, (o.created_at || "").replace("T", " ").slice(0, 19), "@" + (o.buyer_username || o.buyer_user_id), o.status, o.rail,
          o.total_money != null ? o.total_money : "", o.currency || "", o.total_credits != null ? o.total_credits : "", o.coupon_code || "", items, details].map(cell).join(","));
      });
      var blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: "orders-" + current + ".csv" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("CSV exported");
    }
    function orderRow(o) {
      var total = o.rail === "credits" ? "🪙 " + fmt(o.total_credits) : money(o.total_money, o.currency);
      var rowTop = el("div", { class: "row", style: { flexDirection: "column", alignItems: "stretch", gap: "8px" } });
      rowTop.append(el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } },
        el("b", null, "#" + o.id), el("a", { href: "https://discord.com/users/" + o.buyer_user_id, target: "_blank", rel: "noopener", class: "muted" }, "@" + (o.buyer_username || o.buyer_user_id)),
        o.coupon_code ? badge("🎟️ " + o.coupon_code, "info") : null,
        // Claim status for code-redeemable (needs-delivery) orders: has the buyer
        // brought their code to a ticket yet?
        (o.status === "needs_delivery" && o.redeem_code) ? (o.redeemed_at ? badge("Code redeemed", "ok") : badge("Awaiting redemption", "warn")) : null,
        o.created_at ? el("span", { class: "muted", style: { fontSize: "12px" }, title: absDate(o.created_at) }, relTime(o.created_at)) : null,
        el("span", { style: { marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" } }, orderBadge(o.status), el("b", null, total))));
      (o.items || []).forEach(function (i) {
        var tick = i.fulfillment_status === "delivered" ? "✅" : i.fulfillment_status === "granted" ? "⚡" : "⏳";
        var ln = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" } },
          el("span", { class: "muted", style: { flex: 1 } }, tick + " " + i.quantity + "× " + i.name + (i.fulfillment_type === "manual" && i.delivery_instructions ? " — " + i.delivery_instructions : "")));
        if (i.fulfillment_type === "manual" && i.fulfillment_status === "pending") {
          ln.append(btn("Deliver", { style: { padding: "4px 12px", fontSize: "12px" }, onClick: function (e) { var b = e.currentTarget; b.disabled = true; api(A("/store/orders/" + o.id + "/items/" + i.id + "/deliver"), { method: "POST" }).then(function (rr) { if (rr.ok) { toast("Delivered"); refreshOverview().then(function () { load(current); }); } else { toast("Failed", "err"); b.disabled = false; } }); } }));
        }
        rowTop.append(ln);
      });
      // Buyer-supplied delivery details (in-game name etc) — what staff need to
      // fulfil the order in-game. Highlighted so it's not missed.
      var cf = o.customFields || [];
      if (cf.length) {
        var box = el("div", { class: "order-cf-box" });
        cf.forEach(function (f) {
          box.append(el("div", { class: "order-cf-line" }, el("span", { class: "order-cf-k" }, f.label), el("span", { class: "order-cf-v" }, String(f.value))));
        });
        rowTop.append(box);
      }
      if (o.status !== "refunded" && o.status !== "cancelled") {
        rowTop.append(el("div", null, btn("Refund", { variant: "btn-ghost", style: { padding: "4px 12px", fontSize: "12px" }, onClick: function () { if (!confirm("Refund order #" + o.id + "? Granted roles are revoked; credits are re-credited. Money refunds happen in your PayPal/Stripe dashboard.")) return; api(A("/store/orders/" + o.id + "/refund"), { method: "POST" }).then(function (rr) { toast(rr.ok ? ((rr.body && rr.body.moneyRefundNote) || "Refunded") : "Failed", rr.ok ? "" : "err"); refreshOverview().then(function () { load(current); }); }); } })));
      }
      return rowTop;
    }
    function renderRows() {
      clear(listBox);
      var q = search.value.trim().toLowerCase().replace(/^#/, "");
      var orders = q ? loaded.filter(function (o) { return String(o.id).indexOf(q) >= 0 || (o.buyer_username || "").toLowerCase().indexOf(q) >= 0; }) : loaded;
      if (!orders.length) {
        listBox.append(emptyState("orders", q ? "No matching orders" : "No orders here", q ? "Try a different order number or buyer name." : (current === "all" ? "Orders appear here as customers buy from your store." : "No orders with this status right now."), null, true));
        return;
      }
      orders.forEach(function (o) { listBox.append(orderRow(o)); });
    }
    function load(f) {
      current = f; clear(chips);
      [["all", "All"], ["needs_delivery", "Needs delivery"], ["completed", "Completed"], ["pending", "Pending"], ["refunded", "Refunded"], ["cancelled", "Cancelled"]].forEach(function (x) {
        var ch = el("button", { class: "chip" + (x[0] === current ? " on" : "") }, x[1]); ch.addEventListener("click", function () { load(x[0]); }); chips.append(ch);
      });
      clear(listBox); listBox.append(el("div", { class: "sk", style: { height: "70px", marginBottom: "9px" } }), el("div", { class: "sk", style: { height: "70px" } }));
      api(A("/store/orders" + (f === "all" ? "" : "?status=" + f))).then(function (r) { loaded = (r.body && r.body.orders) || []; renderRows(); });
    }
    load("all");
  }

  // ── REVIEWS (moderation) ─────────────────────────────────────────────────────
  function starStr(n) { n = Math.max(0, Math.min(5, n | 0)); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
  function renderCustomers(c) {
    var wrap = panel(panelHead("Customers", btn("Export CSV", { variant: "btn-outline", style: { padding: "6px 13px", fontSize: "13px" }, onClick: function () { exportCustomers(); } })));
    c.append(wrap);
    var search = inp({ type: "search", placeholder: "Search by name or Discord ID…", style: { margin: "4px 0 12px" } });
    var listBox = el("div");
    wrap.append(search, listBox);
    var loaded = [];
    var ccy = function () { return S.cfg.currency || "GBP"; };
    function spendOf(cust) {
      var parts = [];
      if (cust.money) parts.push(money(cust.money, ccy()));
      if (cust.credits) parts.push("🪙 " + fmt(cust.credits));
      return parts.length ? parts.join("  ·  ") : "—";
    }
    function row(cust, rank) {
      var av = el("div", { class: "cust-av" }, initial(cust.username || "?"));
      var nm = el("a", { class: "cust-name", href: "https://discord.com/users/" + cust.userId, target: "_blank", rel: "noopener" }, "@" + (cust.username || cust.userId));
      var last = cust.lastOrderAt ? relTime(cust.lastOrderAt) : "";
      return el("div", { class: "cust-row" },
        el("span", { class: "cust-rank" }, "#" + rank),
        av,
        el("div", { class: "cust-main" }, nm,
          el("div", { class: "cust-sub", title: absDate(cust.lastOrderAt) }, cust.orders + " order" + (cust.orders === 1 ? "" : "s") + (last ? "  ·  last " + last : ""))),
        el("div", { class: "cust-spend" }, spendOf(cust)));
    }
    function renderRows() {
      clear(listBox);
      var q = search.value.trim().toLowerCase();
      var rows = q ? loaded.filter(function (x) { return (x.username || "").toLowerCase().indexOf(q) >= 0 || String(x.userId).indexOf(q) >= 0; }) : loaded;
      if (!rows.length) { listBox.append(emptyState("customers", q ? "No matching customers" : "No customers yet", q ? "Try a different name or ID." : "Customers appear here as soon as people buy from your store.", null, true)); return; }
      listBox.append(el("div", { class: "cust-headrow" }, el("span", null, rows.length + " customer" + (rows.length === 1 ? "" : "s")), el("span", null, "Total spent")));
      rows.forEach(function (x, i) { listBox.append(row(x, i + 1)); });
    }
    function exportCustomers() {
      if (!loaded.length) { toast("No customers to export", "err"); return; }
      function cell(v) { v = v == null ? "" : String(v); return '"' + v.replace(/"/g, '""') + '"'; }
      var rows = [["Discord ID", "Username", "Orders", "Money spent", "Currency", "Credits spent", "First order", "Last order"].map(cell).join(",")];
      loaded.forEach(function (x) {
        rows.push([x.userId, x.username || "", x.orders, x.money != null ? x.money : "", ccy(), x.credits != null ? x.credits : "", (x.firstOrderAt || "").replace("T", " ").slice(0, 19), (x.lastOrderAt || "").replace("T", " ").slice(0, 19)].map(cell).join(","));
      });
      var blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: "customers.csv" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("CSV exported");
    }
    search.addEventListener("input", renderRows);
    clear(listBox); listBox.append(el("div", { class: "sk", style: { height: "62px", marginBottom: "8px" } }), el("div", { class: "sk", style: { height: "62px" } }));
    api(A("/store/customers")).then(function (r) { loaded = (r.body && r.body.customers) || []; renderRows(); });
  }

  function renderReviews(c) {
    var wrap = panel(panelHead("Reviews"), el("p", { class: "panel-sub" }, "Ratings buyers left on your products. Hide anything unfair — hidden reviews drop out of the public score."));
    c.append(wrap);
    var chips = el("div", { class: "chips" });
    var current = "all";
    var box = el("div");
    [["all", "All"], ["published", "Published"], ["hidden", "Hidden"]].forEach(function (f) {
      var ch = el("button", { class: "chip" + (f[0] === current ? " on" : ""), onclick: function () { current = f[0]; chips.querySelectorAll(".chip").forEach(function (x) { x.classList.remove("on"); }); ch.classList.add("on"); load(f[0]); } }, f[1]);
      chips.append(ch);
    });
    wrap.append(chips, box);
    function load(st) {
      clear(box); box.append(el("div", { class: "sk", style: { height: "90px" } }));
      api(A("/store/reviews" + (st === "all" ? "" : "?status=" + st))).then(function (r) {
        clear(box);
        var reviews = (r.body && r.body.reviews) || [];
        if (!reviews.length) { box.append(emptyState("star", "No reviews yet", "Customer reviews appear here once buyers leave them.", null, true)); return; }
        reviews.forEach(function (rv) {
          var hidden = rv.status === "hidden";
          var tiny = { padding: "5px 13px", fontSize: "13px" };
          var item = el("div", { class: "rev-item" });
          var replyView = el("div"), editorWrap = el("div");
          function renderReplyView() { clear(replyView); if (rv.reply) replyView.append(el("div", { class: "rev-reply" }, el("b", null, "↳ Your reply: "), rv.reply)); }
          function toggleEditor() {
            if (editorWrap.firstChild) { clear(editorWrap); return; }
            var ta2 = ta({ value: rv.reply || "", placeholder: "Write a public reply…", maxlength: 1000 });
            var saveB = btn("Save reply", { style: tiny, onClick: function () {
              saveB.disabled = true;
              api(A("/store/reviews/" + rv.id + "/reply"), { method: "POST", body: { reply: ta2.value } }).then(function (r) {
                if (!r.ok) { toast("Failed", "err"); saveB.disabled = false; return; }
                rv.reply = ta2.value.trim() || null; renderReplyView(); clear(editorWrap); toast("Reply saved");
              });
            } });
            var rmB = rv.reply ? btn("Remove", { variant: "btn-ghost", style: tiny, onClick: function () {
              api(A("/store/reviews/" + rv.id + "/reply"), { method: "POST", body: { reply: "" } }).then(function (r) { if (r.ok) { rv.reply = null; renderReplyView(); clear(editorWrap); toast("Reply removed"); } });
            } }) : null;
            editorWrap.append(el("div", { class: "rev-editor" }, ta2, el("div", { style: { display: "flex", gap: "8px" } }, saveB, rmB)));
          }
          item.append(el("div", { class: "row" },
            el("div", { class: "grow" },
              el("div", { class: "t" }, (rv.product_name || ("Product #" + rv.product_id)) + "   " + starStr(rv.rating)),
              el("div", { class: "d", title: absDate(rv.created_at) }, "@" + (rv.username || rv.user_id) + (rv.comment ? " — " + rv.comment : "") + (rv.created_at ? " · " + relTime(rv.created_at) : ""))),
            hidden ? badge("Hidden", "dim") : badge("Published", "ok"),
            btn(rv.reply ? "Edit reply" : "Reply", { variant: "btn-ghost", style: tiny, onClick: toggleEditor }),
            btn(hidden ? "Show" : "Hide", { variant: "btn-outline", style: tiny, onClick: function (e) {
              var b = e.currentTarget; b.disabled = true;
              api(A("/store/reviews/" + rv.id + "/status"), { method: "POST", body: { status: hidden ? "published" : "hidden" } })
                .then(function (rr) { if (rr.ok) { toast(hidden ? "Review shown" : "Review hidden"); load(current); } else { toast("Failed", "err"); b.disabled = false; } });
            } })));
          renderReplyView();
          item.append(replyView, editorWrap);
          box.append(item);
        });
      });
    }
    load("all");
  }

  // ── COUPONS ────────────────────────────────────────────────────────────────
  function couponSummary(c) {
    var d = c.discount_type === "percent" ? c.percent_off + "% off" : [c.amount_off_money != null ? money(c.amount_off_money, S.cfg.currency) + " off" : null, c.amount_off_credits != null ? "🪙" + c.amount_off_credits + " off" : null].filter(Boolean).join(" / ");
    return d + " · " + c.redeemed_count + (c.max_redemptions != null ? " / " + c.max_redemptions : "") + " used";
  }
  function couponRow(cp) {
    return el("div", { class: "row", style: { opacity: cp.enabled ? 1 : 0.6 } },
      el("div", { class: "grow" },
        el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, el("code", { style: { fontSize: "15px", fontWeight: 800, color: "var(--accent-soft)" } }, cp.code), cp.enabled ? null : badge("Disabled", "dim")),
        el("div", { class: "d" }, couponSummary(cp) + (cp.expires_at ? " · expires " + cp.expires_at.slice(0, 10) : "") + (cp.per_user_limit != null ? " · " + cp.per_user_limit + "/user" : ""))),
      btn("Copy", { variant: "btn-ghost", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { try { navigator.clipboard.writeText(cp.code).then(function () { toast("Copied " + cp.code); }, function () { toast("Copied " + cp.code); }); } catch (e) { toast("Copied " + cp.code); } } }),
      btn("Edit", { variant: "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { couponDrawer(cp); } }),
      btn("Delete", { variant: "btn-ghost", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { if (!confirm("Delete coupon " + cp.code + "?")) return; api(A("/store/coupons/" + cp.id), { method: "DELETE" }).then(function (rr) { if (rr.ok) { toast("Deleted"); render(); } else toast("Failed", "err"); }); } }));
  }
  function renderCoupons(c) {
    c.append(panel(panelHead("Coupons", btn("New coupon", { icon: "plus", onClick: function () { couponDrawer(null); } })),
      el("p", { class: "panel-sub" }, "Codes buyers type at checkout. Percent or fixed, on money and/or credits, with optional minimum spend, usage caps and dates.")));
    var loaded = [];
    var search = inp({ type: "search", placeholder: "Search coupons by code…", style: { marginBottom: "12px", display: "none" } });
    var listBox = el("div");
    c.append(search, listBox);
    search.addEventListener("input", renderRows);
    function renderRows() {
      clear(listBox);
      var q = search.value.trim().toLowerCase();
      var cs = q ? loaded.filter(function (cp) { return ((cp.code || "") + " " + (cp.description || "")).toLowerCase().indexOf(q) >= 0; }) : loaded;
      if (!cs.length) {
        if (q) listBox.append(emptyState("coupons", "No matches", "No coupons match your search.", null, true));
        else listBox.append(emptyState("coupons", "No coupons yet", "Create a discount code to run a sale or reward your community.", btn("Create a coupon", { icon: "plus", onClick: function () { couponDrawer(null); } })));
        return;
      }
      cs.forEach(function (cp) { listBox.append(couponRow(cp)); });
    }
    listBox.append(el("div", { class: "sk", style: { height: "64px" } }));
    api(A("/store/coupons")).then(function (r) {
      loaded = (r.body && r.body.coupons) || [];
      if (loaded.length > 4) search.style.display = "";
      renderRows();
    });
  }
  function couponDrawer(existing) {
    var c = existing || {};
    var code = inp({ type: "text", value: c.code || "", maxlength: 32, placeholder: "SAVE10", style: { textTransform: "uppercase" } });
    var descI = inp({ type: "text", value: c.description || "", maxlength: 200, placeholder: "Internal note (optional)" });
    var pct = inp({ type: "number", min: "1", max: "100", step: "1", value: c.percent_off != null ? c.percent_off : "", placeholder: "10" });
    var offM = prefixInp(CCY[S.cfg.currency] || "", { type: "number", min: "0", step: "0.01", value: c.amount_off_money != null ? c.amount_off_money : "", placeholder: "0.00", class: "inp" });
    var offMInput = offM.querySelector("input");
    var offC = inp({ type: "number", min: "0", step: "1", value: c.amount_off_credits != null ? c.amount_off_credits : "", placeholder: "0" });
    var pctWrap = field("Percent off (1–100)", pct);
    var fixWrap = el("div", { class: "grid2" }, field("Money off", offM), field("Credits off", offC));
    var type = segmented([{ value: "percent", label: "Percent" }, { value: "fixed", label: "Fixed amount" }], (c.discount_type || "percent"), function (v) { pctWrap.style.display = v === "percent" ? "block" : "none"; fixWrap.style.display = v === "fixed" ? "grid" : "none"; });
    var minM = prefixInp(CCY[S.cfg.currency] || "", { type: "number", min: "0", step: "0.01", value: c.min_subtotal_money != null ? c.min_subtotal_money : "", placeholder: "0.00", class: "inp" });
    var minMInput = minM.querySelector("input");
    var minC = inp({ type: "number", min: "0", step: "1", value: c.min_subtotal_credits != null ? c.min_subtotal_credits : "", placeholder: "0" });
    var maxR = inp({ type: "number", min: "1", step: "1", value: c.max_redemptions != null ? c.max_redemptions : "", placeholder: "Unlimited" });
    var perU = inp({ type: "number", min: "1", step: "1", value: c.per_user_limit != null ? c.per_user_limit : "", placeholder: "No limit" });
    var starts = inp({ type: "date", value: c.starts_at ? c.starts_at.slice(0, 10) : "" });
    var expires = inp({ type: "date", value: c.expires_at ? c.expires_at.slice(0, 10) : "" });
    var enabled = swRow("Active", "Buyers can use this code at checkout", existing ? c.enabled : true);
    var errEl = el("div", { class: "err" });
    var save = btn(existing ? "Save coupon" : "Create coupon", { onClick: function () {
      errEl.textContent = ""; save.disabled = true;
      var b = { code: code.value.trim(), description: descI.value.trim() || null, discount_type: type.value(),
        percent_off: type.value() === "percent" ? (pct.value === "" ? null : Number(pct.value)) : null,
        amount_off_money: type.value() === "fixed" && offMInput.value !== "" ? Number(offMInput.value) : null,
        amount_off_credits: type.value() === "fixed" && offC.value !== "" ? Number(offC.value) : null,
        min_subtotal_money: minMInput.value === "" ? null : Number(minMInput.value), min_subtotal_credits: minC.value === "" ? null : Number(minC.value),
        max_redemptions: maxR.value === "" ? null : Number(maxR.value), per_user_limit: perU.value === "" ? null : Number(perU.value),
        starts_at: starts.value || null, expires_at: expires.value || null, enabled: enabled.input.checked };
      var req = existing ? api(A("/store/coupons/" + existing.id), { method: "PATCH", body: b }) : api(A("/store/coupons"), { method: "POST", body: b });
      req.then(function (r) { if (!r.ok) { errEl.textContent = (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save"; save.disabled = false; return; } closeDrawer(); toast(existing ? "Coupon saved" : "Coupon created"); render(); });
    } });
    var body = el("div", null,
      field("Code", code, { hint: "Letters, numbers, - and _. Shown to buyers." }), field("Description", descI),
      el("div", { class: "field" }, el("span", { class: "lab" }, "Discount type"), type.node), pctWrap, fixWrap,
      el("div", { class: "grid2" }, field("Min spend (money)", minM), field("Min spend (credits)", minC)),
      el("div", { class: "grid2" }, field("Max total uses", maxR, { hint: "Blank = unlimited" }), field("Per-user uses", perU, { hint: "Blank = no limit" })),
      el("div", { class: "grid2" }, field("Starts", starts), field("Expires", expires)),
      enabled.node, errEl);
    pctWrap.style.display = type.value() === "percent" ? "block" : "none"; fixWrap.style.display = type.value() === "fixed" ? "grid" : "none";
    openDrawer(existing ? "Edit coupon" : "New coupon", body, el("div", null, btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }), save));
  }

  // ── SETTINGS ───────────────────────────────────────────────────────────────
  function renderSettings(c) {
    var cfg = S.cfg;
    var open = swRow("Store open", "When off, the public store shows a ‘closed’ message", cfg.enabled);
    var accM = swRow("Accept money", "Card / PayPal via your connected provider", cfg.accept_money);
    var accC = swRow("Accept credits", "Buyers spend server credits they earned in Discord", cfg.accept_credits);
    var currency = sel(["GBP", "USD", "EUR"], cfg.currency || "GBP");
    var title = inp({ type: "text", value: cfg.title || "", maxlength: 100, placeholder: "My Server Store" });
    var desc = ta({ value: cfg.description || "", maxlength: 1000, placeholder: "Shown under the store name" });
    var announce = inp({ type: "text", value: cfg.announcement || "", maxlength: 280, placeholder: "🔥 Summer sale — 25% off ranks!" });
    var banner = inp({ type: "url", value: cfg.banner_url || "", placeholder: "https://…/banner.png" });
    var accentOn = swRow("Custom storefront colour", "Theme the shop with your own accent — off uses your server brand colour", cfg.accent_color != null);
    var accentPick = inp({ type: "color", value: cfg.accent_color || "#2bff9e", style: { width: "60px", height: "40px", padding: "3px", cursor: "pointer", borderRadius: "10px" } });
    var testMode = swRow("Test mode", "Checkout completes free (no real charge) so you can test the full purchase → code → ticket flow. Turn OFF before selling.", cfg.test_mode);
    var slug = inp({ type: "text", value: cfg.slug || "", maxlength: 32, placeholder: "my-store" });
    var invoiceCh = sel([["", "— none —"]].concat(S.channels.map(function (ch) { return [ch.id, "#" + (ch.name || ch.id)]; })), cfg.invoice_channel_id || "");
    var invoiceEmail = inp({ type: "email", value: cfg.invoice_email || "", maxlength: 120, placeholder: "billing@yourserver.com" });

    // Checkout questions — buyer-supplied delivery details (in-game name etc).
    var cfRows = (cfg.checkout_fields || []).map(function (f) { return { label: f.label || "", required: !!f.required, placeholder: f.placeholder || "" }; });
    var cfList = el("div", { class: "cf-editor" });
    function renderCfRows() {
      clear(cfList);
      if (!cfRows.length) cfList.append(el("p", { class: "hint", style: { margin: "2px 0 12px" } }, "No questions yet — buyers check out without any extra prompts."));
      cfRows.forEach(function (f, idx) {
        var label = inp({ type: "text", value: f.label, maxlength: 40, placeholder: "In-game character name" });
        var ph = inp({ type: "text", value: f.placeholder, maxlength: 60, placeholder: "Hint (optional)" });
        var req = el("input", { type: "checkbox", class: "cf-check" }); req.checked = f.required;
        label.addEventListener("input", function () { cfRows[idx].label = label.value; });
        ph.addEventListener("input", function () { cfRows[idx].placeholder = ph.value; });
        req.addEventListener("change", function () { cfRows[idx].required = req.checked; });
        var del = el("button", { class: "cf-del", title: "Remove", type: "button" }, "✕");
        del.addEventListener("click", function () { cfRows.splice(idx, 1); renderCfRows(); });
        cfList.append(el("div", { class: "cf-row" }, label, ph, el("label", { class: "cf-req" }, req, "Required"), del));
      });
    }
    var addCf = btn("+ Add question", { variant: "btn-outline", style: { padding: "6px 13px", fontSize: "13px" }, onClick: function () {
      if (cfRows.length >= 6) { toast("Up to 6 questions", "err"); return; }
      cfRows.push({ label: "", required: false, placeholder: "" }); renderCfRows();
    } });
    renderCfRows();

    var save = btn("Save settings", { onClick: function () {
      save.disabled = true;
      api(A("/store/config"), { method: "POST", body: {
        enabled: open.input.checked, accept_money: accM.input.checked, accept_credits: accC.input.checked, currency: currency.value,
        title: title.value.trim() || null, description: desc.value.trim() || null, announcement: announce.value.trim() || null, banner_url: banner.value.trim() || null, accent_color: accentOn.input.checked ? accentPick.value : null,
        test_mode: testMode.input.checked, slug: slug.value.trim() || null,
        invoice_channel_id: invoiceCh.value || null, invoice_email: invoiceEmail.value.trim() || null,
        checkout_fields: cfRows.filter(function (f) { return (f.label || "").trim(); }).map(function (f) { return { label: f.label.trim(), required: !!f.required, placeholder: (f.placeholder || "").trim() }; }),
      } }).then(function (r) { save.disabled = false; if (!r.ok) { toast((r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save", "err"); return; } S.cfg = r.body.config; toast("Settings saved"); render(); });
    } });

    var guidUrl = location.origin + "/store.html?guild=" + gid;
    var prettyUrl = cfg.slug ? location.origin + "/s/" + cfg.slug : null;
    c.append(panel(panelHead("Share your store", el("span", { class: "pill " + (cfg.enabled ? "on" : "off") }, cfg.enabled ? "Open" : "Closed")),
      el("p", { class: "panel-sub" }, "Send this link to your community — it's where customers browse and buy."),
      copyField("Public store link", prettyUrl || guidUrl, prettyUrl ? "Your custom link. Anyone with it can browse; they sign in with Discord to buy." : "Set a custom link below for a cleaner address. Buyers sign in with Discord to buy."),
      field("Custom link  " + location.origin + "/s/", slug, { hint: "Lowercase letters, numbers and hyphens. Leave blank to use the default link." }),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        btn("Open store", { variant: "btn-outline", icon: "ext", onClick: function () { window.open(prettyUrl || guidUrl, "_blank"); } }))));

    c.append(panel(panelHead("Storefront"),
      el("p", { class: "panel-sub" }, "How the public store looks and what it accepts."),
      open.node, accM.node, accC.node,
      el("div", { class: "grid2", style: { marginTop: "14px" } }, field("Currency", currency), field("Title", title)),
      field("Description", desc), field("Announcement banner", announce, { hint: "Optional, a short highlighted message across the top of the store" }), field("Banner image URL", banner, { hint: "Optional, shown across the top of the store" }),
      accentOn.node, field("Storefront accent colour", accentPick, { hint: "Used across the public shop when 'Custom storefront colour' is on" })));

    c.append(panel(panelHead("Testing", el("span", { class: "pill " + (cfg.test_mode ? "on" : "off") }, cfg.test_mode ? "Test mode ON" : "Live")),
      el("p", { class: "panel-sub" }, "Try a real purchase end-to-end without paying. While test mode is on, checkout completes for free, the order is tagged as a test, and you still get a redemption code to paste in a ticket."),
      testMode.node));

    c.append(panel(panelHead("Invoices"),
      el("p", { class: "panel-sub" }, "Get a PDF invoice for every order. Leave both blank to skip invoicing."),
      field("Invoice channel", invoiceCh, { hint: "A Discord channel the order invoice PDF is posted to" }),
      field("Invoice email", invoiceEmail, { hint: "An address the invoice PDF is emailed to (needs email set up on the bot)" })));

    c.append(panel(panelHead("Checkout questions", addCf),
      el("p", { class: "panel-sub" }, "Ask buyers for the details you need to deliver — character name, tribe, platform. Answers are saved on the order and shown when they redeem their code."),
      cfList));
    c.append(el("div", { style: { display: "flex", justifyContent: "flex-end" } }, save));
  }

  // ── PAYMENTS ───────────────────────────────────────────────────────────────
  function renderPayments(c) {
    var cfg = S.cfg;
    c.append(panel(panelHead("How buyers pay"),
      el("p", { class: "panel-sub" }, "Connect a provider below to take real money straight into your own account. Server credits work with no setup."),
      payRail("💳", "Card & PayPal", "Real money — needs a connected provider", cfg.accept_money),
      payRail("🪙", "Server credits", "Earned by members in Discord — always ready", cfg.accept_credits)));

    var holder = el("div", null, el("div", { class: "sk", style: { height: "200px", borderRadius: "var(--radius-lg)" } }));
    c.append(holder);

    Promise.all([api(A("/payments/stripe")), api(A("/payments/paypal"))]).then(function (res) {
      clear(holder);
      holder.append(el("div", { class: "ov-cols" }, providerCard("stripe", res[0]), providerCard("paypal", res[1])));
      holder.append(el("p", { class: "hint", style: { marginTop: "14px" } },
        "Coming soon: one-tap “Connect with Stripe” and PayPal login linking, so there are no keys to copy. The setup below works today and takes about two minutes."));
    });
  }
  function payRail(ic, title, desc, on) {
    return el("div", { class: "row" }, el("span", { style: { fontSize: "20px" } }, ic),
      el("div", { class: "grow" }, el("div", { class: "t" }, title), el("div", { class: "d" }, desc)),
      on ? badge("On", "ok") : badge("Off", "dim"));
  }
  function providerCard(kind, resp) {
    var isStripe = kind === "stripe";
    var name = isStripe ? "Stripe" : "PayPal";
    var ic = isStripe ? "💠" : "🅿️";
    var blurb = isStripe ? "Cards, Apple Pay & Google Pay" : "Cards + PayPal balance";
    var box = el("div", { class: "panel", style: { margin: 0 } });
    if (!resp || !resp.ok) {
      box.append(
        el("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
          el("span", { style: { fontSize: "24px" } }, ic), el("div", { class: "grow" }, el("div", { class: "t", style: { fontWeight: "800" } }, name)), badge("Unavailable", "dim")),
        el("p", { class: "muted", style: { fontSize: "13px", margin: "10px 0 0" } }, "Couldn’t load — refresh to try again."));
      return box;
    }
    var b = resp.body, on = b.isConfigured, fp = isStripe ? b.secretKey : b.clientId;
    box.append(el("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" } },
      el("span", { style: { fontSize: "24px" } }, ic),
      el("div", { class: "grow" },
        el("div", { class: "t", style: { fontWeight: "800", fontSize: "16px" } }, name),
        el("div", { class: "d", style: { fontSize: "12.5px", color: "var(--text-muted)" } }, blurb)),
      on ? badge("Connected", "ok") : badge("Not connected", "dim")));

    if (on) {
      var live = b.mode === "live";
      var hookSet = isStripe ? (b.webhookSecret && b.webhookSecret.configured) : (b.webhookId && b.webhookId.configured);
      box.append(el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" } },
        badge(live ? "Live mode" : (isStripe ? "Test mode" : "Sandbox"), live ? "ok" : "warn"),
        (fp && fp.last4) ? badge("key ••" + fp.last4, "dim") : null,
        hookSet ? badge("Webhook set", "ok") : badge("No webhook yet", "warn")));
    } else {
      box.append(el("p", { class: "muted", style: { fontSize: "13px", margin: "0 0 14px", lineHeight: "1.5" } },
        isStripe ? "Paste your Stripe secret key to accept card payments." : "Add your PayPal API credentials to accept card & PayPal payments."));
    }

    var actions = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
      btn(on ? "Manage" : "Connect", { icon: on ? null : "plus", onClick: function () { paymentDrawer(kind, b); } }));
    if (on) actions.append(btn("Test", { variant: "btn-outline", onClick: function (e) { testProvider(kind, e.currentTarget); } }));
    box.append(actions);
    return box;
  }
  function testProvider(kind, b) {
    var name = kind === "stripe" ? "Stripe" : "PayPal", orig = b.textContent;
    b.disabled = true; b.textContent = "Testing…";
    api(A("/payments/" + kind + "/test"), { method: "POST" }).then(function (r) {
      b.disabled = false; b.textContent = orig;
      if (r.ok && r.body && r.body.ok) {
        var a = r.body.account;
        toast(name + " connected ✓" + (a && a.business ? " — " + a.business : (a && a.email ? " — " + a.email : "")));
      } else {
        toast((r.body && r.body.message) || (name + " test failed"), "err");
      }
    });
  }
  function steps(arr) {
    return el("ol", { class: "steps" }, arr.map(function (s) { return el("li", null, s); }));
  }
  function copyField(label, value, hint) {
    var input = inp({ type: "text", value: value, readonly: true, style: { flex: "1" }, onfocus: function (e) { e.target.select(); } });
    var copy = btn("Copy", { variant: "btn-outline", style: { flex: "none" }, onClick: function () {
      try { navigator.clipboard.writeText(value).then(function () { toast("Copied"); }); }
      catch (err) { input.focus(); input.select(); toast("Copied"); }
    } });
    return field(label, el("div", { style: { display: "flex", gap: "8px" } }, input, copy), { hint: hint || "Paste this into your provider’s webhook settings." });
  }
  function disconnectProvider(kind) {
    var name = kind === "stripe" ? "Stripe" : "PayPal";
    if (!confirm("Disconnect " + name + "? The money rail stops working until you reconnect.")) return;
    var payload = kind === "stripe" ? { secretKey: "", webhookSecret: "" } : { clientId: "", clientSecret: "", webhookId: "" };
    api(A("/payments/" + kind), { method: "POST", body: payload }).then(function (r) {
      if (!r.ok) return toast("Couldn’t disconnect", "err");
      closeDrawer(); toast(name + " disconnected"); render();
    });
  }
  function paymentDrawer(kind, data) {
    var isStripe = kind === "stripe";
    data = data || {};
    var errEl = el("div", { class: "err" });
    var hookUrl = data.webhookUrl || (location.origin + (isStripe ? "/webhooks/stripe" : "/webhooks/paypal"));
    var body, save;

    if (isStripe) {
      var skSaved = data.secretKey && data.secretKey.configured;
      var sk = inp({ type: "password", placeholder: skSaved ? "Saved ••" + data.secretKey.last4 + " — leave blank to keep" : "sk_live_… or sk_test_…", autocomplete: "off" });
      var whSaved = data.webhookSecret && data.webhookSecret.configured;
      var wh = inp({ type: "password", placeholder: whSaved ? "Saved — leave blank to keep" : "whsec_…", autocomplete: "off" });
      var brand = inp({ type: "text", value: data.brandName || "", maxlength: 128, placeholder: "Shown on the Stripe checkout page" });
      body = el("div", null,
        steps([
          "Open dashboard.stripe.com → Developers → API keys.",
          "Copy your Secret key (sk_live_… for real money, or sk_test_… to trial it) and paste it below.",
          "Developers → Webhooks → Add endpoint: paste the URL below, choose events checkout.session.completed and charge.refunded, then copy its Signing secret (whsec_…).",
        ]),
        field("Secret key", sk, { hint: "Starts with sk_live_ or sk_test_. Stored encrypted; never shown again." }),
        copyField("Webhook endpoint URL", hookUrl),
        field("Webhook signing secret", wh, { hint: "The whsec_… value — this is what auto-confirms paid orders." }),
        field("Brand name (optional)", brand),
        errEl);
      save = btn("Save Stripe keys", { onClick: function () {
        errEl.textContent = ""; save.disabled = true;
        var payload = { brandName: brand.value.trim() };
        if (sk.value.trim()) payload.secretKey = sk.value.trim();
        if (wh.value.trim()) payload.webhookSecret = wh.value.trim();
        api(A("/payments/stripe"), { method: "POST", body: payload }).then(function (r) {
          save.disabled = false;
          if (!r.ok) { errEl.textContent = (r.body && r.body.message) || "Couldn’t save"; return; }
          closeDrawer(); toast("Stripe saved"); render();
        });
      } });
    } else {
      var modeSeg = segmented([{ value: "live", label: "Live" }, { value: "sandbox", label: "Sandbox" }], (data.mode === "sandbox" ? "sandbox" : "live"));
      var cidSaved = data.clientId && data.clientId.configured;
      var cid = inp({ type: "text", placeholder: cidSaved ? "Saved ••" + data.clientId.last4 + " — leave blank to keep" : "PayPal Client ID", autocomplete: "off" });
      var cs = inp({ type: "password", placeholder: (data.clientSecret && data.clientSecret.configured) ? "Saved — leave blank to keep" : "PayPal Client Secret", autocomplete: "off" });
      var wid = inp({ type: "text", placeholder: (data.webhookId && data.webhookId.configured) ? "Saved — leave blank to keep" : "Webhook ID (e.g. 1AB23…)", autocomplete: "off" });
      var brandP = inp({ type: "text", value: data.brandName || "", maxlength: 128, placeholder: "Shown on the PayPal checkout page" });
      body = el("div", null,
        steps([
          "Open developer.paypal.com → Apps & Credentials. Use the Live tab for real money (Sandbox to trial it).",
          "Open or create an app, then copy its Client ID and Secret into the fields below.",
          "In the app’s Webhooks, add the URL below, subscribe to “Payment capture completed” and “…refunded”, then copy the Webhook ID.",
        ]),
        el("label", { class: "field" }, el("span", { class: "lab" }, "Mode"), modeSeg.node),
        field("Client ID", cid),
        field("Client Secret", cs, { hint: "Stored encrypted; never shown again." }),
        copyField("Webhook endpoint URL", hookUrl),
        field("Webhook ID", wid, { hint: "From the webhook you created in the PayPal app — confirms paid orders." }),
        field("Brand name (optional)", brandP),
        errEl);
      save = btn("Save PayPal keys", { onClick: function () {
        errEl.textContent = ""; save.disabled = true;
        var payload = { mode: modeSeg.value(), brandName: brandP.value.trim() };
        if (cid.value.trim()) payload.clientId = cid.value.trim();
        if (cs.value.trim()) payload.clientSecret = cs.value.trim();
        if (wid.value.trim()) payload.webhookId = wid.value.trim();
        api(A("/payments/paypal"), { method: "POST", body: payload }).then(function (r) {
          save.disabled = false;
          if (!r.ok) { errEl.textContent = (r.body && r.body.message) || "Couldn’t save"; return; }
          closeDrawer(); toast("PayPal saved"); render();
        });
      } });
    }

    var configured = isStripe ? (data.secretKey && data.secretKey.configured) : (data.clientId && data.clientId.configured);
    var foot = el("div", { style: { display: "flex", gap: "8px", alignItems: "center", width: "100%" } },
      configured ? btn("Disconnect", { variant: "btn-ghost", style: { color: "#fda4a4" }, onClick: function () { disconnectProvider(kind); } }) : null,
      el("div", { style: { flex: "1" } }),
      btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }), save);
    openDrawer((isStripe ? "Stripe" : "PayPal") + " setup", body, foot);
  }
})();
