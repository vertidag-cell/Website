/**
 * Dashboard API routes.
 * Mount at /api/dashboard.
 *
 * Required opts (passed by your bot's server.js):
 *   client                    your discord.js client (used to check bot installation)
 *   getGuildSettings(id)      → returns parsed JSON settings for the guild, or null
 *   updateGuildSettings(id, partial)  → merges partial into the settings JSON and saves
 *   getPopulationConfig(id)   (optional) → returns { clusters: [...] } or null
 *   savePopulationConfig(id, payload)  (optional) → persists & returns result
 *   audit({ userId, guildId, action })  (optional) → log dashboard actions
 */

const express = require("express");
const { requireGuildAccess, canManageGuild, isSuperAdmin } = require("./permissionService");
const branding = require("./brandingService");

function createDashboardRouter(opts) {
  opts = opts || {};
  const {
    client,
    getGuildSettings,
    updateGuildSettings,
    getPopulationConfig,
    savePopulationConfig,
    audit,
  } = opts;

  if (typeof getGuildSettings !== "function" || typeof updateGuildSettings !== "function") {
    throw new Error("dashboardRoutes: getGuildSettings and updateGuildSettings are required");
  }

  const router = express.Router();
  const requireGuild = requireGuildAccess({ client });

  // -------- Identity --------
  router.get("/me", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "not_logged_in" });
    res.json({ user: req.session.user });
  });

  // -------- Guild list --------
  router.get("/guilds", (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "not_logged_in" });
    const userGuilds = req.session.guilds || [];
    const superAdmin = isSuperAdmin(req.session.user.id);
    const out = userGuilds
      .filter((g) => canManageGuild(g) || superAdmin)
      .map((g) => {
        const botGuild = client && client.guilds && client.guilds.cache.get(g.id);
        const settings = (getGuildSettings(g.id) || {});
        const sub = settings.subscription || {};
        return {
          id: g.id,
          name: g.name,
          icon: g.icon,
          owner: !!g.owner,
          permissions: String(g.permissions || "0"),
          botInstalled: !!botGuild,
          canManage: true,
          plan: settings.plan || "free",
          status: sub.status || (settings.plan && settings.plan !== "free" ? "active" : "free"),
          expiresAt: sub.expiresAt || null,
        };
      });
    res.json({ guilds: out });
  });

  // -------- Overview --------
  router.get("/guilds/:guildId/overview", requireGuild, (req, res) => {
    const settings = getGuildSettings(req.params.guildId) || {};
    const sub = settings.subscription || {};
    res.json({
      guild: {
        id: req.params.guildId,
        name: (req.botGuild && req.botGuild.name) || req.userGuild.name,
        icon: (req.botGuild && req.botGuild.icon) || req.userGuild.icon,
      },
      botInstalled: !!req.botGuild,
      plan: settings.plan || "free",
      subscription: {
        status: sub.status || (settings.plan && settings.plan !== "free" ? "active" : "free"),
        expiresAt: sub.expiresAt || null,
        renewedAt: sub.renewedAt || null,
      },
      enabledFeatures: detectEnabledFeatures(settings),
      missingConfig: detectMissingConfig(settings),
    });
  });

  // -------- Branding --------
  router.get("/guilds/:guildId/branding", requireGuild, (req, res) => {
    const settings = getGuildSettings(req.params.guildId) || {};
    res.json({
      isPremium: isPremium(settings),
      branding: branding.readBranding(settings),
    });
  });

  router.post("/guilds/:guildId/branding", requireGuild, (req, res) => {
    const settings = getGuildSettings(req.params.guildId) || {};
    if (!isPremium(settings)) return res.status(403).json({ error: "premium_required" });

    const { branding: updated, errors } = branding.validateBrandingPayload(req.body || {});
    if (errors.length) return res.status(400).json({ error: "validation_failed", errors });

    const merged = Object.assign({}, settings.branding || {}, updated);
    updateGuildSettings(req.params.guildId, { branding: merged });
    if (audit) audit({ userId: req.session.user.id, guildId: req.params.guildId, action: "branding_update" });
    res.json({ ok: true, branding: merged });
  });

  router.post("/guilds/:guildId/branding/reset", requireGuild, (req, res) => {
    const settings = getGuildSettings(req.params.guildId) || {};
    if (!isPremium(settings)) return res.status(403).json({ error: "premium_required" });
    const empty = branding.emptyBranding();
    updateGuildSettings(req.params.guildId, { branding: empty });
    if (audit) audit({ userId: req.session.user.id, guildId: req.params.guildId, action: "branding_reset" });
    res.json({ ok: true, branding: empty });
  });

  // -------- /pop Cluster Population --------
  router.get("/guilds/:guildId/population", requireGuild, (req, res) => {
    if (typeof getPopulationConfig !== "function") {
      return res.json({ clusters: [], notice: "population_config_not_wired" });
    }
    const data = getPopulationConfig(req.params.guildId) || { clusters: [] };
    res.json(data);
  });

  router.post("/guilds/:guildId/population/clusters", requireGuild, (req, res) => {
    if (typeof savePopulationConfig !== "function") {
      return res.status(501).json({ error: "not_implemented" });
    }
    const result = savePopulationConfig(req.params.guildId, req.body || {});
    if (audit) audit({ userId: req.session.user.id, guildId: req.params.guildId, action: "population_cluster_save" });
    res.json(result);
  });

  router.post("/guilds/:guildId/population/clusters/:clusterId", requireGuild, (req, res) => {
    if (typeof savePopulationConfig !== "function") {
      return res.status(501).json({ error: "not_implemented" });
    }
    const result = savePopulationConfig(req.params.guildId, { clusterId: req.params.clusterId, patch: req.body || {} });
    if (audit) audit({ userId: req.session.user.id, guildId: req.params.guildId, action: "population_cluster_update" });
    res.json(result);
  });

  router.delete("/guilds/:guildId/population/clusters/:clusterId", requireGuild, (req, res) => {
    if (typeof savePopulationConfig !== "function") {
      return res.status(501).json({ error: "not_implemented" });
    }
    const result = savePopulationConfig(req.params.guildId, { clusterId: req.params.clusterId, delete: true });
    if (audit) audit({ userId: req.session.user.id, guildId: req.params.guildId, action: "population_cluster_delete" });
    res.json(result);
  });

  // -------- Setup status --------
  router.get("/guilds/:guildId/settings/status", requireGuild, (req, res) => {
    const s = getGuildSettings(req.params.guildId) || {};
    res.json({
      welcome:   !!(s.welcome && s.welcome.channelId),
      autoRoles: !!(s.autoRoles && s.autoRoles.length),
      roleMenus: !!(s.roleMenus && s.roleMenus.length),
      population:!!(s.population && s.population.clusters && s.population.clusters.length),
      branding:  !!(s.branding && Object.values(s.branding).some((v) => v !== "" && v !== false)),
      payments:  !!(s.payments && s.payments.paypal),
      staffPay:  !!(s.staffPay && s.staffPay.forumChannelId),
      hype:      !!(s.hype && s.hype.enabled),
      tickets:   !!(s.tickets && s.tickets.panelChannelId),
    });
  });

  return router;
}

