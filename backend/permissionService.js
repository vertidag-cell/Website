/**
 * Permission helpers — backend is the only place that decides if a user
 * can manage a guild. Frontend permission checks are display-only.
 */

const ADMINISTRATOR = BigInt(0x8);
const MANAGE_GUILD = BigInt(0x20);

function canManageGuild(userGuild) {
  if (!userGuild) return false;
  if (userGuild.owner) return true;
  let perms;
  try { perms = BigInt(userGuild.permissions || 0); } catch { return false; }
  return (perms & ADMINISTRATOR) === ADMINISTRATOR
      || (perms & MANAGE_GUILD) === MANAGE_GUILD;
}

function isSuperAdmin(userId) {
  if (!userId) return false;
  const raw = (process.env.BOT_SUPER_ADMINS || "").trim();
  if (!raw) return false;
  return raw.split(/[\s,]+/).filter(Boolean).includes(String(userId));
}

function getSessionUserGuild(req, guildId) {
  const guilds = (req.session && req.session.guilds) || [];
  return guilds.find((g) => g.id === guildId);
}

/**
 * Express middleware: only continue if the logged-in user can manage
 * :guildId. Populates req.userGuild and req.botGuild.
 */
function requireGuildAccess(opts) {
  opts = opts || {};
  const { client } = opts;
  return function (req, res, next) {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "not_logged_in" });
    }
    const guildId = req.params.guildId;
    if (!guildId) return res.status(400).json({ error: "missing_guild_id" });

    const userGuild = getSessionUserGuild(req, guildId);
    const isSuper = isSuperAdmin(req.session.user.id);

    if (!userGuild && !isSuper) {
      return res.status(403).json({ error: "no_access" });
    }
    if (userGuild && !canManageGuild(userGuild) && !isSuper) {
      return res.status(403).json({ error: "insufficient_permissions" });
    }

    req.userGuild = userGuild || { id: guildId, name: "Super Admin Access" };
    req.botGuild = client && client.guilds && client.guilds.cache.get(guildId);
    next();
  };
}

module.exports = {
  ADMINISTRATOR,
  MANAGE_GUILD,
  canManageGuild,
  isSuperAdmin,
  getSessionUserGuild,
  requireGuildAccess,
};
