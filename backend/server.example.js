/**
 * Example: how to mount the dashboard backend on your existing
 * bot's Express server. Adapt the imports to your project layout.
 *
 * This file is documentation, not a standalone server. Your real
 * server already exists in the Square Cloud bot project — this
 * just shows which middleware to add and in what order.
 */

const express = require("express");
const cors = require("cors");

// 1) Bring in the dashboard pieces (drop the backend/ folder of this
//    repo into your bot project at e.g. src/web/dashboard/ and adjust
//    these paths).
const createSessionMiddleware = require("./sessionMiddleware");
const {
  createCorsOptions,
  createCsrfRouter,
  requireCsrfProtection,
  requireProxySecret,
} = require("./securityMiddleware");
const createAuthRouter = require("./authRoutes");
const createDashboardRouter = require("./dashboardRoutes");

// 2) Wire to your existing bot/db code:
//    - `client` is your discord.js Client (already in your bot code)
//    - getGuildSettings / updateGuildSettings should wrap whatever
//      sql.js helpers you already use for guild_settings.settings.

const client = require("../bot").client;           // <-- adapt to your project
const db = require("../db");                       // <-- adapt to your project

function getGuildSettings(guildId) {
  // Return parsed JSON for guild_settings.settings (or {} if missing).
  const row = db.prepare("SELECT settings FROM guild_settings WHERE id = ?").get(guildId);
  if (!row || !row.settings) return {};
  try { return JSON.parse(row.settings); } catch { return {}; }
}

function updateGuildSettings(guildId, partial) {
  const current = getGuildSettings(guildId);
  const merged = Object.assign({}, current, partial);
  const json = JSON.stringify(merged);
  db.prepare(
    "INSERT INTO guild_settings (id, settings) VALUES (?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET settings = excluded.settings"
  ).run(guildId, json);
}

// Optional: /pop config hooks — wire to your population module if you have one.
function getPopulationConfig(guildId) {
  const s = getGuildSettings(guildId);
  return (s && s.population) || { clusters: [] };
}
function savePopulationConfig(guildId, payload) {
  // TODO: implement add/update/delete based on payload.clusterId / payload.delete
  return { ok: false, error: "not_implemented" };
}

function audit({ userId, guildId, action }) {
  console.log(`[dashboard-audit] user=${userId} guild=${guildId || "-"} action=${action}`);
}

// 3) Create or reuse your existing Express app
const app = express();

// 4) Add CORS + JSON + session + trust proxy (Square Cloud runs behind a proxy)
app.set("trust proxy", 1);
app.use(["/auth", "/api"], requireProxySecret());
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: "32kb" }));
app.use(createSessionMiddleware());
app.use("/auth", createCsrfRouter());
app.use(["/auth", "/api/dashboard"], requireCsrfProtection());

// 5) Mount the dashboard
app.use("/auth", createAuthRouter({ audit }));
app.use("/api/dashboard", createDashboardRouter({
  client,
  getGuildSettings,
  updateGuildSettings,
  getPopulationConfig,
  savePopulationConfig,
  audit,
}));

// 6) Health check
app.get("/healthz", (req, res) => res.json({ ok: true, time: Date.now() }));

// 7) Start (use whatever port Square Cloud expects)
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[dashboard-backend] listening on :${port}`));