function isPremium(settings) {
  if (!settings) return false;
  return settings.plan === "premium" || settings.plan === "lifetime";
}

function detectEnabledFeatures(settings) {
  const f = [];
  if (settings.welcome && settings.welcome.channelId) f.push("Welcome");
  if (settings.autoRoles && settings.autoRoles.length) f.push("Auto roles");
  if (settings.roleMenus && settings.roleMenus.length) f.push("Role menus");
  if (settings.population && settings.population.clusters && settings.population.clusters.length) f.push("/pop");
  if (settings.payments && settings.payments.paypal) f.push("Payments");
  if (settings.staffPay && settings.staffPay.forumChannelId) f.push("Staff Pay");
  if (settings.hype && settings.hype.enabled) f.push("Hype");
  if (settings.tickets && settings.tickets.panelChannelId) f.push("Tickets");
  if (settings.branding && Object.values(settings.branding).some((v) => v !== "" && v !== false)) f.push("Branding");
  return f;
}

function detectMissingConfig(settings) {
  const missing = [];
  if (!settings.welcome || !settings.welcome.channelId) missing.push("Welcome channel");
  if (!settings.autoRoles || !settings.autoRoles.length) missing.push("Auto roles");
  if (!settings.roleMenus || !settings.roleMenus.length) missing.push("Role menus");
  if (!settings.population || !settings.population.clusters || !settings.population.clusters.length) missing.push("/pop clusters");
  return missing;
}

module.exports = createDashboardRouter;
