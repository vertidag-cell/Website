/*
 * Quick's ARK Bot — Site Configuration
 * ------------------------------------------------------------
 * Edit this file to change links, pricing, and contact details
 * across the entire site. All HTML pages read from this file.
 *
 * Brand colors live in styles.css (search for ":root").
 */

window.SITE_CONFIG = {
  brand: {
    name: "Quick's ARK Bot",
    tagline: "Advanced Discord Management for ARK Communities",
  },

  // Replace these with your real URLs when ready.
  links: {
    inviteBot: "#",
    supportDiscord: "#",
    subscribe: "#",
    dashboardLogin: "#",
    contactEmail: "support@example.com",
  },

  // Easy to edit later. Prices are displayed exactly as written here.
  pricing: {
    monthly: {
      name: "Monthly",
      price: "£X",
      period: "/ month",
      cadence: "30 days access",
      cta: "Subscribe for 30 Days",
      ctaLink: "subscribe",
      featured: true,
      features: [
        "Full bot access",
        "Setup Hub",
        "Ticket System",
        "Hype & Credits",
        "PayPal Payments",
        "Staff Pay",
        "Pets System",
        "Giveaways & Events",
        "Moderation Tools",
        "Standard Support",
      ],
    },
    custom: {
      name: "Custom / Lifetime",
      price: "Custom",
      period: "",
      cadence: "Contact for pricing",
      cta: "Contact Support",
      ctaLink: "supportDiscord",
      featured: false,
      features: [
        "Best for large clusters",
        "Priority setup help",
        "Long-term access",
        "Custom feature support",
        "Direct owner contact",
      ],
    },
  },
};

// Apply config to every element with [data-link="<key>"], [data-text="<path>"], etc.
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
