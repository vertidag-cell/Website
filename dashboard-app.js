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
    root.append(
      notice("warn", "Backend not configured",
        "Set SITE_CONFIG.backendApiUrl in config.js to your bot's Square Cloud URL."),
      h("div", { class: "dash-card", style: { marginTop: "16px" } },
        h("h3", null, "Manage the bot in Discord"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px" } },
          h("li", null, h("code", null, "/setup"), " — Setup Hub"),
          h("li", null, h("code", null, "/subscribe"), " — start Premium"),
          h("li", null, h("code", null, "/pop"), " — cluster population")
        ),
        h("div", { class: "dash-actions", style: { marginTop: "16px" } },
          btn("Invite Bot", { href: cfg.links?.inviteBot, external: true }),
          btn("Join Support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true })
        )
      )
    );
  }

  function renderLoggedOut() {
    clear(root);
    root.append(
      h("div", { class: "dash-card", style: { textAlign: "center", maxWidth: "560px", margin: "0 auto" } },
        h("h2", { style: { margin: "0 0 8px", fontSize: "1.5rem" } }, "Customer Dashboard"),
        h("p", { style: { color: "var(--text-muted)", margin: "0 0 22px" } },
          "Log in with Discord to manage your bot's setup, branding, /pop, subscriptions, and every module."),
        h("a", { class: "btn btn-lg", href: auth.loginUrl(), style: { background: "#5865f2", color: "#fff", boxShadow: "0 8px 24px rgba(88,101,242,0.45)" } }, "Continue with Discord"),
        h("p", { style: { fontSize: "0.74rem", color: "var(--text-dim)", margin: "18px 0 0" } },
          "We request only ", h("code", null, "identify"), " and ", h("code", null, "guilds"), " scopes.")
      )
    );
  }

  function renderGuildPicker() {
    clear(root);
    root.append(
      h("div", { class: "dash-userbar" },
        userAvatar(state.user),
        h("div", { class: "who" },
          h("div", { class: "who-name" }, state.user.globalName || state.user.username),
          h("div", { class: "who-sub" }, `@${state.user.username}`)
        ),
        btn("Log out", { kind: "btn-ghost", onclick: handleLogout })
      )
    );
    if (!state.guilds.length) {
      root.append(
        notice("warn", "No manageable servers",
          "We didn't find any Discord servers where you have Manage Server / Administrator AND the bot is installed. Invite the bot to a server you own, then refresh."),
        h("div", { class: "dash-actions", style: { marginTop: "16px" } },
          btn("Invite Bot", { href: cfg.links?.inviteBot, external: true }),
          btn("Refresh", { kind: "btn-ghost", onclick: () => boot(true) })
        )
      );
      return;
    }
    root.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Pick a server to manage"),
        h("p", null, "Only servers where the bot is installed AND you have Manage Server or Administrator are shown.")
      ),
      h("div", { class: "dash-guilds" }, ...state.guilds.map(renderGuildCard))
    );
  }

  function renderGuildCard(g) {
    const tags = [];
    if (g.plan === "lifetime") tags.push(h("span", { class: "dash-tag lifetime" }, "Lifetime"));
    else if (g.plan === "monthly" || g.plan === "premium") tags.push(h("span", { class: "dash-tag premium" }, "Premium"));
    else tags.push(h("span", { class: "dash-tag free" }, "Free"));
    if (g.owner) tags.push(h("span", { class: "dash-tag" }, "Owner"));
    return h("button", { class: "dash-guild", type: "button", onclick: () => selectGuild(g.id) },
      guildIcon(g),
      h("div", { class: "gmeta" },
        h("div", { class: "gname" }, g.name),
        h("div", { class: "gtags" }, ...tags)
      ),
      h("span", { style: { color: "var(--text-dim)", fontSize: "1.1rem" } }, "→")
    );
  }

  /* ============================================================
     Per-guild dashboard
     ============================================================ */
  async function renderGuildDashboard() {
    clear(root);
    const guild = state.guilds.find((g) => g.id === state.selectedGuildId);

    // Top bar
    root.append(
      h("div", { class: "dash-userbar" },
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => { state.selectedGuildId = null; render(); } }, "← Servers"),
        guild ? guildIcon(guild) : userAvatar(state.user),
        h("div", { class: "who" },
          h("div", { class: "who-name" }, guild?.name || "Loading…"),
          h("div", { class: "who-sub" }, state.user.globalName || state.user.username)
        ),
        guild?.plan === "lifetime" ? h("span", { class: "dash-tag lifetime", style: { fontSize: "0.74rem" } }, "Lifetime")
          : (guild?.plan === "monthly" || guild?.plan === "premium") ? h("span", { class: "dash-tag premium", style: { fontSize: "0.74rem" } }, "Premium")
          : h("span", { class: "dash-tag free", style: { fontSize: "0.74rem" } }, "Free"),
        btn("Log out", { kind: "btn-ghost", onclick: handleLogout })
      )
    );

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

    // Sidebar — Setup Hub + Overview + each module + Audit
    const sideTabs = [
      { id: "setup-hub", label: "Setup Hub", group: "core" },
      { id: "overview", label: "Overview", group: "core" },
      ...state.modules.map((m) => ({ id: m.name, label: m.label, tier: m.tier, group: m.tier === "premium" ? "premium" : "free" })),
      { id: "premium", label: "Premium", group: "core" },
      { id: "audit", label: "Audit Log", group: "core" },
      { id: "support", label: "Support", group: "core" },
    ];
    const side = h("div", { class: "dash-sidebar", role: "tablist" },
      ...sideTabs.map((t) => h("button", {
        type: "button",
        class: `dash-tab ${t.id === state.activeTab ? "active" : ""}`,
        role: "tab",
        onclick: () => { state.activeTab = t.id; render(); },
      },
        h("span", { class: "badge-dot" }),
        t.label,
        t.tier === "premium" ? h("span", { class: "dash-tab-tier" }, "PRO") : null
      ))
    );
    layout.append(side);

    const content = h("div", { class: "dash-content" });
    layout.append(content);
    root.append(layout);
    renderActiveTab(content);
  }

  function renderActiveTab(content) {
    content.append(h("div", { class: "dash-loading" }, h("div", { class: "dash-spinner" }), "Loading…"));
    const tab = state.activeTab;
    if (tab === "setup-hub") return loadSetupHub(content);
    if (tab === "overview") return loadOverview(content);
    if (tab === "premium") return renderPremium(content);
    if (tab === "audit") return loadAudit(content);
    if (tab === "support") return renderSupportTab(content);
    return loadModule(content, tab);
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

  async function loadSetupHub(content) {
    try {
      const o = await data.overview(state.selectedGuildId);
      const flags = o.setup?.flags || {};
      const isPremium = !!o.premiumActive;
      clear(content);

      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Setup Hub"),
          h("p", null,
            "Same categories as ", h("code", null, "/setup"), " in Discord. Each card jumps to its configuration tab — or click ",
            h("code", null, "/setup"), " inside Discord to use the original guided flow."),
          h("div", { class: "dash-hub-stats" },
            h("div", { class: "hub-stat" },
              h("div", { class: "hub-stat-num" }, o.setup?.completedCount ?? "—"),
              h("div", { class: "hub-stat-lbl" }, "Configured")
            ),
            h("div", { class: "hub-stat" },
              h("div", { class: "hub-stat-num" }, o.setup?.total ?? "—"),
              h("div", { class: "hub-stat-lbl" }, "Total")
            ),
            h("div", { class: "hub-stat" },
              h("div", { class: "hub-stat-num" }, `${o.setup?.percent ?? 0}%`),
              h("div", { class: "hub-stat-lbl" }, "Complete")
            )
          ),
          renderProgress(o.setup?.percent ?? 0)
        )
      );

      const grid = h("div", { class: "setup-hub-grid" });
      SETUP_HUB.forEach((cat) => {
        const isConfigured = cat.flag ? !!flags[cat.flag] : null;
        const isLocked = cat.tier === "premium" && !isPremium;
        const card = h("button", {
          type: "button",
          class: `setup-hub-card ${isConfigured ? "configured" : ""} ${isLocked ? "locked" : ""} ${cat.comingSoon ? "soon" : ""}`,
          onclick: () => {
            if (cat.comingSoon) {
              toast("warn", `${cat.label} is configured in Discord via /setup for now.`, 4500);
              return;
            }
            if (cat.module) {
              state.activeTab = cat.module;
              render();
            }
          },
        },
          h("div", { class: "setup-hub-icon" }, cat.emoji),
          h("div", { class: "setup-hub-body" },
            h("div", { class: "setup-hub-name" }, cat.label),
            h("div", { class: "setup-hub-meta" },
              cat.tier === "premium" ? h("span", { class: "setup-hub-tag premium" }, "Premium") : null,
              cat.comingSoon
                ? h("span", { class: "setup-hub-tag soon" }, "Discord only")
                : isConfigured === true
                  ? h("span", { class: "setup-hub-tag ok" }, "Configured")
                  : isConfigured === false
                    ? h("span", { class: "setup-hub-tag missing" }, "Not set up")
                    : h("span", { class: "setup-hub-tag" }, "Ready")
            )
          ),
          h("div", { class: "setup-hub-arrow" }, "→")
        );
        grid.appendChild(card);
      });
      content.append(grid);

      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Prefer Discord?"),
          h("p", null, "Every category here is also configurable inside Discord with ", h("code", null, "/setup"), ". The dashboard and ", h("code", null, "/setup"), " write to the same database — use whichever you prefer."),
          h("div", { class: "dash-actions" },
            btn("Open Discord", { kind: "btn-ghost", href: cfg.links?.inviteBot, external: true }),
            btn("Support", { kind: "btn-outline", href: cfg.links?.supportDiscord, external: true })
          )
        )
      );
    } catch (e) { renderTabError(content, e); }
  }

  /* ============================================================
     Tab: Overview
     ============================================================ */
  async function loadOverview(content) {
    try {
      const o = await data.overview(state.selectedGuildId);
      clear(content);
      const plan = o.plan || "free";
      const planLabel = plan === "lifetime" ? "Lifetime" : (plan === "monthly" || plan === "premium") ? "Premium" : "Free";
      const expires = o.subscription?.expiresAt ? new Date(o.subscription.expiresAt) : null;
      const setup = o.setup || { percent: 0, completed: [], missing: [], total: 0 };

      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Overview"),
          h("dl", { class: "meta" },
            h("dt", null, "Plan"), h("dd", null, planLabel),
            h("dt", null, "Status"), h("dd", null, o.subscription?.status || "—"),
            h("dt", null, "Expires"), h("dd", null, expires ? expires.toLocaleString() : "—"),
            h("dt", null, "Bot installed"), h("dd", null, o.botInstalled ? "Yes" : "No"),
            h("dt", null, "Setup completion"), h("dd", null, `${setup.percent}% · ${setup.completedCount || setup.completed.length} / ${setup.total} modules`)
          ),
          renderProgress(setup.percent)
        ),
        h("div", { class: "dash-card" },
          h("h3", null, "Setup status"),
          h("div", { class: "dash-feat" },
            ...Object.entries(o.setup?.flags || {}).map(([k, v]) =>
              h("button", {
                type: "button",
                class: `dash-feat-card ${v ? "ok" : "missing"}`,
                onclick: () => { state.activeTab = mapFlagToModule(k); render(); },
                style: { cursor: "pointer", textAlign: "left", border: "1px solid var(--border)" },
              },
                h("span", { class: "name" }, prettyName(k)),
                h("span", { class: "state" }, v ? "Configured" : "Missing")
              )
            )
          )
        ),
        h("div", { class: "dash-card" },
          h("h3", null, "Quick actions"),
          h("div", { class: "dash-actions" },
            btn("Configure Welcome", { kind: "btn-primary", onclick: () => { state.activeTab = "welcome"; render(); } }),
            btn("Configure Role Menus", { kind: "btn-ghost", onclick: () => { state.activeTab = "roleMenus"; render(); } }),
            btn("Configure /pop", { kind: "btn-ghost", onclick: () => { state.activeTab = "population"; render(); } }),
            btn("Branding", { kind: "btn-ghost", onclick: () => { state.activeTab = "branding"; render(); } }),
            btn("Open Support", { kind: "btn-outline", href: cfg.links?.supportDiscord, external: true })
          )
        )
      );
    } catch (e) { renderTabError(content, e); }
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
      // Make sure channel/role pickers are ready
      if (!state.channels || !state.roles) await loadDiscordLists();

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
    } catch (e) { renderTabError(content, e); }
  }

  async function loadDiscordLists() {
    try {
      const [c, r] = await Promise.all([
        data.channels(state.selectedGuildId),
        data.roles(state.selectedGuildId),
      ]);
      state.channels = c.channels || [];
      state.roles = r.roles || [];
    } catch (e) {
      state.channels = [];
      state.roles = [];
    }
  }

  function renderModuleForm(content, mod, values) {
    const card = h("div", { class: "dash-card" },
      h("h3", null, mod.label, mod.tier === "premium" ? h("span", { class: "dash-tag premium", style: { marginLeft: "10px", fontSize: "0.66rem" } }, "Premium") : null),
      mod.description ? h("p", null, mod.description) : null
    );

    // Quick Setup banner — shown only when backend reports it's available
    if (mod.quickSetupAvailable) {
      card.append(renderQuickSetupBanner(mod, content));
    }

    const statusBox = h("div");
    const form = h("form", { class: "dash-form" });

    mod.fields.forEach((f) => form.appendChild(renderField(f, values[f.key])));

    const saveBtn = h("button", { type: "submit", class: "btn btn-primary" }, "Save changes");
    const resetBtn = h("button", { type: "button", class: "btn btn-ghost", onclick: () => doResetModule(mod, content) }, "Reset to default");
    form.appendChild(h("div", { class: "dash-actions" }, saveBtn, resetBtn));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      doSaveModule(form, mod, statusBox, saveBtn);
    });

    card.append(statusBox, form);
    content.append(card);
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
      loadModule(content, mod.name); // reload to pick up new config
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
  function renderMultiPicker(id, name, kind, value) {
    const items = kind === "channels" ? (state.channels || []) : (state.roles || []);
    const selected = new Set(Array.isArray(value) ? value : []);
    const wrap = h("div", { class: "dash-multi", id });
    items.forEach((it) => {
      const checked = selected.has(it.id);
      const lbl = h("label", { class: "dash-chip" },
        h("input", { type: "checkbox", name: `${name}[]`, value: it.id, checked: checked || null }),
        kind === "channels" ? channelHash(it) + " " + it.name : "@" + it.name
      );
      wrap.appendChild(lbl);
    });
    wrap.dataset.kind = kind;
    wrap.dataset.field = name;
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

  async function doSaveModule(form, mod, statusBox, saveBtn) {
    clear(statusBox);
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const payload = collectFormValues(form, mod);
      const res = await data.saveModule(state.selectedGuildId, mod.name, payload);
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      toast("success", `${mod.label} saved`);
      statusBox.append(notice("success", "Saved", "Settings are live for this server."));
    } catch (e) {
      saveBtn.textContent = "Save changes";
      saveBtn.disabled = false;
      if (e.code === 403 && e.data?.error === "premium_required") {
        statusBox.append(notice("warn", "Premium required", e.data?.message || "Activate Premium with /subscribe in Discord."));
        return;
      }
      if (e.code === 400 && Array.isArray(e.data?.errors)) {
        statusBox.append(notice("error", "Validation failed", `Check these fields: ${e.data.errors.join(", ")}`));
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

    form.addEventListener("submit", (e) => { e.preventDefault(); doSaveModule(form, mod, statusBox, saveBtn); });

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

      // Header
      const header = h("div", { class: "dash-card" },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" } },
          h("div", null,
            h("h3", { style: { margin: 0 } }, "Role Menus"),
            h("p", { style: { margin: "4px 0 0", color: "var(--text-muted)" } },
              "Build role-selection panels — dropdowns or buttons — and post them to any channel. No artificial limits.")
          ),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => openCreateMenuModal(content) },
            "+ New Menu")
        )
      );
      content.append(header);

      // Quick Setup banner (still useful for "auto Ping Roles menu")
      data.module(state.selectedGuildId, "roleMenus").then((mod) => {
        if (mod.module?.quickSetupAvailable) {
          const card = h("div", { class: "dash-card" });
          card.append(renderQuickSetupBanner(mod.module, content));
          // place it right after header
          header.after(card);
        }
      }).catch(() => {});

      // Empty state
      if (!menus.length) {
        content.append(
          h("div", { class: "dash-card", style: { textAlign: "center", padding: "40px 24px" } },
            h("div", { style: { fontSize: "2rem", marginBottom: "8px" } }, "🎭"),
            h("h4", { style: { margin: "0 0 6px" } }, "No role menus yet"),
            h("p", { style: { color: "var(--text-muted)", margin: "0 0 18px" } },
              "Create one to let members pick roles from a dropdown or button panel."),
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
    const wrap = h("div", { class: "rm-add-form" },
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-role" }, "Role"), roleSel),
      h("div", { class: "dash-field" }, h("label", { for: "rm-add-label" }, "Label"), labelIn),
      h("div", { class: "rm-add-grid" },
        h("div", { class: "dash-field" }, h("label", { for: "rm-add-emoji" }, "Emoji"), emojiIn),
        h("div", { class: "dash-field" }, h("label", { for: "rm-add-desc" }, "Description"), descIn)
      ),
      h("button", { type: "button", class: "btn btn-primary",
        onclick: () => doAddOption(m.id, roleSel, labelIn, descIn, emojiIn, content) }, "+ Add option")
    );
    return wrap;
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

  /** Generic form modal — confirms or cancels, returns Promise<boolean>. */
  function modalForm(title, formNode) {
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
          h("button", { type: "button", class: "btn btn-primary", onclick: () => close(true) }, "Create")
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
    root.append(h("div", { class: "dash-loading" }, h("div", { class: "dash-spinner" }), "Connecting…"));
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
      if (e.code === "timeout") return renderTabError(root, e);
      if (e.code === "network") return renderTabError(root, e);
      renderTabError(root, e);
    }
  }

  function selectGuild(id) {
    state.selectedGuildId = id;
    state.activeTab = "overview";
    state.channels = null; // reset cached lists for new guild
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
    state.roles = null;
    render();
  }

  boot();
})();
