/* Arkoris — UI interactions
 * --------------------------------------------------------------
 *  - Mobile menu toggle
 *  - Active nav link
 *  - Copyright year
 *  - Fade-in on scroll (IntersectionObserver)
 *  - Count-up animation
 *  - Discord tutorial player with play/pause/progress/steps
 */

(function () {
  "use strict";

  const reducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* -------- Cinematic page-load intro --------
     One-time per session. Disabled under prefers-reduced-motion. */
  if (!reducedMotion && !sessionStorage.getItem("introSeen")) {
    const intro = document.createElement("div");
    intro.className = "page-intro";
    intro.setAttribute("aria-hidden", "true");
    intro.innerHTML = '<div class="page-intro-glow"></div>';
    document.body.appendChild(intro);
    setTimeout(() => intro.remove(), 1500);
    sessionStorage.setItem("introSeen", "1");
  }

  /* -------- Hamburger menu panel --------
     Single source of truth for site navigation. The .nav-links block in
     each HTML page is hidden by CSS but kept for no-JS / crawler fallback. */
  const MENU_LINKS = [
    { href: "index.html", label: "Home", desc: "Cinematic landing page." },
    { href: "features.html", label: "Features", desc: "Explore everything the bot can do." },
    { href: "pop.html", label: "/pop", desc: "Full ARK cluster population and charts." },
    { href: "premium.html", label: "Premium", desc: "Payments, staff tools, branding, automation." },
    { href: "branding.html", label: "Branding", desc: "Customize embeds and panels for your server." },
    { href: "demos.html", label: "Demos", desc: "Animated Discord command previews." },
    { href: "pricing.html", label: "Pricing", desc: "Free · Monthly · Lifetime." },
    { href: "dashboard.html", label: "Dashboard", desc: "Customer dashboard placeholder." },
    { href: "faq.html", label: "FAQ", desc: "Common questions answered." },
    { href: "support.html", label: "Support", desc: "Discord, email, owner contact." },
    { href: "terms.html", label: "Terms" },
    { href: "privacy.html", label: "Privacy" },
  ];

  const trigger = document.querySelector(".nav-toggle");
  if (trigger) {
    // Replace existing SVG with bar spans (CSS morphs them into an X)
    trigger.innerHTML =
      '<span class="bar"></span><span class="bar"></span><span class="bar"></span>';
    trigger.setAttribute("aria-controls", "menuPanel");
    trigger.setAttribute("aria-label", "Open menu");
    trigger.setAttribute("aria-expanded", "false");

    const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    panel.id = "menuPanel";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="menu-backdrop" data-menu-close></div>
      <aside class="menu-inner" role="dialog" aria-modal="true" aria-label="Site menu">
        <div class="menu-head">
          <a class="brand" href="index.html">
            <span class="brand-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L20 5v7c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V5l8-3z" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>
                <path d="M13.2 6.5l-4.3 7h3l-1 4 4.3-7h-3l1-4z" fill="#fff"/>
              </svg>
            </span>
            <span class="brand-text">
              <span class="name">Arkoris</span>
              <span class="sub">Discord Automation · ARK</span>
            </span>
          </a>
          <button class="menu-close" aria-label="Close menu" data-menu-close>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
          </button>
        </div>
        <nav class="menu-links" aria-label="Main navigation">
          ${MENU_LINKS.map((l, i) => {
            const active = l.href.toLowerCase() === here ? " active" : "";
            const desc = l.desc ? `<span class="menu-link-desc">${l.desc}</span>` : "";
            return `<a class="${active.trim()}" href="${l.href}" style="--i:${i}" aria-current="${active ? "page" : "false"}"><span class="menu-link-text"><span class="menu-link-label">${l.label}</span>${desc}</span></a>`;
          }).join("")}
        </nav>
        <div class="menu-cta-mobile">
          <a class="btn btn-primary" data-link="inviteBot" href="#">Invite Bot</a>
          <a class="btn btn-ghost" data-link="dashboardLogin" href="#">Dashboard</a>
          <a class="btn btn-outline" data-link="supportDiscord" href="#">Join Support Discord</a>
        </div>
        <div class="menu-foot">Arkoris · Discord Automation</div>
      </aside>`;
    document.body.appendChild(panel);

    // Re-apply config.js bindings on the newly-injected menu nodes.
    // Uses the shared applySiteConfig() so external links get target/rel,
    // emails become mailto: with subjects, etc.
    if (typeof window.applySiteConfig === "function") {
      window.applySiteConfig(panel);
    }

    let lastFocus = null;
    function openMenu() {
      lastFocus = document.activeElement;
      panel.classList.add("open");
      trigger.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      trigger.setAttribute("aria-expanded", "true");
      document.body.classList.add("menu-open");
      setTimeout(() => {
        const closer = panel.querySelector(".menu-close");
        if (closer) closer.focus();
      }, 60);
    }
    function closeMenu() {
      panel.classList.remove("open");
      trigger.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      trigger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    trigger.addEventListener("click", () => {
      if (panel.classList.contains("open")) closeMenu();
      else openMenu();
    });
    panel.addEventListener("click", (e) => {
      if (e.target.closest("[data-menu-close]")) closeMenu();
      // Close menu when navigating via a link (visual polish before page load)
      else if (e.target.closest(".menu-links a")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("open")) closeMenu();
    });
  }

  /* -------- Copyright year -------- */
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* -------- Fade-in on scroll -------- */
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));

  /* -------- Count-up -------- */
  const countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.getAttribute("data-count"), 10);
        if (Number.isNaN(target)) return;
        if (reducedMotion) {
          el.textContent = target;
          countObserver.unobserve(el);
          return;
        }
        const startDelay = (parseFloat(el.dataset.countDelay) || 0) * 1000;
        const launch = () => {
          const duration = 1100;
          const start = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(eased * target);
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        if (startDelay > 0) setTimeout(launch, startDelay);
        else launch();
        countObserver.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll(".count-up[data-count]").forEach((el) => countObserver.observe(el));

  /* -------- Hero command typing (cinematic stage 3) -------- */
  document.querySelectorAll("[data-typer]").forEach((el) => {
    const text = el.getAttribute("data-typer");
    const delayMs = parseFloat(el.dataset.typerDelay || "0") * 1000;
    const perCharMs = parseFloat(el.dataset.typerSpeed || "26");
    if (reducedMotion) {
      el.textContent = text;
      return;
    }
    setTimeout(() => {
      let i = 0;
      const tick = () => {
        if (i > text.length) return;
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(tick, perCharMs + Math.random() * 28);
      };
      tick();
    }, delayMs);
  });

  /* ============================================================
     Tutorial player
     ============================================================ */

  const PLAY_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  function initTutorialPlayer(root) {
    const cmdBox = root.querySelector(".discord-cmdbox");
    const messages = root.querySelector(".discord-messages");
    const channelEl = root.querySelector(".discord-channel-name");
    const progressEl = root.querySelector(".tut-progress > span");
    const stepsEl = root.querySelector(".tut-steps");
    const titleEl = root.querySelector(".tut-title");
    const subEl = root.querySelector(".tut-sub");
    const countEl = root.querySelector(".tut-step-count");
    const playBtn = root.querySelector(".tut-play");
    const tabs = root.querySelectorAll(".tut-tab");

    const state = {
      currentKey: null,
      playing: false,
      token: 0,
      pending: [],
      channel: "general",
    };

    function sleep(ms) {
      const wait = reducedMotion ? Math.min(ms, 80) : ms;
      return new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          state.pending = state.pending.filter((p) => p.id !== id);
          resolve();
        }, wait);
        state.pending.push({ id, reject });
      });
    }

    function abort() {
      state.token++;
      state.pending.forEach(({ id, reject }) => {
        clearTimeout(id);
        reject(new Error("aborted"));
      });
      state.pending = [];
    }

    function setChannel(name) {
      state.channel = name;
      if (channelEl) {
        channelEl.innerHTML = `<span class="channel-hash">#</span>&nbsp;${name}`;
      }
      cmdBox.innerHTML = `<span class="placeholder">Message #${name}</span>`;
    }

    function setProgress(pct) {
      progressEl.style.width = pct + "%";
    }

    function renderStepPills(labels) {
      stepsEl.innerHTML = labels
        .map((l, i) => `<span class="tut-step">${i + 1}. ${escapeHtml(l)}</span>`)
        .join("");
    }

    function setActiveStep(i, total) {
      Array.from(stepsEl.children).forEach((el, idx) => {
        el.classList.toggle("active", idx === i);
        el.classList.toggle("done", idx < i);
      });
      countEl.textContent = `Step ${Math.min(i + 1, total)} / ${total}`;
    }

    function clearMessages() {
      messages.innerHTML = "";
    }

    function scrollEnd() {
      messages.scrollTop = messages.scrollHeight;
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    /* --- Message rendering API passed into scenes --- */

    async function typeCmd(text) {
      cmdBox.innerHTML =
        '<span class="slash">/</span><span class="typed"></span><span class="caret"></span>';
      const span = cmdBox.querySelector(".typed");
      const body = text.startsWith("/") ? text.slice(1) : text;
      if (reducedMotion) {
        span.textContent = body;
        await sleep(120);
        return;
      }
      for (const ch of body) {
        span.textContent += ch;
        await sleep(48 + Math.random() * 55);
      }
    }

    function sendCmd() {
      cmdBox.innerHTML = `<span class="placeholder">Message #${state.channel}</span>`;
    }

    function userMsg(text, name = "ServerOwner", initial = "S") {
      const row = document.createElement("div");
      row.className = "dmsg";
      row.innerHTML = `
        <div class="davatar user">${escapeHtml(initial)}</div>
        <div class="dbody">
          <div class="dhead">
            <span class="dname">${escapeHtml(name)}</span>
            <span class="dtime">just now</span>
          </div>
          <div class="dtext">${text}</div>
        </div>`;
      messages.appendChild(row);
      scrollEnd();
    }

    function systemMsg(text) {
      const row = document.createElement("div");
      row.className = "dmsg";
      row.innerHTML = `
        <div class="davatar system">SYS</div>
        <div class="dbody">
          <div class="dhead"><span class="dname" style="color:#949ba4">System</span></div>
          <div class="dtext" style="color:#949ba4;font-size:0.84rem">${text}</div>
        </div>`;
      messages.appendChild(row);
      scrollEnd();
    }

    function botRow(opts = {}) {
      const row = document.createElement("div");
      row.className = "dmsg";
      row.innerHTML = `
        <div class="davatar">Q</div>
        <div class="dbody">
          <div class="dhead">
            <span class="dname dname-bot">Arkoris</span>
            <span class="dbadge">BOT</span>
            <span class="dtime">just now</span>
          </div>
          ${opts.text ? `<div class="dtext">${opts.text}</div>` : ""}
        </div>`;
      messages.appendChild(row);
      const body = row.querySelector(".dbody");
      if (opts.embed) body.appendChild(makeEmbed(opts.embed));
      if (opts.buttons) body.appendChild(makeButtons(opts.buttons));
      scrollEnd();
      return {
        node: row,
        body,
        addEmbed: (e) => {
          body.appendChild(makeEmbed(e));
          scrollEnd();
        },
        addButtons: (b) => {
          body.appendChild(makeButtons(b));
          scrollEnd();
        },
        replaceButtons: (b) => {
          body.querySelectorAll(".dbuttons").forEach((n) => n.remove());
          body.appendChild(makeButtons(b));
          scrollEnd();
        },
        removeButtons: () => {
          body.querySelectorAll(".dbuttons").forEach((n) => n.remove());
        },
      };
    }

    function makeEmbed(e) {
      const div = document.createElement("div");
      div.className = "dembed" + (e.style ? " " + e.style : "");
      let html = "";
      if (e.title) html += `<div class="dembed-title">${e.title}</div>`;
      if (e.desc) html += `<div class="dembed-desc">${e.desc}</div>`;
      if (e.fields && e.fields.length) {
        html += `<div class="dembed-fields">`;
        for (const f of e.fields) {
          html += `<div class="dembed-field"><div class="dembed-field-name">${f.name}</div><div class="dembed-field-value">${f.value}</div></div>`;
        }
        html += `</div>`;
      }
      if (e.footer) html += `<div class="dembed-footer">${e.footer}</div>`;
      div.innerHTML = html;
      return div;
    }

    function makeButtons(buttons) {
      const div = document.createElement("div");
      div.className = "dbuttons";
      div.innerHTML = buttons
        .map((b, i) => {
          const cls = b.style ? "dbtn-" + b.style : "";
          const icon = b.icon || "";
          // Labels are authored locally; allow HTML (spinner, checkmark icons).
          return `<button class="dbtn ${cls}" style="animation-delay:${i * 70}ms" disabled aria-disabled="true">${icon}${b.label}</button>`;
        })
        .join("");
      return div;
    }

    async function clickButton(label) {
      const btns = Array.from(messages.querySelectorAll(".dbtn")).reverse();
      const btn = btns.find((b) => b.textContent.trim().toLowerCase().includes(label.toLowerCase()));
      if (!btn) return;
      btn.classList.add("clicked");
      await sleep(reducedMotion ? 50 : 380);
      btn.classList.remove("clicked");
    }

    const api = {
      sleep,
      typeCmd,
      sendCmd,
      userMsg,
      systemMsg,
      botRow,
      clickButton,
      setChannel,
    };

    /* --- Player controls --- */

    function setPlayBtn(playing) {
      playBtn.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
      playBtn.setAttribute("aria-label", playing ? "Pause tutorial" : "Play tutorial");
    }

    async function load(key, autoPlay) {
      abort();
      const t = TUTORIALS[key];
      if (!t) return;
      state.currentKey = key;
      tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tut === key));
      titleEl.textContent = t.title;
      subEl.textContent = t.sub;
      renderStepPills(t.steps);
      setActiveStep(0, t.scenes.length);
      setChannel(t.channel || "general");
      clearMessages();
      setProgress(0);
      if (autoPlay) await play();
    }

    async function play() {
      if (!state.currentKey) {
        await load(TUTORIAL_ORDER[0]);
      }
      state.playing = true;
      setPlayBtn(true);
      const myToken = ++state.token;
      const t = TUTORIALS[state.currentKey];
      try {
        while (state.playing && myToken === state.token) {
          for (let i = 0; i < t.scenes.length; i++) {
            if (!state.playing || myToken !== state.token) return;
            setActiveStep(i, t.scenes.length);
            setProgress((i / t.scenes.length) * 100);
            await t.scenes[i].run(api);
            if (!state.playing || myToken !== state.token) return;
            setProgress(((i + 1) / t.scenes.length) * 100);
            await sleep(700);
          }
          await sleep(3200);
          if (!state.playing || myToken !== state.token) return;
          clearMessages();
          setProgress(0);
          setActiveStep(0, t.scenes.length);
        }
      } catch (e) {
        /* aborted — fine */
      }
    }

    function pause() {
      state.playing = false;
      setPlayBtn(false);
      abort();
    }

    playBtn.addEventListener("click", () => {
      if (state.playing) pause();
      else play();
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const wasPlaying = state.playing;
        load(tab.dataset.tut, wasPlaying || true);
      });
    });

    // Auto-load first tutorial; auto-play when section scrolls into view.
    load(TUTORIAL_ORDER[0]);
    const autoPlayObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !state.playing && !root.dataset.started) {
            root.dataset.started = "1";
            play();
          }
        });
      },
      { threshold: 0.35 }
    );
    autoPlayObserver.observe(root);
  }

  /* ============================================================
     Tutorial scene definitions — edit copy/timing here
     ============================================================ */

  const TUTORIAL_ORDER = [
    "setup",
    "pop",
    "subscribe",
    "branding",
    "tickets",
    "reward",
    "pets",
  ];

  const cmdTag = (text) => `<code class="cmd">${text}</code>`;

  const TUTORIALS = {
    setup: {
      title: "Setup Your Server in Minutes",
      sub: "Configure modules through the Discord-driven Setup Hub.",
      channel: "general",
      steps: ["Run /setup", "Open Hub", "Pick category", "Save"],
      scenes: [
        {
          run: async (api) => {
            await api.sleep(400);
            await api.typeCmd("/setup");
            await api.sleep(350);
            api.userMsg(cmdTag("/setup"));
            api.sendCmd();
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Setup Hub",
                desc: "Configure every module from one place. No commands required.",
                fields: [
                  { name: "Modules", value: "14 available" },
                  { name: "Method", value: "Button-driven" },
                  { name: "Multi-guild", value: "Ready" },
                  { name: "Time to setup", value: "~5 minutes" },
                ],
                footer: "Pick a category to continue",
              },
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            const r = api.botRow({});
            r.addButtons([
              { label: "Tickets", style: "primary" },
              { label: "Payments" },
              { label: "Hype" },
              { label: "Credits" },
              { label: "Pets" },
              { label: "Staff Pay" },
              { label: "Welcome" },
            ]);
            await api.sleep(1500);
            await api.clickButton("Tickets");
          },
        },
        {
          run: async (api) => {
            await api.sleep(450);
            api.botRow({
              embed: {
                title: "Ticket Setup Complete",
                desc: "Forum channel created. Staff role assigned. Auto-routing enabled.",
                fields: [
                  { name: "Forum channel", value: "✓ #support" },
                  { name: "Staff role", value: "✓ @Staff" },
                  { name: "Logs channel", value: "✓ #ticket-logs" },
                  { name: "Auto-assign", value: "✓ Enabled" },
                ],
                footer: "Setup Complete",
                style: "success",
              },
            });
          },
        },
      ],
    },

    subscribe: {
      title: "Activate Your Subscription",
      sub: "PayPal payment with automatic server activation.",
      channel: "billing",
      steps: ["Run /subscribe", "View plan", "Pay with PayPal", "Activated"],
      scenes: [
        {
          run: async (api) => {
            await api.sleep(400);
            await api.typeCmd("/subscribe");
            await api.sleep(350);
            api.userMsg(cmdTag("/subscribe"));
            api.sendCmd();
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            const r = api.botRow({
              embed: {
                title: "Subscribe to Arkoris",
                desc: "Activate full bot access for this server.",
                fields: [
                  { name: "Plan", value: "Monthly · 30 days" },
                  { name: "Modules", value: "All 14 included" },
                  { name: "Activation", value: "Automatic on payment" },
                  { name: "Cancel", value: "Anytime via PayPal" },
                ],
                footer: "Choose an option below",
              },
            });
            r.addButtons([
              { label: "Subscribe / Renew 1 Month", style: "primary" },
              { label: "View Status" },
            ]);
            await api.sleep(1400);
            await api.clickButton("Subscribe");
          },
        },
        {
          run: async (api) => {
            await api.sleep(400);
            const r = api.botRow({
              embed: {
                title: "Complete Payment",
                desc: "You'll be redirected to PayPal in your browser.",
                footer: "Secure checkout · Funds go to the server PayPal",
              },
            });
            r.addButtons([{ label: "Pay with PayPal", style: "paypal" }]);
            await api.sleep(1300);
            await api.clickButton("Pay with PayPal");
            await api.sleep(300);
            r.replaceButtons([
              {
                label: '<span class="dspinner"></span>&nbsp;&nbsp;Processing payment',
              },
            ]);
            await api.sleep(1600);
          },
        },
        {
          run: async (api) => {
            await api.sleep(300);
            api.botRow({
              embed: {
                title: "Payment Received",
                desc: "Server activated for 30 days. All modules now available.",
                fields: [
                  {
                    name: "Status",
                    value: '<span class="dchecky">✓</span>&nbsp;&nbsp;Active',
                  },
                  { name: "Renews", value: "in 30 days" },
                ],
                footer: "Run /setup to configure your modules",
                style: "success",
              },
            });
          },
        },
      ],
    },

    tickets: {
      title: "Open and Manage Tickets",
      sub: "Forum-based support tickets with clean staff workflows.",
      channel: "tickets",
      steps: ["Open ticket", "Bot creates thread", "Staff replies", "Resolved"],
      scenes: [
        {
          run: async (api) => {
            await api.sleep(400);
            const r = api.botRow({
              embed: {
                title: "Need help?",
                desc: "Open a support ticket. A staff member will respond shortly.",
                footer: "Tickets are private to you and staff",
              },
            });
            r.addButtons([{ label: "Open Support Ticket", style: "primary" }]);
            await api.sleep(1300);
            await api.clickButton("Open Support Ticket");
          },
        },
        {
          run: async (api) => {
            await api.sleep(400);
            api.systemMsg(
              'Forum thread created · <strong style="color:#dbdee1">#ticket-0042 · "I need help with payments"</strong>'
            );
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Ticket #0042 Opened",
                desc: "A staff member has been pinged. Please describe your issue in detail.",
                fields: [
                  { name: "Status", value: "Open" },
                  { name: "Assigned", value: "@StaffOnDuty" },
                  { name: "Category", value: "Payments" },
                  { name: "Priority", value: "Normal" },
                ],
                footer: "Arkoris · Ticket System",
              },
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.userMsg(
              "Hey, thanks for opening up — checking your payment status now.",
              "StaffOnDuty",
              "S"
            );
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Ticket #0042 Resolved",
                desc: "Logged to #ticket-logs. Forum thread archived.",
                fields: [
                  { name: "Resolved by", value: "@StaffOnDuty" },
                  { name: "Duration", value: "4m 12s" },
                ],
                footer: "Tickets organized automatically",
                style: "success",
              },
            });
          },
        },
      ],
    },

    reward: {
      title: "Reward Your Community",
      sub: "Hype System rewards players for activity automatically.",
      channel: "hype",
      steps: ["Tag detected", "Reward fired", "Credit awarded", "Logged"],
      scenes: [
        {
          run: async (api) => {
            await api.sleep(400);
            api.systemMsg(
              '<strong style="color:#dbdee1">Player</strong> updated their nickname to <strong style="color:#dbdee1">[QUICK] Player</strong>'
            );
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Hype Detected",
                desc: "Server tag <strong>[QUICK]</strong> displayed in member nickname. Reward triggered.",
                fields: [
                  { name: "Trigger", value: "Tag display" },
                  { name: "Reward", value: "+1 Credit" },
                  { name: "Expires", value: "in 14 days" },
                  { name: "Type", value: "Temporary" },
                ],
                footer: "Activity rewarded automatically",
              },
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              text: "<strong>+1 Credit Awarded</strong> · Total balance: 8 credits",
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Logged to Hype History",
                desc: "Reward record saved. Credit will expire in 14 days unless used.",
                style: "success",
                footer: "Arkoris · Hype System",
              },
            });
          },
        },
      ],
    },

    payments: {
      title: "Track Staff and Payments",
      sub: "PayPal payments auto-confirm and staff pay logs stay tidy.",
      channel: "payment-logs",
      steps: ["Admin creates payment", "PayPal confirms", "Log embed", "Staff updated"],
      scenes: [
        {
          run: async (api) => {
            await api.sleep(400);
            await api.typeCmd("/payment create");
            await api.sleep(350);
            api.userMsg(
              cmdTag("/payment create") + " amount:<strong>25</strong> user:<strong>@Player</strong>"
            );
            api.sendCmd();
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Payment #1283 Created",
                desc: "Awaiting PayPal confirmation.",
                fields: [
                  { name: "Amount", value: "$25.00" },
                  { name: "User", value: "@Player" },
                  {
                    name: "Status",
                    value: '<span class="dspinner"></span>&nbsp;&nbsp;Pending',
                  },
                  { name: "Method", value: "PayPal" },
                ],
                footer: "Arkoris · Payments",
              },
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(1300);
            api.botRow({
              embed: {
                title: "Payment #1283 Confirmed",
                desc: "PayPal webhook received. Funds settled.",
                fields: [
                  { name: "Amount", value: "$25.00" },
                  {
                    name: "Status",
                    value: '<span class="dchecky">✓</span>&nbsp;&nbsp;Paid',
                  },
                ],
                footer: "Auto-confirmed by webhook",
                style: "success",
              },
            });
          },
        },
        {
          run: async (api) => {
            await api.sleep(500);
            api.botRow({
              embed: {
                title: "Staff Pay — March 2026",
                desc: "+$5.00 commission added to @StaffOnDuty's monthly log.",
                fields: [
                  { name: "Total this month", value: "$127.00" },
                  { name: "Payouts", value: "3 confirmed" },
                ],
                footer: "Payments and staff logs stay organized",
                style: "success",
              },
            });
          },
        },
      ],
    },
  };

  /* --- New v3 demos: /pop, Premium Branding, Pets --- */

  TUTORIALS.pop = {
    title: "Full Cluster Population — Free",
    sub: "/pop shows your entire ARK cluster, not just one map.",
    channel: "cluster",
    steps: ["Run /pop", "Cluster embed", "Maps animate", "Open chart"],
    scenes: [
      {
        run: async (api) => {
          await api.sleep(400);
          await api.typeCmd("/pop");
          await api.sleep(350);
          api.userMsg(
            cmdTag('/pop game:"ARK Survival Ascended" platform:"Steam" cluster:"Quick\'s ARK"')
          );
          api.sendCmd();
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          api.botRow({
            embed: {
              title: "ARK Cluster Population",
              desc: "Arkoris · ARK Survival Ascended · Steam",
              fields: [
                { name: "Total Players", value: "<strong style=\"color:#fff\">184</strong> / 620" },
                { name: "Online Maps", value: "11 / 12" },
                { name: "Peak Today", value: "231" },
                { name: "Average 24h", value: "156" },
                { name: "Best Map", value: "The Island · 42 / 70" },
                { name: "Lowest Map", value: "Scorched Earth · 3 / 50" },
              ],
              footer: "Last updated 2 minutes ago",
            },
          });
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          const r = api.botRow({
            embed: {
              title: "Map Breakdown",
              desc:
                "The Island · 42 / 70<br/>Ragnarok · 38 / 70<br/>Fjordur · 31 / 70<br/>" +
                "Aberration · 22 / 70<br/>Extinction · 15 / 70<br/>Genesis 2 · 9 / 70<br/>" +
                "Scorched Earth · 3 / 50",
              footer: "All maps online",
            },
          });
          r.addButtons([
            { label: "Refresh", style: "primary" },
            { label: "24h Chart" },
            { label: "7d Chart" },
            { label: "Map Breakdown" },
          ]);
          await api.sleep(1500);
          await api.clickButton("24h Chart");
        },
      },
      {
        run: async (api) => {
          await api.sleep(400);
          api.botRow({
            embed: {
              title: "24h Cluster Population",
              desc: "Players over the last 24 hours.<br/><br/>" +
                "<svg viewBox=\"0 0 300 60\" width=\"100%\" height=\"60\" preserveAspectRatio=\"none\">" +
                "<defs><linearGradient id=\"tg\" x1=\"0\" x2=\"0\" y1=\"0\" y2=\"1\">" +
                "<stop offset=\"0\" stop-color=\"#ef4444\" stop-opacity=\".4\"/>" +
                "<stop offset=\"1\" stop-color=\"#ef4444\" stop-opacity=\"0\"/>" +
                "</linearGradient></defs>" +
                "<path d=\"M0,45 L25,40 L50,35 L75,30 L100,20 L125,25 L150,18 L175,22 L200,12 L225,18 L250,25 L275,15 L300,20 L300,60 L0,60 Z\" fill=\"url(#tg)\"/>" +
                "<path d=\"M0,45 L25,40 L50,35 L75,30 L100,20 L125,25 L150,18 L175,22 L200,12 L225,18 L250,25 L275,15 L300,20\" stroke=\"#ef4444\" stroke-width=\"2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>" +
                "</svg>",
              fields: [
                { name: "Peak", value: "231 players" },
                { name: "Low", value: "98 players" },
                { name: "Average", value: "156 players" },
                { name: "Now", value: "184 players" },
              ],
              footer: "Charts and /pop are free for everyone",
              style: "success",
            },
          });
        },
      },
    ],
  };

  TUTORIALS.branding = {
    title: "Customize Your Brand (Premium)",
    sub: "Make embeds, panels, and /pop match your community identity.",
    channel: "general",
    steps: ["Open dashboard", "Edit brand name", "Change color", "Embed updates"],
    scenes: [
      {
        run: async (api) => {
          await api.sleep(400);
          api.systemMsg(
            'Dashboard opened · <strong style="color:#dbdee1">Branding Settings</strong>'
          );
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          api.botRow({
            embed: {
              title: "Default Branding — Arkoris",
              desc: "This is how embeds look out of the box.",
              fields: [
                { name: "Brand Name", value: "Arkoris" },
                { name: "Accent Color", value: "Red" },
                { name: "Footer", value: "Arkoris · v1.0" },
              ],
              footer: "Arkoris · default branding",
            },
          });
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          api.systemMsg(
            'Brand Name updated to <strong style="color:#dbdee1">Iron ARK</strong>'
          );
          await api.sleep(400);
          api.systemMsg(
            'Accent Color updated to <strong style="color:#fbbf24">#F59E0B</strong>'
          );
          await api.sleep(400);
          api.systemMsg(
            'Footer updated to <strong style="color:#dbdee1">Iron ARK · powered by Quick\'s ARK Bot</strong>'
          );
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          api.botRow({
            embed: {
              title: "Iron ARK Cluster Population",
              desc: "Now this server's embeds carry the Iron ARK brand.",
              fields: [
                { name: "Brand", value: "<strong style=\"color:#fbbf24\">Iron ARK</strong>" },
                { name: "Accent", value: "<strong style=\"color:#fbbf24\">Custom orange</strong>" },
                { name: "Applies to", value: "Embeds · Panels · Charts" },
                { name: "Tier", value: "Premium" },
              ],
              footer: "Iron ARK · powered by Arkoris",
              style: "warn",
            },
          });
        },
      },
    ],
  };

  TUTORIALS.pets = {
    title: "Pets — Free Basics, Premium Depth",
    sub: "Basic pets are free. Advanced features unlock with Premium.",
    channel: "pets",
    steps: ["Open pets", "View card", "Basic action", "Premium upgrade"],
    scenes: [
      {
        run: async (api) => {
          await api.sleep(400);
          await api.typeCmd("/pets");
          await api.sleep(350);
          api.userMsg(cmdTag("/pets"));
          api.sendCmd();
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          const r = api.botRow({
            embed: {
              title: "Your Pets",
              desc: "Basic pet management is free for every server.",
              fields: [
                { name: "Shadow", value: "Common · Lv 4" },
                { name: "Ember", value: "Common · Lv 2" },
                { name: "Slots", value: "2 / 3 used" },
                { name: "Tier", value: '<span style="color:#4ade80;font-weight:600">Free</span>' },
              ],
              footer: "Arkoris · Pets",
            },
          });
          r.addButtons([
            { label: "Feed", style: "primary" },
            { label: "Rename" },
            { label: "Inventory" },
          ]);
          await api.sleep(1400);
          await api.clickButton("Feed");
        },
      },
      {
        run: async (api) => {
          await api.sleep(400);
          api.botRow({
            text: "<strong>Shadow</strong> grew to Level 5.",
          });
        },
      },
      {
        run: async (api) => {
          await api.sleep(500);
          const r = api.botRow({
            embed: {
              title: "Boss Fights, Fusion, Leaderboards",
              desc: "Advanced pet features unlock on Premium servers.",
              fields: [
                { name: "Boss Fights", value: "🔒 Premium" },
                { name: "Fusion", value: "🔒 Premium" },
                { name: "Rarity Tiers", value: "🔒 Premium" },
                { name: "Leaderboard", value: "🔒 Premium" },
              ],
              footer: "Premium unlocks advanced pets, payments, staff pay, branding",
              style: "warn",
            },
          });
          r.addButtons([
            { label: "Upgrade to Premium", style: "primary" },
            { label: "View Plans" },
          ]);
        },
      },
    ],
  };

  /* --- Branding morph toggle (Premium Branding section) --- */
  document.querySelectorAll("[data-brand-toggle]").forEach((btn) => {
    const targetSelector = btn.getAttribute("data-brand-toggle");
    const stateLabel = document.querySelector("[data-brand-state]");
    btn.addEventListener("click", () => {
      const targets = document.querySelectorAll(targetSelector);
      const turningOn = !targets[0]?.classList.contains("branded");
      targets.forEach((el) => el.classList.toggle("branded", turningOn));
      if (stateLabel) {
        stateLabel.innerHTML = turningOn
          ? 'Showing <strong>premium</strong> branding'
          : 'Showing <strong>default</strong> branding';
      }
      btn.textContent = turningOn ? "Reset to Default" : "Preview Premium Branding";
    });
  });

  /* --- Hero word reveal: stagger via CSS variable --i --- */
  document.querySelectorAll("[data-word-reveal]").forEach((el) => {
    const html = el.innerHTML;
    // Wrap each top-level token: split spaces, preserve nested elements via temp DOM walk
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    let i = 0;
    const walk = (node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === 3) {
          const words = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          words.forEach((w) => {
            if (/^\s+$/.test(w)) {
              frag.appendChild(document.createTextNode(w));
            } else if (w.length) {
              const s = document.createElement("span");
              s.className = "word";
              s.style.setProperty("--i", i++);
              s.textContent = w;
              frag.appendChild(s);
            }
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          // Element — wrap its text contents too but keep the element's classes
          if (child.classList && child.classList.contains("accent")) {
            child.classList.add("word");
            child.style.setProperty("--i", i++);
          } else {
            walk(child);
          }
        }
      }
    };
    walk(tmp);
    el.innerHTML = tmp.innerHTML;
    // Apply animation-delay based on --i
    const baseDelay = parseFloat(el.dataset.revealDelay) || 0;
    const perWord = parseFloat(el.dataset.revealStagger) || 0.08;
    el.querySelectorAll(".word").forEach((w) => {
      const idx = parseInt(w.style.getPropertyValue("--i") || "0", 10);
      w.style.animationDelay = (baseDelay + perWord * idx) + "s";
    });
  });

  /* --- IntersectionObserver: also tag [data-stagger] and .pop-card --- */
  const v3Observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          v3Observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll("[data-stagger], .pop-card").forEach((el) => v3Observer.observe(el));

  /* ============================================================
     v7 — Scroll progress, back-to-top, reveal observer, parallax
     ============================================================ */

  // Scroll progress bar
  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);

  // Back to top button
  const backTop = document.createElement("button");
  backTop.type = "button";
  backTop.className = "back-top";
  backTop.setAttribute("aria-label", "Back to top");
  backTop.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(backTop);
  backTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });

  // Parallax participants
  const parallaxEls = document.querySelectorAll(".parallax-slow, .parallax-medium");

  let scrollTicking = false;
  function onScroll() {
    const scrolled = window.scrollY || document.documentElement.scrollTop;
    const max = (document.documentElement.scrollHeight || 0) - window.innerHeight;
    const pct = max > 0 ? Math.min(100, (scrolled / max) * 100) : 0;
    progress.style.width = pct + "%";
    if (scrolled > 600) backTop.classList.add("visible");
    else backTop.classList.remove("visible");
    if (!reducedMotion && parallaxEls.length) {
      parallaxEls.forEach((el) => {
        const speed = el.classList.contains("parallax-slow") ? 0.12 : 0.28;
        el.style.transform = "translateY(" + scrolled * speed + "px)";
      });
    }
    scrollTicking = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        requestAnimationFrame(onScroll);
        scrollTicking = true;
      }
    },
    { passive: true }
  );
  onScroll();

  // Reveal observer for [data-reveal] elements
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => revealObserver.observe(el));

  // Smooth scroll for in-page anchor links (also closes menu if open)
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href === "#") return;
    const tgt = document.querySelector(href);
    if (!tgt) return;
    e.preventDefault();
    tgt.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    const panel = document.getElementById("menuPanel");
    if (panel && panel.classList.contains("open")) {
      const trig = document.querySelector(".nav-toggle");
      if (trig) trig.click();
    }
  });

  // Initialise tutorial player after data is defined (avoids TDZ).
  const tutorialRoot = document.querySelector("[data-tut-root]");
  if (tutorialRoot) initTutorialPlayer(tutorialRoot);
})();

