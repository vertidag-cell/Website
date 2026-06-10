# Dashboard backend — integration guide

This `backend/` folder is **scaffold code** for your bot's Express server on Square Cloud. The website (Cloudflare Pages) is the frontend; this code is the backend it talks to.

**Copy these files into your bot project** (e.g. `src/web/dashboard/`). Do not deploy them from this Website repo.

## Files

| File | Purpose |
|---|---|
| `sessionMiddleware.js` | `express-session` configured for cross-site cookies (Cloudflare Pages ↔ Square Cloud) |
| `discordOAuthService.js` | Builds OAuth URL + exchanges code + fetches user/guilds |
| `authRoutes.js` | `/auth/discord/login`, `/auth/discord/callback`, `/auth/logout` |
| `permissionService.js` | Checks if a logged-in user can manage a given guild |
| `brandingService.js` | Validates branding payload (hex colors, HTTPS URLs, length limits) |
| `securityMiddleware.js` | CORS allowlist, proxy-secret check, and CSRF protection |
| `dashboardRoutes.js` | `/api/dashboard/*` — guilds list, overview, branding, /pop, status |
| `server.example.js` | Reference wiring inside your bot's Express server |
| `.env.example` | Env vars you need to add to Square Cloud secrets |
| `package.json.example` | Dependencies to add to your bot's `package.json` |

## Steps

### 1. Add dependencies to your bot

```bash
npm install express express-session cors
```

(Node 18+ has global `fetch`. On older Node, also `npm install node-fetch` and update `discordOAuthService.js` to import it.)

### 2. Create a Discord OAuth2 app

