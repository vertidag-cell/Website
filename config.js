/*
 * Quick's ARK Bot — Site Configuration (central, public)
 * ------------------------------------------------------------
 * Edit this file to change links, pricing, contact details, and
 * brand info across the entire site. All HTML pages read from
 * this file via data-link / data-text attributes.
 *
 * SAFE TO EXPOSE: this is a public config. Nothing here is secret.
 * Do not add Discord bot tokens, PayPal secrets, OAuth client secrets,
 * webhook secrets, database URLs, or API keys to this file.
 *
 * SUBSCRIBE FLOW: subscriptions happen inside Discord via the
 * /subscribe command after inviting the bot. The website does not
 * process payments. Subscribe buttons link to the pricing page
 * which documents the Discord-only flow.
 */

window.SITE_CONFIG = {
  brand: {
    name: "Quick's ARK Bot",
    short: "Quick's",
    tagline: "Advanced Discord automation for ARK and gaming communities.",
  },

  websiteUrl: "https://50bf9296.website-1h0.pages.dev/",

  /*
   * Backend API base URL for the customer dashboard.
   *
   * Left EMPTY on purpose: the dashboard now talks to its own origin
   * (relative /api/* and /auth/* URLs). Cloudflare Pages Functions in
   * /functions reverse-proxy those paths to the bot's Square Cloud
   * backend, so the session cookie stays first-party — which is what
   * makes login work on mobile (Safari/Chrome block third-party
   * cookies). Do NOT point this back at the squareweb.app URL.
   */
  backendApiUrl: "",

  links: {
    // External — opens in new tab
    // Server (guild) install — scope=bot forces the "Add to Server" flow
    // (not a user install); integration_type=0 makes that explicit.
    // permissions=8 = Administrator.
    inviteBot:
      "https://discord.com/oauth2/authorize?client_id=1487468686150336614&permissions=8&scope=bot+applications.commands&integration_type=0",
    supportDiscord: "https://discord.gg/MXS3ZcsCSH",

    // Internal — same tab, points to pages that explain the flow
    subscribe: "pricing.html",
    dashboardLogin: "dashboard.html",

    // Email — auto-converted to mailto: with subject
    contactEmail: "QuicksARKPP@gmail.com",
  },

  // Three tiers. Edit price strings exactly as they should display.
  pricing: {
    free: {
      name: "Free",
      price: "$0",
      period: "",
      cadence: "Forever · no card required",
      cta: "Invite the Bot",
      ctaLink: "inviteBot",
      featured: false,
      features: [
        "Welcome messages",
        "Auto roles",
        "Role menus (no limits)",
        "/pop cluster population",
        "Population charts (basic)",
        "Basic pets system",
        "Community setup tools",
      ],
    },
    monthly: {
      name: "Premium Monthly",
      price: "$15",
      period: "/ month",
      cadence: "30 days access · cancel anytime",
      cta: "Subscribe in Discord",
      ctaLink: "subscribe",
      featured: true,
      features: [
        "Everything in Free",
        "PayPal Payments (per-server)",
        "Staff Pay tracking",
        "Hype Rewards system",
        "Advanced Credits",
        "Advanced Tickets & Logs",
        "Giveaways & Events",
        "Moderation workflows",
        "Server Templates",
        "Premium Branding",
        "Advanced Pets",
        "Priority Support",
      ],
    },
    lifetime: {
      name: "Lifetime / Custom",
      price: "Custom",
      period: "",
      cadence: "Contact for pricing",
      cta: "Contact Support",
      ctaLink: "supportDiscord",
      featured: false,
      features: [
        "Long-term Premium access",
        "Best for large clusters",
        "Priority setup help",
        "Custom feature support",
        "Direct owner contact",
        "Negotiated terms",
      ],
    },
  },
};

/**
 * Apply config to any DOM root.
 *  - [data-link="<key>"]      → sets href; external links get target="_blank"
 *                                and rel="noopener noreferrer"; email becomes
 *                                mailto: with optional subject from
 *                                [data-email-subject].
 *  - [data-text="<a.b.c>"]    → sets text content from SITE_CONFIG path.
 * Called automatically on DOMContentLoaded, and re-callable from script.js
 * when new DOM is injected (e.g. the slide-in menu panel).
 */
window.applySiteConfig = function (root) {
  root = root || document;
  const cfg = window.SITE_CONFIG;
  if (!cfg) return;

  const EXTERNAL = ["inviteBot", "supportDiscord"];
  const EMAIL = ["contactEmail"];

  root.querySelectorAll("[data-link]").forEach((el) => {
    const key = el.getAttribute("data-link");
    const val = cfg.links[key];
    if (!val) return;

    if (EMAIL.indexOf(key) !== -1) {
      const subject = el.getAttribute("data-email-subject") || "Quick's ARK Bot Support";
      el.setAttribute("href", "mailto:" + val + "?subject=" + encodeURIComponent(subject));
    } else if (EXTERNAL.indexOf(key) !== -1) {
      el.setAttribute("href", val);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    } else {
      el.setAttribute("href", val);
    }
  });

  root.querySelectorAll("[data-text]").forEach((el) => {
    const path = el.getAttribute("data-text").split(".");
    let v = cfg;
    for (const k of path) v = v ? v[k] : undefined;
    if (v !== undefined) el.textContent = v;
  });
};

document.addEventListener("DOMContentLoaded", function () {
  window.applySiteConfig(document);
});