/* ============================================================
   v9 — Premium motion layer (additive, self-contained)
   Marks the doc as motion-capable, then layers alive hover light,
   a scroll-aware navbar, a pointer-reactive hero glow, and a
   subtly magnetic primary CTA. Everything degrades under
   prefers-reduced-motion and is gated to fine-pointer devices.
   ============================================================ */
(function () {
  "use strict";

  // Hide-on-reveal logic in CSS is gated behind this class, so content
  // stays visible if JS never runs. Added before first paint here.
  document.documentElement.classList.add("js-motion");

  const reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer =
    window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- Navbar scroll state ---- */
  const navbar = document.querySelector(".navbar");
  if (navbar) {
    let navTicking = false;
    const syncNav = () => {
      navbar.classList.toggle("scrolled", (window.scrollY || 0) > 40);
      navTicking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!navTicking) {
          requestAnimationFrame(syncNav);
          navTicking = true;
        }
      },
      { passive: true }
    );
    syncNav();
  }

  /* ---- Alive cards: lift + cursor-tracked light ---- */
  const CARD_SELECTOR =
    ".fvp-col, .eco-col, .demo-mini, .ark-suite-card, .highlight-card, .soon-card, .feature-card";
  document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
    if (card.classList.contains("lift")) return;
    card.classList.add("lift");
    // Inject the light layer once (kept first so it sits beneath content).
    const sheen = document.createElement("span");
    sheen.className = "card-sheen";
    sheen.setAttribute("aria-hidden", "true");
    card.prepend(sheen);
  });

  if (!reduced && finePointer) {
    document.querySelectorAll(".lift").forEach((card) => {
      card.addEventListener(
        "pointermove",
        (e) => {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
          card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
        },
        { passive: true }
      );
    });

    /* ---- Pointer-reactive hero glow ---- */
    const hero = document.querySelector(".hero-cinematic");
    const glow = hero && hero.querySelector(".hero-bg-glow");
    if (hero && glow) {
      let glowTicking = false;
      let nx = 0,
        ny = 0;
      const applyGlow = () => {
        glow.style.setProperty("--gx", nx.toFixed(3));
        glow.style.setProperty("--gy", ny.toFixed(3));
        glowTicking = false;
      };
      hero.addEventListener("pointerenter", () => hero.classList.add("pointer-active"));
      hero.addEventListener(
        "pointermove",
        (e) => {
          const r = hero.getBoundingClientRect();
          nx = (e.clientX - r.left) / r.width - 0.5; // -0.5..0.5
          ny = (e.clientY - r.top) / r.height - 0.5;
          if (!glowTicking) {
            requestAnimationFrame(applyGlow);
            glowTicking = true;
          }
        },
        { passive: true }
      );
      hero.addEventListener("pointerleave", () => {
        nx = 0;
        ny = 0;
        applyGlow();
        hero.classList.remove("pointer-active");
      });
    }

    /* ---- Magnetic primary CTA (hero only, subtle) ---- */
    const MAG_MAX = 6; // px
    document.querySelectorAll(".hero-ctas .btn-primary").forEach((btn) => {
      btn.classList.add("magnetic");
      const pad = 60;
      btn.addEventListener(
        "pointermove",
        (e) => {
          const r = btn.getBoundingClientRect();
          const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 + pad);
          const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 + pad);
          btn.style.setProperty("--tx", (dx * MAG_MAX).toFixed(2) + "px");
          btn.style.setProperty("--ty", (dy * MAG_MAX).toFixed(2) + "px");
        },
        { passive: true }
      );
      btn.addEventListener("pointerleave", () => {
        btn.style.setProperty("--tx", "0px");
        btn.style.setProperty("--ty", "0px");
      });
    });
  }
})();

