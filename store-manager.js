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
    { id: 1, name: "VIP Rank", description: "Coloured name, /kit vip, 2 homes and queue priority.", image_url: null, category: "Ranks", price_money: 9.99, price_credits: 5000, fulfillment_type: "role", role_id: "1", stock: null, per_user_limit: 1, enabled: true, featured: true },
    { id: 2, name: "MVP Rank", description: "Everything in VIP plus a custom tag and monthly crate.", image_url: null, category: "Ranks", price_money: 19.99, price_credits: 12000, fulfillment_type: "role", role_id: "3", stock: null, per_user_limit: 1, enabled: true, featured: true },
    { id: 3, name: "Giga lvl 150 (imprinted)", description: "Bred, imprinted Giga delivered to your tribe.", image_url: null, category: "Dinos", price_money: null, price_credits: 8000, fulfillment_type: "manual", delivery_instructions: "Spawn imprinted Giga 150 at buyer base", stock: 5, per_user_limit: null, enabled: true },
    { id: 4, name: "Starter Kit", description: "Metal tools, 200 element, full flak.", image_url: null, category: "Kits", price_money: 4.99, price_credits: 2500, fulfillment_type: "manual", delivery_instructions: "Hand over starter kit", stock: 0, per_user_limit: null, enabled: true },
    { id: 5, name: "Tribe Logo", description: "Custom in-server tribe banner (hidden while in design).", image_url: null, category: "Cosmetic", price_money: 6, price_credits: null, fulfillment_type: "manual", delivery_instructions: "Design + deliver banner", stock: null, per_user_limit: null, enabled: false },
  ];
  var DEMO_ORDERS = [
    { id: 312, buyer_user_id: "111", buyer_username: "ApexHunter", rail: "money", total_money: 9.99, currency: "GBP", total_credits: null, status: "completed", coupon_code: null, created_at: "2026-06-19 14:02:00", items: [{ id: 1, name: "VIP Rank", quantity: 1, fulfillment_type: "role", fulfillment_status: "granted" }] },
    { id: 311, buyer_user_id: "112", buyer_username: "RexQueen", rail: "credits", total_credits: 8000, status: "needs_delivery", coupon_code: "SUMMER20", created_at: "2026-06-19 12:40:00", items: [{ id: 2, name: "Giga lvl 150 (imprinted)", quantity: 1, fulfillment_type: "manual", delivery_instructions: "Spawn imprinted Giga 150 at buyer base", fulfillment_status: "pending" }] },
    { id: 310, buyer_user_id: "113", buyer_username: "MeshGod", rail: "money", total_money: 19.99, currency: "GBP", status: "paid", coupon_code: null, created_at: "2026-06-18 22:10:00", items: [{ id: 3, name: "MVP Rank", quantity: 1, fulfillment_type: "role", fulfillment_status: "granted" }] },
  ];
  var DEMO_COUPONS = [
    { id: 1, code: "SUMMER20", description: "Summer sale", discount_type: "percent", percent_off: 20, amount_off_money: null, amount_off_credits: null, min_subtotal_money: null, min_subtotal_credits: null, max_redemptions: 100, per_user_limit: 1, redeemed_count: 37, starts_at: null, expires_at: "2026-08-31 23:59:59", enabled: true },
    { id: 2, code: "WELCOME5", description: "£5 off first order", discount_type: "fixed", percent_off: null, amount_off_money: 5, amount_off_credits: null, min_subtotal_money: 10, min_subtotal_credits: null, max_redemptions: null, per_user_limit: 1, redeemed_count: 12, starts_at: null, expires_at: null, enabled: true },
  ];
  var DEMO_REVIEWS = [
    { id: 1, product_id: 1, product_name: "VIP Rank", user_id: "111", username: "ApexHunter", rating: 5, comment: "Instant role, brilliant value.", status: "published", created_at: "2026-06-18 10:00:00" },
    { id: 2, product_id: 3, product_name: "Giga lvl 150 (imprinted)", user_id: "112", username: "RexQueen", rating: 4, comment: "Delivered in-game within the hour.", status: "published", created_at: "2026-06-17 14:00:00" },
    { id: 3, product_id: 4, product_name: "Starter Kit", user_id: "113", username: "MeshGod", rating: 2, comment: "Wanted more element in the kit.", status: "hidden", created_at: "2026-06-16 09:00:00" },
  ];
  var DEMO_CFG = { guild_id: gid, enabled: true, title: "Velated PVP Store", description: "Donor ranks, kits and in-game items for the cluster.", currency: "GBP", accept_money: true, accept_credits: true, orders_channel_id: "10", staff_role_ids: ["4"], banner_url: null };
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
  function demoResp(path, opts) {
    if (opts && opts.method && opts.method !== "GET") return { ok: true };
    if (/\/me$/.test(path)) return { user: { id: "0", username: "previewowner", globalName: "Preview Owner" } };
    if (/\/store\/overview/.test(path)) return { config: DEMO_CFG, recentOrders: DEMO_ORDERS, series: DEMO_SERIES, topProducts: DEMO_TOP, stats: { revenueMoney: 1284.5, revenueCredits: 96000, paidOrders: 73, needsDelivery: 1, products: DEMO_PRODUCTS.length, enabledProducts: 4, activeCoupons: 2 } };
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
      var val = Array.isArray(o) ? o[0] : o.value, lab = Array.isArray(o) ? o[1] : o.label;
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
  var S = { cfg: null, products: [], roles: [], channels: [], stats: {}, recent: [], series: [], top: [], section: "overview" };

  // ── boot ──────────────────────────────────────────────────────────────────
  if (!gid || !/^\d{5,25}$/.test(gid)) { fullState("store", "No server selected", "Open the Store Manager from your dashboard.", btn("Go to dashboard", { onClick: function () { location.href = "dashboard.html"; } })); return; }

  api("/api/dashboard/me").then(function (me) {
    if (me.status === 401) { loginBounce(); return Promise.reject("redirect"); }
    return Promise.all([api(A("/store/overview")), api(A("/store/products")), api(A("/discord/roles")), api(A("/discord/channels"))]);
  }).then(function (res) {
    if (!res) return;
    var ov = res[0];
    if (ov.status === 403 && ov.body && ov.body.error === "premium_required") { return fullState("lock", "Premium required", "The web store is a Premium feature. Unlock it with /subscribe in Discord.", btn("See Premium", { onClick: function () { location.href = "pricing.html"; } })); }
    if (ov.status === 401 || ov.status === 403) { return fullState("lock", "No access", "You don't manage this server, or your session expired.", btn("Back to dashboard", { onClick: function () { location.href = "dashboard.html"; } })); }
    if (!ov.ok) { return fullState("store", "Couldn't load the store", "Please try again in a moment.", btn("Retry", { onClick: function () { location.reload(); } })); }
    S.cfg = ov.body.config; S.stats = ov.body.stats || {}; S.recent = ov.body.recentOrders || []; S.series = ov.body.series || []; S.top = ov.body.topProducts || [];
    S.products = (res[1].body && res[1].body.products) || [];
    S.roles = (res[2].body && res[2].body.roles) || [];
    S.channels = (res[3].body && res[3].body.channels) || [];
    render();
  }).catch(function (e) { if (e !== "redirect") fullState("store", "Couldn't reach the backend", "Please try again shortly.", btn("Retry", { onClick: function () { location.reload(); } })); });

  function refreshOverview() { return api(A("/store/overview")).then(function (r) { if (r.ok) { S.stats = r.body.stats || {}; S.recent = r.body.recentOrders || []; S.series = r.body.series || []; S.top = r.body.topProducts || []; } }); }
  function refreshProducts() { return api(A("/store/products")).then(function (r) { S.products = (r.body && r.body.products) || []; }); }

  // ── shell render ──────────────────────────────────────────────────────────
  var NAV = [["overview", "Overview", "overview"], ["products", "Products", "products"], ["orders", "Orders", "orders"], ["reviews", "Reviews", "star"], ["coupons", "Coupons", "coupons"], ["settings", "Settings", "settings"], ["payments", "Payments", "payments"]];
  var SECTION_META = {
    overview: ["Overview", "Your store at a glance"], products: ["Products", "What you sell"], orders: ["Orders", "Fulfil and refund purchases"],
    reviews: ["Reviews", "Customer ratings — hide anything unfair"],
    coupons: ["Coupons", "Discount codes for checkout"], settings: ["Settings", "Store name, currency, payment rails, staff"], payments: ["Payments", "Connect a provider to take real money"],
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
    else if (S.section === "orders") renderOrders(content);
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

    // needs-delivery call to action
    if (s.needsDelivery > 0) {
      c.append(reveal(el("div", { class: "alert" },
        el("div", { class: "ai" }, icon("truck")),
        el("div", { class: "grow" },
          el("div", { class: "t" }, s.needsDelivery === 1 ? "1 order is waiting on you" : s.needsDelivery + " orders are waiting on you"),
          el("div", { class: "d" }, "Customers have paid for in-game items that need hand delivery.")),
        btn("Deliver now", { onClick: function () { S.section = "orders"; render(); } }))));
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
    var trendTxt = tp == null ? "No change yet" : (tp >= 0 ? "▲ " : "▼ ") + Math.abs(tp) + "% vs prior week";
    var ordSum = sum(series.map(function (x) { return x.orders; }));

    var hero = el("div", { class: "hero-rev" },
      el("div", { class: "cap" }, (useCredits ? "Credits taken" : "Revenue") + " · last 14 days"),
      el("div", { class: "big" }, heroBig),
      el("span", { class: "trend " + trendCls }, trendTxt),
      areaChart(vals, { color: "var(--accent)" }),
      el("div", { class: "hero-sub" },
        el("div", null, el("div", { class: "v" }, money(s.revenueMoney, ccy)), el("div", { class: "l" }, "All-time money")),
        el("div", null, el("div", { class: "v" }, "🪙 " + fmt(s.revenueCredits)), el("div", { class: "l" }, "All-time credits")),
        el("div", null, el("div", { class: "v" }, fmt(ordSum)), el("div", { class: "l" }, "Orders this fortnight"))));

    function gstat(label, value, ic, flag) {
      return el("div", { class: "gstat" + (flag ? " flag" : "") },
        el("div", { class: "gi" }, icon(ic)), el("div", { class: "v" }, value), el("div", { class: "l" }, label));
    }
    var mini = el("div", { class: "ov-mini" },
      gstat("Paid orders", fmt(s.paidOrders), "orders"),
      gstat("Awaiting delivery", fmt(s.needsDelivery || 0), "truck", s.needsDelivery > 0),
      gstat("Products live", fmt(s.enabledProducts || 0) + " / " + fmt(s.products || 0), "products"),
      gstat("Active coupons", fmt(s.activeCoupons || 0), "coupons"));

    c.append(reveal(el("div", { class: "ov-grid" }, hero, mini)));

    // quick actions
    c.append(reveal(panel(panelHead("Quick actions"), el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } },
      btn("Add product", { icon: "plus", onClick: function () { S.section = "products"; render(); productDrawer(null); } }),
      btn("New coupon", { variant: "btn-outline", onClick: function () { S.section = "coupons"; render(); couponDrawer(null); } }),
      btn("Edit store settings", { variant: "btn-outline", icon: "settings", onClick: function () { S.section = "settings"; render(); } }),
      btn("View public store", { variant: "btn-ghost", icon: "ext", onClick: function () { window.open(location.origin + "/store.html?guild=" + gid, "_blank"); } })))));

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

    var ord = panel(panelHead("Recent orders", S.recent.length ? btn("View all", { variant: "btn-ghost", onClick: function () { S.section = "orders"; render(); } }) : null));
    if (!S.recent.length) ord.append(emptyState("orders", "No orders yet", "Purchases will appear here the moment customers check out.", null, true));
    else S.recent.forEach(function (o) {
      var total = o.rail === "credits" ? "🪙 " + fmt(o.total_credits) : money(o.total_money, o.currency);
      ord.append(el("div", { class: "sw-row" },
        el("div", { class: "meta" }, el("div", { class: "t" }, "#" + o.id + "  ·  @" + (o.buyer_username || o.buyer_user_id)), el("div", { class: "d" }, (o.coupon_code ? "🎟️ " + o.coupon_code + " · " : "") + new Date((o.created_at || "").replace(" ", "T") + "Z").toLocaleDateString())),
        el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, orderBadge(o.status), el("b", null, total))));
    });

    c.append(reveal(el("div", { class: "ov-cols" }, top, ord)));
  }
  function orderBadge(status) {
    var m = { completed: ["Completed", "ok"], paid: ["Paid", "ok"], needs_delivery: ["Needs delivery", "warn"], pending: ["Pending", "dim"], cancelled: ["Cancelled", "dim"], refunded: ["Refunded", "info"], failed: ["Failed", "dim"] };
    var x = m[status] || [status, "dim"]; return badge(x[0], x[1]);
  }

  // ── PRODUCTS ───────────────────────────────────────────────────────────────
  function renderProducts(c) {
    c.append(panel(panelHead("Products (" + S.products.length + ")", btn("Add product", { icon: "plus", onClick: function () { productDrawer(null); } })),
      el("p", { class: "panel-sub" }, "Each product is sold on your public store. Price in money, credits, or both; deliver an instant Discord role or a manual in-game handover.")));
    if (!S.products.length) { c.append(emptyState("products", "No products yet", "Add your first product to start selling. You can price it in real money, server credits, or both.", btn("Add your first product", { icon: "plus", onClick: function () { productDrawer(null); } }))); return; }
    var grid = el("div", { class: "pgrid" });
    S.products.forEach(function (p) {
      var price = el("div", { class: "pr" });
      if (p.price_money != null) price.append(money(p.price_money, S.cfg.currency));
      if (p.price_money != null && p.price_credits != null) price.append(el("span", { class: "alt" }, "  or  "));
      if (p.price_credits != null) price.append(el("span", { class: p.price_money != null ? "alt" : "" }, "🪙 " + fmt(p.price_credits)));
      var img = p.image_url ? el("img", { class: "img", src: p.image_url, alt: "", loading: "lazy" }) : el("div", { class: "img fb" }, initial(p.name));
      grid.append(el("div", { class: "pcard" + (p.enabled ? "" : " off") }, img,
        el("div", { class: "body" },
          el("div", { class: "nm" }, p.name),
          el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
            p.featured ? badge("★ Featured", "ok") : null,
            badge(p.fulfillment_type === "role" ? "⚡ Instant role" : "📦 In-game", p.fulfillment_type === "role" ? "ok" : ""),
            p.stock != null ? badge(p.stock > 0 ? p.stock + " left" : "Out of stock", p.stock > 0 ? "dim" : "warn") : null,
            p.enabled ? null : badge("Hidden", "dim")),
          price,
          el("div", { class: "foot" },
            btn("Edit", { variant: "btn-outline", onClick: function () { productDrawer(p); } }),
            btn("Delete", { variant: "btn-ghost", onClick: function () { delProduct(p); } })))));
    });
    c.append(grid);
  }
  function delProduct(p) {
    if (!confirm('Delete "' + p.name + '"? This hides it from the store.')) return;
    api(A("/store/products/" + p.id), { method: "DELETE" }).then(function (r) { if (!r.ok) return toast("Couldn't delete", "err"); refreshProducts().then(function () { toast("Product deleted"); render(); }); });
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
    var cat = inp({ type: "text", value: p.category || "", maxlength: 60, placeholder: "Ranks" });
    var pm = inp({ type: "number", step: "0.01", min: "0", value: p.price_money != null ? p.price_money : "", placeholder: "0.00" });
    var pc = inp({ type: "number", step: "1", min: "0", value: p.price_credits != null ? p.price_credits : "", placeholder: "0" });
    var stock = inp({ type: "number", step: "1", min: "0", value: p.stock != null ? p.stock : "", placeholder: "Unlimited" });
    var lim = inp({ type: "number", step: "1", min: "0", value: p.per_user_limit != null ? p.per_user_limit : "", placeholder: "No limit" });
    var enabled = swRow("Visible in store", "Buyers can see and purchase it", existing ? p.enabled : true);
    var featured = swRow("Featured", "Highlighted and shown first on the storefront", existing ? p.featured : false);

    var roleSel = sel([["", "— pick a role —"]].concat(S.roles.map(function (r) { return [r.id, r.name]; })), p.role_id || "");
    var instr = ta({ value: p.delivery_instructions || "", maxlength: 1000, placeholder: "e.g. Spawn a Giga lvl 150 for the buyer" });
    var roleWrap = field("Role to grant", roleSel, { hint: "Auto-added to the buyer the instant they pay" });
    var manWrap = field("Delivery instructions (shown to staff)", instr);
    var ft = segmented([{ value: "role", label: "⚡ Discord role" }, { value: "manual", label: "📦 Manual / in-game" }], p.fulfillment_type === "role" ? "role" : "manual", function (v) { roleWrap.style.display = v === "role" ? "block" : "none"; manWrap.style.display = v === "manual" ? "block" : "none"; });

    var errEl = el("div", { class: "err" });
    var save = btn(existing ? "Save product" : "Add product", { onClick: function () {
      errEl.textContent = ""; save.disabled = true;
      var b = { name: name.value.trim(), description: desc.value.trim() || null, image_url: img.value.trim() || null, category: cat.value.trim() || null,
        price_money: pm.value === "" ? null : Number(pm.value), price_credits: pc.value === "" ? null : Number(pc.value),
        fulfillment_type: ft.value(), role_id: ft.value() === "role" ? (roleSel.value || null) : null,
        delivery_instructions: ft.value() === "manual" ? (instr.value.trim() || null) : null,
        stock: stock.value === "" ? null : Number(stock.value), per_user_limit: lim.value === "" ? null : Number(lim.value), enabled: enabled.input.checked, featured: featured.input.checked };
      var req = existing ? api(A("/store/products/" + existing.id), { method: "PATCH", body: b }) : api(A("/store/products"), { method: "POST", body: b });
      req.then(function (r) { if (!r.ok) { errEl.textContent = (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save"; save.disabled = false; return; } closeDrawer(); refreshProducts().then(function () { toast(existing ? "Product saved" : "Product added"); render(); }); });
    } });

    var pmWrap = el("div", { class: "inp-prefix" }, el("span", null, CCY[S.cfg.currency] || ""), pm);
    var body = el("div", null,
      field("Name", name), field("Description", desc),
      field("Image", img, { hint: "Paste an https image URL, or upload below" }), prev, el("div", { style: { margin: "8px 0 16px" } }, upBtn, upMsg, file),
      field("Category (optional)", cat),
      el("div", { class: "grid2" }, field("Price — money", pmWrap, { hint: "Blank = not sold for money" }), field("Price — credits", pc, { hint: "Blank = not sold for credits" })),
      el("div", { class: "field" }, el("span", { class: "lab" }, "Delivery"), ft.node), roleWrap, manWrap,
      el("div", { class: "grid2" }, field("Stock", stock, { hint: "Blank = unlimited" }), field("Per-user limit", lim, { hint: "Blank = no limit" })),
      enabled.node, featured.node, errEl);
    roleWrap.style.display = ft.value() === "role" ? "block" : "none"; manWrap.style.display = ft.value() === "manual" ? "block" : "none";
    openDrawer(existing ? "Edit product" : "New product", body, el("div", null, btn("Cancel", { variant: "btn-ghost", onClick: closeDrawer }), save));
  }

  // ── ORDERS ─────────────────────────────────────────────────────────────────
  function renderOrders(c) {
    var wrap = panel(panelHead("Orders"));
    c.append(wrap);
    var chips = el("div", { class: "chips" });
    var listBox = el("div");
    wrap.append(chips, listBox);
    var current = "all";
    function load(f) {
      current = f; clear(chips);
      [["all", "All"], ["needs_delivery", "Needs delivery"], ["completed", "Completed"], ["refunded", "Refunded"]].forEach(function (x) {
        var ch = el("button", { class: "chip" + (x[0] === current ? " on" : "") }, x[1]); ch.addEventListener("click", function () { load(x[0]); }); chips.append(ch);
      });
      clear(listBox); listBox.append(el("div", { class: "sk", style: { height: "70px", marginBottom: "9px" } }), el("div", { class: "sk", style: { height: "70px" } }));
      api(A("/store/orders" + (f === "all" ? "" : "?status=" + f))).then(function (r) {
        clear(listBox);
        var orders = (r.body && r.body.orders) || [];
        if (!orders.length) { listBox.append(emptyState("orders", "No orders here", f === "all" ? "Orders appear here as customers buy from your store." : "No orders with this status right now.")); return; }
        orders.forEach(function (o) {
          var total = o.rail === "credits" ? "🪙 " + fmt(o.total_credits) : money(o.total_money, o.currency);
          var rowTop = el("div", { class: "row", style: { flexDirection: "column", alignItems: "stretch", gap: "8px" } });
          rowTop.append(el("div", { style: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" } },
            el("b", null, "#" + o.id), el("a", { href: "https://discord.com/users/" + o.buyer_user_id, target: "_blank", rel: "noopener", class: "muted" }, "@" + (o.buyer_username || o.buyer_user_id)),
            o.coupon_code ? badge("🎟️ " + o.coupon_code, "info") : null,
            el("span", { style: { marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" } }, orderBadge(o.status), el("b", null, total))));
          (o.items || []).forEach(function (i) {
            var tick = i.fulfillment_status === "delivered" ? "✅" : i.fulfillment_status === "granted" ? "⚡" : "⏳";
            var ln = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" } },
              el("span", { class: "muted", style: { flex: 1 } }, tick + " " + i.quantity + "× " + i.name + (i.fulfillment_type === "manual" && i.delivery_instructions ? " — " + i.delivery_instructions : "")));
            if (i.fulfillment_type === "manual" && i.fulfillment_status === "pending") {
              ln.append(btn("Deliver", { style: { padding: "4px 12px", fontSize: "12px" }, onClick: function (e) { var b = e.target; b.disabled = true; api(A("/store/orders/" + o.id + "/items/" + i.id + "/deliver"), { method: "POST" }).then(function (rr) { if (rr.ok) { toast("Delivered"); refreshOverview().then(function () { load(current); }); } else { toast("Failed", "err"); b.disabled = false; } }); } }));
            }
            rowTop.append(ln);
          });
          if (o.status !== "refunded" && o.status !== "cancelled") {
            rowTop.append(el("div", null, btn("Refund", { variant: "btn-ghost", style: { padding: "4px 12px", fontSize: "12px" }, onClick: function () { if (!confirm("Refund order #" + o.id + "? Granted roles are revoked; credits are re-credited. Money refunds happen in your PayPal/Stripe dashboard.")) return; api(A("/store/orders/" + o.id + "/refund"), { method: "POST" }).then(function (rr) { toast(rr.ok ? ((rr.body && rr.body.moneyRefundNote) || "Refunded") : "Failed", rr.ok ? "" : "err"); refreshOverview().then(function () { load(current); }); }); } })));
          }
          listBox.append(rowTop);
        });
      });
    }
    load("all");
  }

  // ── REVIEWS (moderation) ─────────────────────────────────────────────────────
  function starStr(n) { n = Math.max(0, Math.min(5, n | 0)); return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n); }
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
          box.append(el("div", { class: "row" },
            el("div", { class: "grow" },
              el("div", { class: "t" }, (rv.product_name || ("Product #" + rv.product_id)) + "   " + starStr(rv.rating)),
              el("div", { class: "d" }, "@" + (rv.username || rv.user_id) + (rv.comment ? " — " + rv.comment : ""))),
            hidden ? badge("Hidden", "dim") : badge("Published", "ok"),
            btn(hidden ? "Show" : "Hide", { variant: "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function (e) {
              var b = e.currentTarget; b.disabled = true;
              api(A("/store/reviews/" + rv.id + "/status"), { method: "POST", body: { status: hidden ? "published" : "hidden" } })
                .then(function (rr) { if (rr.ok) { toast(hidden ? "Review shown" : "Review hidden"); load(current); } else { toast("Failed", "err"); b.disabled = false; } });
            } })));
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
  function renderCoupons(c) {
    c.append(panel(panelHead("Coupons", btn("New coupon", { icon: "plus", onClick: function () { couponDrawer(null); } })),
      el("p", { class: "panel-sub" }, "Codes buyers type at checkout. Percent or fixed, on money and/or credits, with optional minimum spend, usage caps and dates.")));
    var listBox = el("div"); c.append(listBox);
    listBox.append(el("div", { class: "sk", style: { height: "64px" } }));
    api(A("/store/coupons")).then(function (r) {
      clear(listBox);
      var cs = (r.body && r.body.coupons) || [];
      if (!cs.length) { listBox.append(emptyState("coupons", "No coupons yet", "Create a discount code to run a sale or reward your community.", btn("Create a coupon", { icon: "plus", onClick: function () { couponDrawer(null); } }))); return; }
      cs.forEach(function (cp) {
        listBox.append(el("div", { class: "row", style: { opacity: cp.enabled ? 1 : 0.6 } },
          el("div", { class: "grow" },
            el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, el("code", { style: { fontSize: "15px", fontWeight: 800, color: "var(--accent-soft)" } }, cp.code), cp.enabled ? null : badge("Disabled", "dim")),
            el("div", { class: "d" }, couponSummary(cp) + (cp.expires_at ? " · expires " + cp.expires_at.slice(0, 10) : "") + (cp.per_user_limit != null ? " · " + cp.per_user_limit + "/user" : ""))),
          btn("Edit", { variant: "btn-outline", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { couponDrawer(cp); } }),
          btn("Delete", { variant: "btn-ghost", style: { padding: "5px 13px", fontSize: "13px" }, onClick: function () { if (!confirm("Delete coupon " + cp.code + "?")) return; api(A("/store/coupons/" + cp.id), { method: "DELETE" }).then(function (rr) { if (rr.ok) { toast("Deleted"); render(); } else toast("Failed", "err"); }); } })));
      });
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
    var banner = inp({ type: "url", value: cfg.banner_url || "", placeholder: "https://…/banner.png" });
    var ordersCh = sel([["", "— none —"]].concat(S.channels.map(function (ch) { return [ch.id, "#" + (ch.name || ch.id)]; })), cfg.orders_channel_id || "");
    var staff = el("select", { class: "inp", multiple: true, style: { minHeight: "120px" } }, S.roles.map(function (r) { return el("option", { value: r.id, selected: (cfg.staff_role_ids || []).indexOf(r.id) >= 0 }, r.name); }));
    var save = btn("Save settings", { onClick: function () {
      save.disabled = true;
      api(A("/store/config"), { method: "POST", body: {
        enabled: open.input.checked, accept_money: accM.input.checked, accept_credits: accC.input.checked, currency: currency.value,
        title: title.value.trim() || null, description: desc.value.trim() || null, banner_url: banner.value.trim() || null,
        orders_channel_id: ordersCh.value || null, staff_role_ids: Array.prototype.map.call(staff.selectedOptions, function (o) { return o.value; }),
      } }).then(function (r) { save.disabled = false; if (!r.ok) { toast((r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save", "err"); return; } S.cfg = r.body.config; toast("Settings saved"); render(); });
    } });

    c.append(panel(panelHead("Storefront"),
      el("p", { class: "panel-sub" }, "How the public store looks and what it accepts."),
      open.node, accM.node, accC.node,
      el("div", { class: "grid2", style: { marginTop: "14px" } }, field("Currency", currency), field("Title", title)),
      field("Description", desc), field("Banner image URL", banner, { hint: "Optional, shown across the top of the store" })));
    c.append(panel(panelHead("Staff & delivery"),
      el("p", { class: "panel-sub" }, "Where manual orders go and who can fulfil them."),
      field("Orders channel", ordersCh, { hint: "Manual delivery orders are posted here for staff" }),
      field("Staff roles", staff, { hint: "These roles can claim, deliver and refund (Ctrl/Cmd-click to select several)" })));
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
  function copyField(label, value) {
    var input = inp({ type: "text", value: value, readonly: true, style: { flex: "1" }, onfocus: function (e) { e.target.select(); } });
    var copy = btn("Copy", { variant: "btn-outline", style: { flex: "none" }, onClick: function () {
      try { navigator.clipboard.writeText(value).then(function () { toast("Copied"); }); }
      catch (err) { input.focus(); input.select(); toast("Copied"); }
    } });
    return field(label, el("div", { style: { display: "flex", gap: "8px" } }, input, copy), { hint: "Paste this into your provider’s webhook settings." });
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
