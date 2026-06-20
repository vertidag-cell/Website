// Dedicated Store Manager — a full-page store admin (Settings · Products ·
// Orders · Payments) for one guild (?guild=<id>). Reuses the same admin store
// API as the dashboard (requireGuild-gated) and the first-party session cookie.
// CSP-safe: DOM built via el() with addEventListener (no inline handlers).
(function () {
  var cfgSite = window.SITE_CONFIG || {};
  var root = document.getElementById("sm-root");
  var params = new URLSearchParams(location.search);
  var gid = (params.get("guild") || params.get("g") || "").trim();
  var CCY = { GBP: "£", USD: "$", EUR: "€" };

  // ---- DOM helper ----
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

  // ---- API ----
  var _csrf = "";
  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch("/auth/csrf", { credentials: "include", headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (b) { _csrf = (b && b.csrfToken) || ""; return _csrf; }).catch(function () { return ""; });
  }
  function api(path, opts) {
    opts = opts || {};
    var method = (opts.method || "GET").toUpperCase();
    var headers = { Accept: "application/json" };
    if (opts.body) headers["Content-Type"] = "application/json";
    var pre = (method === "GET") ? Promise.resolve("") : getCsrf();
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
  function loginBounce() { try { sessionStorage.setItem("storeReturn", location.href); } catch (e) {} location.href = "/auth/discord/login"; }

  function toast(msg, kind) {
    var t = el("div", { class: "sm-toast" + (kind === "err" ? " err" : "") }); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.classList.add("in"); }, 10);
    setTimeout(function () { t.classList.remove("in"); setTimeout(function () { t.remove(); }, 250); }, 2600);
  }
  function stateMsg(title, body, link) {
    clear(root);
    root.append(el("div", { class: "sm-state" }, el("h2", null, title), el("p", null, body), link || null));
  }

  // ---- state ----
  var S = { cfg: null, products: [], roles: [], channels: [], section: "overview" };

  // ================= BOOT =================
  if (!gid || !/^\d{5,25}$/.test(gid)) { stateMsg("No server", "Open the Store Manager from your dashboard.", el("a", { class: "btn btn-primary", href: "dashboard.html" }, "Go to dashboard")); return; }

  api("/api/dashboard/me").then(function (me) {
    if (me.status === 401) { loginBounce(); return Promise.reject("redirect"); }
    return Promise.all([
      api("/api/dashboard/guilds/" + gid + "/store/config"),
      api("/api/dashboard/guilds/" + gid + "/store/products"),
      api("/api/dashboard/guilds/" + gid + "/discord/roles"),
      api("/api/dashboard/guilds/" + gid + "/discord/channels"),
    ]);
  }).then(function (res) {
    if (!res) return;
    var c = res[0];
    if (c.status === 403 && c.body && c.body.error === "premium_required") { stateMsg("Premium required", "The web store is a Premium feature. Unlock it with /subscribe in Discord.", el("a", { class: "btn btn-primary", href: "pricing.html" }, "See Premium")); return; }
    if (c.status === 401 || c.status === 403) { stateMsg("No access", "You don't manage this server, or your session expired.", el("a", { class: "btn btn-primary", href: "dashboard.html" }, "Back to dashboard")); return; }
    if (!c.ok) { stateMsg("Couldn't load", "Please try again in a moment."); return; }
    S.cfg = c.body.config;
    S.products = (res[1].body && res[1].body.products) || [];
    S.roles = (res[2].body && res[2].body.roles) || [];
    S.channels = (res[3].body && res[3].body.channels) || [];
    render();
  }).catch(function (e) { if (e !== "redirect") stateMsg("Couldn't reach the backend", "Please try again shortly."); });

  // ================= RENDER =================
  function render() {
    clear(root);
    var name = S.cfg.title || "Your store";
    var storeUrl = location.origin + "/store.html?guild=" + gid;

    root.append(el("div", { class: "sm-head" },
      el("div", { class: "sm-logo sm-fb" }, initial(name)),
      el("div", null, el("h1", { class: "sm-title" }, name + " — Store Manager"),
        el("p", { class: "sm-sub" }, S.cfg.enabled ? "Store is OPEN" : "Store is closed", " · ", S.products.length + " product" + (S.products.length === 1 ? "" : "s"))),
      el("div", { class: "sm-head-actions" },
        el("a", { class: "btn btn-outline", href: storeUrl, target: "_blank", rel: "noopener" }, "View public store ↗"))));

    var nav = el("div", { class: "sm-nav" });
    [["overview", "Overview"], ["products", "Products"], ["orders", "Orders"], ["coupons", "Coupons"], ["settings", "Settings"], ["payments", "Payments"]].forEach(function (t) {
      nav.append(el("button", { type: "button", class: S.section === t[0] ? "active" : "", onclick: function () { S.section = t[0]; render(); } }, t[1]));
    });
    root.append(nav);

    var body = el("div");
    root.append(body);
    if (S.section === "overview") renderOverview(body);
    else if (S.section === "settings") renderSettings(body);
    else if (S.section === "products") renderProducts(body);
    else if (S.section === "orders") renderOrders(body);
    else if (S.section === "coupons") renderCoupons(body);
    else renderPayments(body);
  }

  function fieldRow(label, control, hint) {
    return el("label", { class: "sm-field" }, el("span", null, label), control, hint ? el("span", { class: "hint" }, hint) : null);
  }
  function input(attrs) { return el("input", Object.assign({ class: "sm-input" }, attrs)); }
  function checkbox(label, checked) { var c = el("input", { type: "checkbox" }); c.checked = !!checked; return { node: el("label", null, c, " " + label), input: c }; }

  // ---- OVERVIEW ----
  function renderOverview(body) {
    var loading = el("div", { class: "skel", style: { height: "120px" } });
    body.append(loading);
    api("/api/dashboard/guilds/" + gid + "/store/overview").then(function (r) {
      clear(body);
      if (!r.ok) { body.append(el("p", { class: "sm-muted" }, "Couldn't load stats.")); return; }
      var s = r.body.stats || {}, ccy = (r.body.config && r.body.config.currency) || "GBP";
      function stat(label, value, accent) {
        return el("div", { class: "sm-stat" + (accent ? " accent" : "") }, el("div", { class: "sm-stat-v" }, value), el("div", { class: "sm-stat-l" }, label));
      }
      var grid = el("div", { class: "sm-stats" },
        stat("Revenue (money)", money(s.revenueMoney, ccy)),
        stat("Revenue (credits)", "🪙 " + fmt(s.revenueCredits)),
        stat("Paid orders", fmt(s.paidOrders)),
        stat("Awaiting delivery", fmt(s.needsDelivery), s.needsDelivery > 0),
        stat("Products live", fmt(s.enabledProducts) + " / " + fmt(s.products)),
        stat("Active coupons", fmt(s.activeCoupons)));
      body.append(grid);

      // Quick actions.
      body.append(el("div", { class: "sm-card", style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        el("button", { class: "btn btn-primary", onclick: function () { S.section = "products"; render(); openProductModal(null); } }, "+ Add product"),
        el("button", { class: "btn btn-outline", onclick: function () { S.section = "orders"; render(); } }, "View orders" + (s.needsDelivery > 0 ? " (" + s.needsDelivery + " to deliver)" : "")),
        el("button", { class: "btn btn-outline", onclick: function () { S.section = "coupons"; render(); } }, "Coupons"),
        el("a", { class: "btn btn-ghost", href: location.origin + "/store.html?guild=" + gid, target: "_blank", rel: "noopener" }, "Open public store ↗")));

      // Recent orders.
      var recent = (r.body.recentOrders || []);
      var card = el("div", { class: "sm-card" }, el("h2", null, "Recent orders"));
      if (!recent.length) card.append(el("p", { class: "sm-muted" }, "No orders yet."));
      else {
        var STAT = { completed: "✅ completed", needs_delivery: "⏳ needs delivery", paid: "✅ paid", pending: "… pending", cancelled: "⚪ cancelled", refunded: "↩️ refunded", failed: "❌ failed" };
        recent.forEach(function (o) {
          var total = o.rail === "credits" ? "🪙 " + fmt(o.total_credits) : money(o.total_money, o.currency);
          card.append(el("div", { class: "sm-order-line", style: { justifyContent: "space-between" } },
            el("span", null, "#" + o.id + " · @" + (o.buyer_username || o.buyer_user_id) + (o.coupon_code ? " · 🎟️" + o.coupon_code : "")),
            el("span", { class: "sm-muted" }, STAT[o.status] || o.status), el("b", null, total)));
        });
      }
      body.append(card);
    });
  }

  // ---- SETTINGS ----
  function renderSettings(body) {
    var c = S.cfg;
    var enabled = checkbox("Store open", c.enabled), money_ = checkbox("Accept money", c.accept_money), credits = checkbox("Accept credits", c.accept_credits);
    var currency = el("select", { class: "sm-select" }, ["GBP", "USD", "EUR"].map(function (x) { return el("option", { value: x, selected: c.currency === x }, x); }));
    var title = input({ type: "text", value: c.title || "", maxlength: 100, placeholder: "Store title" });
    var desc = input({ type: "text", value: c.description || "", maxlength: 1000, placeholder: "Short description" });
    var banner = input({ type: "url", value: c.banner_url || "", placeholder: "https://…/banner.png" });
    var ordersCh = el("select", { class: "sm-select" }, el("option", { value: "" }, "— none —"),
      S.channels.map(function (ch) { return el("option", { value: ch.id, selected: c.orders_channel_id === ch.id }, "#" + (ch.name || ch.id)); }));
    var staff = el("select", { class: "sm-select", multiple: true, style: { minHeight: "92px" } },
      S.roles.map(function (r) { return el("option", { value: r.id, selected: (c.staff_role_ids || []).indexOf(r.id) >= 0 }, r.name); }));
    var save = el("button", { class: "btn btn-primary" }, "Save settings");
    save.addEventListener("click", function () {
      save.disabled = true;
      api("/api/dashboard/guilds/" + gid + "/store/config", { method: "POST", body: {
        enabled: enabled.input.checked, accept_money: money_.input.checked, accept_credits: credits.input.checked,
        currency: currency.value, title: title.value.trim() || null, description: desc.value.trim() || null,
        banner_url: banner.value.trim() || null, orders_channel_id: ordersCh.value || null,
        staff_role_ids: Array.prototype.map.call(staff.selectedOptions, function (o) { return o.value; }),
      } }).then(function (r) {
        save.disabled = false;
        if (!r.ok) { toast((r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save", "err"); return; }
        S.cfg = r.body.config; toast("Settings saved"); render();
      });
    });
    body.append(el("div", { class: "sm-card" }, el("h2", null, "Store settings"),
      el("div", { class: "sm-toggles" }, enabled.node, money_.node, credits.node),
      el("div", { class: "sm-grid2" }, fieldRow("Currency", currency), fieldRow("Staff orders channel", ordersCh)),
      fieldRow("Title", title), fieldRow("Description", desc), fieldRow("Banner image URL", banner, "https image, optional"),
      fieldRow("Staff roles (deliver / refund)", staff, "Ctrl/Cmd-click to multi-select"),
      save));
  }

  // ---- PRODUCTS ----
  function renderProducts(body) {
    var head = el("div", { class: "sm-card" },
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
        el("h2", { style: { margin: 0 } }, "Products (" + S.products.length + ")"),
        el("button", { class: "btn btn-primary", onclick: function () { openProductModal(null); } }, "+ Add product")),
      el("p", { class: "sm-muted", style: { margin: 0, fontSize: "13px" } }, "Sold on your public store. Price in money, credits, or both."));
    body.append(head);
    if (!S.products.length) { body.append(el("p", { class: "sm-muted" }, "No products yet — add your first.")); return; }
    var grid = el("div", { class: "sm-prod-grid" });
    S.products.forEach(function (p) {
      var price = [p.price_money != null ? money(p.price_money, S.cfg.currency) : null, p.price_credits != null ? "🪙" + p.price_credits : null].filter(Boolean).join(" / ");
      var img = p.image_url ? el("img", { class: "sm-prod-img", src: p.image_url, alt: "", loading: "lazy" }) : el("div", { class: "sm-prod-img fb" }, initial(p.name));
      grid.append(el("div", { class: "sm-prod" + (p.enabled ? "" : " off") }, img,
        el("div", { class: "sm-prod-body" },
          el("div", { class: "sm-prod-name" }, p.name, p.enabled ? "" : " (hidden)"),
          el("div", { class: "sm-prod-meta" }, price + " · " + (p.fulfillment_type === "role" ? "⚡ role" : "📦 manual") + (p.stock != null ? " · stock " + p.stock : "")),
          el("div", { class: "sm-prod-actions" },
            el("button", { class: "btn btn-ghost", onclick: function () { openProductModal(p); } }, "Edit"),
            el("button", { class: "btn btn-ghost", onclick: function () { delProduct(p); } }, "Delete")))));
    });
    body.append(grid);
  }

  function delProduct(p) {
    if (!confirm('Delete "' + p.name + '"?')) return;
    api("/api/dashboard/guilds/" + gid + "/store/products/" + p.id, { method: "DELETE" }).then(function (r) {
      if (!r.ok) return toast("Couldn't delete", "err");
      reloadProducts("Product deleted");
    });
  }
  function reloadProducts(msg) {
    api("/api/dashboard/guilds/" + gid + "/store/products").then(function (r) { S.products = (r.body && r.body.products) || []; if (msg) toast(msg); render(); });
  }

  function openProductModal(existing) {
    var p = existing || {};
    var name = input({ type: "text", value: p.name || "", maxlength: 120, placeholder: "Product name" });
    var desc = input({ type: "text", value: p.description || "", maxlength: 1000, placeholder: "Description" });
    var img = input({ type: "url", value: p.image_url || "", placeholder: "https://…/image.png" });
    var preview = el("img", { class: "sm-preview", src: p.image_url || "", alt: "", style: { display: p.image_url ? "block" : "none" } });
    img.addEventListener("input", function () { if (/^https:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(img.value)) { preview.src = img.value; preview.style.display = "block"; } else preview.style.display = "none"; });
    // upload
    var file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" } });
    var upBtn = el("button", { type: "button", class: "btn btn-ghost", style: { fontSize: "13px", padding: "5px 12px" } }, "⬆ Upload");
    var upMsg = el("span", { class: "sm-muted", style: { fontSize: "12px", marginLeft: "8px" } });
    upBtn.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; if (!f) return;
      if (f.size > 5 * 1024 * 1024) { upMsg.textContent = "Max 5 MB."; return; }
      upBtn.disabled = true; upMsg.textContent = "Uploading…";
      fetch("/api/store-upload", { method: "POST", credentials: "include", headers: { "content-type": f.type }, body: f })
        .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { s: r.status, b: b }; }); })
        .then(function (o) {
          if (o.s === 501) upMsg.textContent = "Uploads not set up — paste a URL.";
          else if (!o.b || !o.b.url) upMsg.textContent = (o.b && o.b.detail) || "Upload failed.";
          else { img.value = o.b.url; img.dispatchEvent(new Event("input")); upMsg.textContent = "Uploaded ✓"; }
        }).catch(function () { upMsg.textContent = "Upload failed."; }).then(function () { upBtn.disabled = false; file.value = ""; });
    });
    var cat = input({ type: "text", value: p.category || "", maxlength: 60, placeholder: "Category (optional)" });
    var pm = input({ type: "number", step: "0.01", min: "0", value: p.price_money != null ? p.price_money : "", placeholder: "—" });
    var pc = input({ type: "number", step: "1", min: "0", value: p.price_credits != null ? p.price_credits : "", placeholder: "—" });
    var stock = input({ type: "number", step: "1", min: "0", value: p.stock != null ? p.stock : "", placeholder: "∞" });
    var lim = input({ type: "number", step: "1", min: "0", value: p.per_user_limit != null ? p.per_user_limit : "", placeholder: "∞" });
    var enabled = checkbox("Visible in store", existing ? p.enabled : true);
    var ftRole = el("input", { type: "radio", name: "smft" }); ftRole.checked = p.fulfillment_type === "role";
    var ftMan = el("input", { type: "radio", name: "smft" }); ftMan.checked = p.fulfillment_type !== "role";
    var roleSel = el("select", { class: "sm-select" }, el("option", { value: "" }, "— pick a role —"),
      S.roles.map(function (r) { return el("option", { value: r.id, selected: p.role_id === r.id }, r.name); }));
    var instr = input({ type: "text", value: p.delivery_instructions || "", maxlength: 1000, placeholder: "e.g. Spawn a Giga lvl 150" });
    var roleWrap = fieldRow("Role to grant", roleSel), manWrap = fieldRow("Delivery instructions (staff)", instr);
    function syncFt() { roleWrap.style.display = ftRole.checked ? "block" : "none"; manWrap.style.display = ftMan.checked ? "block" : "none"; }
    ftRole.addEventListener("change", syncFt); ftMan.addEventListener("change", syncFt);

    var save = el("button", { class: "btn btn-primary" }, existing ? "Save" : "Add product");
    var errBox = el("div");
    save.addEventListener("click", function () {
      clear(errBox); save.disabled = true;
      var b = {
        name: name.value.trim(), description: desc.value.trim() || null, image_url: img.value.trim() || null, category: cat.value.trim() || null,
        price_money: pm.value === "" ? null : Number(pm.value), price_credits: pc.value === "" ? null : Number(pc.value),
        fulfillment_type: ftRole.checked ? "role" : "manual", role_id: ftRole.checked ? (roleSel.value || null) : null,
        delivery_instructions: ftMan.checked ? (instr.value.trim() || null) : null,
        stock: stock.value === "" ? null : Number(stock.value), per_user_limit: lim.value === "" ? null : Number(lim.value), enabled: enabled.input.checked,
      };
      var req = existing ? api("/api/dashboard/guilds/" + gid + "/store/products/" + existing.id, { method: "PATCH", body: b })
        : api("/api/dashboard/guilds/" + gid + "/store/products", { method: "POST", body: b });
      req.then(function (r) {
        if (!r.ok) { errBox.append(el("p", { style: { color: "#ef4444", fontSize: "13px" } }, (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save")); save.disabled = false; return; }
        closeModal(); reloadProducts(existing ? "Product saved" : "Product added");
      });
    });

    var modal = el("div", { class: "sm-modal" }, el("h2", null, existing ? "Edit product" : "New product"),
      fieldRow("Name", name), fieldRow("Description", desc),
      fieldRow("Image URL", img, "https image, or upload"), preview, el("div", { style: { margin: "4px 0 12px" } }, upBtn, upMsg, file),
      fieldRow("Category", cat),
      el("div", { class: "sm-grid2" }, fieldRow("Price — money", pm), fieldRow("Price — credits", pc)),
      el("div", { class: "sm-field" }, el("span", null, "Delivery"),
        el("label", { style: { marginRight: "16px" } }, ftRole, " Discord role"), el("label", null, ftMan, " Manual / in-game")),
      roleWrap, manWrap,
      el("div", { class: "sm-grid2" }, fieldRow("Stock (blank = ∞)", stock), fieldRow("Per-user limit (blank = none)", lim)),
      el("div", { style: { marginBottom: "6px" } }, enabled.node), errBox,
      el("div", { class: "sm-modal-foot" }, el("button", { class: "btn btn-ghost", onclick: closeModal }, "Cancel"), save));
    syncFt();
    var ov = el("div", { class: "sm-modal-ov", id: "sm-modal-ov", onclick: function (e) { if (e.target.id === "sm-modal-ov") closeModal(); } }, modal);
    document.body.append(ov);
  }
  function closeModal() { var ov = document.getElementById("sm-modal-ov"); if (ov) ov.remove(); }

  // ---- ORDERS ----
  function renderOrders(body) {
    var card = el("div", { class: "sm-card" }, el("h2", null, "Orders"));
    body.append(card);
    var filters = el("div", { class: "sm-filters" });
    var listBox = el("div", { class: "sm-muted" }, "Loading…");
    var current = "all";
    function load(f) {
      current = f; clear(filters);
      ["all", "needs_delivery", "completed", "refunded"].forEach(function (x) {
        filters.append(el("button", { class: "btn " + (x === current ? "btn-primary" : "btn-ghost"), onclick: function () { load(x); } }, x.replace("_", " ")));
      });
      listBox.textContent = "Loading…";
      api("/api/dashboard/guilds/" + gid + "/store/orders" + (f === "all" ? "" : "?status=" + f)).then(function (r) {
        clear(listBox);
        var orders = (r.body && r.body.orders) || [];
        if (!orders.length) { listBox.append(el("p", { class: "sm-muted" }, "No orders.")); return; }
        var STAT = { completed: "✅ completed", needs_delivery: "⏳ needs delivery", paid: "✅ paid", pending: "… pending", cancelled: "⚪ cancelled", refunded: "↩️ refunded", failed: "❌ failed" };
        orders.forEach(function (o) {
          var total = o.rail === "credits" ? "🪙 " + o.total_credits : money(o.total_money, o.currency);
          var oc = el("div", { class: "sm-order" }, el("div", { class: "sm-order-top" },
            el("span", null, "#" + o.id + " · ", el("a", { href: "https://discord.com/users/" + o.buyer_user_id, target: "_blank", rel: "noopener" }, "@" + (o.buyer_username || o.buyer_user_id))),
            el("span", null, STAT[o.status] || o.status), el("span", null, total)));
          (o.items || []).forEach(function (i) {
            var tick = i.fulfillment_status === "delivered" ? "✅" : i.fulfillment_status === "granted" ? "⚡" : "⏳";
            var ln = el("div", { class: "sm-order-line" }, el("span", { style: { flex: 1 } }, tick + " " + i.quantity + "× " + i.name + (i.fulfillment_type === "manual" && i.delivery_instructions ? " — " + i.delivery_instructions : "")));
            if (i.fulfillment_type === "manual" && i.fulfillment_status === "pending") {
              var d = el("button", { class: "btn btn-primary", style: { padding: "3px 10px", fontSize: "12px" } }, "Deliver");
              d.addEventListener("click", function () { d.disabled = true; api("/api/dashboard/guilds/" + gid + "/store/orders/" + o.id + "/items/" + i.id + "/deliver", { method: "POST" }).then(function (rr) { if (rr.ok) { toast("Delivered"); load(current); } else { toast("Failed", "err"); d.disabled = false; } }); });
              ln.append(d);
            }
            oc.append(ln);
          });
          if (o.status !== "refunded" && o.status !== "cancelled") {
            var rf = el("button", { class: "btn btn-ghost", style: { marginTop: "8px", padding: "3px 10px", fontSize: "12px" } }, "Refund");
            rf.addEventListener("click", function () { if (!confirm("Refund order #" + o.id + "? Roles are revoked; credits re-credited. Money refunds happen in your PayPal/Stripe dashboard.")) return; api("/api/dashboard/guilds/" + gid + "/store/orders/" + o.id + "/refund", { method: "POST" }).then(function (rr) { toast(rr.ok ? ((rr.body && rr.body.moneyRefundNote) || "Refunded") : "Failed", rr.ok ? "" : "err"); load(current); }); });
            oc.append(rf);
          }
          listBox.append(oc);
        });
      });
    }
    card.append(filters, listBox);
    load("all");
  }

  // ---- COUPONS ----
  function couponSummary(c) {
    var d = c.discount_type === "percent" ? c.percent_off + "% off"
      : [c.amount_off_money != null ? money(c.amount_off_money, S.cfg.currency) + " off" : null, c.amount_off_credits != null ? "🪙" + c.amount_off_credits + " off" : null].filter(Boolean).join(" / ");
    var used = c.redeemed_count + (c.max_redemptions != null ? " / " + c.max_redemptions : "") + " used";
    return d + " · " + used;
  }
  function renderCoupons(body) {
    var head = el("div", { class: "sm-card" },
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" } },
        el("h2", { style: { margin: 0 } }, "Coupons"),
        el("button", { class: "btn btn-primary", onclick: function () { openCouponModal(null); } }, "+ New coupon")),
      el("p", { class: "sm-muted", style: { margin: 0, fontSize: "13px" } }, "Discount codes buyers enter at checkout. Percent or fixed, on money and/or credits."));
    body.append(head);
    var listBox = el("div", { class: "sm-muted" }, "Loading…");
    body.append(listBox);
    api("/api/dashboard/guilds/" + gid + "/store/coupons").then(function (r) {
      clear(listBox);
      var cs = (r.body && r.body.coupons) || [];
      if (!cs.length) { listBox.append(el("p", { class: "sm-muted" }, "No coupons yet — create your first.")); return; }
      cs.forEach(function (c) {
        listBox.append(el("div", { class: "sm-order", style: { opacity: c.enabled ? 1 : 0.55 } },
          el("div", { class: "sm-order-top" },
            el("span", null, el("code", { style: { fontSize: "15px", fontWeight: 800 } }, c.code), c.enabled ? "" : " (disabled)"),
            el("span", { class: "sm-muted", style: { fontSize: "13px" } }, couponSummary(c)),
            el("span", null,
              el("button", { class: "btn btn-ghost", style: { padding: "3px 10px", fontSize: "12px" }, onclick: function () { openCouponModal(c); } }, "Edit"),
              el("button", { class: "btn btn-ghost", style: { padding: "3px 10px", fontSize: "12px" }, onclick: function () { if (!confirm("Delete coupon " + c.code + "?")) return; api("/api/dashboard/guilds/" + gid + "/store/coupons/" + c.id, { method: "DELETE" }).then(function (rr) { if (rr.ok) { toast("Deleted"); render(); } else toast("Failed", "err"); }); } }, "Delete"))),
          c.description ? el("div", { class: "sm-muted", style: { fontSize: "12.5px", marginTop: "4px" } }, c.description) : null,
          (c.min_subtotal_money != null || c.min_subtotal_credits != null || c.per_user_limit != null || c.expires_at)
            ? el("div", { class: "sm-muted", style: { fontSize: "12px", marginTop: "4px" } },
                [c.min_subtotal_money != null ? "min " + money(c.min_subtotal_money, S.cfg.currency) : null,
                 c.min_subtotal_credits != null ? "min 🪙" + c.min_subtotal_credits : null,
                 c.per_user_limit != null ? c.per_user_limit + "/user" : null,
                 c.expires_at ? "expires " + c.expires_at.slice(0, 10) : null].filter(Boolean).join(" · "))
            : null));
      });
    });
  }
  function openCouponModal(existing) {
    var c = existing || {};
    var code = input({ type: "text", value: c.code || "", maxlength: 32, placeholder: "SAVE10", style: { textTransform: "uppercase" } });
    var descI = input({ type: "text", value: c.description || "", maxlength: 200, placeholder: "Optional note (internal)" });
    var typePct = el("input", { type: "radio", name: "smcoupon" }); typePct.checked = (c.discount_type || "percent") === "percent";
    var typeFix = el("input", { type: "radio", name: "smcoupon" }); typeFix.checked = c.discount_type === "fixed";
    var pct = input({ type: "number", min: "1", max: "100", step: "1", value: c.percent_off != null ? c.percent_off : "", placeholder: "10" });
    var offM = input({ type: "number", min: "0", step: "0.01", value: c.amount_off_money != null ? c.amount_off_money : "", placeholder: "—" });
    var offC = input({ type: "number", min: "0", step: "1", value: c.amount_off_credits != null ? c.amount_off_credits : "", placeholder: "—" });
    var pctWrap = fieldRow("Percent off (1–100)", pct);
    var fixWrap = el("div", { class: "sm-grid2" }, fieldRow("Money off", offM), fieldRow("Credits off", offC));
    function syncType() { pctWrap.style.display = typePct.checked ? "block" : "none"; fixWrap.style.display = typeFix.checked ? "grid" : "none"; }
    typePct.addEventListener("change", syncType); typeFix.addEventListener("change", syncType);
    var minM = input({ type: "number", min: "0", step: "0.01", value: c.min_subtotal_money != null ? c.min_subtotal_money : "", placeholder: "—" });
    var minC = input({ type: "number", min: "0", step: "1", value: c.min_subtotal_credits != null ? c.min_subtotal_credits : "", placeholder: "—" });
    var maxR = input({ type: "number", min: "1", step: "1", value: c.max_redemptions != null ? c.max_redemptions : "", placeholder: "∞" });
    var perU = input({ type: "number", min: "1", step: "1", value: c.per_user_limit != null ? c.per_user_limit : "", placeholder: "∞" });
    var starts = input({ type: "date", value: c.starts_at ? c.starts_at.slice(0, 10) : "" });
    var expires = input({ type: "date", value: c.expires_at ? c.expires_at.slice(0, 10) : "" });
    var enabled = checkbox("Active", existing ? c.enabled : true);
    var errBox = el("div");
    var save = el("button", { class: "btn btn-primary" }, existing ? "Save" : "Create coupon");
    save.addEventListener("click", function () {
      clear(errBox); save.disabled = true;
      var b = {
        code: code.value.trim(), description: descI.value.trim() || null,
        discount_type: typePct.checked ? "percent" : "fixed",
        percent_off: typePct.checked ? (pct.value === "" ? null : Number(pct.value)) : null,
        amount_off_money: typeFix.checked && offM.value !== "" ? Number(offM.value) : null,
        amount_off_credits: typeFix.checked && offC.value !== "" ? Number(offC.value) : null,
        min_subtotal_money: minM.value === "" ? null : Number(minM.value),
        min_subtotal_credits: minC.value === "" ? null : Number(minC.value),
        max_redemptions: maxR.value === "" ? null : Number(maxR.value),
        per_user_limit: perU.value === "" ? null : Number(perU.value),
        starts_at: starts.value || null, expires_at: expires.value || null, enabled: enabled.input.checked,
      };
      var req = existing ? api("/api/dashboard/guilds/" + gid + "/store/coupons/" + existing.id, { method: "PATCH", body: b })
        : api("/api/dashboard/guilds/" + gid + "/store/coupons", { method: "POST", body: b });
      req.then(function (r) {
        if (!r.ok) { errBox.append(el("p", { style: { color: "#ef4444", fontSize: "13px" } }, (r.body && r.body.errors && r.body.errors.join("; ")) || "Couldn't save")); save.disabled = false; return; }
        closeModal(); toast(existing ? "Coupon saved" : "Coupon created"); render();
      });
    });
    var modal = el("div", { class: "sm-modal" }, el("h2", null, existing ? "Edit coupon" : "New coupon"),
      fieldRow("Code", code, "Letters/numbers/-/_, shown to buyers"), fieldRow("Description", descI),
      el("div", { class: "sm-field" }, el("span", null, "Discount type"),
        el("label", { style: { marginRight: "16px" } }, typePct, " Percent off"), el("label", null, typeFix, " Fixed amount")),
      pctWrap, fixWrap,
      el("div", { class: "sm-grid2" }, fieldRow("Min spend (money)", minM), fieldRow("Min spend (credits)", minC)),
      el("div", { class: "sm-grid2" }, fieldRow("Max total uses (blank = ∞)", maxR), fieldRow("Per-user uses (blank = ∞)", perU)),
      el("div", { class: "sm-grid2" }, fieldRow("Starts", starts), fieldRow("Expires", expires)),
      el("div", { style: { marginBottom: "6px" } }, enabled.node), errBox,
      el("div", { class: "sm-modal-foot" }, el("button", { class: "btn btn-ghost", onclick: closeModal }, "Cancel"), save));
    syncType();
    document.body.append(el("div", { class: "sm-modal-ov", id: "sm-modal-ov", onclick: function (e) { if (e.target.id === "sm-modal-ov") closeModal(); } }, modal));
  }

  // ---- PAYMENTS (connect status; one-click connect wired next) ----
  function renderPayments(body) {
    var c = S.cfg;
    body.append(el("div", { class: "sm-card" }, el("h2", null, "How buyers pay"),
      el("p", { class: "sm-muted", style: { marginTop: 0, fontSize: "13px" } }, "Products can be sold for real money (needs a connected provider) and/or server credits. Toggle these in Settings."),
      el("div", { class: "sm-pay-row" }, el("div", { class: "sm-pay-ico" }, "💳"),
        el("div", { class: "sm-pay-main" }, el("div", { class: "sm-pay-name" }, "Money"), el("div", { class: "sm-pay-state" }, c.accept_money ? el("span", { class: "sm-badge-ok" }, "Accepted") : el("span", { class: "sm-badge-no" }, "Off — enable in Settings")))),
      el("div", { class: "sm-pay-row" }, el("div", { class: "sm-pay-ico" }, "🪙"),
        el("div", { class: "sm-pay-main" }, el("div", { class: "sm-pay-name" }, "Server credits"), el("div", { class: "sm-pay-state" }, c.accept_credits ? el("span", { class: "sm-badge-ok" }, "Accepted") : el("span", { class: "sm-badge-no" }, "Off — enable in Settings"))))));

    body.append(el("div", { class: "sm-card" }, el("h2", null, "Connect a payment provider"),
      el("p", { class: "sm-muted", style: { marginTop: 0, fontSize: "13px" } }, "One-click connect is on the way — log in and link, no API keys to copy."),
      el("div", { class: "sm-pay-row" }, el("div", { class: "sm-pay-ico" }, "💠"),
        el("div", { class: "sm-pay-main" }, el("div", { class: "sm-pay-name" }, "Stripe"), el("div", { class: "sm-pay-state" }, "One-click ‘Connect with Stripe’ — coming next.")),
        el("button", { class: "btn btn-outline", disabled: true }, "Connect (soon)")),
      el("div", { class: "sm-pay-row" }, el("div", { class: "sm-pay-ico" }, "🅿️"),
        el("div", { class: "sm-pay-main" }, el("div", { class: "sm-pay-name" }, "PayPal"), el("div", { class: "sm-pay-state" }, "One-click PayPal connect — pending PayPal partner approval.")),
        el("button", { class: "btn btn-outline", disabled: true }, "Connect (soon)")),
      el("p", { class: "sm-muted", style: { fontSize: "12.5px" } }, "For now, set up PayPal/Stripe keys in the dashboard Payments tab — those power the money rail today.")));
  }
})();