/* ============================================================
   v10 — Platform layer (additive, self-contained)
   Ambient animated background, scroll-linked depth + a sticky
   dashboard reveal, and the cinematic video modal. CSP-safe
   (no inline, no CDN). Everything heavy is gated to non-reduced
   motion and torn down off-screen.
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Ambient background field (every page) ---- */
  if (!document.querySelector(".bg-field")) {
    const field = document.createElement("div");
    field.className = "bg-field";
    field.setAttribute("aria-hidden", "true");
    field.innerHTML = '<div class="bg-mesh"></div><div class="bg-grid"></div><div class="bg-orb"></div>';
    document.body.prepend(field);
  }
  const bgGrid = document.querySelector(".bg-field .bg-grid");

  /* ---- Scroll-linked depth + sticky dashboard reveal ---- */
  const depthEls = Array.from(document.querySelectorAll("[data-depth]"));
  const stages = Array.from(document.querySelectorAll(".stage-reveal"));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  if (!reduced && (depthEls.length || stages.length || bgGrid)) {
    let ticking = false;
    const onScroll = () => {
      const y = window.scrollY || 0;
      const winH = window.innerHeight || 800;
      if (bgGrid) bgGrid.style.transform = `translate3d(0, ${y * 0.04}px, 0)`;
      for (const el of depthEls) {
        const d = parseFloat(el.dataset.depth) || 0;
        el.style.transform = `translate3d(0, ${y * d}px, 0)`;
      }
      for (const st of stages) {
        const r = st.getBoundingClientRect();
        // 0 as the section enters from the bottom → 1 once it settles near the top third.
        const p = clamp(1 - (r.top - winH * 0.18) / (winH * 0.62), 0, 1);
        st.style.setProperty("--p", p.toFixed(3));
      }
      ticking = false;
    };
    const requestTick = () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } };
    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", requestTick, { passive: true });
    onScroll();
  } else {
    // Reduced motion → show the dashboard reveal in its final state immediately.
    for (const st of stages) st.style.setProperty("--p", "1");
  }

  /* ---- Video modal ("See it in action") ---- */
  const modal = document.querySelector("dialog.video-modal");
  const video = modal && modal.querySelector("video");
  if (modal && video && typeof modal.showModal === "function") {
    const open = () => {
      try { modal.showModal(); } catch { return; }
      try { video.currentTime = 0; const pr = video.play(); if (pr && pr.catch) pr.catch(() => {}); } catch {}
    };
    const close = () => { try { modal.close(); } catch {} };
    document.querySelectorAll("[data-video-open]").forEach((t) => {
      t.addEventListener("click", (e) => { e.preventDefault(); open(); });
    });
    modal.querySelectorAll("[data-video-close]").forEach((c) => c.addEventListener("click", close));
    // Click on the backdrop (the dialog element itself, outside the inner card) closes.
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    // Pause + reset whenever the dialog closes (button, Esc, or backdrop).
    modal.addEventListener("close", () => { try { video.pause(); video.removeAttribute("autoplay"); } catch {} });
  }
})();

