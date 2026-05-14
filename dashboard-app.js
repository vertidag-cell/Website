/*
 * Quick's ARK Bot — Dashboard SPA
 * ------------------------------------------------------------
 * Vanilla JS single-page dashboard. Talks to a backend at
 * window.SITE_CONFIG.backendApiUrl over fetch + cookies.
 *
 * No secrets in this file. The backend handles Discord OAuth and
 * permission checks. This file only renders state.
 */

(function () {
  "use strict";

  const cfg = window.SITE_CONFIG || {};
  const API_BASE = (cfg.backendApiUrl || "").replace(/\/$/, "");
  const root = document.getElementById("dashboard-root");
  if (!root) return;

  /* ============================================================
     Minimal API client (credentials: include for session cookie)
     ============================================================ */
  async function api(path, opts) {
    opts = opts || {};
    if (!API_BASE) throw new Error("backend_not_configured");
    const url = API_BASE + path;
    const res = await fetch(url, {
      method: opts.method || "GET",
      credentials: "include",
      headers: opts.body
        ? { "Content-Type": "application/json", Accept: "application/json" }
        : { Accept: "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) throw Object.assign(new Error("not_logged_in"), { code: 401 });
    if (res.status === 403) throw Object.assign(new Error("forbidden"), { code: 403 });
    if (!res.ok) {
      let detail = res.statusText;
      try { const j = await res.json(); detail = j.error || detail; } catch {}
      throw Object.assign(new Error(detail), { code: res.status });
    }
    return res.json();
  }

  const auth = {
    loginUrl: () => API_BASE + "/auth/discord/login",
    logout: () => api("/auth/logout", { method: "POST" }),
  };

  const data = {
    me: () => api("/api/dashboard/me"),
    guilds: () => api("/api/dashboard/guilds"),
    overview: (gid) => api(`/api/dashboard/guilds/${gid}/overview`),
    branding: (gid) => api(`/api/dashboard/guilds/${gid}/branding`),
    saveBranding: (gid, payload) => api(`/api/dashboard/guilds/${gid}/branding`, { method: "POST", body: payload }),
    resetBranding: (gid) => api(`/api/dashboard/guilds/${gid}/branding/reset`, { method: "POST" }),
    population: (gid) => api(`/api/dashboard/guilds/${gid}/population`),
    setupStatus: (gid) => api(`/api/dashboard/guilds/${gid}/settings/status`),
  };

  /* ============================================================
     Tiny render helpers
     ============================================================ */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "style" && typeof attrs[k] === "object") Object.assign(el.style, attrs[k]);
      else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else if (k === "html") el.innerHTML = attrs[k];
      else if (attrs[k] === true) el.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach((cc) => cc != null && el.append(cc.nodeType ? cc : document.createTextNode(cc)));
      else el.append(c.nodeType ? c : document.createTextNode(c));
    }
    return el;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function userAvatar(user) {
    if (user.avatar) {
      return h("div", { class: "dash-avatar" }, h("img", { src: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`, alt: "" }));
    }
    return h("div", { class: "dash-avatar" }, (user.username || "U").charAt(0).toUpperCase());
  }

  function guildIcon(guild) {
    if (guild.icon) {
      return h("div", { class: "gico" }, h("img", { src: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`, alt: "" }));
    }
    const initials = (guild.name || "?").split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
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
    const a = h(opts.href ? "a" : "button", {
      class: `btn ${opts.kind || "btn-primary"}`,
      type: opts.href ? null : "button",
      href: opts.href || null,
      target: opts.external ? "_blank" : null,
      rel: opts.external ? "noopener noreferrer" : null,
      onclick: opts.onclick || null,
    }, label);
    return a;
  }

  /* ============================================================
     State
     ============================================================ */
  const state = {
    user: null,
    guilds: [],
    selectedGuildId: null,
    activeTab: "overview",
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
        "The dashboard frontend is deployed but the backend API URL is empty. Set SITE_CONFIG.backendApiUrl in config.js to your bot's Square Cloud HTTPS URL once the backend is live."),
      h("div", { class: "dash-card", style: { marginTop: "16px" } },
        h("h3", null, "What you can do today"),
        h("p", null, "Until the dashboard backend is live, manage everything inside Discord:"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0 0 16px" } },
          h("li", null, h("code", null, "/setup"), " — open the Setup Hub and configure every module."),
          h("li", null, h("code", null, "/subscribe"), " — start or renew a Premium subscription."),
          h("li", null, h("code", null, "/pop"), " — show full cluster population in any channel.")
        ),
        h("div", { class: "dash-actions" },
          btn("Invite Bot", { kind: "btn-primary", href: cfg.links && cfg.links.inviteBot, external: true }),
          btn("Join Support Discord", { kind: "btn-ghost", href: cfg.links && cfg.links.supportDiscord, external: true })
        )
      )
    );
  }

  function renderLoggedOut() {
    clear(root);
    root.append(
      h("div", { class: "dash-card", style: { textAlign: "center", maxWidth: "560px", margin: "0 auto" } },
        h("div", { style: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "5px 12px", background: "var(--red-tint)", color: "var(--red-bright)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "16px" } },
          h("span", { style: { width: "6px", height: "6px", borderRadius: "50%", background: "var(--red-bright)" } }),
          "Customer Dashboard"
        ),
        h("h2", { style: { margin: "0 0 8px", fontSize: "1.5rem" } }, "Log in with Discord"),
        h("p", { style: { color: "var(--text-muted)", margin: "0 0 22px" } },
          "Manage your server's subscription, branding, /pop clusters, and setup status from one place."),
        h("a", {
          class: "btn btn-primary btn-lg",
          href: auth.loginUrl(),
          style: { background: "#5865f2", boxShadow: "0 8px 24px rgba(88,101,242,0.45)" }
        },
          h("span", { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:-3px"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.175 1.095 2.156 2.419 0 1.333-.955 2.418-2.156 2.418zm7.974 0c-1.183 0-2.156-1.085-2.156-2.418 0-1.333.955-2.419 2.156-2.419 1.21 0 2.175 1.095 2.156 2.419 0 1.333-.946 2.418-2.156 2.418z"/></svg>' }),
          "Continue with Discord"
        ),
        h("p", { style: { fontSize: "0.74rem", color: "var(--text-dim)", margin: "18px 0 0" } },
          "We request only ", h("code", null, "identify"), " and ", h("code", null, "guilds"), " scopes. No tokens are stored in your browser.")
      ),
      h("div", { class: "dash-card", style: { marginTop: "16px" } },
        h("h3", null, "What you can manage"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0" } },
          h("li", null, "Subscription status and expiry"),
          h("li", null, "Premium branding (Premium only)"),
          h("li", null, "/pop cluster population settings"),
          h("li", null, "Setup status across modules"),
          h("li", null, "Quick links to support and pricing")
        )
      )
    );
  }

  function renderGuildPicker() {
    clear(root);

    const top = h("div", { class: "dash-userbar" },
      userAvatar(state.user),
      h("div", { class: "who" },
        h("div", { class: "who-name" }, state.user.globalName || state.user.username),
        h("div", { class: "who-sub" }, `@${state.user.username}`)
      ),
      btn("Log out", { kind: "btn-ghost", onclick: handleLogout })
    );
    root.append(top);

    if (!state.guilds.length) {
      root.append(notice("warn", "No manageable servers",
        "We didn't find any Discord servers where you have Manage Server or Administrator permissions. Invite the bot to a server you own, then refresh."));
      root.append(h("div", { class: "dash-actions", style: { marginTop: "16px" } },
        btn("Invite Bot", { kind: "btn-primary", href: cfg.links && cfg.links.inviteBot, external: true }),
        btn("Refresh", { kind: "btn-ghost", onclick: () => loadInitial(true) })
      ));
      return;
    }

    root.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Pick a server to manage"),
        h("p", null, "Only servers where you have Manage Server or Administrator permission are listed. Servers without the bot show an Invite button.")
      ),
      h("div", { class: "dash-guilds" }, ...state.guilds.map(renderGuildCard))
    );
  }

  function renderGuildCard(g) {
    const tags = [];
    if (g.plan === "premium") tags.push(h("span", { class: "dash-tag premium" }, "Premium"));
    else if (g.plan === "lifetime") tags.push(h("span", { class: "dash-tag lifetime" }, "Lifetime"));
    else tags.push(h("span", { class: "dash-tag free" }, "Free"));
    if (!g.botInstalled) tags.push(h("span", { class: "dash-tag no-bot" }, "Bot not installed"));
    if (g.owner) tags.push(h("span", { class: "dash-tag" }, "Owner"));

    if (!g.botInstalled) {
      return h("a", {
        class: "dash-guild",
        href: cfg.links && cfg.links.inviteBot,
        target: "_blank",
        rel: "noopener noreferrer",
        title: "Invite the bot to this server",
      },
        guildIcon(g),
        h("div", { class: "gmeta" },
          h("div", { class: "gname" }, g.name),
          h("div", { class: "gtags" }, ...tags)
        ),
        h("span", { style: { color: "var(--red-bright)", fontWeight: "700", fontSize: "0.82rem" } }, "Invite →")
      );
    }

    return h("button", {
      class: "dash-guild",
      type: "button",
      onclick: () => selectGuild(g.id),
    },
      guildIcon(g),
      h("div", { class: "gmeta" },
        h("div", { class: "gname" }, g.name),
        h("div", { class: "gtags" }, ...tags)
      ),
      h("span", { style: { color: "var(--text-dim)", fontSize: "1.1rem" } }, "→")
    );
  }

  /* ============================================================
     Guild dashboard with tabs
     ============================================================ */
  const TABS = [
    { id: "overview",    label: "Overview" },
    { id: "subscription",label: "Subscription" },
    { id: "branding",    label: "Branding" },
    { id: "population",  label: "Cluster Population" },
    { id: "features",    label: "Features" },
    { id: "setup",       label: "Setup Status" },
    { id: "support",     label: "Support" },
  ];

  function renderGuildDashboard() {
    clear(root);
    const guild = state.guilds.find((g) => g.id === state.selectedGuildId);

    const top = h("div", { class: "dash-userbar" },
      h("button", { type: "button", class: "btn btn-ghost", onclick: () => { state.selectedGuildId = null; render(); } }, "← Servers"),
      guild ? guildIcon(guild) : userAvatar(state.user),
      h("div", { class: "who" },
        h("div", { class: "who-name" }, guild ? guild.name : "Loading…"),
        h("div", { class: "who-sub" }, state.user.globalName || state.user.username)
      ),
      btn("Log out", { kind: "btn-ghost", onclick: handleLogout })
    );
    root.append(top);

    const layout = h("div", { class: "dash-layout" });

    const side = h("div", { class: "dash-sidebar", role: "tablist" }, ...TABS.map((t) =>
      h("button", {
        type: "button",
        class: `dash-tab ${t.id === state.activeTab ? "active" : ""}`,
        role: "tab",
        onclick: () => { state.activeTab = t.id; render(); },
      },
        h("span", { class: "badge-dot" }),
        t.label
      )
    ));
    layout.append(side);

    const content = h("div", { class: "dash-content" });
    layout.append(content);
    root.append(layout);

    renderTab(content, state.activeTab);
  }

  function renderTab(content, tabId) {
    content.append(h("div", { class: "dash-loading" }, h("div", { class: "dash-spinner" }), "Loading…"));

    switch (tabId) {
      case "overview":     return loadOverview(content);
      case "subscription": return renderSubscription(content);
      case "branding":     return loadBranding(content);
      case "population":   return loadPopulation(content);
      case "features":     return loadFeatures(content);
      case "setup":        return loadSetupStatus(content);
      case "support":      return renderSupport(content);
    }
  }

  /* ---- Tab: Overview ---- */
  async function loadOverview(content) {
    try {
      const o = await data.overview(state.selectedGuildId);
      clear(content);
      const plan = (o.plan || "free");
      const planLabel = plan === "lifetime" ? "Lifetime" : plan === "premium" ? "Premium Monthly" : "Free";
      const status = (o.subscription && o.subscription.status) || "free";
      const expires = (o.subscription && o.subscription.expiresAt) ? new Date(o.subscription.expiresAt) : null;
      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Overview"),
          h("dl", { class: "meta" },
            h("dt", null, "Plan"), h("dd", null, planLabel),
            h("dt", null, "Status"), h("dd", null, status),
            h("dt", null, "Expires"), h("dd", null, expires ? expires.toLocaleString() : "—"),
            h("dt", null, "Bot installed"), h("dd", null, o.botInstalled ? "Yes" : "No"),
            h("dt", null, "Enabled modules"), h("dd", null, (o.enabledFeatures && o.enabledFeatures.length) ? o.enabledFeatures.join(", ") : "—")
          )
        ),
        (o.missingConfig && o.missingConfig.length)
          ? h("div", { class: "dash-card" },
              h("h3", null, "Missing setup"),
              h("p", null, "Run ", h("code", null, "/setup"), " in your Discord server to configure these:"),
              h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "8px 0 0" } },
                ...o.missingConfig.map((k) => h("li", null, k))
              )
            )
          : null,
        h("div", { class: "dash-card" },
          h("h3", null, "Quick actions"),
          h("div", { class: "dash-actions" },
            btn("Manage in Discord (/setup)", { kind: "btn-primary", href: cfg.links && cfg.links.inviteBot, external: true }),
            btn("View /pop Settings", { kind: "btn-ghost", onclick: () => { state.activeTab = "population"; render(); } }),
            btn("Branding", { kind: "btn-ghost", onclick: () => { state.activeTab = "branding"; render(); } }),
            btn("Join Support", { kind: "btn-outline", href: cfg.links && cfg.links.supportDiscord, external: true })
          )
        )
      );
    } catch (e) { renderTabError(content, e); }
  }

  /* ---- Tab: Subscription (no fake payment) ---- */
  function renderSubscription(content) {
    clear(content);
    const g = state.guilds.find((x) => x.id === state.selectedGuildId) || {};
    const plan = g.plan || "free";
    const planLabel = plan === "lifetime" ? "Lifetime" : plan === "premium" ? "Premium Monthly" : "Free";
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
        h("ol", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0 0 16px", lineHeight: "1.8" } },
          h("li", null, "Invite Quick's ARK Bot to your Discord server."),
          h("li", null, "Open your server and run ", h("code", null, "/subscribe"), "."),
          h("li", null, "Select the Premium plan."),
          h("li", null, "Complete the PayPal checkout that opens from the bot."),
          h("li", null, "Your server activates automatically after payment.")
        ),
        h("div", { class: "dash-actions" },
          btn("Invite Bot", { kind: "btn-primary", href: cfg.links && cfg.links.inviteBot, external: true }),
          btn("Join Support Discord", { kind: "btn-ghost", href: cfg.links && cfg.links.supportDiscord, external: true })
        )
      )
    );
  }

  /* ---- Tab: Branding ---- */
  async function loadBranding(content) {
    try {
      const b = await data.branding(state.selectedGuildId);
      clear(content);

      if (!b.isPremium) {
        content.append(
          h("div", { class: "dash-card" },
            h("h3", null, "Premium Branding"),
            notice("warn", "Premium required",
              "Premium branding requires a Premium subscription. Free features remain active on this server."),
            h("div", { class: "dash-actions", style: { marginTop: "16px" } },
              btn("View Subscribe Flow", { kind: "btn-primary", onclick: () => { state.activeTab = "subscription"; render(); } }),
              btn("Learn more", { kind: "btn-ghost", href: "branding.html" })
            )
          )
        );
        return;
      }

      const v = b.branding || {};
      const card = h("div", { class: "dash-card" }, h("h3", null, "Branding"));
      const status = h("div");
      const form = h("form", { class: "dash-form" });

      function field(id, label, type, value, hint, attrs) {
        attrs = attrs || {};
        return h("div", { class: "dash-field" },
          h("label", { for: id }, label),
          h(type === "textarea" ? "textarea" : "input", Object.assign({ id, name: id, type: type === "textarea" ? null : type, value: value || "" }, attrs)),
          hint ? h("div", { class: "hint" }, hint) : null
        );
      }

      const inputs = [
        field("brandName", "Brand Name", "text", v.brandName, "Up to 64 chars. Replaces \"Quick's ARK Bot\" in embeds."),
        field("brandShort", "Short Name", "text", v.brandShort, "Up to 16 chars. Used in compact contexts."),
      ];
      form.append(h("div", { class: "dash-form-row" }, ...inputs));

      const colors = [
        field("embedColor", "Embed Color", "color", v.embedColor || "#dc2626", "Hex color for embed strip."),
        field("accentColor", "Accent Color", "color", v.accentColor || "#ef4444", "Hex color for action highlights."),
      ];
      form.append(h("div", { class: "dash-form-row" }, ...colors));

      form.append(
        field("logoUrl", "Logo URL", "url", v.logoUrl, "HTTPS only. PNG/JPG/WebP. Up to 256x256 recommended."),
        field("iconUrl", "Icon URL", "url", v.iconUrl, "HTTPS only. Small thumbnail."),
        field("footerText", "Footer Text", "text", v.footerText, "Up to 128 chars."),
        field("supportUrl", "Support URL", "url", v.supportUrl, "HTTPS only.")
      );

      const titles = [
        field("ticketTitle", "Ticket Panel Title", "text", v.ticketTitle),
        field("paymentTitle", "Payment Panel Title", "text", v.paymentTitle),
        field("welcomeTitle", "Welcome Title", "text", v.welcomeTitle),
        field("populationTitle", "/pop Title", "text", v.populationTitle),
      ];
      form.append(h("div", { class: "dash-form-row" }, titles[0], titles[1]));
      form.append(h("div", { class: "dash-form-row" }, titles[2], titles[3]));

      form.append(h("div", { class: "dash-field" },
        h("label", { for: "hideDefault" }, h("input", { type: "checkbox", id: "hideDefault", name: "hideDefault", checked: !!v.hideDefault, style: { width: "auto", marginRight: "8px" } }), "Hide default Quick's ARK Bot branding (where permitted)")
      ));

      form.append(h("div", { class: "dash-actions" },
        h("button", { type: "submit", class: "btn btn-primary" }, "Save Changes"),
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => resetBranding(content) }, "Reset to Default")
      ));

      form.addEventListener("submit", (e) => { e.preventDefault(); submitBranding(form, status, content); });

      // Live preview embed
      function makePreview() {
        const color = form.embedColor.value || "#dc2626";
        const brand = form.brandName.value || "Quick's ARK Bot";
        const footer = form.footerText.value || `${brand} · v1`;
        return h("div", { class: "preview-embed", style: { "--brand-accent": color, borderLeftColor: color } },
          h("div", { class: "pe-title" }, `${brand} · /pop Cluster Population`),
          h("div", { class: "pe-desc" }, "Total players: 184 / 620 · 11 / 12 maps online · Peak today 231"),
          h("div", { class: "pe-footer" }, footer)
        );
      }
      const previewWrap = h("div", { class: "dash-card" },
        h("h3", null, "Live preview"),
        h("p", null, "Approximate render of an embed using your branding values."),
        h("div", { id: "brand-preview-host" })
      );
      function refreshPreview() {
        const host = previewWrap.querySelector("#brand-preview-host");
        clear(host); host.append(makePreview());
      }
      form.addEventListener("input", refreshPreview);

      card.append(status, form);
      content.append(card, previewWrap);
      refreshPreview();
    } catch (e) { renderTabError(content, e); }
  }

  async function submitBranding(form, statusHost, content) {
    const payload = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name) return;
      if (el.type === "checkbox") payload[el.name] = el.checked;
      else if (el.value !== "") payload[el.name] = el.value;
    });
    clear(statusHost);
    statusHost.append(h("div", { class: "dash-loading", style: { padding: "12px 0" } }, h("div", { class: "dash-spinner" }), "Saving…"));
    try {
      await data.saveBranding(state.selectedGuildId, payload);
      clear(statusHost);
      statusHost.append(notice("success", "Branding saved", "Your embeds and panels will use these values from the next render."));
    } catch (e) {
      clear(statusHost);
      statusHost.append(notice("error", "Save failed", e.message));
    }
  }

  async function resetBranding(content) {
    if (!confirm("Reset all branding values to default?")) return;
    try {
      await data.resetBranding(state.selectedGuildId);
      loadBranding(content);
    } catch (e) { renderTabError(content, e); }
  }

  /* ---- Tab: Cluster Population ---- */
  async function loadPopulation(content) {
    try {
      const p = await data.population(state.selectedGuildId);
      clear(content);
      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Cluster Population (/pop)"),
          h("p", null, "Free for every server. ", h("strong", null, "No artificial cluster limits."), " Configure clusters here or in Discord with ", h("code", null, "/setup › Cluster Population"), ".")
        )
      );
      if (p.notice === "population_config_not_wired") {
        content.append(notice("info", "Population API not wired yet",
          "The backend's getPopulationConfig hook isn't connected. Configure clusters via /setup in Discord until the dashboard hook is wired."));
        return;
      }
      const clusters = p.clusters || [];
      if (!clusters.length) {
        content.append(notice("warn", "No clusters configured",
          "Use /setup in Discord to add your first cluster, or wire the dashboard's population hooks for in-browser editing."));
        return;
      }
      clusters.forEach((c) => {
        content.append(
          h("div", { class: "dash-card" },
            h("h3", null, c.name || "Untitled cluster"),
            h("dl", { class: "meta" },
              h("dt", null, "Provider"), h("dd", null, c.provider || "manual"),
              h("dt", null, "Visibility"), h("dd", null, c.public ? "Public" : "Private"),
              h("dt", null, "Maps"), h("dd", null, (c.maps && c.maps.length) || 0),
              h("dt", null, "Last updated"), h("dd", null, c.lastUpdated ? new Date(c.lastUpdated).toLocaleString() : "—"),
              h("dt", null, "Cached total"), h("dd", null, c.cachedTotal != null ? `${c.cachedTotal}` : "—")
            )
          )
        );
      });
    } catch (e) { renderTabError(content, e); }
  }

  /* ---- Tab: Features ---- */
  async function loadFeatures(content) {
    try {
      const o = await data.overview(state.selectedGuildId);
      const isPremium = (o.plan === "premium" || o.plan === "lifetime");
      clear(content);
      const FREE = ["Welcome messages","Auto roles","Role menus","/pop cluster population","Population charts","Basic pets"];
      const PREM = ["PayPal payments","Staff Pay","Hype","Advanced credits","Advanced tickets/logs","Premium branding","Advanced pets","Server templates"];
      const SOON = ["ARK Guard","Nitrado","Server status panel","Cluster automation"];
      const grid = (title, items, kind) => h("div", { class: "dash-card" },
        h("h3", null, title),
        h("div", { class: "dash-feat" }, ...items.map((name) =>
          h("div", { class: `dash-feat-card ${kind === "premium" && !isPremium ? "locked" : kind === "soon" ? "locked" : "ok"}` },
            h("span", { class: "name" }, name),
            h("span", { class: "state" }, kind === "premium" && !isPremium ? "Locked" : kind === "soon" ? "Soon" : "Active")
          )
        ))
      );
      content.append(
        grid("Free", FREE, "free"),
        grid("Premium", PREM, "premium"),
        grid("Coming Soon", SOON, "soon")
      );
    } catch (e) { renderTabError(content, e); }
  }

  /* ---- Tab: Setup Status ---- */
  async function loadSetupStatus(content) {
    try {
      const s = await data.setupStatus(state.selectedGuildId);
      clear(content);
      const entries = [
        ["welcome", "Welcome messages"],
        ["autoRoles", "Auto roles"],
        ["roleMenus", "Role menus"],
        ["population", "/pop clusters"],
        ["branding", "Branding"],
        ["payments", "Payments (PayPal)"],
        ["staffPay", "Staff Pay"],
        ["hype", "Hype"],
        ["tickets", "Tickets"],
      ];
      content.append(
        h("div", { class: "dash-card" },
          h("h3", null, "Setup Status"),
          h("p", null, "Most setup actions can also be done in Discord using ", h("code", null, "/setup"), "."),
          h("div", { class: "dash-feat" }, ...entries.map(([k, label]) =>
            h("div", { class: `dash-feat-card ${s[k] ? "ok" : "missing"}` },
              h("span", { class: "name" }, label),
              h("span", { class: "state" }, s[k] ? "Configured" : "Missing")
            )
          ))
        )
      );
    } catch (e) { renderTabError(content, e); }
  }

  /* ---- Tab: Support ---- */
  function renderSupport(content) {
    clear(content);
    content.append(
      h("div", { class: "dash-card" },
        h("h3", null, "Support"),
        h("p", null, "Common commands:"),
        h("ul", { style: { color: "var(--text-muted)", paddingLeft: "20px", margin: "0 0 16px" } },
          h("li", null, h("code", null, "/setup"), " — open the Setup Hub"),
          h("li", null, h("code", null, "/subscribe"), " — start or renew premium"),
          h("li", null, h("code", null, "/pop"), " — show cluster population"),
          h("li", null, h("code", null, "/premium-admin"), " — bot owner only")
        ),
        h("div", { class: "dash-actions" },
          btn("Join Support Discord", { kind: "btn-primary", href: cfg.links && cfg.links.supportDiscord, external: true }),
          btn("Email Support", { kind: "btn-ghost", href: `mailto:${(cfg.links && cfg.links.contactEmail) || ""}?subject=${encodeURIComponent("Quick's ARK Bot Support")}` })
        )
      )
    );
  }

  function renderTabError(content, err) {
    clear(content);
    if (err.code === 401) {
      state.user = null;
      return render();
    }
    if (err.code === 403) {
      return content.append(notice("error", "Access denied",
        "You don't have permission to view this server's settings. Manage Server or Administrator permission is required."));
    }
    if (err.message === "backend_not_configured") {
      state.user = null;
      return renderNoBackend();
    }
    content.append(notice("error", "Couldn't load", err.message || "Unknown error"));
  }

  /* ============================================================
     Actions
     ============================================================ */
  async function loadInitial(force) {
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
      if (e.code === 401 || e.message === "not_logged_in") {
        state.user = null;
        return renderLoggedOut();
      }
      clear(root);
      root.append(notice("error", "Couldn't reach the dashboard backend",
        `${e.message}. If this persists, the backend may be offline or the SITE_CONFIG.backendApiUrl is wrong.`));
    }
  }

  function selectGuild(id) {
    state.selectedGuildId = id;
    state.activeTab = "overview";
    render();
  }

  async function handleLogout() {
    try { await auth.logout(); } catch {}
    state.user = null;
    state.guilds = [];
    state.selectedGuildId = null;
    render();
  }

  /* Boot */
  loadInitial();
})();
