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
    audit: (gid) => api(`/api/dashboard/guilds/${gid}/audit-log`),
    channels: (gid) => api(`/api/dashboard/guilds/${gid}/discord/channels`),
    roles: (gid) => api(`/api/dashboard/guilds/${gid}/discord/roles`),
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
    { id: "giveaways",   label: "Giveaways",   emoji: "🎉", module: "giveaways",     flag: null,         tier: "premium" },
    { id: "welcome",     label: "Welcome",     emoji: "👋", module: "welcome",       flag: "welcome" },
    { id: "roleMenus",   label: "Role Menus",  emoji: "🎭", module: "roleMenus",     flag: "roleMenus" },
    { id: "suggestions", label: "Suggestions", emoji: "🔔", module: null,            flag: null,         comingSoon: true },
    { id: "events",      label: "Events",      emoji: "📋", module: "events",        flag: null,         tier: "premium" },
    { id: "polls",       label: "Polls",       emoji: "📊", module: "polls",         flag: null },
    { id: "sticky",      label: "Sticky",      emoji: "📌", module: null,            flag: null,         comingSoon: true },
    { id: "credits",     label: "Credits",     emoji: "💰", module: "credits",       flag: "credits" },
    { id: "tickets",     label: "Tickets",     emoji: "🎫", module: "tickets",       flag: "tickets" },
    { id: "payments",    label: "Payments",    emoji: "💳", module: "payments",      flag: "payments",   tier: "premium" },
    { id: "staffPay",    label: "Staff Pay",   emoji: "💷", module: "staffPay",      flag: "staffPay",   tier: "premium" },
    { id: "hype",        label: "Hype System", emoji: "🔥", module: "hype",          flag: "hype",       tier: "premium" },
    { id: "population",  label: "Cluster Pop", emoji: "📡", module: "population",    flag: "population" },
    { id: "branding",    label: "Branding",    emoji: "🎨", module: "branding",      flag: "branding",   tier: "premium" },
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
        input = renderSelect(id, f.key, [{ id: "", name: "— none —" }, ...(state.channels || [])], value, (c) => `${channelHash(c)} ${c.name}`);
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
    if (c.type === 4) return "▾"; // category
    if (c.type === 15) return "📋"; // forum
    if (c.type === 5) return "📢"; // announcement
    return "#";
  }
  function renderSelect(id, name, options, value, labelFn) {
    const sel = h("select", { id, name });
    options.forEach((o) => {
      const opt = h("option", { value: o.id, selected: (o.id === value) || null }, labelFn ? labelFn(o) : o.name);
      sel.appendChild(opt);
    });
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
  function renderRoleMenusInfo(content) {
    clear(content);
    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Role Menus"),
        h("p", null, "No artificial limits — make as many role menus as you need."),
        notice("info", "Configured in Discord", "Role menu CRUD currently lives in /setup → Role Menus inside Discord. Dashboard read-only listing + create flow are on the roadmap."),
        h("div", { class: "dash-actions", style: { marginTop: "12px" } },
          btn("Open Discord", { kind: "btn-primary", href: cfg.links?.inviteBot, external: true }),
          btn("Join Support", { kind: "btn-ghost", href: cfg.links?.supportDiscord, external: true })
        )
      )
    );
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
