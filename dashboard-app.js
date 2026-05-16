/*
 * Quick's ARK Bot — Dashboard SPA (schema-driven)
 * ------------------------------------------------------------
 * Renders ~20 module pages from a single backend schema endpoint.
 * Talks to the bot's Express server (Square Cloud) over fetch +
 * cookies. No secrets in this file.
 *
 * Loads after dashboard-boot.js which provides a 4-second safety
 * timer in case this script fails to boot.
 */

(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const API_BASE = (cfg.backendApiUrl || "").replace(/\/$/, "");
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  window.__DASH_TOUCHED__ = true;

  const DEBUG = true;
  if (DEBUG) {
    console.log("[dashboard] backendApiUrl:", cfg.backendApiUrl || "(empty)");
    console.log("[dashboard] resolved API_BASE:", API_BASE || "(empty)");
  }

  /* ============================================================
     API client with timeout + structured errors
     ============================================================ */
  const API_TIMEOUT_MS = 8000;

  async function api(path, opts) {
    opts = opts || {};
    if (!API_BASE) throw Object.assign(new Error("backend not configured"), { code: "no_backend" });
    const url = API_BASE + path;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: opts.method || "GET",
        credentials: "include",
        signal: ctrl.signal,
        headers: opts.body
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e?.name === "AbortError") throw Object.assign(new Error("Backend timed out"), { code: "timeout" });
      throw Object.assign(new Error("Backend unreachable"), { code: "network" });
    }
    clearTimeout(timer);
    const ct = res.headers.get("content-type") || "";
    let body = null;
    try {
      if (ct.includes("application/json")) body = await res.json();
      else { const t = await res.text(); body = t ? { error: t.slice(0, 200) } : null; }
    } catch {}
    if (DEBUG) console.log(`[dashboard] ${path} → ${res.status}`, body || "");
    if (res.ok) return body;
    const err = new Error((body?.error) || (body?.message) || res.statusText || `HTTP ${res.status}`);
    err.code = res.status;
    err.data = body;
    throw err;
  }

  /* ============================================================
     Icon library — small inline SVGs keyed by name.
     ------------------------------------------------------------
     Kept minimal (24x24 stroke icons) so we don't ship an icon
     library just for the dashboard. Use icon(name, opts?) to get
     a <span class="dash-tab-ico"> wrapping the SVG, or call
     iconSvg(name) for the raw SVG element.
  */
  const ICON_PATHS = {
    // Layout / nav
    grid:      'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    list:      'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    activity:  'M22 12h-4l-3 9L9 3l-3 9H2',
    flag:      'M4 22V4l9 5-9 5M4 4l16 6-16 6',
    // Modules
    hand:      'M9 11V6a2 2 0 1 1 4 0v5M13 11V4a2 2 0 1 1 4 0v9M17 11V7a2 2 0 1 1 4 0v10a6 6 0 0 1-6 6h-2a8 8 0 0 1-8-8v-3a2 2 0 0 1 4 0v4',
    shield:    'M12 2L4 5v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V5l-8-3z',
    palette:   'M12 2a10 10 0 1 0 10 10c0-1.66-1.34-3-3-3h-2a3 3 0 0 1-3-3V4a2 2 0 0 0-2-2z',
    masks:     'M8 4a4 4 0 0 0-4 4v3a6 6 0 0 0 12 0V8a4 4 0 0 0-4-4zM4 11s2 2 8 2 8-2 8-2',
    poll:      'M3 3v18h18M7 14v4M12 9v9M17 13v5',
    sword:     'M14 14l7 7v-7zM14 14L4 4 4 11l10 10z',
    ticket:    'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4z',
    coin:      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9',
    creditCard:'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20',
    wallet:    'M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V5a2 2 0 0 1 2-2h12v4M17 13h3',
    flame:     'M14 2c0 6 4 7 4 12a6 6 0 1 1-12 0c0-4 3-5 3-9 2 2 2 4 5 6 0-3 0-6 0-9z',
    trophy:    'M8 4h8v4a4 4 0 0 1-8 0zM4 6h4M16 6h4M12 12v4M8 20h8',
    gift:      'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7',
    calendar:  'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4',
    template:  'M3 3h18v4H3zM3 11h7v10H3zM14 11h7v10h-7z',
    fileText:  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
    lifeRing:  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5',
    cog:       'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82h0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    // Utility / state
    lock:      'M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 9V7a4 4 0 1 1 8 0v2',
    sparkle:   'M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4',
    arrowRight:'M5 12h14M13 5l7 7-7 7',
    menu:      'M3 6h18M3 12h18M3 18h18',
    user:      'M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
    logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    refresh:   'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    plug:      'M9 2v6M15 2v6M5 8h14v4a7 7 0 0 1-14 0zM12 19v3',
  };
  function iconSvg(name) {
    const d = ICON_PATHS[name] || ICON_PATHS.list;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    return svg;
  }
  function icon(name, cls) {
    const wrap = h("span", { class: cls || "dash-tab-ico" });
    wrap.appendChild(iconSvg(name));
    return wrap;
  }

  // Map every dashboard tab to an icon
  const TAB_ICONS = {
    "setup-hub":  "grid",
    overview:     "activity",
    welcome:      "hand",
    autoRoles:    "shield",
    roleMenus:    "masks",
    polls:        "poll",
    moderation:   "shield",
    xp:           "trophy",
    pets:         "flag",
    tickets:      "ticket",
    credits:      "coin",
    payments:     "creditCard",
    staffPay:     "wallet",
    hype:         "flame",
    giveaways:    "gift",
    events:       "calendar",
    branding:     "palette",
    serverTemplates: "template",
    logs:         "fileText",
    premium:      "sparkle",
    audit:        "fileText",
    support:      "lifeRing",
  };
  function tabIcon(id) { return icon(TAB_ICONS[id] || "list"); }

  /* ============================================================
     DOM helpers
     ============================================================ */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach((cc) => cc != null && cc !== false && el.append(cc.nodeType ? cc : document.createTextNode(cc)));
      else el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function userAvatar(u) {
    if (u.avatar) return h("div", { class: "dash-avatar" }, h("img", { src: `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128`, alt: "" }));
    return h("div", { class: "dash-avatar" }, (u.username || "U").charAt(0).toUpperCase());
  }
  function guildIcon(g) {
    if (g.icon) return h("div", { class: "gico" }, h("img", { src: `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`, alt: "" }));
    const initials = (g.name || "?").split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
    return h("div", { class: "gico" }, initials);
  }
  function notice(kind, title, detail) {
    return h("div", { class: `dash-notice ${kind}` },
      h("span", { class: "ni" }, kind === "warn" ? "!" : kind === "error" ? "✕" : kind === "success" ? "✓" : "i"),
      h("div", null,
        h("div", { style: { fontWeight: "600", marginBottom: detail ? "4px" : "0" } }, title),
        detail ? h("div", { style: { fontSize: "0.86rem", color: "var(--text-muted)" } }, detail) : null
      )
    );
  }
  function btn(label, opts) {
    opts = opts || {};
    return h(opts.href ? "a" : "button", {
      class: `btn ${opts.kind || "btn-primary"}`,
      type: opts.href ? null : "button",
      href: opts.href || null,
      target: opts.external ? "_blank" : null,
      rel: opts.external ? "noopener noreferrer" : null,
      onclick: opts.onclick || null,
      disabled: opts.disabled || null,
    }, label);
  }
  function toast(kind, msg, ms) {
    let host = document.getElementById("dash-toasts");
    if (!host) {
      host = h("div", { id: "dash-toasts" });
      document.body.appendChild(host);
    }
    const t = h("div", { class: `dash-toast ${kind || ""}` }, msg);
    host.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, ms || 3200);
  }

  /* ============================================================
     State
     ============================================================ */
  const state = {
    user: null,
    guilds: [],
    selectedGuildId: null,
    modules: null,         // schema list from /api/dashboard/modules
    channels: null,        // per-selected-guild
    categories: null,      // per-selected-guild (Discord category channels)
    roles: null,           // per-selected-guild
    activeTab: "overview", // module name OR "overview" OR "audit"
  };

  const auth = { loginUrl: () => API_BASE + "/auth/discord/login" };
  const data = {
    me: () => api("/api/dashboard/me"),
    guilds: () => api("/api/dashboard/guilds"),
    modules: () => api("/api/dashboard/modules"),
    overview: (gid) => api(`/api/dashboard/guilds/${gid}/overview`),
    module: (gid, name) => api(`/api/dashboard/guilds/${gid}/modules/${name}`),
    saveModule: (gid, name, body) => api(`/api/dashboard/guilds/${gid}/modules/${name}`, { method: "POST", body }),
    resetModule: (gid, name) => api(`/api/dashboard/guilds/${gid}/modules/${name}/reset`, { method: "POST" }),
    quickSetup: (gid, name, body) => api(`/api/dashboard/guilds/${gid}/modules/${name}/quick-setup`, { method: "POST", body: body || {} }),
    audit: (gid) => api(`/api/dashboard/guilds/${gid}/audit-log`),
    channels: (gid) => api(`/api/dashboard/guilds/${gid}/discord/channels`),
    categories: (gid) => api(`/api/dashboard/guilds/${gid}/discord/categories`),
    roles: (gid) => api(`/api/dashboard/guilds/${gid}/discord/roles`),
    // Role menu CRUD
    rmList: (gid) => api(`/api/dashboard/guilds/${gid}/role-menus`),
    rmGet: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`),
    rmCreate: (gid, body) => api(`/api/dashboard/guilds/${gid}/role-menus`, { method: "POST", body }),
    rmUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`, { method: "PATCH", body }),
    rmDelete: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}`, { method: "DELETE" }),
    rmOptAdd: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options`, { method: "POST", body }),
    rmOptUpdate: (gid, id, oid, body) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options/${oid}`, { method: "PATCH", body }),
    rmOptDelete: (gid, id, oid) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/options/${oid}`, { method: "DELETE" }),
    rmPost: (gid, id) => api(`/api/dashboard/guilds/${gid}/role-menus/${id}/post`, { method: "POST" }),
    // Staff Tiers (per-role pay amounts) — premium only
    tierList:   (gid)         => api(`/api/dashboard/guilds/${gid}/staff-tiers`),
    tierCreate: (gid, body)   => api(`/api/dashboard/guilds/${gid}/staff-tiers`, { method: "POST", body }),
    tierUpdate: (gid, id, body) => api(`/api/dashboard/guilds/${gid}/staff-tiers/${id}`, { method: "PATCH", body }),
    tierDelete: (gid, id)     => api(`/api/dashboard/guilds/${gid}/staff-tiers/${id}`, { method: "DELETE" }),
    // PayPal config (write-only secrets, masked on read) — premium only
    paypalGet:  (gid)         => api(`/api/dashboard/guilds/${gid}/payments/paypal`),
    paypalSave: (gid, body)   => api(`/api/dashboard/guilds/${gid}/payments/paypal`, { method: "POST", body }),
    paypalTest: (gid)         => api(`/api/dashboard/guilds/${gid}/payments/paypal/test`, { method: "POST" }),
  };

  /* ============================================================
     Top-level renderers
     ============================================================ */
  function render() {
    if (!API_BASE) return renderNoBackend();
    if (!state.user) return renderLoggedOut();
    if (!state.selectedGuildId) return renderGuildPicker();
    return renderGuildDashboard();
  }

  function renderNoBackend() {
    clear(root);
    // Premium full-page state — not a tiny notice
    const card = h("div", { class: "picker-empty large" });
    const ico = h("div", { class: "picker-empty-ico" });
    ico.appendChild(iconSvg("plug"));
    card.append(
      ico,
      h("h3", null, "Dashboard backend not connected"),
      h("p", null,
        "The dashboard UI is ready, but the backend API URL isn't configured yet. For now, manage the bot inside Discord with ",
        h("code", null, "/setup"), " and ", h("code", null, "/subscribe"),
        ". Once the backend goes live this page becomes a full control panel."),
      h("div", { class: "dash-actions", style: { justifyContent: "center" } },
        btn("Invite Bot",   { kind: "btn-primary", href: cfg.links?.inviteBot,      external: true }),
        btn("Join Support", { kind: "btn-ghost",   href: cfg.links?.supportDiscord, external: true }),
        btn("View Pricing", { kind: "btn-outline", href: "pricing.html" })
      )
    );
    root.append(card);
    // Also show the marketing-style feature preview + setup guide so the
    // page still feels useful while backend is offline.
    root.append(renderPickerFeaturePreview(), renderPickerSetupGuide());
  }

  function renderLoggedOut() {
    clear(root);
    const card = h("div", { class: "dash-empty-card", style: { maxWidth: "560px", margin: "40px auto" } });
    const ico = h("div", { class: "ico" });
    ico.appendChild(iconSvg("user"));
    card.append(
      ico,
      h("h4", null, "Sign in to your Quick's ARK Bot dashboard"),
      h("p", null,
        "Manage every module, branding, role menus, staff tiers, events and more — securely synced with your Discord server."),
      h("a", { class: "btn btn-lg",
        href: auth.loginUrl(),
        style: { background: "#5865f2", color: "#fff", boxShadow: "0 8px 24px rgba(88,101,242,0.45)", fontWeight: 700 } },
        "Continue with Discord"),
      h("p", { style: { fontSize: "0.74rem", color: "var(--dash-muted-2)", margin: "16px 0 0" } },
        "We request only ", h("code", null, "identify"), " and ", h("code", null, "guilds"), " scopes — no message read, no member list.")
    );
    root.append(card);
  }

  // Server-picker local UI state (search query + filter pill)
  const pickerState = { query: "", filter: "all" };

  function renderGuildPicker() {
    clear(root);

    const totalCount   = state.guilds.length;
    const premiumCount = state.guilds.filter((g) => g.plan === "premium" || g.plan === "monthly" || g.plan === "lifetime").length;
    const ownerCount   = state.guilds.filter((g) => g.owner).length;

    // ── Welcome header ─────────────────────────────────────────────
    root.append(renderPickerHeader(totalCount));

    // No manageable servers — premium empty state inside the layout
    if (!totalCount) {
      const card = h("div", { class: "picker-empty" },
        (() => { const i = h("div", { class: "picker-empty-ico" }); i.appendChild(iconSvg("shield")); return i; })(),
        h("h3", null, "No manageable servers found"),
        h("p", null,
          "You need to be a server owner, administrator, or have Manage Server permission AND have Quick's ARK Bot installed in that server."),
        h("div", { class: "dash-actions", style: { justifyContent: "center" } },
          btn("Invite Bot", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true }),
          btn("Join Support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true }),
          btn("Refresh", { kind: "btn-outline", onclick: () => boot(true) })
        )
      );
      root.append(card);
      // Still show getting-started + features below
      root.append(renderPickerFeaturePreview(), renderPickerSetupGuide());
      return;
    }

    // ── Main 2-column layout ───────────────────────────────────────
    const grid = h("div", { class: "picker-grid" });

    // ─ Left: search/filter + server cards
    const left = h("div", { class: "picker-main" });
    left.append(renderPickerSearchBar());
    const listHost = h("div", { class: "picker-servers" });
    left.append(listHost);
    rerenderServerList(listHost);

    // ─ Right: account + quick actions + premium info
    const aside = h("aside", { class: "picker-aside" },
      renderPickerAccountCard(totalCount, premiumCount, ownerCount),
      renderPickerQuickActions(),
      renderPickerPremiumCard()
    );

    grid.append(left, aside);
    root.append(grid);

    // ── Below the fold: feature preview + setup guide ─────────────
    root.append(renderPickerFeaturePreview(), renderPickerSetupGuide());
  }

  function renderPickerHeader(totalCount) {
    const u = state.user || {};
    const name = u.globalName || u.username || "there";
    return h("div", { class: "picker-header" },
      h("div", { class: "picker-header-row" },
        userAvatar(u),
        h("div", { class: "picker-header-who" },
          h("h1", { class: "picker-header-title" }, `Welcome back, ${name}`),
          h("p", { class: "picker-header-sub" },
            "Select a Discord server to manage setup, branding, role menus, /pop, staff pay, and every Quick's ARK Bot feature.")
        )
      ),
      h("div", { class: "picker-header-badges" },
        h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Logged in with Discord"),
        h("span", { class: "dash-status-pill" }, `${totalCount} manageable server${totalCount === 1 ? "" : "s"}`),
        h("span", { class: "dash-status-pill premium" }, h("span", { class: "pill-dot" }), "Quick's ARK Bot Dashboard")
      ),
      h("div", { class: "picker-header-actions" },
        btn("Invite Bot",      { kind: "btn-primary", href: cfg.links?.inviteBot,      external: true }),
        btn("Join Support",    { kind: "btn-ghost",   href: cfg.links?.supportDiscord, external: true }),
        btn("View Pricing",    { kind: "btn-outline", href: "pricing.html" }),
        btn("Log out",         { kind: "btn-ghost",   onclick: handleLogout })
      )
    );
  }

  function renderPickerSearchBar() {
    const search = h("input", {
      type: "search",
      class: "picker-search",
      placeholder: "Search your servers…",
      value: pickerState.query,
      autocomplete: "off",
      spellcheck: "false",
    });
    search.addEventListener("input", () => {
      pickerState.query = search.value;
      rerenderServerList(root.querySelector(".picker-servers"));
    });

    const filters = [
      { id: "all",      label: "All",       countFn: (gs) => gs.length },
      { id: "premium",  label: "Premium",   countFn: (gs) => gs.filter((g) => g.plan === "premium" || g.plan === "monthly" || g.plan === "lifetime").length },
      { id: "free",     label: "Free",      countFn: (gs) => gs.filter((g) => !["premium","monthly","lifetime"].includes(g.plan)).length },
      { id: "owner",    label: "Owner",     countFn: (gs) => gs.filter((g) => g.owner).length },
    ];
    const pillRow = h("div", { class: "picker-filters" });
    filters.forEach((f) => {
      const count = f.countFn(state.guilds);
      const pill = h("button", {
        type: "button",
        class: `picker-filter ${pickerState.filter === f.id ? "active" : ""}`,
        onclick: () => {
          pickerState.filter = f.id;
          // Re-render filter row to reflect active state
          const newBar = renderPickerSearchBar();
          root.querySelector(".picker-searchbar").replaceWith(newBar);
          rerenderServerList(root.querySelector(".picker-servers"));
        },
      },
        f.label,
        h("span", { class: "picker-filter-count" }, String(count))
      );
      pillRow.appendChild(pill);
    });

    const ico = h("span", { class: "picker-search-ico" });
    ico.appendChild(iconSvg("activity"));
    return h("div", { class: "picker-searchbar" },
      h("div", { class: "picker-search-wrap" }, ico, search),
      pillRow
    );
  }

  function filterGuilds(guilds) {
    const q = (pickerState.query || "").trim().toLowerCase();
    const f = pickerState.filter;
    return guilds.filter((g) => {
      if (q && !(g.name || "").toLowerCase().includes(q)) return false;
      if (f === "premium" && !(g.plan === "premium" || g.plan === "monthly" || g.plan === "lifetime")) return false;
      if (f === "free"    &&  (g.plan === "premium" || g.plan === "monthly" || g.plan === "lifetime")) return false;
      if (f === "owner"   && !g.owner) return false;
      return true;
    });
  }

  function rerenderServerList(host) {
    if (!host) return;
    clear(host);
    const filtered = filterGuilds(state.guilds);
    if (!filtered.length) {
      host.append(
        h("div", { class: "picker-empty-inline" },
          (() => { const i = h("div", { class: "picker-empty-ico small" }); i.appendChild(iconSvg("activity")); return i; })(),
          h("h4", null, "No matches"),
          h("p", null,
            pickerState.query
              ? `No servers match "${pickerState.query}". Try a different search.`
              : "No servers in this category.")
        )
      );
      return;
    }
    filtered.forEach((g, i) => {
      const card = renderGuildCard(g);
      // Staggered fade-in for premium feel
      card.style.animationDelay = (i * 0.05) + "s";
      host.appendChild(card);
    });
  }

  function renderGuildCard(g) {
    const planLabel = g.plan === "lifetime" ? "Lifetime"
                    : (g.plan === "premium" || g.plan === "monthly") ? "Premium"
                    : "Free";
    const planClass = g.plan === "lifetime" ? "lifetime"
                    : (g.plan === "premium" || g.plan === "monthly") ? "premium"
                    : "free";

    const card = h("button", { class: "picker-server-card", type: "button",
      onclick: () => selectGuild(g.id),
      "aria-label": `Manage ${g.name}` });

    card.append(
      h("div", { class: "picker-server-top" },
        guildIcon(g),
        h("div", { class: "picker-server-info" },
          h("div", { class: "picker-server-name" }, g.name),
          h("div", { class: "picker-server-id" }, "ID · " + (g.id ? g.id.slice(-6) : "—"))
        ),
        h("span", { class: `dash-status-pill ${planClass}` },
          g.plan === "lifetime" || g.plan === "premium" || g.plan === "monthly" ? h("span", { class: "pill-dot" }) : null,
          planLabel)
      ),
      h("div", { class: "picker-server-badges" },
        h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Bot Installed"),
        g.owner ? h("span", { class: "dash-status-pill" }, "Owner")
                : h("span", { class: "dash-status-pill" }, "Manage Server")
      ),
      h("div", { class: "picker-server-actions" },
        h("span", { class: "picker-manage-btn" }, "Manage Server →")
      )
    );

    return card;
  }

  // ── Aside cards ──────────────────────────────────────────────────
  function renderPickerAccountCard(totalCount, premiumCount, ownerCount) {
    return h("div", { class: "picker-aside-card" },
      h("h4", null, "Account"),
      h("div", { class: "picker-account-row" },
        userAvatar(state.user),
        h("div", null,
          h("div", { class: "picker-account-name" }, state.user?.globalName || state.user?.username || "—"),
          h("div", { class: "picker-account-sub" }, "@" + (state.user?.username || "—"))
        )
      ),
      h("div", { class: "picker-mini-stats" },
        renderMiniStat(String(totalCount),   "Servers"),
        renderMiniStat(String(premiumCount), "Premium"),
        renderMiniStat(String(ownerCount),   "Owner")
      )
    );
  }
  function renderMiniStat(value, label) {
    return h("div", { class: "picker-mini-stat" },
      h("div", { class: "picker-mini-stat-v" }, value),
      h("div", { class: "picker-mini-stat-l" }, label)
    );
  }

  function renderPickerQuickActions() {
    return h("div", { class: "picker-aside-card" },
      h("h4", null, "Quick Actions"),
      h("div", { class: "picker-quick-list" },
        renderQuickRow("plug",    "Invite Bot",     cfg.links?.inviteBot,      true),
        renderQuickRow("lifeRing","Support Server", cfg.links?.supportDiscord, true),
        renderQuickRow("calendar","View Pricing",   "pricing.html",            false),
        renderQuickRow("fileText","Dashboard Help", "faq.html",                false)
      )
    );
  }
  function renderQuickRow(iconName, label, href, external) {
    return h("a", {
      class: "picker-quick-row",
      href: href || "#",
      target: external ? "_blank" : null,
      rel:    external ? "noopener noreferrer" : null,
    },
      icon(iconName, "picker-quick-ico"),
      h("span", { class: "picker-quick-label" }, label),
      h("span", { class: "picker-quick-arrow" }, "→")
    );
  }

  function renderPickerPremiumCard() {
    return h("div", { class: "picker-aside-card picker-premium" },
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" } },
        icon("sparkle", "picker-quick-ico"),
        h("h4", { style: { margin: 0, color: "var(--dash-red-2)" } }, "Activate Premium")
      ),
      h("p", { style: { fontSize: "0.84rem", color: "var(--dash-muted)", margin: "0 0 12px" } },
        "Premium is activated inside Discord. Invite the bot, pick a server, then run ",
        h("code", null, "/subscribe"), " — checkout opens automatically."),
      h("div", { class: "dash-actions", style: { marginTop: 0 } },
        btn("Invite Bot",   { kind: "btn-primary", href: cfg.links?.inviteBot, external: true }),
        btn("Pricing",      { kind: "btn-ghost",   href: "pricing.html" })
      )
    );
  }

  // ── Below-the-fold cards ────────────────────────────────────────
  function renderPickerFeaturePreview() {
    return h("div", { class: "picker-features-block" },
      h("div", { class: "picker-section-head" },
        h("h3", null, "What you can manage"),
        h("p", null, "Quick's ARK Bot ships with a deep free toolkit and premium upgrades. Every module is also configurable inside Discord with /setup.")
      ),
      h("div", { class: "picker-features-grid" },
        renderFeatureChip("hand",     "Welcome",          "free"),
        renderFeatureChip("shield",   "Auto Roles",       "free"),
        renderFeatureChip("masks",    "Role Menus",       "free"),
        renderFeatureChip("activity", "/pop Population",  "free"),
        renderFeatureChip("trophy",   "XP & Leaderboards","free"),
        renderFeatureChip("flag",     "Pets",             "free"),
        renderFeatureChip("creditCard","Payments",        "premium"),
        renderFeatureChip("wallet",   "Staff Pay",        "premium"),
        renderFeatureChip("flame",    "Hype",             "premium"),
        renderFeatureChip("palette",  "Branding",         "premium"),
        renderFeatureChip("ticket",   "Tickets",          "premium"),
        renderFeatureChip("calendar", "Events",           "premium")
      )
    );
  }
  function renderFeatureChip(iconName, label, tier) {
    return h("div", { class: `picker-feature-chip ${tier}` },
      icon(iconName, "picker-feature-ico"),
      h("div", { class: "picker-feature-body" },
        h("div", { class: "picker-feature-label" }, label),
        h("div", { class: "picker-feature-tier" }, tier === "premium" ? "Premium" : "Free")
      )
    );
  }

  function renderPickerSetupGuide() {
    const steps = [
      { n: "1", title: "Invite the bot",            sub: "Click Invite Bot and pick your server." },
      { n: "2", title: "Open the dashboard",        sub: "Select that server from the list above." },
      { n: "3", title: "Configure modules",         sub: "Welcome, Role Menus, Tickets, and more — point-and-click or use /setup." },
      { n: "4", title: "Unlock premium (optional)", sub: "Run /subscribe inside Discord for staff pay, branding, hype, events." },
    ];
    return h("div", { class: "picker-guide" },
      h("div", { class: "picker-section-head" },
        h("h3", null, "Getting started"),
        h("p", null, "Four short steps from zero to a configured server.")
      ),
      h("ol", { class: "picker-stepper" },
        ...steps.map((s) => h("li", { class: "picker-step" },
          h("div", { class: "picker-step-num" }, s.n),
          h("div", null,
            h("div", { class: "picker-step-title" }, s.title),
            h("div", { class: "picker-step-sub" }, s.sub)
          )
        ))
      )
    );
  }

  /* ============================================================
     Per-guild dashboard — premium SaaS layout
     ============================================================ */
  async function renderGuildDashboard() {
    clear(root);
    const guild = state.guilds.find((g) => g.id === state.selectedGuildId);
    const plan = guild?.plan || "free";

    // Mobile drawer toggle bar — only visible <= 980px via CSS.
    // Lets users open the sidebar on phones.
    const mobileBar = h("div", { class: "dash-mobile-bar" },
      h("button", { type: "button", class: "menu-btn", "aria-label": "Open menu",
        onclick: () => {
          const side = root.querySelector(".dash-sidebar");
          if (side) {
            side.classList.toggle("open");
            document.body.classList.toggle("dash-drawer-open", side.classList.contains("open"));
          }
        },
      }, iconSvg("menu")),
      h("div", { class: "label" }, guild?.name || "Dashboard"),
      planPill(plan)
    );
    root.append(mobileBar);

    // Top bar — clean status row
    const topbar = h("div", { class: "dash-userbar" });
    topbar.append(
      h("button", { type: "button", class: "btn btn-ghost", "aria-label": "Back to server picker",
        onclick: () => { state.selectedGuildId = null; render(); } }, "← Servers"),
      guild ? guildIcon(guild) : userAvatar(state.user),
      h("div", { class: "who" },
        h("div", { class: "who-name" }, guild?.name || "Loading…"),
        h("div", { class: "who-sub" },
          (state.user.globalName || state.user.username),
          guild?.id ? h("span", { style: { marginLeft: "8px", color: "var(--dash-muted-2)" } }, "· " + guild.id.slice(-6)) : null
        )
      ),
      h("div", { id: "dash-save-status", class: "dash-save-status" }, "Saved ✓"),
      h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Bot Online"),
      planPill(plan),
      btn("Log out", { kind: "btn-ghost", onclick: handleLogout })
    );
    root.append(topbar);

    // Load modules schema once
    if (!state.modules) {
      try {
        const m = await data.modules();
        state.modules = m.modules || [];
      } catch (e) {
        return renderTabError(root, e);
      }
    }

    const layout = h("div", { class: "dash-layout" });
    layout.append(renderSidebar(plan));
    const content = h("div", { class: "dash-content" });
    layout.append(content);
    root.append(layout);
    renderActiveTab(content);
  }

  /** Premium plan pill — used in top bar + mobile bar */
  function planPill(plan) {
    if (plan === "lifetime") return h("span", { class: "dash-status-pill lifetime" }, h("span", { class: "pill-dot" }), "Lifetime");
    if (plan === "premium" || plan === "monthly") return h("span", { class: "dash-status-pill premium" }, h("span", { class: "pill-dot" }), "Premium");
    return h("span", { class: "dash-status-pill" }, "Free");
  }

  /** Grouped sidebar with icons, sections, premium-locked indicators. */
  function renderSidebar(plan) {
    const isPremium = plan === "premium" || plan === "monthly" || plan === "lifetime";
    const side = h("div", { class: "dash-sidebar", role: "tablist", "aria-label": "Dashboard navigation" });

    // Brand block
    side.append(
      h("div", { class: "dash-side-brand" },
        h("div", { class: "dash-side-brand-mark" }, iconSvg("flag")),
        h("div", { class: "dash-side-brand-text" },
          h("div", { class: "dash-side-brand-name" }, "Quick's ARK Bot"),
          h("div", { class: "dash-side-brand-sub" }, "Dashboard")
        )
      )
    );

    // Build groups dynamically from state.modules
    const free = state.modules.filter((m) => m.tier !== "premium").map((m) => m.name);
    const prem = state.modules.filter((m) => m.tier === "premium").map((m) => m.name);

    const groups = [
      { label: "Core",          items: ["setup-hub", "overview"] },
      { label: "Free Tools",    items: free },
      { label: "Premium Tools", items: prem },
      { label: "System",        items: ["premium", "audit", "support"] },
    ];

    const labels = {
      "setup-hub": "Setup Hub",
      overview:    "Overview",
      premium:     "Premium",
      audit:       "Audit Log",
      support:     "Support",
    };

    groups.forEach((g) => {
      if (!g.items.length) return;
      side.append(h("div", { class: "dash-side-section" }, g.label));
      g.items.forEach((id) => {
        const mod = state.modules.find((m) => m.name === id);
        const label = labels[id] || (mod?.label || id);
        const isPremTier = !!mod && mod.tier === "premium";
        const locked = isPremTier && !isPremium;
        const tab = h("button", {
          type: "button",
          class: `dash-tab ${id === state.activeTab ? "active" : ""} ${locked ? "locked" : ""}`,
          role: "tab",
          "aria-selected": id === state.activeTab ? "true" : "false",
          onclick: () => {
            state.activeTab = id;
            // Close drawer on mobile after picking a tab
            const sb = root.querySelector(".dash-sidebar");
            if (sb && sb.classList.contains("open")) {
              sb.classList.remove("open");
              document.body.classList.remove("dash-drawer-open");
            }
            render();
          },
        });
        tab.append(tabIcon(id), label);
        if (isPremTier) tab.append(h("span", { class: "dash-tab-tier" }, "PRO"));
        if (locked)     tab.append(h("span", { class: "dash-lock" }, iconSvg("lock")));
        side.append(tab);
      });
    });

    // Footer — quick support shortcut
    side.append(
      h("div", { class: "dash-side-foot" },
        btn("Discord", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true }),
        btn("Invite Bot", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true })
      )
    );

    return side;
  }

  function renderActiveTab(content) {
    // Render a couple of shimmer skeleton cards instead of a tiny spinner —
    // gives the dashboard a real "loading" feel during fetch.
    clear(content);
    content.append(renderGenericSkeleton());
    const tab = state.activeTab;
    if (tab === "setup-hub") return loadSetupHub(content);
    if (tab === "overview") return loadOverview(content);
    if (tab === "premium") return renderPremium(content);
    if (tab === "audit") return loadAudit(content);
    if (tab === "support") return renderSupportTab(content);
    return loadModule(content, tab);
  }

  /** Generic shimmer used while a module / tab is loading. */
  function renderGenericSkeleton() {
    return h("div", null,
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-70" })
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-50" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-70" }),
        h("div", { class: "skel skel-line w-50" })
      )
    );
  }

  /** Standardized module-page hero. icon + title + tier + status badge. */
  function renderModuleHero(mod, statusBadge) {
    const ico = h("div", { class: "dash-module-hero-ico" });
    ico.appendChild(iconSvg(TAB_ICONS[mod.name] || "list"));
    return h("div", { class: "dash-module-hero" },
      ico,
      h("div", { class: "dash-module-hero-body" },
        h("div", { class: "dash-module-hero-row" },
          h("h2", { class: "dash-module-hero-title" }, mod.label),
          mod.tier === "premium"
            ? h("span", { class: "dash-status-pill premium" }, h("span", { class: "pill-dot" }), "Premium")
            : h("span", { class: "dash-status-pill" }, "Free"),
          statusBadge || null
        ),
        mod.description ? h("p", { class: "dash-module-hero-desc" }, mod.description) : null
      )
    );
  }

  /** Heuristic: do the saved values look "configured"? Used for the status pill. */
  function detectModuleStatus(mod, values) {
    if (!values || typeof values !== "object") return "missing";
    const enabledField = (mod.fields || []).find((f) => f.key === "enabled");
    if (enabledField) {
      if (values.enabled === true) return "configured";
      return "missing";
    }
    // Otherwise consider it configured if any non-default value is present
    const hasValue = Object.values(values).some((v) =>
      v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0) && v !== false
    );
    return hasValue ? "configured" : "missing";
  }
  function statusBadgeFor(status) {
    if (status === "configured") return h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Configured");
    return h("span", { class: "dash-status-pill warn" }, "Not set up");
  }

  /* ============================================================
     Tab: Setup Hub — mirrors the Discord /setup category grid.
     15 cards, same emojis, status pills, click-to-configure.
     ============================================================ */
  // Mirrors handlers/setup.js HUB_CATEGORIES on the bot. Order
  // matches Discord layout. Each `module` maps the card to a real
  // dashboard module tab; `comingSoon: true` means the dashboard
  // tab isn't wired yet (configure in Discord for now).
  const SETUP_HUB = [
    { id: "levels",      label: "Levels",      emoji: "⚡", module: "xp",            flag: "xp" },
    { id: "welcome",     label: "Welcome",     emoji: "👋", module: "welcome",       flag: "welcome" },
    { id: "roleMenus",   label: "Role Menus",  emoji: "🎭", module: "roleMenus",     flag: "roleMenus" },
    { id: "polls",       label: "Polls",       emoji: "📊", module: "polls",         flag: null },
    { id: "moderation",  label: "Moderation",  emoji: "🛡️", module: "moderation",   flag: "moderation" },
    { id: "tickets",     label: "Tickets",     emoji: "🎫", module: "tickets",       flag: "tickets",    tier: "premium" },
    { id: "credits",     label: "Credits",     emoji: "💰", module: "credits",       flag: "credits",    tier: "premium" },
    { id: "payments",    label: "Payments",    emoji: "💳", module: "payments",      flag: "payments",   tier: "premium" },
    { id: "staffPay",    label: "Staff Pay",   emoji: "💷", module: "staffPay",      flag: "staffPay",   tier: "premium" },
    { id: "hype",        label: "Hype System", emoji: "🔥", module: "hype",          flag: "hype",       tier: "premium" },
    { id: "giveaways",   label: "Giveaways",   emoji: "🎉", module: "giveaways",     flag: null,         tier: "premium" },
    { id: "events",      label: "Events",      emoji: "📋", module: "events",        flag: null,         tier: "premium" },
    { id: "branding",    label: "Branding",    emoji: "🎨", module: "branding",      flag: "branding",   tier: "premium" },
    { id: "suggestions", label: "Suggestions", emoji: "🔔", module: null,            flag: null,         comingSoon: true },
    { id: "sticky",      label: "Sticky",      emoji: "📌", module: null,            flag: null,         comingSoon: true },
  ];

  // One-line descriptions for the Setup Hub cards (mockup style).
  const SETUP_HUB_DESC = {
    levels:      "Reward activity with XP and levels.",
    welcome:     "Greet new members with style.",
    roleMenus:   "Create reaction role menus.",
    polls:       "Run quick role-gated polls.",
    moderation:  "Ban, kick, timeout, URL filter.",
    tickets:     "Manage support tickets easily.",
    credits:     "In-server credits with expiry.",
    payments:    "Accept PayPal payments securely.",
    staffPay:    "Pay your staff automatically.",
    hype:        "Build hype and engage your community.",
    giveaways:   "Run community giveaways.",
    events:      "Dino, Number & Vault credit events.",
    branding:    "Customize bot text, colors and more.",
    suggestions: "Collect member suggestions.",
    sticky:      "Keep a message pinned to the bottom.",
  };

  async function loadSetupHub(content) {
    try {
      const o = await data.overview(state.selectedGuildId);
      const flags = o.setup?.flags || {};
      const isPremium = !!o.premiumActive;
      const setup = o.setup || { percent: 0, total: 0, completedCount: 0 };
      clear(content);

      // ── Two-column shell: main (hero + grid) + right rail ──────────
      const shell = h("div", { class: "hub-shell" });
      const main = h("div", { class: "hub-main" });
      const rail = h("aside", { class: "hub-rail" });
      shell.append(main, rail);
      content.append(shell);

      // Hero band
      main.append(
        h("div", { class: "hub-hero" },
          h("div", { class: "hub-hero-body" },
            h("div", { class: "hub-hero-eyebrow" }, "/ SETUP"),
            h("h1", { class: "hub-hero-title" }, "Setup Hub"),
            h("div", { class: "hub-hero-rule" }),
            h("p", { class: "hub-hero-desc" },
              "Configure and customize your server with Quick's ARK Bot's powerful modules. Every card writes to the same database as ",
              h("code", null, "/setup"), " in Discord.")
          ),
          h("div", { class: "hub-hero-glow", "aria-hidden": "true" })
        )
      );

      // Module card grid
      const grid = h("div", { class: "hub-grid" });
      SETUP_HUB.forEach((cat) => {
        const isConfigured = cat.flag ? !!flags[cat.flag] : null;
        const isLocked = cat.tier === "premium" && !isPremium;
        const card = h("div", {
          class: `hub-card ${isConfigured ? "configured" : ""} ${isLocked ? "locked" : ""}`,
        });
        const iconWrap = h("div", { class: "hub-card-icon" });
        iconWrap.appendChild(iconSvg(TAB_ICONS[cat.module] || "grid"));
        const go = () => {
          if (cat.comingSoon) {
            toast("warn", `${cat.label} is configured in Discord via /setup for now.`, 4500);
            return;
          }
          if (cat.module) { state.activeTab = cat.module; render(); }
        };
        card.append(
          cat.tier === "premium" ? h("span", { class: "hub-card-tier" }, "PRO") : null,
          isConfigured === true ? h("span", { class: "hub-card-check" }, "✓") : null,
          iconWrap,
          h("div", { class: "hub-card-name" }, cat.label),
          h("div", { class: "hub-card-desc" }, SETUP_HUB_DESC[cat.id] || "Configure this module."),
          h("button", { type: "button", class: "hub-card-btn", onclick: go },
            cat.comingSoon ? "Discord only" : "Configure",
            h("span", { class: "hub-card-btn-arrow" }, "›"))
        );
        // Whole card is clickable too
        card.addEventListener("click", (e) => { if (!e.target.closest(".hub-card-btn")) go(); });
        grid.appendChild(card);
      });
      main.append(grid);

      // ── Right rail ────────────────────────────────────────────────
      // Bot status
      rail.append(
        h("div", { class: "hub-rail-card" },
          h("div", { class: "hub-rail-label" }, "Bot Status"),
          h("div", { class: "hub-status-row" },
            h("div", { class: "hub-status-badge" }, "✓"),
            h("div", null,
              h("div", { class: "hub-status-main" }, o.botInstalled ? "Online" : "Not installed"),
              h("div", { class: "hub-status-sub" }, o.botInstalled ? "All systems operational" : "Invite the bot to this server")
            )
          )
        )
      );

      // Server info — real data only
      const g = o.guild || {};
      const created = g.createdAt ? new Date(g.createdAt) : null;
      const planLabel = o.plan === "lifetime" ? "Lifetime"
                      : (o.plan === "premium" || o.plan === "monthly") ? "Premium" : "Free";
      rail.append(
        h("div", { class: "hub-rail-card" },
          h("div", { class: "hub-rail-label" }, "Server Info"),
          h("div", { class: "hub-info-row" }, h("span", null, "Server"),  h("strong", null, g.name || "—")),
          g.memberCount != null
            ? h("div", { class: "hub-info-row" }, h("span", null, "Members"), h("strong", null, g.memberCount.toLocaleString()))
            : null,
          created
            ? h("div", { class: "hub-info-row" }, h("span", null, "Created"), h("strong", null, created.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })))
            : null,
          h("div", { class: "hub-info-row" }, h("span", null, "Plan"), h("strong", null, planLabel)),
          h("div", { class: "hub-info-row" }, h("span", null, "Setup"), h("strong", null, `${setup.percent || 0}% · ${setup.completedCount || 0}/${setup.total || 0}`))
        )
      );

      // Quick actions (real)
      rail.append(
        h("div", { class: "hub-rail-card" },
          h("div", { class: "hub-rail-label" }, "Quick Actions"),
          h("div", { class: "hub-rail-actions" },
            renderHubAction("activity", "Overview",     () => { state.activeTab = "overview"; render(); }),
            renderHubAction("fileText", "Audit Log",    () => { state.activeTab = "audit"; render(); }),
            renderHubAction("plug",     "Invite Bot",   cfg.links?.inviteBot),
            renderHubAction("lifeRing", "Join Support", cfg.links?.supportDiscord)
          )
        )
      );

      // Go Premium (only when not premium)
      if (!isPremium) {
        rail.append(
          h("div", { class: "hub-rail-card hub-premium" },
            h("div", { class: "hub-premium-head" },
              h("span", { class: "hub-premium-crown" }, "♛"),
              h("span", null, "Go Premium")
            ),
            h("p", null, "Unlock Payments, Staff Pay, Hype, Branding, Tickets, Events and more."),
            btn("Upgrade Now", { kind: "btn-primary", onclick: () => { state.activeTab = "premium"; render(); } })
          )
        );
      }
    } catch (e) { renderTabError(content, e); }
  }

  /** Right-rail quick-action row for the Setup Hub. `target` is either a
   *  URL string (external link) or a function (in-app navigation). */
  function renderHubAction(iconName, label, target) {
    const isFn = typeof target === "function";
    const el = h(isFn ? "button" : "a", {
      class: "hub-rail-action",
      type: isFn ? "button" : null,
      href: isFn ? null : (target || "#"),
      target: isFn ? null : "_blank",
      rel: isFn ? null : "noopener noreferrer",
      onclick: isFn ? target : null,
    },
      icon(iconName, "hub-rail-action-ico"),
      h("span", { class: "hub-rail-action-label" }, label),
      h("span", { class: "hub-rail-action-arrow" }, "›")
    );
    return el;
  }

  /* ============================================================
     Tab: Overview
     ============================================================ */
  async function loadOverview(content) {
    // Skeleton while we fetch
    clear(content);
    content.append(renderOverviewSkeleton());
    try {
      const o = await data.overview(state.selectedGuildId);
      clear(content);
      const plan = o.plan || "free";
      const planLabel = plan === "lifetime" ? "Lifetime" : (plan === "monthly" || plan === "premium") ? "Premium" : "Free";
      const expires = o.subscription?.expiresAt ? new Date(o.subscription.expiresAt) : null;
      const setup = o.setup || { percent: 0, completed: [], missing: [], total: 0 };
      const completed = setup.completedCount ?? (setup.completed ? setup.completed.length : 0);

      // Stat grid
      content.append(
        h("div", { class: "dash-stat-grid" },
          renderStatCard({ label: "Plan", value: planLabel, sub: o.subscription?.status || "—", iconName: "sparkle" }),
          renderStatCard({ label: "Setup", value: `${setup.percent}%`, sub: `${completed} of ${setup.total} modules`, iconName: "grid", barPct: setup.percent }),
          renderStatCard({ label: "Bot", value: o.botInstalled ? "Installed" : "Not in server", sub: o.botInstalled ? "Online" : "Invite required", iconName: "plug" }),
          renderStatCard({ label: "Expires", value: expires ? expires.toLocaleDateString() : "—", sub: expires ? "Auto-renew via /subscribe" : "—", iconName: "calendar" })
        )
      );

      // Quick actions
      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Quick actions"),
          h("p", null, "Jump straight into the configuration you need most."),
          h("div", { class: "dash-quick-actions" },
            renderQuickAction("welcome",   "hand",     "Configure Welcome",  "Greet new members with a custom embed."),
            renderQuickAction("roleMenus", "masks",    "Role Menus",         "Build dropdown / button role panels."),
            renderQuickAction("tickets",   "ticket",   "Tickets",            "Forum-based support tickets."),
            renderQuickAction("staffPay",  "wallet",   "Staff Pay",          "Per-role pay amounts + tiers."),
            renderQuickAction("events",    "calendar", "Events",             "Dino / Number / Vault credit events."),
            renderQuickAction("branding",  "palette",  "Branding",           "Customize the bot's embed look.")
          )
        )
      );

      // Setup progress (ring + checklist) — mirrors the mockup's
      // "Bot Setup Progress" panel.
      content.append(renderSetupProgressCard(o));

      // Recent audit (preview, last 6)
      content.append(renderRecentAuditCard());
    } catch (e) { renderTabError(content, e); }
  }

  /** Animated circular progress ring (SVG). Returns a wrapper div. */
  function renderProgressRing(pct, opts) {
    opts = opts || {};
    const size = opts.size || 140;
    const stroke = opts.stroke || 12;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, Math.round(pct || 0)));
    const offset = circ * (1 - clamped / 100);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("class", "ring-svg");
    const mk = (cls) => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", size / 2);
      c.setAttribute("cy", size / 2);
      c.setAttribute("r", r);
      c.setAttribute("fill", "none");
      c.setAttribute("stroke-width", stroke);
      c.setAttribute("class", cls);
      return c;
    };
    const track = mk("ring-track");
    const fill = mk("ring-fill");
    fill.setAttribute("stroke-linecap", "round");
    fill.setAttribute("stroke-dasharray", circ);
    fill.setAttribute("stroke-dashoffset", circ); // start empty
    svg.append(track, fill);
    const wrap = h("div", { class: "ring-wrap", style: { width: size + "px", height: size + "px" } },
      svg,
      h("div", { class: "ring-label" },
        h("div", { class: "ring-pct" }, clamped + "%"),
        h("div", { class: "ring-sub" }, opts.label || "Complete")
      )
    );
    // Animate to target once mounted
    requestAnimationFrame(() => setTimeout(() => { fill.setAttribute("stroke-dashoffset", offset); }, 60));
    return wrap;
  }

  /** "Bot Setup Progress" card — ring on the left, clickable checklist
   *  of every module flag on the right. Real data from /overview. */
  function renderSetupProgressCard(o) {
    const setup = o.setup || { percent: 0, total: 0 };
    const flags = setup.flags || {};
    const entries = Object.entries(flags).filter(([k]) => k !== "population");
    const completed = entries.filter(([, v]) => v).length;

    const ringCol = h("div", { class: "setup-ring-col" },
      renderProgressRing(setup.percent || 0, { label: "Configured" }),
      h("div", { class: "setup-ring-meta" }, `${completed} of ${entries.length} modules`),
      btn("Continue setup", { kind: "btn-primary", onclick: () => { state.activeTab = "setup-hub"; render(); } })
    );

    const checklist = h("div", { class: "setup-checklist" },
      ...entries.map(([k, v]) => h("button", {
        type: "button",
        class: "setup-check-row " + (v ? "done" : "todo"),
        onclick: () => { state.activeTab = mapFlagToModule(k); render(); },
      },
        h("span", { class: "setup-check-box" }, v ? "✓" : ""),
        h("span", { class: "setup-check-name" }, prettyName(k)),
        h("span", { class: "setup-check-state" }, v ? "Configured" : "Set up →")
      ))
    );

    return h("div", { class: "dash-card" },
      h("h3", null, "Bot Setup Progress"),
      h("p", null, "Track configuration across every module. Click a row to jump straight to it."),
      h("div", { class: "setup-progress-grid" }, ringCol, checklist)
    );
  }

  function renderStatCard({ label, value, sub, iconName, barPct }) {
    const card = h("div", { class: "dash-stat" });
    card.append(
      h("div", { class: "dash-stat-l" }, label),
      h("div", { class: "dash-stat-v" }, value),
      h("div", { class: "dash-stat-sub" }, sub || ""),
    );
    if (iconName) {
      const ic = h("span", { class: "dash-stat-ico" });
      ic.appendChild(iconSvg(iconName));
      card.appendChild(ic);
    }
    if (typeof barPct === "number") {
      card.append(h("div", { class: "dash-stat-bar" }, h("i", { style: { width: `${Math.min(100, Math.max(0, barPct))}%` } })));
    }
    return card;
  }

  function renderQuickAction(tabId, iconName, name, desc) {
    return h("button", {
      type: "button",
      class: "dash-quick-action",
      onclick: () => { state.activeTab = tabId; render(); },
    },
      icon(iconName, "dash-quick-action-ico"),
      h("div", { class: "dash-quick-action-body" },
        h("div", { class: "dash-quick-action-name" }, name),
        h("div", { class: "dash-quick-action-desc" }, desc)
      ),
      h("span", { style: { color: "var(--dash-muted-2)" } }, "→")
    );
  }

  /** Inline recent-audit preview (last 6 entries). Loads async, hides on error. */
  function renderRecentAuditCard() {
    const card = h("div", { class: "dash-card" },
      h("h3", null, "Recent activity"),
      h("p", null, "Last few configuration changes from this dashboard."),
      h("div", { id: "dash-recent-audit" }, h("div", { class: "skel skel-line lg w-90" }), h("div", { class: "skel skel-line w-70" }), h("div", { class: "skel skel-line w-50" }))
    );
    data.audit(state.selectedGuildId).then((a) => {
      const host = card.querySelector("#dash-recent-audit");
      if (!host) return;
      clear(host);
      const entries = (a.entries || []).slice(0, 6);
      if (!entries.length) {
        host.append(notice("info", "No recent activity", "Edits, panel posts, and config changes will appear here."));
        return;
      }
      const list = h("div", { class: "dash-audit-list" });
      entries.forEach((e) => {
        list.append(
          h("div", { class: "dash-audit-row" },
            h("span", { class: "dash-audit-time" }, new Date(e.ts).toLocaleString()),
            h("span", { class: `dash-audit-action ${e.ok ? "ok" : "fail"}` }, e.action),
            h("span", { class: "dash-audit-target" }, e.target || "—")
          )
        );
      });
      host.appendChild(list);
    }).catch(() => {
      const host = card.querySelector("#dash-recent-audit");
      if (host) host.replaceWith(h("div"));
    });
    return card;
  }

  /** Shimmer skeleton shown while the Overview fetch is in flight. */
  function renderOverviewSkeleton() {
    const wrap = h("div");
    wrap.append(
      h("div", { class: "skel-stat-grid" },
        ...new Array(4).fill(0).map(() => h("div", { class: "skel-card" },
          h("div", { class: "skel skel-line w-30" }),
          h("div", { class: "skel skel-line lg w-50" }),
          h("div", { class: "skel skel-line w-70" })
        ))
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-70" })
      ),
      h("div", { class: "skel-card" },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-90" }),
        h("div", { class: "skel skel-line w-90" })
      )
    );
    return wrap;
  }

  function renderProgress(pct) {
    return h("div", { style: { height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "999px", overflow: "hidden", marginTop: "12px" } },
      h("div", { style: { height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--red), var(--red-bright))", transition: "width 0.5s" } })
    );
  }

  function mapFlagToModule(flag) {
    const map = { welcome: "welcome", autoRoles: "autoRoles", roleMenus: "roleMenus", population: "population", branding: "branding", payments: "payments", staffPay: "staffPay", hype: "hype", tickets: "tickets", xp: "xp", pets: "pets", credits: "credits", moderation: "moderation" };
    return map[flag] || "overview";
  }
  function prettyName(s) {
    return ({
      welcome: "Welcome", autoRoles: "Auto Roles", roleMenus: "Role Menus", population: "/pop Cluster",
      branding: "Branding", payments: "Payments", staffPay: "Staff Pay", hype: "Hype",
      tickets: "Tickets", xp: "XP / Leaderboards", pets: "Pets", credits: "Credits", moderation: "Moderation"
    }[s]) || s;
  }

  /* ============================================================
     Tab: Module (schema-driven form)
     ============================================================ */
  async function loadModule(content, name) {
    try {
      // Make sure channel/category/role pickers are ready
      if (!state.channels || !state.roles || !state.categories) await loadDiscordLists();

      const m = await data.module(state.selectedGuildId, name);
      clear(content);
      const mod = m.module;

      // Premium gate
      if (m.tierLocked) {
        content.append(
          h("div", { class: "dash-card" },
            h("h3", null, mod.label),
            h("p", null, mod.description),
            notice("warn", "Premium required",
              "This module is part of the Premium plan. Free modules remain active. Use /subscribe inside Discord to activate Premium."),
            h("div", { class: "dash-actions", style: { marginTop: "12px" } },
              btn("View subscribe flow", { kind: "btn-primary", onclick: () => { state.activeTab = "premium"; render(); } }),
              btn("Invite Bot", { kind: "btn-ghost", href: cfg.links?.inviteBot, external: true })
            )
          )
        );
        return;
      }

      // Custom UI modules — render dedicated handlers
      if (mod.customUi) {
        if (mod.name === "branding") return renderBrandingForm(content, mod, m.values);
        if (mod.name === "population") return renderPopulationView(content);
        if (mod.name === "roleMenus") return renderRoleMenusInfo(content);
        if (mod.name === "logs") return loadAudit(content);
      }

      // Generic schema-driven form
      renderModuleForm(content, mod, m.values);

      // Staff Pay gets an extra "Tiers" section below the standard form
      // for per-role pay amounts (ticket basic/medium/advanced + auction %
      // + event payouts). Loads async; failure is silent + non-blocking.
      if (mod.name === "staffPay") {
        renderStaffTiersSection(content);
      }
      // Payments gets an extra PayPal API + Webhooks section below the
      // standard form. Secrets are write-only — backend returns masks.
      if (mod.name === "payments") {
        renderPayPalConfigSection(content);
      }
    } catch (e) { renderTabError(content, e); }
  }

  async function loadDiscordLists() {
    try {
      const [c, cat, r] = await Promise.all([
        data.channels(state.selectedGuildId),
        data.categories(state.selectedGuildId),
        data.roles(state.selectedGuildId),
      ]);
      state.channels = c.channels || [];
      state.categories = cat.categories || [];
      state.roles = r.roles || [];
    } catch (e) {
      state.channels = [];
      state.categories = [];
      state.roles = [];
    }
  }

  /** Optional per-module accordion groups. When a module has an entry
   *  here, its fields are split into collapsible <details> sections so
   *  a long form (XP, Hype, Events, Tickets) becomes scannable. Any
   *  field not listed in a group ends up in a trailing "Other" group.
   *  Modules NOT in this map render as a single flat form (current
   *  behaviour). */
  const MODULE_GROUPS = {
    welcome: [
      { name: "Basic",          fields: ["enabled", "channelId"] },
      { name: "Message",        fields: ["title", "message", "mentionUser"] },
      { name: "Embed design",   fields: ["embedColor", "imageUrl"] },
    ],
    xp: [
      { name: "Basic",                  fields: ["enabled"] },
      { name: "XP rules",               fields: ["xpMin", "xpMax", "cooldownSec"] },
      { name: "Filters",                fields: ["ignoredChannels", "ignoredRoles"] },
      { name: "Level-up announcements", fields: ["levelUpAnnounce", "levelUpChannelId"] },
      { name: "Weekly leaderboard",     fields: ["weeklyResetDay", "weeklyChannelId"] },
      { name: "Rewards",                fields: ["rewardsMode", "rewardType", "reward1stCredits", "reward2ndCredits", "reward3rdCredits", "reward1stEggs", "reward2ndEggs", "reward3rdEggs"] },
    ],
    hype: [
      { name: "Basic",              fields: ["enabled", "rewardChannelId"] },
      { name: "Name / tag triggers",fields: ["tagKeywords", "creditAmount", "creditExpiryDays"] },
      { name: "Reward role",        fields: ["rewardRoleId"] },
      { name: "Other triggers",     fields: ["rewardInvites", "rewardBoosts", "preventDuplicates"] },
    ],
    events: [
      { name: "Basic",        fields: ["enabled", "announceChannelId", "trackChannelId"] },
      { name: "Permissions",  fields: ["pingRoleId", "allowedRoleIds"] },
      { name: "Dino event",   fields: ["dinoBase", "dinoBump", "dinoPer"] },
      { name: "Number guess", fields: ["numberBase", "numberBump", "numberPer"] },
      { name: "Vault event",  fields: ["vaultBase", "vaultBump", "vaultPer"] },
    ],
    tickets: [
      { name: "Basic",   fields: ["enabled", "panelChannelId", "ticketCategoryId"] },
      { name: "Staff",   fields: ["staffRoleIds", "claimEnabled"] },
      { name: "Logging", fields: ["logChannelId", "autoCloseHours"] },
    ],
    payments: [
      { name: "Basic",        fields: ["enabled", "logChannelId"] },
      { name: "Instructions", fields: ["instructions", "manualFallback"] },
    ],
    staffPay: [
      { name: "Basic",   fields: ["enabled", "forumChannelId"] },
      { name: "Payouts", fields: ["payoutRoleIds", "logChannelId"] },
    ],
    moderation: [
      { name: "Basic",      fields: ["enabled", "modLogChannelId", "modRoleIds"] },
      { name: "URL filter", fields: ["urlFilterEnabled", "whitelistDomains"] },
      { name: "Auto-action",fields: ["maxWarnings"] },
    ],
    giveaways: [
      { name: "Basic",   fields: ["enabled", "defaultChannelId"] },
      { name: "Hosts",   fields: ["allowedRoleIds"] },
      { name: "Logging", fields: ["logChannelId"] },
    ],
    autoRoles: [
      { name: "Basic", fields: ["enabled", "roleIds", "ignoreBots"] },
    ],
    pets: [
      { name: "Basic",    fields: ["enabled"] },
      { name: "Channels", fields: ["showLeaderboard", "leaderboardChannelId", "displayChannelId"] },
    ],
    credits: [
      { name: "Basic",  fields: ["enabled", "publicBalance"] },
      { name: "Admin",  fields: ["adminRoleIds"] },
      { name: "Expiry & logging", fields: ["defaultExpiryDays", "logChannelId"] },
    ],
  };

  /** Modules with a live right-rail preview. */
  const MODULES_WITH_PREVIEW = new Set(["welcome"]);

  /** Render fields either as accordion sections (when groups exist for
   *  this module) or as a flat list. Returns the wrapper element so
   *  callers can append it into a form. */
  function renderFieldsGrouped(mod, values) {
    const wrap = h("div", { class: "dash-form-fields" });
    const groups = MODULE_GROUPS[mod.name];
    if (!groups || !groups.length) {
      mod.fields.forEach((f) => wrap.appendChild(renderField(f, values[f.key])));
      return wrap;
    }
    const usedKeys = new Set();
    groups.forEach((g) => {
      const fields = g.fields
        .map((k) => mod.fields.find((f) => f.key === k))
        .filter(Boolean);
      if (!fields.length) return;
      fields.forEach((f) => usedKeys.add(f.key));
      wrap.appendChild(renderFormSection(g.name, fields, values, /* open */ groups.indexOf(g) === 0));
    });
    // Any leftover fields go into "Other"
    const leftover = mod.fields.filter((f) => !usedKeys.has(f.key));
    if (leftover.length) wrap.appendChild(renderFormSection("Other", leftover, values, false));
    return wrap;
  }

  function renderFormSection(name, fields, values, openByDefault) {
    const section = h("details", { class: "dash-form-section" });
    if (openByDefault) section.setAttribute("open", "");
    const summary = h("summary", null,
      h("span", { class: "sec-name" }, name),
      h("span", { class: "sec-count" }, String(fields.length)),
    );
    const chev = h("span", { class: "chev" });
    chev.appendChild(iconSvg("arrowRight"));
    summary.appendChild(chev);
    section.appendChild(summary);
    const body = h("div", { class: "sec-body" });
    fields.forEach((f) => body.appendChild(renderField(f, values[f.key])));
    section.appendChild(body);
    return section;
  }

  function renderModuleForm(content, mod, values) {
    // Hero (icon + name + tier + status)
    content.append(renderModuleHero(mod, statusBadgeFor(detectModuleStatus(mod, values))));

    const card = h("div", { class: "dash-card" });

    // Quick Setup banner — shown only when backend reports it's available
    if (mod.quickSetupAvailable) {
      card.append(renderQuickSetupBanner(mod, content));
    }

    const statusBox = h("div");
    const form = h("form", { class: "dash-form" });
    form.dataset.module = mod.name;

    // Snapshot baseline so we can detect dirty state
    form._baseline = JSON.stringify(values || {});
    form.appendChild(renderFieldsGrouped(mod, values));

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save changes");
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    // Sticky bottom action bar so Save is always reachable, even on long forms
    form.appendChild(
      h("div", { class: "dash-sticky-actions" },
        saveBtn,
        resetBtn,
        h("span", { class: "dash-unsaved" }, h("span", { class: "dot" }), "Unsaved changes"),
        h("div", { class: "filler" }),
        h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)" } },
          mod.tier === "premium" ? "Premium" : "Free", " module")
      )
    );

    // Track dirty state
    form.addEventListener("input", () => updateDirty(form, mod), { capture: true });
    form.addEventListener("change", () => updateDirty(form, mod), { capture: true });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSaveModule(form, mod, statusBox, saveBtn, content);
    });

    card.append(statusBox, form);

    // Two-column layout for modules with a meaningful preview
    if (MODULES_WITH_PREVIEW.has(mod.name)) {
      const grid = h("div", { class: "dash-mod-grid" });
      grid.appendChild(card);
      const aside = h("div", { class: "dash-mod-aside" }, renderModulePreviewPanel(mod, values, form));
      grid.appendChild(aside);
      content.append(grid);
    } else {
      content.append(card);
    }
  }

  /** Build the right-rail preview + tips panel for a module. */
  function renderModulePreviewPanel(mod, values, form) {
    const panel = h("div");
    if (mod.name === "welcome") {
      const card = h("div", { class: "dash-preview-card" },
        h("h4", null, "Live preview"),
        h("div", { id: "dc-preview-welcome" })
      );
      panel.append(card);
      // Build a refresh function the form input listener calls
      const refresh = () => {
        const host = panel.querySelector("#dc-preview-welcome");
        if (!host) return;
        clear(host);
        const v = collectFormValues(form, mod);
        host.appendChild(renderWelcomeEmbedPreview(v));
      };
      form._previewRefresh = refresh;
      // First render
      setTimeout(refresh, 0);

      // Helpful tip card under the preview
      panel.append(
        h("div", { class: "dash-tip" },
          (() => { const i = h("span", { class: "tip-ico" }); i.appendChild(iconSvg("sparkle")); return i; })(),
          h("div", null,
            h("strong", null, "Tips: "),
            "Use ", h("code", null, "{user}"),
            " to mention the new member and ", h("code", null, "{server}"),
            " for the server name."
          )
        )
      );
    }
    return panel;
  }

  /** Discord-style welcome embed preview, driven by the current form. */
  function renderWelcomeEmbedPreview(v) {
    const color = (v && v.embedColor && /^#[0-9a-f]{6}$/i.test(v.embedColor)) ? v.embedColor : "#dc2626";
    const guildName = (state.guilds.find((g) => g.id === state.selectedGuildId)?.name) || "your server";
    const username  = state.user?.username || "newmember";
    const title = (v?.title && v.title.trim())
      ? v.title.replace(/\{server\}/gi, guildName)
      : `🦖  Welcome to ${guildName}!`;
    const message = (v?.message && v.message.trim())
      ? v.message
          .replace(/\{user\}/gi, `@${username}`)
          .replace(/\{server\}/gi, guildName)
      : "Glad you're here! 🎉 Read the rules and say hi.";
    const shell = h("div", { class: "dc-embed-shell", style: { ["--dc-color"]: color } },
      h("div", { class: "dc-embed-bot" },
        h("div", { class: "dc-embed-bot-avatar" }),
        h("div", { class: "dc-embed-bot-name" }, "Quick's ARK Bot"),
        h("span", { class: "dc-embed-bot-tag" }, "APP")
      ),
      v?.mentionUser !== false
        ? h("div", { style: { color: "#fff", marginBottom: "6px", fontSize: "0.86rem" } }, `@${username}`)
        : null,
      h("div", { class: "dc-embed-title" }, title),
      h("div", { class: "dc-embed-desc" }, message),
      v?.imageUrl && /^https:\/\//i.test(v.imageUrl)
        ? h("img", { class: "dc-embed-image", src: v.imageUrl, alt: "", onerror: function(){ this.style.display = "none"; } })
        : null,
      h("div", { class: "dc-embed-footer" }, `${guildName}`)
    );
    return shell;
  }

  /** Mark the form as dirty/clean by comparing live values to baseline. */
  function updateDirty(form, mod) {
    try {
      const live = collectFormValues(form, mod);
      const same = JSON.stringify(live) === form._baseline;
      form.classList.toggle("dirty", !same);
    } catch {}
    // Also refresh the live preview if one is wired
    if (form._previewRefresh) {
      try { form._previewRefresh(); } catch {}
    }
  }

  /* ============================================================
     Quick Setup — wraps the same logic /setup uses in Discord.
     One-click create channels / categories / role-menu panels.
     ============================================================ */

  // Module-specific copy. Keep short, action-oriented.
  const QUICK_SETUP_COPY = {
    welcome: {
      title: "⚡ Quick Setup — Welcome",
      blurb: "Pick a sensible welcome channel automatically (system channel → #welcome → #general → first writable text) and enable welcome messages with the default text. Idempotent — re-runs just update the channel.",
      cta: "Run Welcome Quick Setup",
    },
    tickets: {
      title: "⚡ Quick Setup — Tickets",
      blurb: "Bootstrap the full Support layout: Support category, ticket channels, ticket-logs, staff-pay channel, and staff-earnings forum. Channels are reused if they already exist with similar names.",
      cta: "Run Tickets Quick Setup",
    },
    roleMenus: {
      title: "⚡ Quick Setup — Role Menus",
      blurb: "Auto-create a Ping Roles dropdown using your configured Announcements / Auctions / Events / Giveaways roles, and post it to a channel of your choice. Requires those ping roles to be set (use /setup → Role Menus once if not).",
      cta: "Run Role Menus Quick Setup",
    },
  };

  function renderQuickSetupBanner(mod, content) {
    const copy = QUICK_SETUP_COPY[mod.name] || {
      title: `⚡ Quick Setup — ${mod.label}`,
      blurb: `Run the same Quick Setup ${mod.label} uses in Discord /setup.`,
      cta: `Run Quick Setup`,
    };
    return h("div", { class: "dash-quick-banner" },
      h("div", { class: "dqb-icon" }, "⚡"),
      h("div", { class: "dqb-body" },
        h("div", { class: "dqb-title" }, copy.title),
        h("div", { class: "dqb-blurb" }, copy.blurb)
      ),
      h("button", {
        type: "button",
        class: "btn btn-primary dqb-btn",
        onclick: () => doQuickSetup(mod, content),
      }, copy.cta)
    );
  }

  async function doQuickSetup(mod, content) {
    // Module-specific input gathering
    let body = {};

    if (mod.name === "roleMenus") {
      if (!state.channels) await loadDiscordLists();
      const channelId = await modalChannelPicker(
        "Pick a channel for the Ping Roles menu",
        "The bot will create a dropdown role menu and post it to this channel.",
        state.channels || []
      );
      if (!channelId) return;
      body = { channelId };
    } else {
      const messages = {
        welcome: "Run Welcome Quick Setup? The bot will pick the best welcome channel and enable welcome messages.",
        tickets: "Run Tickets Quick Setup? The bot will create (or reuse) a Support category with ticket channels, log channels, staff-pay, and staff-earnings forum. This may take a few seconds.",
      };
      if (!confirm(messages[mod.name] || `Run Quick Setup for ${mod.label}?`)) return;
    }

    // Run
    const btn = content.querySelector(".dqb-btn");
    const original = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Running…"; }
    try {
      const res = await data.quickSetup(state.selectedGuildId, mod.name, body);
      toast("success", res.summary || `${mod.label} Quick Setup complete.`, 6000);

      // Quick Setup (especially Tickets) creates brand-new Discord channels
      // and roles. The cached state.channels / state.roles lists are now
      // stale — if we re-render the form against them, the channel/role
      // <select>s won't contain an <option> for the freshly-created IDs and
      // will show "— none —" even though the backend saved them correctly.
      // Bust the cache so loadModule re-fetches the live Discord lists.
      state.channels = null;
      state.categories = null;
      state.roles = null;

      // Show a skeleton immediately so the reload feels responsive while
      // we re-fetch channels/roles + module values.
      clear(content);
      content.append(renderGenericSkeleton());
      await loadModule(content, mod.name); // reload to pick up new config
      // Pulse the top-bar Saved indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = original; }
      const msg = e.data?.summary || e.data?.message || e.message || "Quick Setup failed";
      toast("error", msg, 6500);
    }
  }

  /** Channel picker modal — returns Promise<string|null>. */
  function modalChannelPicker(title, blurb, channels) {
    return new Promise((resolve) => {
      const overlay = h("div", { class: "dash-modal-overlay" });
      const close = (value) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(value);
      };
      const sel = renderChannelSelect("modal-channel-select", "channel", channels, "");
      const modal = h("div", { class: "dash-modal" },
        h("h3", null, title),
        h("p", null, blurb),
        h("div", { class: "dash-field", style: { margin: "12px 0" } }, sel),
        h("div", { class: "dash-modal-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => close(null) }, "Cancel"),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => {
            const el = document.getElementById("modal-channel-select");
            const v = el ? el.value : "";
            close(v || null);
          } }, "Confirm")
        )
      );
      overlay.append(modal);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
      document.addEventListener("keydown", function esc(ev) {
        if (ev.key === "Escape") { document.removeEventListener("keydown", esc); close(null); }
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
    });
  }

  function renderField(f, value) {
    const id = `field-${f.key}`;
    const label = h("label", { for: id }, f.label || f.key);
    let input;
    switch (f.type) {
      case "text":
        input = h("input", { id, name: f.key, type: "text", value: value ?? "" });
        if (f.max) input.setAttribute("maxlength", f.max);
        break;
      case "textarea":
        input = h("textarea", { id, name: f.key, rows: 4 }, value ?? "");
        if (f.max) input.setAttribute("maxlength", f.max);
        break;
      case "boolean":
        input = h("label", { class: "dash-switch" },
          h("input", { id, name: f.key, type: "checkbox", checked: !!value }),
          h("span", { class: "slider" }),
          h("span", { class: "switch-label" }, value ? "On" : "Off"));
        break;
      case "integer":
        input = h("input", { id, name: f.key, type: "number", value: value ?? 0,
          min: f.min ?? null, max: f.max ?? null, step: 1 });
        break;
      case "hex":
        input = h("input", { id, name: f.key, type: "color", value: value || "#dc2626" });
        break;
      case "url":
      case "image-url":
        input = h("input", { id, name: f.key, type: "url", value: value ?? "", placeholder: "https://…" });
        break;
      case "channel":
        input = renderChannelSelect(id, f.key, state.channels || [], value);
        break;
      case "category":
        input = renderSelect(id, f.key,
          [{ id: "", name: "— none —" }, ...(state.categories || [])], value,
          (c) => c.id ? "▸ " + c.name : c.name);
        break;
      case "role":
        input = renderSelect(id, f.key, [{ id: "", name: "— none —" }, ...(state.roles || [])], value, (r) => `@${r.name}`);
        break;
      case "channels":
      case "roles":
        input = renderMultiPicker(id, f.key, f.type, value);
        break;
      case "choice":
        input = renderSelect(id, f.key, (f.options || []).map((o) => ({ id: o, name: o })), value);
        break;
      case "keywords":
        input = h("input", { id, name: f.key, type: "text", value: (value || []).join(", "), placeholder: "comma-separated" });
        input.dataset.kind = "keywords";
        break;
      default:
        input = h("div", { style: { fontSize: "0.84rem", color: "var(--text-dim)" } }, `(unsupported field type: ${f.type})`);
    }
    return h("div", { class: "dash-field" }, label, input, f.help ? h("div", { class: "hint" }, f.help) : null);
  }

  function channelHash(c) {
    if (c.id === "") return "";
    if (c.type === 15) return "📋"; // forum
    if (c.type === 5) return "📢"; // announcement
    return "#";          // text (categories never appear in channels list)
  }
  function renderSelect(id, name, options, value, labelFn) {
    const sel = h("select", { id, name });
    options.forEach((o) => {
      const opt = h("option", { value: o.id, selected: (o.id === value) || null }, labelFn ? labelFn(o) : o.name);
      sel.appendChild(opt);
    });
    return sel;
  }

  /** Channel picker — groups channels under their parent category as
      <optgroup> for clearer scanning. Channels without a parent go
      into an "Uncategorized" group at the bottom. */
  function renderChannelSelect(id, name, channels, value) {
    const sel = h("select", { id, name });
    sel.appendChild(h("option", { value: "", selected: !value || null }, "— none —"));
    const byParent = new Map();
    const noParent = [];
    for (const c of channels) {
      if (c.parentName) {
        if (!byParent.has(c.parentName)) byParent.set(c.parentName, []);
        byParent.get(c.parentName).push(c);
      } else {
        noParent.push(c);
      }
    }
    const sortedParents = Array.from(byParent.keys()).sort((a, b) => a.localeCompare(b));
    for (const parent of sortedParents) {
      const group = h("optgroup", { label: parent });
      for (const c of byParent.get(parent)) {
        group.appendChild(h("option", { value: c.id, selected: (c.id === value) || null },
          `${channelHash(c)} ${c.name}`));
      }
      sel.appendChild(group);
    }
    if (noParent.length) {
      const group = h("optgroup", { label: "Uncategorized" });
      for (const c of noParent) {
        group.appendChild(h("option", { value: c.id, selected: (c.id === value) || null },
          `${channelHash(c)} ${c.name}`));
      }
      sel.appendChild(group);
    }
    return sel;
  }
  /**
   * Multi-picker (channels / roles) — search box + selected-on-top + scroll.
   *
   * Why the rewrite: with 30+ roles (Hall-of-Fame Quicks setup) the original
   * "flex-wrap chip cloud" was unusable — chips overflowed the 220px box,
   * users had no way to find a specific role, and selected ones were buried
   * inside the cloud. New layout:
   *   - sticky search input that filters in-place
   *   - "Selected (N)" header above the picked chips (so they're always visible)
   *   - "All N roles" header above the rest
   *   - taller scrollable container (max 360px)
   * `collectFormValues` still reads
   *   wrap.querySelectorAll('input[type="checkbox"]:checked')
   * so the data contract is unchanged.
   */
  function renderMultiPicker(id, name, kind, value) {
    const items = kind === "channels" ? (state.channels || []) : (state.roles || []);
    const selectedSet = new Set(Array.isArray(value) ? value : []);

    const wrap = h("div", { class: "dash-multi", id });
    wrap.dataset.kind = kind;
    wrap.dataset.field = name;

    const search = h("input", {
      type: "search",
      class: "dash-multi-search",
      placeholder: kind === "channels" ? "Search channels…" : "Search roles…",
      autocomplete: "off",
      spellcheck: "false",
    });
    const selectedHeader = h("div", { class: "dash-multi-section" }, "Selected (0)");
    const selectedBox = h("div", { class: "dash-multi-chips" });
    const allHeader = h("div", { class: "dash-multi-section" }, "All");
    const allBox = h("div", { class: "dash-multi-chips" });
    const empty = h("div", { class: "dash-multi-empty" }, "No matches.");
    empty.style.display = "none";

    function labelFor(it) {
      return kind === "channels" ? channelHash(it) + " " + it.name : "@" + it.name;
    }

    function makeChip(it) {
      const checked = selectedSet.has(it.id);
      const cb = h("input", { type: "checkbox", name: `${name}[]`, value: it.id, checked: checked || null });
      const chip = h("label", { class: "dash-chip" + (checked ? " selected" : "") }, cb, labelFor(it));
      cb.addEventListener("change", () => {
        if (cb.checked) selectedSet.add(it.id); else selectedSet.delete(it.id);
        chip.classList.toggle("selected", cb.checked);
        layout(); // re-bucket after toggle
      });
      return chip;
    }

    function layout() {
      const q = (search.value || "").trim().toLowerCase();
      const matches = (it) => !q || it.name.toLowerCase().includes(q);
      clear(selectedBox);
      clear(allBox);
      let selCount = 0;
      let allCount = 0;
      items.forEach((it) => {
        if (!matches(it)) return;
        const chip = makeChip(it);
        if (selectedSet.has(it.id)) {
          selectedBox.appendChild(chip);
          selCount++;
        } else {
          allBox.appendChild(chip);
          allCount++;
        }
      });
      selectedHeader.textContent = `Selected (${selCount})`;
      selectedHeader.style.display = selCount ? "" : "none";
      selectedBox.style.display = selCount ? "" : "none";
      allHeader.textContent = q ? `Matches (${allCount})` : `All ${items.length} ${kind === "channels" ? "channels" : "roles"}`;
      empty.style.display = (selCount + allCount === 0) ? "" : "none";
    }

    search.addEventListener("input", layout);

    wrap.append(search, selectedHeader, selectedBox, allHeader, allBox, empty);
    layout();
    return wrap;
  }

  function collectFormValues(form, mod) {
    const out = {};
    for (const f of mod.fields) {
      if (f.type === "boolean") {
        const el = form.querySelector(`#field-${f.key}`);
        out[f.key] = !!(el && el.checked);
        continue;
      }
      if (f.type === "integer") {
        const el = form.querySelector(`#field-${f.key}`);
        const v = el ? parseInt(el.value, 10) : NaN;
        out[f.key] = Number.isFinite(v) ? v : 0;
        continue;
      }
      if (f.type === "channels" || f.type === "roles") {
        const wrap = form.querySelector(`#field-${f.key}`);
        if (!wrap) { out[f.key] = []; continue; }
        const ids = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
        out[f.key] = ids;
        continue;
      }
      if (f.type === "keywords") {
        const el = form.querySelector(`#field-${f.key}`);
        const raw = el ? el.value : "";
        out[f.key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
        continue;
      }
      const el = form.querySelector(`#field-${f.key}`);
      out[f.key] = el ? el.value : "";
    }
    return out;
  }

  /** Map a server-returned `invalid_<fieldKey>` token back to a human label
   *  from the module schema so the user knows what to fix. */
  function fieldLabelFromErrorToken(mod, token) {
    if (typeof token !== "string" || !token.startsWith("invalid_")) return token;
    const key = token.slice("invalid_".length);
    const f = (mod.fields || []).find((x) => x.key === key);
    return f ? (f.label || key) : key;
  }

  /** Clear any "invalid" highlight added by a prior save attempt. */
  function clearFieldErrors(form) {
    form.querySelectorAll(".dash-field.has-error").forEach((el) => el.classList.remove("has-error"));
  }
  function markFieldError(form, key) {
    const f = form.querySelector(`#field-${key}`);
    if (!f) return;
    const wrap = f.closest(".dash-field");
    if (wrap) wrap.classList.add("has-error");
  }

  async function doSaveModule(form, mod, statusBox, saveBtn, content) {
    clear(statusBox);
    clearFieldErrors(form);
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const payload = collectFormValues(form, mod);
      const res = await data.saveModule(state.selectedGuildId, mod.name, payload);
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      toast("success", `${mod.label} saved`);
      statusBox.append(notice("success", "Saved", "Settings are live for this server."));
      // Pulse the top-bar "Saved ✓" indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) {
        stat.classList.add("show");
        setTimeout(() => stat.classList.remove("show"), 1800);
      }
      // Re-render the form from the server's merged values so the user
      // visibly sees that the change persisted (and so multi-pickers /
      // checkboxes show the exact state the backend now has). Falls back
      // to refetching if the response doesn't include `values`.
      if (content) {
        if (res && res.values) {
          // Lightweight: just refetch the whole module GET so any
          // server-side normalization (e.g. dedupe, default fill) is
          // reflected in the visible form fields.
          loadModule(content, mod.name);
        } else {
          loadModule(content, mod.name);
        }
      }
    } catch (e) {
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      if (e.code === 403 && e.data?.error === "premium_required") {
        statusBox.append(notice("warn", "Premium required", e.data?.message || "Activate Premium with /subscribe in Discord."));
        return;
      }
      if (e.code === 400 && Array.isArray(e.data?.errors)) {
        // Highlight each invalid field on the form so user can find it
        const labels = [];
        e.data.errors.forEach((tok) => {
          const key = typeof tok === "string" && tok.startsWith("invalid_") ? tok.slice("invalid_".length) : null;
          if (key) markFieldError(form, key);
          labels.push(fieldLabelFromErrorToken(mod, tok));
        });
        toast("error", `${mod.label}: fix ${labels.length} field${labels.length === 1 ? "" : "s"}`, 4500);
        statusBox.append(notice("error", "Some fields are invalid",
          `Fix and try again: ${labels.join(", ")}`));
        // Scroll first invalid into view so user notices it
        const firstBad = form.querySelector(".dash-field.has-error");
        if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      toast("error", e.message || "Save failed");
      statusBox.append(notice("error", "Save failed", e.message));
    }
  }

  async function doResetModule(mod, content) {
    if (!confirm(`Reset all ${mod.label} settings to default?`)) return;
    try {
      await data.resetModule(state.selectedGuildId, mod.name);
      toast("success", `${mod.label} reset`);
      loadModule(content, mod.name);
    } catch (e) {
      toast("error", e.message || "Reset failed");
    }
  }

  /* ============================================================
     Tab: Branding (bespoke with live preview)
     ============================================================ */
  function renderBrandingForm(content, mod, values) {
    const v = values || {};
    const card = h("div", { class: "dash-card" }, h("h3", null, "Branding"), h("p", null, mod.description));
    const statusBox = h("div");
    const form = h("form", { class: "dash-form" });

    mod.fields.forEach((f) => form.appendChild(renderField(f, v[f.key])));

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save changes");
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    form.appendChild(h("div", { class: "dash-actions" }, saveBtn, resetBtn));

    form.addEventListener("submit", (e) => { e.preventDefault(); doSaveModule(form, mod, statusBox, saveBtn, content); });

    const previewWrap = h("div", { class: "dash-card" }, h("h3", null, "Live preview"), h("div", { id: "brand-preview-host" }));
    function refresh() {
      const color = form.querySelector("#field-embedColor")?.value || "#dc2626";
      const brand = form.querySelector("#field-brandName")?.value || "Quick's ARK Bot";
      const footer = form.querySelector("#field-footerText")?.value || `${brand} · v1`;
      const host = previewWrap.querySelector("#brand-preview-host");
      clear(host);
      host.append(
        h("div", { class: "preview-embed", style: { "--brand-accent": color, borderLeftColor: color } },
          h("div", { class: "pe-title" }, `${brand} · /pop Cluster Population`),
          h("div", { class: "pe-desc" }, "Total players: 184 / 620 · 11 / 12 maps online · Peak today 231"),
          h("div", { class: "pe-footer" }, footer)
        )
      );
    }
    form.addEventListener("input", refresh);

    card.append(statusBox, form);
    content.append(card, previewWrap);
    refresh();
  }

  /* ============================================================
     Tab: /pop Population (read-only with link to Discord)
     ============================================================ */
  async function renderPopulationView(content) {
    try {
      const p = await api(`/api/dashboard/guilds/${state.selectedGuildId}/population`);
      clear(content);
      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "/pop Cluster Population"),
          h("p", null, "Free for every server. Cluster CRUD currently lives in Discord — run ", h("code", null, "/setup › Cluster Population"), ". The dashboard previews configured clusters.")
        )
      );
      if (p.notice === "population_config_not_wired" || !p.clusters?.length) {
        content.append(
          notice("info", "No clusters configured", "Run /setup in Discord to add your first cluster. The dashboard will list them here."),
          h("div", { class: "dash-actions", style: { marginTop: "12px" } },
            btn("Open in Discord", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true })
          )
        );
        return;
      }
      (p.clusters || []).forEach((c) => {
        content.append(
          h("div", { class: "dash-card" },
            h("h3", null, c.name || "Unnamed cluster"),
            h("dl", { class: "meta" },
              h("dt", null, "Provider"), h("dd", null, c.provider || "manual"),
              h("dt", null, "Visibility"), h("dd", null, c.public ? "Public" : "Private"),
              h("dt", null, "Maps"), h("dd", null, (c.maps && c.maps.length) || 0),
              h("dt", null, "Last updated"), h("dd", null, c.lastUpdated ? new Date(c.lastUpdated).toLocaleString() : "—"),
              h("dt", null, "Cached total"), h("dd", null, c.cachedTotal != null ? c.cachedTotal : "—")
            )
          )
        );
      });
    } catch (e) { renderTabError(content, e); }
  }

  /* ============================================================
     Tab: Role Menus (info card, deeper UI on roadmap)
     ============================================================ */
  /* ============================================================
     Role Menus — full CRUD: profiles → options → post to Discord
     ============================================================ */

  // Local state for which menu we're editing (null = list view)
  let _rmEditingId = null;

  async function renderRoleMenusInfo(content) {
    if (!state.channels || !state.roles) await loadDiscordLists();
    if (_rmEditingId) return renderRoleMenuDetail(content, _rmEditingId);
    return renderRoleMenuList(content);
  }

  async function renderRoleMenuList(content) {
    try {
      const r = await data.rmList(state.selectedGuildId);
      const menus = r.menus || [];
      clear(content);

      // Header card — only show "+ New Menu" CTA here when at least one
      // menu exists. When empty, the empty-state below owns the CTA so we
      // don't have two competing buttons on one screen.
      const header = h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "Role Menus"),
            h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
              "Build role-selection panels — dropdowns or buttons — and post them to any channel. No artificial limits.")
          ),
          menus.length
            ? h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateMenuModal(content) }, "+ New Menu")
            : null
        )
      );
      content.append(header);

      // Quick Setup banner (still useful for "auto Ping Roles menu")
      data.module(state.selectedGuildId, "roleMenus").then((mod) => {
        if (mod.module?.quickSetupAvailable) {
          const card = h("div", { class: "dash-card" });
          card.append(renderQuickSetupBanner(mod.module, content));
          header.after(card);
        }
      }).catch(() => {});

      // Empty state — owns the create CTA when no menus exist
      if (!menus.length) {
        content.append(
          h("div", { class: "dash-card", style: { textAlign: "center", padding: "44px 24px" } },
            h("div", { style: { fontSize: "2.4rem", marginBottom: "10px" } }, "🎭"),
            h("h4", { style: { margin: "0 0 6px", fontSize: "1.08rem" } }, "No role menus yet"),
            h("p", { style: { color: "var(--text-muted)", margin: "0 0 20px", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" } },
              "Create one to let members pick roles from a dropdown or button panel. You can post it to any channel and update it any time."),
            h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateMenuModal(content) },
              "+ Create your first menu")
          )
        );
        return;
      }

      // Menu cards
      const grid = h("div", { class: "rm-list" });
      menus.forEach((m) => grid.appendChild(renderMenuCard(m, content)));
      content.append(grid);
    } catch (e) { renderTabError(content, e); }
  }

  function renderMenuCard(m, content) {
    const ch = (state.channels || []).find((c) => c.id === m.channelId);
    const card = h("button", { type: "button", class: "rm-card", onclick: () => { _rmEditingId = m.id; renderActiveTab(content); } },
      h("div", { class: "rm-card-top" },
        h("div", { class: "rm-card-icon" }, m.type === "button" ? "▢" : "▾"),
        h("div", { class: "rm-card-info" },
          h("div", { class: "rm-card-name" }, m.name),
          h("div", { class: "rm-card-sub" },
            ch ? `${ch.type === 15 ? "📋" : "#"} ${ch.name}` : "(channel missing)",
            " · ",
            `${m.options.length} option${m.options.length === 1 ? "" : "s"}`
          )
        ),
        m.posted
          ? h("span", { class: "rm-tag posted" }, "Posted")
          : h("span", { class: "rm-tag draft" }, "Draft")
      ),
      h("div", { class: "rm-card-meta" },
        h("span", { class: "rm-meta-pill" }, m.type === "button" ? "Buttons" : "Dropdown"),
        h("span", { class: "rm-card-arrow" }, "→")
      )
    );
    return card;
  }

  async function openCreateMenuModal(content) {
    const form = h("form");
    const nameInput = h("input", { id: "rm-new-name", type: "text", placeholder: "e.g. Ping Roles", maxlength: 64 });
    const descInput = h("input", { id: "rm-new-desc", type: "text", placeholder: "Pick the pings you want to get", maxlength: 256 });
    const typeSelect = h("select", { id: "rm-new-type" },
      h("option", { value: "dropdown", selected: true }, "Dropdown (single panel)"),
      h("option", { value: "button" }, "Buttons (one per role)")
    );
    const channelSelect = renderChannelSelect("rm-new-channel", "channel", state.channels || [], "");

    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-name" }, "Menu name"), nameInput));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-desc" }, "Description (optional)"), descInput));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-type" }, "Type"), typeSelect));
    form.appendChild(h("div", { class: "dash-field" }, h("label", { for: "rm-new-channel" }, "Post in channel"), channelSelect));

    const result = await modalForm("Create new role menu", form);
    if (!result) return;

    try {
      const r = await data.rmCreate(state.selectedGuildId, {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
        type: typeSelect.value,
        channelId: channelSelect.value,
      });
      toast("success", `Created "${r.menu.name}".`);
      _rmEditingId = r.menu.id;
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Couldn't create menu");
    }
  }

  async function renderRoleMenuDetail(content, menuId) {
    try {
      const r = await data.rmGet(state.selectedGuildId, menuId);
      const m = r.menu;
      clear(content);

      // Back + identity + actions row
      content.append(
        h("div", { class: "dash-card" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
            h("button", { type: "button", class: "btn btn-ghost", onclick: () => { _rmEditingId = null; renderActiveTab(content); } }, "← All menus"),
            h("div", { style: { flex: 1 } },
              h("h3", { style: { margin: 0 } }, m.name),
              h("div", { style: { color: "var(--text-muted)", fontSize: "0.86rem", marginTop: "2px" } },
                m.posted ? h("span", { class: "rm-tag posted" }, "Posted to Discord") : h("span", { class: "rm-tag draft" }, "Draft — not posted yet")
              )
            ),
            h("button", { type: "button", class: "btn btn-primary", onclick: () => doPostMenu(menuId, content) },
              m.posted ? "🔄 Re-post" : "📤 Post to Discord"),
            h("button", { type: "button", class: "btn btn-ghost", onclick: () => doDeleteMenu(menuId, content) },
              "Delete menu")
          )
        )
      );

      // Menu settings form
      content.append(renderMenuSettings(m, content));

      // Options editor
      content.append(renderOptionsEditor(m, content));
    } catch (e) { renderTabError(content, e); }
  }

  function renderMenuSettings(m, content) {
    const nameInput = h("input", { id: "rm-edit-name", type: "text", value: m.name, maxlength: 64 });
    const descInput = h("input", { id: "rm-edit-desc", type: "text", value: m.description || "", maxlength: 256 });
    const typeSelect = h("select", { id: "rm-edit-type" },
      h("option", { value: "dropdown", selected: m.type === "dropdown" || null }, "Dropdown (single panel)"),
      h("option", { value: "button", selected: m.type === "button" || null }, "Buttons (one per role)")
    );
    const channelSelect = renderChannelSelect("rm-edit-channel", "channel", state.channels || [], m.channelId);

    const card = h("div", { class: "dash-card" },
      h("h4", { style: { margin: "0 0 12px" } }, "Menu settings"),
      h("div", { class: "dash-form" },
        h("div", { class: "dash-field" }, h("label", { for: "rm-edit-name" }, "Menu name"), nameInput),
        h("div", { class: "dash-field" }, h("label", { for: "rm-edit-desc" }, "Description"), descInput),
        h("div", { class: "dash-form-row" },
          h("div", { class: "dash-field" }, h("label", { for: "rm-edit-type" }, "Type"), typeSelect),
          h("div", { class: "dash-field" }, h("label", { for: "rm-edit-channel" }, "Post in channel"), channelSelect)
        ),
        h("div", { class: "dash-actions" },
          h("button", { type: "button", class: "btn btn-primary", onclick: () => doSaveMenu(m.id, content) }, "Save settings")
        )
      )
    );
    return card;
  }

  async function doSaveMenu(menuId, content) {
    const body = {
      name: document.getElementById("rm-edit-name").value.trim(),
      description: document.getElementById("rm-edit-desc").value.trim(),
      type: document.getElementById("rm-edit-type").value,
      channelId: document.getElementById("rm-edit-channel").value,
    };
    try {
      await data.rmUpdate(state.selectedGuildId, menuId, body);
      toast("success", "Menu settings saved");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Save failed");
    }
  }

  function renderOptionsEditor(m, content) {
    const list = h("div", { class: "rm-options" });
    m.options.forEach((o) => list.appendChild(renderOptionRow(m, o, content)));

    // Add option form
    const addForm = renderAddOptionForm(m, content);

    return h("div", { class: "dash-card" },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" } },
        h("h4", { style: { margin: 0 } }, "Role options"),
        h("span", { style: { color: "var(--text-dim)", fontSize: "0.82rem" } },
          `${m.options.length} / 25 options`)
      ),
      m.options.length ? list : h("div", { class: "rm-empty" }, "No options yet. Add the first role below."),
      addForm
    );
  }

  function renderOptionRow(m, o, content) {
    const role = (state.roles || []).find((r) => r.id === o.roleId);
    const row = h("div", { class: "rm-option-row" },
      h("div", { class: "rm-option-emoji" }, o.emoji || "·"),
      h("div", { class: "rm-option-info" },
        h("div", { class: "rm-option-label" }, o.label),
        h("div", { class: "rm-option-role" },
          role ? `@${role.name}` : `(role missing: ${o.roleId})`,
          o.description ? ` · ${o.description}` : ""
        )
      ),
      h("button", { type: "button", class: "btn btn-ghost rm-option-del", title: "Remove option",
        onclick: () => doDeleteOption(m.id, o.id, content) }, "×")
    );
    return row;
  }

  function renderAddOptionForm(m, content) {
    if (m.options.length >= 25) {
      return h("div", { class: "rm-empty" }, "Maximum of 25 options reached.");
    }
    const roleSel = renderSelect("rm-add-role", "role", [{ id: "", name: "— pick a role —" }, ...(state.roles || [])], "", (r) => r.id ? `@${r.name}` : r.name);
    const labelIn = h("input", { id: "rm-add-label", type: "text", placeholder: "Label shown in menu", maxlength: 80 });
    const descIn = h("input", { id: "rm-add-desc", type: "text", placeholder: "Description (optional)", maxlength: 100 });
    const emojiIn = h("input", { id: "rm-add-emoji", type: "text", placeholder: "🎮", maxlength: 32, style: { textAlign: "center" } });
    const emojiBtn = h("button", {
      type: "button",
      class: "btn btn-ghost emoji-pick-btn",
      title: "Pick an emoji",
      onclick: (e) => openEmojiPicker(emojiIn, e.currentTarget),
    }, "😀");
    const wrap = h("div", { class: "rm-add-form" },
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-role" }, "Role"), roleSel),
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-label" }, "Label"), labelIn),
      h("div", { class: "rm-add-grid" },
        h("div", { class: "dash-field" },
          h("label", { for: "rm-add-emoji" }, "Emoji"),
          h("div", { class: "emoji-input-group" }, emojiIn, emojiBtn)
        ),
        h("div", { class: "dash-field" }, h("label", { for: "rm-add-desc" }, "Description"), descIn)
      ),
      h("button", { type: "button", class: "btn btn-primary",
        onclick: () => doAddOption(m.id, roleSel, labelIn, descIn, emojiIn, content) }, "+ Add option")
    );
    return wrap;
  }

  /* ============================================================
     Emoji picker — categorized unicode emoji popover
     ============================================================
     Used by role-menu option rows. Click the 😀 button next to an
     emoji input to open the picker; click an emoji to insert it
     into the bound input. Escape / click-outside dismisses it.
  */
  const EMOJI_CATEGORIES = [
    {
      name: "ARK & Gaming",
      emojis: ["🦖","🦕","🐉","🐲","🦅","🦁","🐺","🐗","🐍","🕷️","🦂","🦴","💀","☠️","⚔️","🗡️","🛡️","🏹","🪓","⛏️","🔫","💣","🎮","🕹️","🎯","🏆","🏅","🥇","🥈","🥉","🎖️","🏟️"]
    },
    {
      name: "Pings & Hype",
      emojis: ["📢","📣","🔔","🔕","🎉","🎊","🎁","🎀","🪅","🪩","✨","⭐","🌟","💫","🔥","⚡","💥","🚀","💎","🪙","💰","💵","💸","🎈","🎆","🎇"]
    },
    {
      name: "Roles & Staff",
      emojis: ["👑","🛡️","⚔️","🎖️","🏆","🥇","🥈","🥉","🎗️","📛","💼","🧑‍💼","👨‍💻","🧑‍💻","🧙‍♂️","🧙","🧝‍♂️","🦸‍♂️","🦹‍♂️","🥷","🧛","🏴‍☠️"]
    },
    {
      name: "Tickets & Support",
      emojis: ["🎫","🎟️","📩","📨","💬","🗨️","🆘","⛑️","🔧","🛠️","⚙️","📋","📝","✉️","📞","☎️","📡","🗣️","👂","🙋","🙋‍♂️","🙋‍♀️"]
    },
    {
      name: "Status & Reactions",
      emojis: ["✅","❌","⚠️","ℹ️","❓","❗","‼️","⁉️","✔️","❎","✳️","❇️","🟢","🟡","🔴","🟠","🟣","🔵","⚫","⚪","🔘","🚫","⛔","📵"]
    },
    {
      name: "Hearts & Faces",
      emojis: ["❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💖","💗","💓","💞","💕","💔","💯","💢","💨","💦","💤","🫶","🤝","👍","👎","👏","🙏","🤘","✊","✌️","🫡","🤔","😎","😅","😂","🤣","😤","😡","🥳","🤩","😍","😭","🥺"]
    },
    {
      name: "Communication",
      emojis: ["💬","🗨️","🗯️","💭","🔊","🔇","📡","📨","📩","📧","📮","📬","📭","📪","📫","✏️","📌","📍","🔖","🏷️"]
    },
    {
      name: "Misc",
      emojis: ["🌍","🌎","🌏","🌐","🗺️","⏰","⏳","⌛","🔒","🔓","🔑","🗝️","💾","💿","📀","💼","📁","📂","🧰","🧲","🔗","⚗️","🧪","🔬","🔭","📊","📈","📉"]
    },
  ];

  let _emojiPickerEl = null;

  function closeEmojiPicker() {
    if (_emojiPickerEl) {
      _emojiPickerEl.remove();
      _emojiPickerEl = null;
      document.removeEventListener("click", _emojiPickerOutside, true);
      document.removeEventListener("keydown", _emojiPickerEsc, true);
    }
  }
  function _emojiPickerOutside(ev) {
    if (_emojiPickerEl && !_emojiPickerEl.contains(ev.target) && !ev.target.closest(".emoji-pick-btn")) {
      closeEmojiPicker();
    }
  }
  function _emojiPickerEsc(ev) {
    if (ev.key === "Escape") closeEmojiPicker();
  }

  /** Open the emoji picker above the given button, inserting the chosen
   *  emoji into `targetInput.value`. */
  function openEmojiPicker(targetInput, anchorBtn) {
    closeEmojiPicker();
    const popover = h("div", { class: "emoji-popover" });

    const search = h("input", {
      type: "search",
      class: "emoji-search",
      placeholder: "Search emojis…",
      autocomplete: "off",
    });
    const tabs = h("div", { class: "emoji-tabs" });
    const grid = h("div", { class: "emoji-grid" });
    const empty = h("div", { class: "emoji-empty" }, "No matches.");
    empty.style.display = "none";

    function pick(e) {
      targetInput.value = e;
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      closeEmojiPicker();
    }

    function renderCategory(cat) {
      clear(grid);
      cat.emojis.forEach((e) => {
        grid.appendChild(h("button", { type: "button", class: "emoji-btn", title: e, onclick: () => pick(e) }, e));
      });
      empty.style.display = "none";
    }

    function renderSearch(q) {
      clear(grid);
      const needle = q.trim().toLowerCase();
      let hits = 0;
      EMOJI_CATEGORIES.forEach((cat) => {
        cat.emojis.forEach((e) => {
          // Crude name match using category name as label hint
          if (cat.name.toLowerCase().includes(needle) || e.includes(needle)) {
            grid.appendChild(h("button", { type: "button", class: "emoji-btn", title: e, onclick: () => pick(e) }, e));
            hits++;
          }
        });
      });
      empty.style.display = hits ? "none" : "";
    }

    EMOJI_CATEGORIES.forEach((cat, i) => {
      const tab = h("button", {
        type: "button",
        class: "emoji-tab" + (i === 0 ? " active" : ""),
        title: cat.name,
        onclick: () => {
          tabs.querySelectorAll(".emoji-tab").forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");
          search.value = "";
          renderCategory(cat);
        },
      }, cat.emojis[0]); // use first emoji as the tab icon
      tabs.appendChild(tab);
    });

    search.addEventListener("input", () => {
      if (search.value.trim()) renderSearch(search.value);
      else renderCategory(EMOJI_CATEGORIES[0]);
    });

    popover.append(search, tabs, grid, empty);
    document.body.appendChild(popover);
    _emojiPickerEl = popover;

    // Position above anchor button (prefer above; fall back to below)
    const rect = anchorBtn.getBoundingClientRect();
    const popH = 320;
    const popW = 320;
    const top = rect.top + window.scrollY - popH - 8;
    const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - popW - 8));
    if (top > window.scrollY + 8) {
      popover.style.top = top + "px";
    } else {
      popover.style.top = (rect.bottom + window.scrollY + 8) + "px";
    }
    popover.style.left = left + "px";

    renderCategory(EMOJI_CATEGORIES[0]);

    // Bind close handlers (deferred so this click doesn't immediately close)
    setTimeout(() => {
      document.addEventListener("click", _emojiPickerOutside, true);
      document.addEventListener("keydown", _emojiPickerEsc, true);
    }, 0);
  }

  async function doAddOption(menuId, roleSel, labelIn, descIn, emojiIn, content) {
    const body = {
      roleId: roleSel.value,
      label: labelIn.value.trim(),
      description: descIn.value.trim(),
      emoji: emojiIn.value.trim() || null,
    };
    if (!body.roleId) return toast("error", "Pick a role first");
    if (!body.label) return toast("error", "Add a label");
    try {
      await data.rmOptAdd(state.selectedGuildId, menuId, body);
      toast("success", "Option added");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message || "Couldn't add option");
    }
  }

  async function doDeleteOption(menuId, optionId, content) {
    if (!confirm("Remove this option from the menu?")) return;
    try {
      await data.rmOptDelete(state.selectedGuildId, menuId, optionId);
      toast("success", "Option removed");
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message);
    }
  }

  async function doPostMenu(menuId, content) {
    try {
      const r = await data.rmPost(state.selectedGuildId, menuId);
      toast("success", r.summary || "Menu posted to Discord", 5000);
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.data?.summary || e.message || "Couldn't post menu", 5500);
    }
  }

  async function doDeleteMenu(menuId, content) {
    if (!confirm("Delete this entire role menu? The Discord message will be deleted too.")) return;
    try {
      await data.rmDelete(state.selectedGuildId, menuId);
      toast("success", "Menu deleted");
      _rmEditingId = null;
      renderActiveTab(content);
    } catch (e) {
      toast("error", e.message);
    }
  }

  /** Generic form modal — confirms or cancels, returns Promise<boolean>.
   *  opts: { okLabel?: string }
   */
  function modalForm(title, formNode, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = h("div", { class: "dash-modal-overlay" });
      const close = (ok) => {
        overlay.classList.remove("show");
        setTimeout(() => overlay.remove(), 200);
        resolve(ok);
      };
      const modal = h("div", { class: "dash-modal" },
        h("h3", null, title),
        formNode,
        h("div", { class: "dash-modal-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => close(false) }, "Cancel"),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => close(true) }, opts.okLabel || "Create")
        )
      );
      overlay.append(modal);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", function esc(ev) {
        if (ev.key === "Escape") { document.removeEventListener("keydown", esc); close(false); }
      });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("show"));
    });
  }

  /* ============================================================
     PayPal API + Webhooks — appears below the Payments form.
     ============================================================
     Secrets (client_id, client_secret, webhook_id) are write-only:
     the backend never sends the actual values back, only:
       { configured: true|false, source: 'guild'|'env'|'unset',
         last4: '...' }
     The UI shows the masked state, lets the user enter a NEW value
     to overwrite, or click Clear to fall back to the env default.
     Includes a Test Connection button that hits PayPal's OAuth
     endpoint with the stored credentials.
  */
  async function renderPayPalConfigSection(content) {
    const host = h("div", { class: "dash-paypal-host" });
    content.append(host);
    host.append(h("div", { class: "skel-card" },
      h("div", { class: "skel skel-line lg w-30" }),
      h("div", { class: "skel skel-line w-90" }),
      h("div", { class: "skel skel-line w-70" })
    ));
    try {
      const r = await data.paypalGet(state.selectedGuildId);
      renderPayPalInto(host, r);
    } catch (e) {
      clear(host);
      if (e.code === 403) return; // tierLocked already shown above
      host.append(notice("warn", "Couldn't load PayPal config", e.message || "Backend error"));
    }
  }

  function renderPayPalInto(host, cfg) {
    clear(host);

    // ── Header card with status pill + brief explanation ───────────
    const statusPill = cfg.isConfigured
      ? h("span", { class: "dash-status-pill ok" }, h("span", { class: "pill-dot" }), "Configured")
      : h("span", { class: "dash-status-pill warn" }, "Not set up");
    const preferredLabel =
      cfg.preferredMode === "orders"   ? "PayPal Orders API (auto-confirm)" :
      cfg.preferredMode === "paypalme" ? "PayPal.me link (manual)" :
      "Not configured";

    host.append(
      h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "PayPal API & Webhooks"),
            h("p", { style: { margin: "4px 0 0", color: "var(--dash-muted)" } },
              "Wire up your own PayPal app so /payment can issue checkouts and auto-confirm via webhooks. Currently active flow: ",
              h("strong", null, preferredLabel), ".")
          ),
          statusPill
        )
      )
    );

    // ── Webhook URLs (read-only, copyable) ─────────────────────────
    host.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Webhook & return URLs"),
        h("p", null, "Paste these into your PayPal Developer dashboard when creating the app."),
        copyRow("Webhook URL", cfg.webhookUrl, "Add this as a Webhook in your PayPal app."),
        copyRow("Return URL",  cfg.returnUrl,  "Used after successful payment."),
        copyRow("Cancel URL",  cfg.cancelUrl,  "Used if the buyer cancels.")
      )
    );

    // ── Credentials editor ─────────────────────────────────────────
    const form = h("form", { class: "dash-form", onsubmit: (e) => { e.preventDefault(); doSavePayPal(host, form, saveBtn); } });

    // Mode select
    const modeSel = h("select", { id: "pp-mode" },
      h("option", { value: "live",    selected: (cfg.mode === "live")    || null }, "Live"),
      h("option", { value: "sandbox", selected: (cfg.mode === "sandbox") || null }, "Sandbox")
    );
    // Prefer select
    const preferSel = h("select", { id: "pp-prefer" },
      h("option", { value: "orders",   selected: (cfg.prefer === "orders")   || null }, "Orders API (auto-confirm)"),
      h("option", { value: "paypalme", selected: (cfg.prefer === "paypalme") || null }, "PayPal.me link (manual)")
    );

    const brandIn   = h("input", { id: "pp-brand",  type: "text", value: cfg.brandName || "", placeholder: "Quick's ARK", maxlength: 128 });
    const handleIn  = h("input", { id: "pp-handle", type: "text", value: cfg.paypalMeHandle || "", placeholder: "yourhandle", maxlength: 64 });

    const cidIn     = h("input", { id: "pp-cid",  type: "password", autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.clientId) });
    const cidShow   = makeShowToggle(cidIn);
    const csIn      = h("input", { id: "pp-cs",   type: "password", autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.clientSecret) });
    const csShow    = makeShowToggle(csIn);
    const whIn      = h("input", { id: "pp-wh",   type: "text",     autocomplete: "off", spellcheck: "false", placeholder: secretPlaceholder(cfg.webhookId) });

    form.append(
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "pp-mode" }, "Mode"), modeSel,
          h("div", { class: "hint" }, "Use Sandbox while testing. Switch to Live once your PayPal app is approved.")),
        h("div", { class: "dash-field" }, h("label", { for: "pp-prefer" }, "Preferred flow"), preferSel,
          h("div", { class: "hint" }, "Orders API auto-confirms payments. PayPal.me requires staff to mark paid manually."))
      ),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "pp-brand" }, "Brand name (on checkout)"), brandIn),
        h("div", { class: "dash-field" }, h("label", { for: "pp-handle" }, "PayPal.me handle"), handleIn,
          h("div", { class: "hint" }, "Without the @. Used when Preferred flow is PayPal.me."))
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-cid" }, "Client ID ", secretLabel(cfg.clientId)),
        h("div", { class: "pp-secret-row" }, cidIn, cidShow),
        h("div", { class: "hint" }, "From your PayPal app. Leave blank to keep current value. Type 'clear' and save to remove.")
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-cs" }, "Client Secret ", secretLabel(cfg.clientSecret)),
        h("div", { class: "pp-secret-row" }, csIn, csShow),
        h("div", { class: "hint" }, "Never displayed back. Stored on the bot server only — never sent to your browser.")
      ),
      h("div", { class: "dash-field" },
        h("label", { for: "pp-wh" }, "Webhook ID ", secretLabel(cfg.webhookId)),
        whIn,
        h("div", { class: "hint" }, "PayPal Developer → your app → Webhooks → the ID after you register the Webhook URL above.")
      )
    );

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save credentials");
    const testBtn = h("button", { type: "button", class: "btn btn-ghost",
      onclick: () => doTestPayPal(host, testBtn) }, "Test connection");
    form.append(
      h("div", { class: "dash-actions" },
        saveBtn,
        testBtn,
        h("span", { style: { fontSize: "0.78rem", color: "var(--dash-muted-2)", marginLeft: "auto" } },
          "Secrets are stored server-side only.")
      )
    );

    host.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Credentials"),
        h("p", null,
          "Get these from ",
          h("a", { href: "https://developer.paypal.com/dashboard/applications/live", target: "_blank", rel: "noopener noreferrer", style: { color: "var(--dash-red-2)" } },
            "developer.paypal.com → My Apps"),
          ". Sandbox vs Live credentials are different — match the Mode you pick above."),
        form
      )
    );

    // Keep a handle so submit handler can reference saveBtn
    form._ppSaveBtn = saveBtn;
  }

  function secretPlaceholder(rec) {
    if (rec && rec.configured) return `••••••••${rec.last4 || ""} (${rec.source}) — type to replace`;
    return "Not set";
  }
  function secretLabel(rec) {
    if (rec && rec.configured) {
      const src = rec.source === "env" ? "from environment" : "set for this server";
      return h("span", { class: "pp-secret-tag" }, "●●●●●●●● " + (rec.last4 || ""), " · " + src);
    }
    return h("span", { class: "pp-secret-tag unset" }, "Not set");
  }
  function copyRow(label, value, hint) {
    if (!value) return null;
    const input = h("input", { type: "text", readonly: true, value, style: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "0.82rem" } });
    const btn = h("button", { type: "button", class: "btn btn-ghost", style: { whiteSpace: "nowrap" },
      onclick: () => {
        navigator.clipboard?.writeText(value).then(() => {
          btn.textContent = "Copied ✓";
          setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        }).catch(() => toast("error", "Couldn't copy"));
      }
    }, "Copy");
    return h("div", { class: "dash-field" },
      h("label", null, label),
      h("div", { class: "pp-copy-row" }, input, btn),
      hint ? h("div", { class: "hint" }, hint) : null
    );
  }
  function makeShowToggle(input) {
    const btn = h("button", { type: "button", class: "btn btn-ghost pp-show-btn", "aria-label": "Show/hide",
      onclick: () => {
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        btn.textContent = isHidden ? "Hide" : "Show";
      }
    }, "Show");
    return btn;
  }

  async function doSavePayPal(host, form, saveBtn) {
    const body = {
      mode:           form.querySelector("#pp-mode").value,
      prefer:         form.querySelector("#pp-prefer").value,
      brandName:      form.querySelector("#pp-brand").value.trim(),
      paypalMeHandle: form.querySelector("#pp-handle").value.trim(),
    };
    // Secret fields — only include in payload if user typed something.
    // Empty input means "keep current". The literal word 'clear' (case-i)
    // clears the value.
    const cidV = form.querySelector("#pp-cid").value;
    const csV  = form.querySelector("#pp-cs").value;
    const whV  = form.querySelector("#pp-wh").value;
    if (cidV.trim() !== "") body.clientId     = (/^clear$/i.test(cidV.trim()) ? "" : cidV.trim());
    if (csV.trim()  !== "") body.clientSecret = (/^clear$/i.test(csV.trim())  ? "" : csV.trim());
    if (whV.trim()  !== "") body.webhookId    = (/^clear$/i.test(whV.trim())  ? "" : whV.trim());

    saveBtn.disabled = true;
    const original = saveBtn.textContent;
    saveBtn.textContent = "Saving…";
    try {
      const r = await data.paypalSave(state.selectedGuildId, body);
      toast("success", "PayPal config saved");
      // Pulse the top-bar Saved indicator
      const stat = document.getElementById("dash-save-status");
      if (stat) { stat.classList.add("show"); setTimeout(() => stat.classList.remove("show"), 1800); }
      renderPayPalInto(host, r);
    } catch (e) {
      toast("error", e.message || "Save failed");
      saveBtn.disabled = false;
      saveBtn.textContent = original;
    }
  }

  async function doTestPayPal(host, btn) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Testing…";
    try {
      const r = await data.paypalTest(state.selectedGuildId);
      const msg = `PayPal OK (${r.mode}) · token valid ${Math.round((r.expiresIn || 0) / 60)} min`;
      toast("success", msg, 5000);
    } catch (e) {
      const detail = e.data?.message || e.message || "Test failed";
      toast("error", `PayPal: ${detail}`, 6500);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  /* ============================================================
     Staff Tiers — per-role pay amount editor (Staff Pay module)
     ============================================================
     Lives beneath the standard Staff Pay form. Lists the tiers
     this guild already has, lets you add new ones (pick a role +
     amounts), edit existing ones inline, and delete them. The bot's
     /log command resolves the highest-priority tier the user has and
     uses its amounts for ticket / auction / event earnings.
  */

  const EVENT_TYPES_DEFAULT = ["Raid Base", "Vault Event", "Scav", "Other"];

  // Helper: USD formatting for read-only displays
  function fmtUSD(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "$0.00";
    return "$" + num.toFixed(2);
  }

  async function renderStaffTiersSection(content) {
    // Placeholder so it appears immediately under the form
    const host = h("div", { class: "dash-tiers-host" });
    content.append(host);
    try {
      const r = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, r.tiers || [], r.defaults || {});
    } catch (e) {
      // 403 (no premium) was already handled by tierLocked path above; this
      // is a defensive catch for unexpected errors. Hide silently.
      if (e.code !== 403) {
        host.append(notice("warn", "Couldn't load staff tiers", e.message || "Backend error"));
      }
    }
  }

  function renderTiersInto(host, tiers, defaults) {
    clear(host);
    const card = h("div", { class: "dash-card" },
      h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" } },
        h("div", null,
          h("h3", { style: { margin: 0 } }, "Staff Tiers — pay per role"),
          h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
            "Set per-role pay amounts for tickets, auctions, and events. The bot uses the highest-priority tier a staff member has.")
        ),
        h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateTierModal(host) }, "+ New Tier")
      )
    );
    host.append(card);

    if (!tiers.length) {
      host.append(
        h("div", { class: "dash-card", style: { textAlign: "center", padding: "32px 20px" } },
          h("div", { style: { fontSize: "2rem", marginBottom: "8px" } }, "💷"),
          h("h4", { style: { margin: "0 0 4px", fontSize: "1.02rem" } }, "No staff tiers yet"),
          h("p", { style: { color: "var(--text-muted)", margin: "0 0 14px", maxWidth: "440px", marginLeft: "auto", marginRight: "auto" } },
            "Without tiers the bot uses default amounts: $", defaults.ticket?.basic?.amount?.toFixed(2) || "0.20", " basic, $",
            defaults.ticket?.medium?.amount?.toFixed(2) || "0.30", " medium, $",
            defaults.ticket?.advanced?.amount?.toFixed(2) || "0.40", " advanced.")
        )
      );
      return;
    }

    const list = h("div", { class: "dash-tiers-list" });
    tiers.forEach((t) => list.appendChild(renderTierCard(t, host)));
    host.append(list);
  }

  function renderTierCard(t, host) {
    const role = (state.roles || []).find((r) => r.id === t.role_id);
    const roleColor = role && role.color ? "#" + role.color.toString(16).padStart(6, "0") : "var(--red)";
    return h("div", { class: "dash-tier-card" },
      h("div", { class: "tier-head" },
        h("span", { class: "tier-dot", style: { background: roleColor } }),
        h("div", { class: "tier-head-info" },
          h("div", { class: "tier-name" }, t.tier_name || "Tier"),
          h("div", { class: "tier-role" }, role ? "@" + role.name : `(role missing: ${t.role_id})`, " · priority ", String(t.priority || 0))
        ),
        h("div", { class: "tier-head-actions" },
          h("button", { type: "button", class: "btn btn-ghost", onclick: () => openEditTierModal(t, host) }, "Edit"),
          h("button", { type: "button", class: "btn btn-ghost tier-del", title: "Delete tier", onclick: () => deleteTier(t, host) }, "×")
        )
      ),
      h("div", { class: "tier-grid" },
        renderTierStat("Ticket — basic",    fmtUSD(t.ticket_basic)),
        renderTierStat("Ticket — medium",   fmtUSD(t.ticket_medium)),
        renderTierStat("Ticket — advanced", fmtUSD(t.ticket_advanced)),
        renderTierStat("Auction %",         (t.auction_percentage ?? 20) + "%"),
      ),
      Object.keys(t.event_payouts || {}).length
        ? h("div", { class: "tier-events" },
            h("div", { class: "tier-events-h" }, "Event payouts"),
            h("div", { class: "tier-events-grid" },
              ...Object.entries(t.event_payouts).map(([k, v]) =>
                h("div", { class: "tier-event-chip" },
                  h("span", { class: "tier-event-k" }, k),
                  h("span", { class: "tier-event-v" }, fmtUSD(v))
                )
              )
            )
          )
        : null,
      h("div", { class: "tier-perms" },
        t.can_payment          ? h("span", { class: "perm-chip ok" }, "Can /payment") : h("span", { class: "perm-chip off" }, "No /payment"),
        t.can_log              ? h("span", { class: "perm-chip ok" }, "Can /log")     : h("span", { class: "perm-chip off" }, "No /log"),
        t.can_approve_payout   ? h("span", { class: "perm-chip ok" }, "Approve payout") : null,
        t.can_configure_tickets? h("span", { class: "perm-chip ok" }, "Configure tickets") : null,
      )
    );
  }

  function renderTierStat(label, value) {
    return h("div", { class: "tier-stat" },
      h("div", { class: "tier-stat-l" }, label),
      h("div", { class: "tier-stat-v" }, value)
    );
  }

  function openCreateTierModal(host) {
    openTierModal({ host, mode: "create", tier: null });
  }
  function openEditTierModal(t, host) {
    openTierModal({ host, mode: "edit", tier: t });
  }

  /** Tier editor modal — works for both create and edit. */
  async function openTierModal({ host, mode, tier }) {
    if (!state.roles) await loadDiscordLists();
    const isEdit = mode === "edit";

    const roleSel = renderSelect("tier-role", "role", [{ id: "", name: "— pick a role —" }, ...(state.roles || [])], tier?.role_id || "", (r) => r.id ? `@${r.name}` : r.name);
    if (isEdit) roleSel.disabled = true; // role is the identity, don't let edit change it
    const nameIn = h("input", { id: "tier-name", type: "text", value: tier?.tier_name || "", placeholder: "e.g. Admin, Mod, Trial Staff", maxlength: 64 });
    const prioIn = h("input", { id: "tier-prio", type: "number", value: tier?.priority ?? 100, min: 0, max: 999 });

    const basicIn    = h("input", { id: "tier-basic",    type: "number", step: "0.01", min: "0", value: tier?.ticket_basic    ?? 0.20 });
    const mediumIn   = h("input", { id: "tier-medium",   type: "number", step: "0.01", min: "0", value: tier?.ticket_medium   ?? 0.30 });
    const advancedIn = h("input", { id: "tier-advanced", type: "number", step: "0.01", min: "0", value: tier?.ticket_advanced ?? 0.40 });
    const auctionIn  = h("input", { id: "tier-auction",  type: "number", step: "1",    min: "0", max: "100", value: tier?.auction_percentage ?? 20 });

    // Event payouts: render an input per known event type, prefilled if tier
    // already has an override for it.
    const eventTypes = Array.from(new Set([
      ...EVENT_TYPES_DEFAULT,
      ...Object.keys(tier?.event_payouts || {}),
    ]));
    const eventInputs = {};
    const eventFields = h("div", { class: "tier-events-edit" },
      ...eventTypes.map((ev) => {
        const v = tier?.event_payouts?.[ev];
        const input = h("input", { type: "number", step: "0.01", min: "0", value: (v ?? "").toString(), placeholder: "0.00" });
        eventInputs[ev] = input;
        return h("label", { class: "dash-field tier-event-field" },
          h("span", null, ev),
          h("div", { class: "tier-event-input" }, h("span", null, "$"), input)
        );
      })
    );

    const canPayment   = h("input", { type: "checkbox", checked: tier?.can_payment ? true : null });
    const canLog       = h("input", { type: "checkbox", checked: tier?.can_log !== false ? true : null });
    const canApprove   = h("input", { type: "checkbox", checked: tier?.can_approve_payout ? true : null });
    const canCfgTicket = h("input", { type: "checkbox", checked: tier?.can_configure_tickets ? true : null });

    function permRow(label, cb) {
      return h("label", { class: "tier-perm-row" }, cb, h("span", null, label));
    }

    const form = h("form", null,
      h("div", { class: "dash-field" }, h("label", { for: "tier-role" }, "Role"), roleSel),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-name" }, "Tier name"), nameIn),
        h("div", { class: "dash-field" }, h("label", { for: "tier-prio" }, "Priority (higher = wins)"), prioIn)
      ),
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Ticket pay (USD per ticket)"),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-basic" }, "Basic"),    h("div", { class: "tier-event-input" }, h("span", null, "$"), basicIn)),
        h("div", { class: "dash-field" }, h("label", { for: "tier-medium" }, "Medium"),  h("div", { class: "tier-event-input" }, h("span", null, "$"), mediumIn))
      ),
      h("div", { class: "dash-form-row" },
        h("div", { class: "dash-field" }, h("label", { for: "tier-advanced" }, "Advanced"), h("div", { class: "tier-event-input" }, h("span", null, "$"), advancedIn)),
        h("div", { class: "dash-field" }, h("label", { for: "tier-auction" }, "Auction %"), auctionIn)
      ),
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Event payouts (USD, leave blank for default)"),
      eventFields,
      h("h4", { style: { margin: "16px 0 6px", fontSize: "0.9rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" } }, "Permissions"),
      h("div", { class: "tier-perms-edit" },
        permRow("Can use /payment",        canPayment),
        permRow("Can use /log",            canLog),
        permRow("Can approve payouts",     canApprove),
        permRow("Can configure tickets",   canCfgTicket)
      )
    );

    const ok = await modalForm(isEdit ? `Edit tier — ${tier.tier_name || "Tier"}` : "New staff tier", form, {
      okLabel: isEdit ? "Save tier" : "Create tier",
    });
    if (!ok) return;

    const body = {
      role_id:    roleSel.value,
      tier_name:  nameIn.value.trim() || "Staff",
      priority:   parseInt(prioIn.value, 10) || 0,
      ticket_basic:    Number(basicIn.value)    || 0,
      ticket_medium:   Number(mediumIn.value)   || 0,
      ticket_advanced: Number(advancedIn.value) || 0,
      auction_percentage: Number(auctionIn.value) || 0,
      event_payouts: Object.fromEntries(
        Object.entries(eventInputs)
          .map(([k, el]) => [k, el.value.trim() === "" ? null : Number(el.value)])
          .filter(([, v]) => Number.isFinite(v) && v > 0)
      ),
      can_payment:          canPayment.checked,
      can_log:              canLog.checked,
      can_approve_payout:   canApprove.checked,
      can_configure_tickets: canCfgTicket.checked,
    };

    if (!body.role_id) return toast("error", "Pick a role first");

    try {
      if (isEdit) {
        await data.tierUpdate(state.selectedGuildId, tier.id, body);
        toast("success", `Updated ${body.tier_name}`);
      } else {
        await data.tierCreate(state.selectedGuildId, body);
        toast("success", `Created ${body.tier_name}`);
      }
      // Refresh the tiers section
      const newR = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, newR.tiers || [], newR.defaults || {});
    } catch (e) {
      toast("error", e.message || (isEdit ? "Update failed" : "Create failed"));
    }
  }

  async function deleteTier(t, host) {
    if (!confirm(`Delete tier "${t.tier_name}"? Staff with this role will fall back to default amounts.`)) return;
    try {
      await data.tierDelete(state.selectedGuildId, t.id);
      toast("success", "Tier deleted");
      const newR = await data.tierList(state.selectedGuildId);
      renderTiersInto(host, newR.tiers || [], newR.defaults || {});
    } catch (e) {
      toast("error", e.message);
    }
  }

  /* ============================================================
     Tab: Premium (subscribe flow info)
     ============================================================ */
  function renderPremium(content) {
    clear(content);
    const g = state.guilds.find((x) => x.id === state.selectedGuildId) || {};
    const plan = g.plan || "free";
    const planLabel = plan === "lifetime" ? "Lifetime" : (plan === "premium" || plan === "monthly") ? "Premium" : "Free";
    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Current Plan"),
        h("dl", { class: "meta" },
          h("dt", null, "Plan"), h("dd", null, planLabel),
          h("dt", null, "Status"), h("dd", null, g.status || "—"),
          h("dt", null, "Expires"), h("dd", null, g.expiresAt ? new Date(g.expiresAt).toLocaleString() : "—")
        )
      ),
      notice("info", "Subscriptions are managed inside Discord",
        "The website does not process payments directly. Premium activates automatically inside Discord after PayPal confirms."),
      h("div", { class: "dash-card" },
        h("h3", null, "How to subscribe"),
        h("ol", { style: { color: "var(--text-muted)", paddingLeft: "20px", lineHeight: "1.8" } },
          h("li", null, "Make sure Quick's ARK Bot is in your server."),
          h("li", null, "Run ", h("code", null, "/subscribe"), " in your Discord server."),
          h("li", null, "Select the Premium plan."),
          h("li", null, "Complete the PayPal checkout the bot opens."),
          h("li", null, "Your server activates automatically.")
        ),
        h("div", { class: "dash-actions" },
          btn("Invite Bot", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true }),
          btn("Join Support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true })
        )
      )
    );
  }

  /* ============================================================
     Tab: Audit log
     ============================================================ */
  async function loadAudit(content) {
    try {
      const a = await data.audit(state.selectedGuildId);
      clear(content);
      content.append(h("div", { class: "dash-card" }, h("h3", null, "Audit Log"), h("p", null, "Recent dashboard actions. Last 50 entries.")));
      if (!a.entries || !a.entries.length) {
        content.append(notice("info", "No entries yet", "Dashboard actions you take will appear here."));
        return;
      }
      const list = h("div", { class: "dash-audit-list" });
      a.entries.forEach((e) => {
        list.append(
          h("div", { class: "dash-audit-row" },
            h("span", { class: "dash-audit-time" }, new Date(e.ts).toLocaleString()),
            h("span", { class: `dash-audit-action ${e.ok ? "ok" : "fail"}` }, e.action),
            h("span", { class: "dash-audit-target" }, e.target || "—"),
            h("span", { class: "dash-audit-user" }, e.userId ? `<@${e.userId.slice(-6)}>` : "—")
          )
        );
      });
      content.append(list);
    } catch (e) { renderTabError(content, e); }
  }

  /* ============================================================
     Tab: Support
     ============================================================ */
  function renderSupportTab(content) {
    clear(content);
    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Support"),
        h("p", null, "Common commands:"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0 0 16px" } },
          h("li", null, h("code", null, "/setup"), " — Setup Hub"),
          h("li", null, h("code", null, "/subscribe"), " — start or renew premium"),
          h("li", null, h("code", null, "/pop"), " — show cluster population"),
          h("li", null, h("code", null, "/rank"), " — your XP"),
          h("li", null, h("code", null, "/leaderboard"), " — server leaderboard")
        ),
        h("div", { class: "dash-actions" },
          btn("Join Support Discord", { kind: "btn-primary", href: cfg.links?.supportDiscord, external: true }),
          btn("Email Support", { kind: "btn-ghost", href: `mailto:${cfg.links?.contactEmail || ""}?subject=${encodeURIComponent("Quick's ARK Bot Support")}` })
        )
      )
    );
  }

  /* ============================================================
     Error rendering
     ============================================================ */
  function renderTabError(content, err) {
    clear(content);
    if (err.code === 401) {
      state.user = null;
      return render();
    }
    if (err.code === 403) {
      const msg = err.data?.message || "You don't have permission for this. Manage Server or Administrator required.";
      return content.append(notice("error", "Access denied", msg));
    }
    if (err.code === "no_backend") {
      state.user = null;
      return renderNoBackend();
    }
    if (err.code === "timeout") {
      return content.append(notice("error", "Backend timed out", "The backend didn't respond in 8 seconds."));
    }
    if (err.code === "network") {
      return content.append(notice("error", "Backend unreachable", "CORS or network failure."));
    }
    if (err.code === 404) {
      return content.append(notice("error", "Route not found", "This route isn't deployed on the backend yet."));
    }
    content.append(notice("error", "Couldn't load", err.message || "Unknown error"));
  }

  /* ============================================================
     Boot
     ============================================================ */
  async function boot() {
    clear(root);
    // Premium skeleton while we fetch identity + guild list.
    root.append(renderPickerBootSkeleton());
    if (!API_BASE) return renderNoBackend();
    try {
      const me = await data.me();
      state.user = me.user;
      const g = await data.guilds();
      state.guilds = g.guilds || [];
      render();
    } catch (e) {
      console.error("[dashboard] boot failed:", e);
      if (e.code === 401) { state.user = null; return renderLoggedOut(); }
      if (e.code === "no_backend") return renderNoBackend();
      // Network/timeout/500 — show a friendly retry card, not raw error text.
      return renderPickerBootError(e);
    }
  }

  /** Skeleton mirroring the picker layout so the loading state feels
   *  intentional, not blank. */
  function renderPickerBootSkeleton() {
    const wrap = h("div");
    wrap.append(
      h("div", { class: "skel-card", style: { padding: "20px" } },
        h("div", { class: "skel skel-line lg w-30" }),
        h("div", { class: "skel skel-line w-70" }),
        h("div", { class: "skel skel-line w-50" })
      ),
      h("div", { class: "picker-grid" },
        h("div", { class: "picker-main" },
          h("div", { class: "skel-card", style: { padding: "12px" } },
            h("div", { class: "skel skel-line w-50" })
          ),
          h("div", { class: "picker-servers" },
            ...new Array(4).fill(0).map(() => h("div", { class: "skel-card" },
              h("div", { class: "skel skel-line lg w-50" }),
              h("div", { class: "skel skel-line w-30" }),
              h("div", { class: "skel skel-line w-70" })
            ))
          )
        ),
        h("div", { class: "picker-aside" },
          h("div", { class: "skel-card" },
            h("div", { class: "skel skel-line lg w-30" }),
            h("div", { class: "skel skel-line w-70" })
          ),
          h("div", { class: "skel-card" },
            h("div", { class: "skel skel-line lg w-30" }),
            h("div", { class: "skel skel-line w-90" })
          )
        )
      )
    );
    return wrap;
  }

  /** Premium boot-error state. Shown when /me or /guilds fails (network,
   *  500, timeout). Always offers a clear Retry + Support. */
  function renderPickerBootError(err) {
    clear(root);
    const card = h("div", { class: "picker-empty large" });
    const ico = h("div", { class: "picker-empty-ico" });
    ico.appendChild(iconSvg("refresh"));
    const detail = err?.code === "timeout" ? "The backend didn't respond in 8 seconds."
                  : err?.code === "network" ? "Couldn't reach the backend (CORS or network)."
                  : (err?.message || "Unknown error");
    card.append(
      ico,
      h("h3", null, "Couldn't load your servers"),
      h("p", null, detail, " You can try again, or manage the bot inside Discord while we look into it."),
      h("div", { class: "dash-actions", style: { justifyContent: "center" } },
        btn("Retry",        { kind: "btn-primary", onclick: () => boot() }),
        btn("Join Support", { kind: "btn-ghost",   href: cfg.links?.supportDiscord, external: true }),
        btn("Invite Bot",   { kind: "btn-outline", href: cfg.links?.inviteBot,      external: true })
      )
    );
    root.append(card);
  }

  function selectGuild(id) {
    state.selectedGuildId = id;
    state.activeTab = "overview";
    state.channels = null; // reset cached lists for new guild
    state.categories = null;
    state.roles = null;
    render();
  }

  async function handleLogout() {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    state.user = null;
    state.guilds = [];
    state.selectedGuildId = null;
    state.modules = null;
    state.channels = null;
    state.categories = null;
    state.roles = null;
    render();
  }

  boot();
})();
