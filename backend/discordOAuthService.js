/**
 * Discord OAuth2 helpers.
 * Uses native fetch (Node 18+) — if your Node is older, install
 * `node-fetch` and `const fetch = require("node-fetch")`.
 */

const TOKEN_URL = "https://discord.com/api/oauth2/token";
const ME_URL = "https://discord.com/api/users/@me";
const GUILDS_URL = "https://discord.com/api/users/@me/guilds";

function buildAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function fetchMe(accessToken) {
  const res = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`fetchMe failed: ${res.status}`);
  return res.json();
}

async function fetchGuilds(accessToken) {
  const res = await fetch(GUILDS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`fetchGuilds failed: ${res.status}`);
  return res.json();
}

module.exports = { buildAuthUrl, exchangeCode, fetchMe, fetchGuilds };
