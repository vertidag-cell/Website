/*
 * Quick's ARK Bot — Site Configuration
 * ------------------------------------------------------------
 * Edit this file to change links, pricing, contact details, and
 * brand info across the entire site. All HTML pages read from
 * this file via data-link / data-text attributes.
 *
 * Brand colors live in styles.css (search for ":root").
 * Feature copy lives in index.html.
 * Tutorial scenes/timings live in script.js (TUTORIALS object).
 */

window.SITE_CONFIG = {
  brand: {
    name: "Quick's ARK Bot",
    short: "Quick's",
    tagline: "Advanced Discord automation for ARK and gaming communities.",
  },

  // Replace these with your real URLs when ready.
  links: {
    inviteBot: "#",
    supportDiscord: "#",
    subscribe: "#",
    dashboardLogin: "#",
    contactEmail: "support@example.com",
  },

  // Three tiers. Edit price strings exactly as they should display.
  pricing: {
    free: {
      name: "Free",
      price: "£0",
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
      price: "£X",
      period: "/ month",
      cadence: "30 days access · cancel anytime",
      cta: "Subscribe for 30 Days",
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

// Apply config to every element with [data-link="<key>"] or [data-text="<path>"]
document.addEventListener("DOMContentLoaded", function () {
  const cfg = window.SITE_CONFIG;

  document.querySelectorAll("[data-link]").forEach((el) => {
    const key = el.getAttribute("data-link");
    if (cfg.links[key]) {
      if (key === "contactEmail") {
        el.setAttribute("href", "mailto:" + cfg.links[key]);
      } else {
        el.setAttribute("href", cfg.links[key]);
      }
    }
  });

  document.querySelectorAll("[data-text]").forEach((el) => {
    const path = el.getAttribute("data-text").split(".");
    let val = cfg;
    for (const k of path) val = val ? val[k] : undefined;
    if (val !== undefined) el.textContent = val;
  });
});
