/* Quick's ARK Bot — UI interactions
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

  /* -------- Mobile menu -------- */
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.querySelector(".nav-links");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      menu.classList.toggle("open");
      const open = menu.classList.contains("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    menu.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => menu.classList.remove("open"))
    );
  }

  /* -------- Active nav link -------- */
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    if (href === path || (path === "" && href === "index.html")) {
      a.classList.add("active");
    }
  });

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
        const duration = 1100;
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(eased * target);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        countObserver.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll(".count-up[data-count]").forEach((el) => countObserver.observe(el));

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
            <span class="dname dname-bot">Quick's ARK Bot</span>
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

  const TUTORIAL_ORDER = ["setup", "subscribe", "tickets", "reward", "payments"];

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
                title: "Subscribe to Quick's ARK Bot",
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
                footer: "Quick's ARK Bot · Ticket System",
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
                footer: "Quick's ARK Bot · Hype System",
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
                  { name: "Amount", value: "£25.00" },
                  { name: "User", value: "@Player" },
                  {
                    name: "Status",
                    value: '<span class="dspinner"></span>&nbsp;&nbsp;Pending',
                  },
                  { name: "Method", value: "PayPal" },
                ],
                footer: "Quick's ARK Bot · Payments",
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
                  { name: "Amount", value: "£25.00" },
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
                desc: "+£5.00 commission added to @StaffOnDuty's monthly log.",
                fields: [
                  { name: "Total this month", value: "£127.00" },
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

  // Initialise tutorial player after data is defined (avoids TDZ).
  const tutorialRoot = document.querySelector("[data-tut-root]");
  if (tutorialRoot) initTutorialPlayer(tutorialRoot);
})();
