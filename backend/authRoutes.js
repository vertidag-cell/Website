/**
 * Discord OAuth login / callback / logout routes.
 * Mount at /auth.
 *
 * Required env vars:
 *   DISCORD_CLIENT_ID
 *   DISCORD_CLIENT_SECRET
 *   DISCORD_REDIRECT_URI       e.g. https://arkoris.net/auth/discord/callback
 *   DASHBOARD_FRONTEND_URL     e.g. https://arkoris.net
 */

const express = require("express");
const crypto = require("crypto");
const oauth = require("./discordOAuthService");

function createAuthRouter(opts) {
  opts = opts || {};
  const router = express.Router();

  router.get("/discord/login", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;
    const url = oauth.buildAuthUrl(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_REDIRECT_URI,
      state
    );
    res.redirect(url);
  });

  router.get("/discord/callback", async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(frontend(req) + "dashboard.html?error=" + encodeURIComponent(error));
    if (!code || !state) return res.status(400).send("Missing code or state");
    if (state !== req.session.oauthState) return res.status(403).send("Invalid OAuth state");
    delete req.session.oauthState;

    try {
      const tokens = await oauth.exchangeCode(
        code,
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_CLIENT_SECRET,
        process.env.DISCORD_REDIRECT_URI
      );
      const [me, guilds] = await Promise.all([
        oauth.fetchMe(tokens.access_token),
        oauth.fetchGuilds(tokens.access_token),
      ]);

      const sessionUser = {
        id: me.id,
        username: me.username,
        globalName: me.global_name || me.username,
        avatar: me.avatar,
      };
      // Cache the raw guilds list (id, name, icon, owner, permissions) for
      // permission checks. We do NOT store the access token long-term.
      const sessionGuilds = (guilds || []).map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: !!g.owner,
        permissions: g.permissions,
      }));
      const tokenExpiresAt = Date.now() + (tokens.expires_in || 0) * 1000;

      // Rotate the anonymous OAuth-state session into an authenticated session.
      await regenerateSession(req);
      req.session.user = sessionUser;
      req.session.guilds = sessionGuilds;
      req.session.tokenExpiresAt = tokenExpiresAt;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");

      if (typeof opts.audit === "function") {
        opts.audit({ userId: me.id, action: "login" });
      }

      res.redirect(frontend(req) + "dashboard.html");
    } catch (e) {
      console.error("[dashboard-auth] callback error:", e);
      res.status(500).send("OAuth callback failed");
    }
  });

  router.post("/logout", (req, res) => {
    const userId = req.session && req.session.user && req.session.user.id;
    req.session.destroy(() => {
      if (typeof opts.audit === "function" && userId) {
        opts.audit({ userId, action: "logout" });
      }
      res.json({ ok: true });
    });
  });

  return router;
}

function frontend(req) {
  let f = process.env.DASHBOARD_FRONTEND_URL || "/";
  if (!f.endsWith("/")) f += "/";
  return f;
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = createAuthRouter;
