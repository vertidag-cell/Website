/**
 * Premium branding validation and shape.
 * Pure functions — no DB calls. Wire them up in dashboardRoutes.js.
 */

const HEX_RE = /^#[0-9a-f]{6}$/i;
const ALLOWED_PROTOCOLS = ["https:"];
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;

function isHex(v) { return typeof v === "string" && HEX_RE.test(v); }
function isHttpsUrl(v) {
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return ALLOWED_PROTOCOLS.includes(u.protocol);
  } catch { return false; }
}
function isImageUrl(v) { return isHttpsUrl(v) && IMAGE_EXT_RE.test(v); }

function sanitizeText(v, max) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return "";
  if (trimmed.includes("@everyone") || trimmed.includes("@here")) return null;
  return trimmed.slice(0, max);
}

const FIELDS = [
  { key: "brandName",       validate: (v) => sanitizeText(v, 64) },
  { key: "brandShort",      validate: (v) => sanitizeText(v, 16) },
  { key: "embedColor",      validate: (v) => isHex(v) ? v : null },
  { key: "accentColor",     validate: (v) => isHex(v) ? v : null },
  { key: "logoUrl",         validate: (v) => v === "" ? "" : (isImageUrl(v) ? v : null) },
  { key: "iconUrl",         validate: (v) => v === "" ? "" : (isImageUrl(v) ? v : null) },
  { key: "footerText",      validate: (v) => sanitizeText(v, 128) },
  { key: "supportUrl",      validate: (v) => v === "" ? "" : (isHttpsUrl(v) ? v : null) },
  { key: "ticketTitle",     validate: (v) => sanitizeText(v, 64) },
  { key: "paymentTitle",    validate: (v) => sanitizeText(v, 64) },
  { key: "welcomeTitle",    validate: (v) => sanitizeText(v, 64) },
  { key: "populationTitle", validate: (v) => sanitizeText(v, 64) },
  { key: "hideDefault",     validate: (v) => typeof v === "boolean" ? v : null },
];

function emptyBranding() {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.key === "hideDefault" ? false : "";
  return out;
}

function readBranding(guildSettings) {
  const branding = (guildSettings && guildSettings.branding) || {};
  const empty = emptyBranding();
  return Object.assign({}, empty, branding);
}

function validateBrandingPayload(payload) {
  if (!payload || typeof payload !== "object") return { branding: {}, errors: ["invalid_payload"] };
  const out = {};
  const errors = [];
  for (const f of FIELDS) {
    if (!(f.key in payload)) continue;
    const v = f.validate(payload[f.key]);
    if (v === null) errors.push(`invalid_${f.key}`);
    else out[f.key] = v;
  }
  return { branding: out, errors };
}

module.exports = { FIELDS, emptyBranding, readBranding, validateBrandingPayload };
