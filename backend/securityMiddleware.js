/**
 * Dashboard security middleware.
 *
 * These helpers are dependency-free so they can be copied into the bot project
 * with the rest of backend/.
 */

const crypto = require("crypto");
const express = require("express");

const CSRF_HEADER = "x-arkoris-csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function timingSafeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function parseAllowedOrigins(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsOptions() {
  const allowed = parseAllowedOrigins(
    process.env.DASHBOARD_ALLOWED_ORIGINS || process.env.DASHBOARD_ALLOWED_ORIGIN
  );
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !allowed.length) {
    throw new Error("DASHBOARD_ALLOWED_ORIGIN is required in production");
  }

  return {
    credentials: true,
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (!allowed.length && !isProd) return cb(null, true);
      return cb(null, allowed.includes(origin));
    },
  };
}

function requireProxySecret() {
  const expected = process.env.PROXY_SECRET;
  return function proxySecretMiddleware(req, res, next) {
    if (!expected) return next();

    const supplied = req.get("X-Arkoris-Proxy");
    if (!timingSafeEqual(supplied, expected)) {
      return res.status(403).json({ error: "proxy_required" });
    }
    return next();
  };
}

function ensureCsrfToken(req) {
  if (!req.session) {
    throw new Error("CSRF middleware requires express-session before it");
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return req.session.csrfToken;
}

function createCsrfRouter() {
  const router = express.Router();
  router.get("/csrf", (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "not_logged_in" });
    }
    res.json({ csrfToken: ensureCsrfToken(req) });
  });
  return router;
}

function requireCsrfProtection(opts) {
  opts = opts || {};
  const exemptPaths = new Set(opts.exemptPaths || ["/auth/session"]);

  return function csrfMiddleware(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const path = (req.originalUrl || req.url || "").split("?")[0];
    if (exemptPaths.has(path)) return next();
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: "not_logged_in" });
    }

    let expected;
    try {
      expected = ensureCsrfToken(req);
    } catch (e) {
      return next(e);
    }

    const supplied = req.get(CSRF_HEADER);
    if (!supplied || !timingSafeEqual(supplied, expected)) {
      return res.status(403).json({ error: "csrf_failed" });
    }
    return next();
  };
}

module.exports = {
  CSRF_HEADER,
  createCorsOptions,
  createCsrfRouter,
  requireCsrfProtection,
  requireProxySecret,
};
