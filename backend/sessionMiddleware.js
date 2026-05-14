/**
 * Quick's ARK Bot — Dashboard session middleware
 * ------------------------------------------------------------
 * Drop into your bot's Square Cloud Express server.
 * Requires: express-session (`npm install express-session`)
 *
 * Cookies are configured for cross-site (Cloudflare Pages frontend
 * <-> Square Cloud backend), so they need sameSite=None + secure.
 * That means the backend MUST be served over HTTPS in production.
 */

const session = require("express-session");

function createSessionMiddleware() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET env var is required for the dashboard");
  }
  const isProd = process.env.NODE_ENV === "production";
  return session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: "quicksark_sid",
    cookie: {
      httpOnly: true,
      secure: isProd, // requires HTTPS in prod
      sameSite: isProd ? "none" : "lax", // cross-site cookie in prod
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  });
}

module.exports = createSessionMiddleware;