/* ============================================================
   v11 — Live data feel: count-up on reveal + gentle live ticks
   for the /pop readout and the hero status chips. (phase 2)
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Count up [data-count-to] when it scrolls into view.
  const counters = document.querySelectorAll("[data-count-to]");
  if (counters.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        const to = parseInt(el.dataset.countTo, 10) || 0;
        if (reduced) { el.textContent = to.toLocaleString(); return; }
        const dur = 1100, t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * to).toLocaleString();
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach((el) => io.observe(el));
  }

  if (reduced) return; // no live ticking under reduced motion

  // Gentle live nudges so the platform feels alive (decorative, bounded).
  const onlineEls = Array.from(document.querySelectorAll('[data-fc="online"], .lp-online b'));
  const flagsEl = document.querySelector('[data-fc="flags"]');
  if (onlineEls.length) {
    let online = 248;
    setInterval(() => {
      online = Math.max(184, Math.min(352, online + Math.round((Math.random() - 0.46) * 9)));
      onlineEls.forEach((el) => { el.textContent = el.matches("[data-fc]") ? online + " online" : online.toLocaleString(); });
    }, 2600);
  }
  if (flagsEl) {
    setInterval(() => {
      const f = Math.random() < 0.22 ? 1 + Math.floor(Math.random() * 2) : 0;
      flagsEl.textContent = f + (f === 1 ? " flag" : " flags");
    }, 4400);
  }
})();

/* ============================================================
   v12 — 3D pointer tilt on feature cards (phase 3)
   Composes with the v9 cursor-light + lift. Subtle (≤6°),
   fine-pointer + non-reduced-motion only; clears on leave so
   the CSS spring-back takes over.
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (reduced || !fine) return;

  document.querySelectorAll(".ark-suite-card, .demo-mini, .highlight-card, .feature-card").forEach((card) => {
    card.addEventListener("pointerenter", () => {
      card.style.transition = "transform 0.14s var(--ease-platform)";
      card.style.willChange = "transform";
    });
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) translateY(-6px)`;
    }, { passive: true });
    card.addEventListener("pointerleave", () => {
      card.style.transition = "";
      card.style.transform = "";
      card.style.willChange = "";
    });
  });
})();

/* ============================================================
   v14 — /pop cluster-tile counts count up on reveal (phase 5)
   Animates only the leading number text node, leaving the
   "/ 70" max suffix span intact. (reduced-motion → instant)
   ============================================================ */
(function () {
  "use strict";
  const counts = document.querySelectorAll(".cluster-tile-count");
  if (!counts.length || !("IntersectionObserver" in window)) return;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      const tn = el.firstChild; // leading "42" text node, before the .max span
      if (!tn || tn.nodeType !== 3) return;
      const to = parseInt(tn.textContent, 10);
      if (!Number.isFinite(to)) return;
      if (reduced) { tn.textContent = String(to); return; }
      const dur = 900, t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        tn.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * to));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.5 });
  counts.forEach((el) => io.observe(el));
})();