1. Go to https://discord.com/developers/applications
2. Use your existing bot's app (the one with client ID `1487468686150336614`).
3. **OAuth2 → Redirects**: add `https://arkoris.net/auth/discord/callback`
4. **OAuth2 → Client Secret**: copy it (you'll set `DISCORD_CLIENT_SECRET`).

### 3. Set env vars on Square Cloud

Copy `.env.example` and fill it in. Required:

```
DISCORD_CLIENT_ID=1487468686150336614
DISCORD_CLIENT_SECRET=<from step 2>
DISCORD_REDIRECT_URI=https://arkoris.net/auth/discord/callback
SESSION_SECRET=<random 64+ char string>
DASHBOARD_FRONTEND_URL=https://arkoris.net
DASHBOARD_ALLOWED_ORIGIN=https://arkoris.net
PROXY_SECRET=<same random value set on Cloudflare Pages/Worker>
NODE_ENV=production
```

Generate `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate `PROXY_SECRET` the same way, then set that exact value on both the
Cloudflare Pages/Worker environment and the Square Cloud backend. When it is
set, the backend rejects direct origin hits that did not pass through arkoris.net.

### 4. Mount the routes on your existing Express app

See `server.example.js`. The critical bits, in order:

```js
app.set("trust proxy", 1);
app.use(["/auth", "/api"], requireProxySecret());
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: "32kb" }));
app.use(createSessionMiddleware());
app.use("/auth", createCsrfRouter());
app.use(["/auth", "/api/dashboard"], requireCsrfProtection());
app.use("/auth", createAuthRouter({ audit }));
app.use("/api/dashboard", createDashboardRouter({
  client,
  getGuildSettings,
  updateGuildSettings,
  // optional:
  getPopulationConfig,
  savePopulationConfig,
  audit,
}));
```

You provide `getGuildSettings` and `updateGuildSettings` — they wrap whatever sql.js helper you already use for the `guild_settings.settings` JSON blob. Example in `server.example.js`.

### 5. Tell the frontend where the backend lives

Keep the Website repo's `config.js` dashboard API base empty:

```js
backendApiUrl: "",
```

The dashboard calls same-origin `/api/*` and `/auth/*`; Cloudflare proxies those
requests to Square Cloud and adds `X-Arkoris-Proxy`.

## Routes summary

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET  | `/auth/csrf` | session | `{ csrfToken }` |
| GET  | `/auth/discord/login` | none | 302 → Discord authorize |
| GET  | `/auth/discord/callback` | OAuth state | 302 → dashboard.html |
| POST | `/auth/logout` | session + CSRF | `{ ok: true }` |
| GET  | `/api/dashboard/me` | session | `{ user }` |
| GET  | `/api/dashboard/guilds` | session | `{ guilds: [...] }` |
| GET  | `/api/dashboard/guilds/:id/overview` | session + perms | overview JSON |
| GET  | `/api/dashboard/guilds/:id/branding` | session + perms | `{ isPremium, branding }` |
| POST | `/api/dashboard/guilds/:id/branding` | session + perms + premium + CSRF | validated save |
| POST | `/api/dashboard/guilds/:id/branding/reset` | session + perms + premium + CSRF | resets to empty |
| GET  | `/api/dashboard/guilds/:id/population` | session + perms | clusters config |
| POST | `/api/dashboard/guilds/:id/population/clusters` | session + perms + CSRF | save (501 if hook absent) |
| POST | `/api/dashboard/guilds/:id/population/clusters/:cid` | session + perms + CSRF | update cluster |
| DELETE | `/api/dashboard/guilds/:id/population/clusters/:cid` | session + perms + CSRF | delete cluster |
| GET  | `/api/dashboard/guilds/:id/settings/status` | session + perms | feature configured/missing booleans |

## Permission rules

A user can manage a guild if **all** of:

1. They are logged in via Discord OAuth.
2. Either (a) they are the guild **owner**, or (b) their permissions on that guild include **Administrator** or **Manage Server**.
3. The bot is installed in that guild (for routes that touch live settings).

`BOT_SUPER_ADMINS` (comma-separated user IDs) overrides 1–3 for emergency access.

All permission checks are backend-side. The frontend's permission badges are display-only.

## What the frontend NEVER sees

- Discord bot token
- Discord client secret
- PayPal client secret or webhook secret
- BattleMetrics or any third-party API token
- `SESSION_SECRET`
- Raw OAuth access tokens (we cache identity + guild list server-side after exchange; we never send the access token back to the browser)
- Database paths or queries

## What the backend MUST never do

- Process payments. Subscriptions happen via `/subscribe` inside Discord. The dashboard never opens PayPal.
- Trust frontend permission claims. Every guild-scoped route runs `requireGuildAccess`.
- Echo the OAuth access token back in any API response.

## Audit

Pass an `audit({ userId, guildId, action })` callback to log dashboard actions (login, logout, branding_update, branding_reset, population_cluster_*). The provided example just `console.log`s — wire it to your existing audit table if you have one.

## Troubleshooting

- **"Backend not configured"** on dashboard → make sure the Cloudflare `/api/*` and `/auth/*` proxy routes are deployed and the Square Cloud backend is reachable. Keep `backendApiUrl` empty in `config.js`.
- **Login redirects to Discord but bounces back with `invalid_state`** → cookies are dropping. Check that `NODE_ENV=production` is set so the session cookie is `secure + sameSite=none`, and that both the backend and the frontend are HTTPS.
- **CORS error** → `DASHBOARD_ALLOWED_ORIGIN` must match the frontend's origin exactly (no trailing slash). And the CORS middleware must be loaded **before** the session middleware.
- **`401 not_logged_in` immediately after callback** → the session cookie isn't reaching the API. Same fix as the `invalid_state` case.
- **Guilds list is empty** → user has Manage Server / Administrator on zero guilds, OR `client.guilds.cache` is empty on the bot side. Both are checked.

## What's still TODO

- `getPopulationConfig` and `savePopulationConfig` hooks are optional. Wire them to your `/pop` module to enable cluster CRUD from the dashboard.
- Audit log persistence: provided callback is currently `console.log` only.
- Dashboard session store: defaults to in-memory `express-session` MemoryStore (fine for one process, not for multi-instance). Add `connect-sqlite3` or similar if you scale out.
