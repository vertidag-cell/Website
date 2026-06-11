/*
 * Arkoris landing v2 — interactions.
 * External file on purpose: the site CSP is `script-src 'self'`, so inline
 * <script> blocks never run in production. (The old community-teaser inline
 * script was silently dead because of this — its logic lives here now.)
 *
 * Everything is decorative and degrades to nothing: reduced-motion users get
 * a static page, fetch failures keep the hard-coded fallbacks.
 */
(function () {
  "use strict";

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;

  /* ── Hero particle field ─────────────────────────────────────────────── */
  (function particles() {
    var canvas = document.getElementById("lx-particles");
    if (!canvas || reduced) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, dots = [], running = false, raf = 0;

    function size() {
      var r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.min(70, Math.floor((w * h) / 26000));
      dots = [];
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 0.6 + Math.random() * 1.7,
          vy: 0.12 + Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 0.12,
          a: 0.12 + Math.random() * 0.5,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.y -= d.vy;
        d.x += d.vx;
        d.tw += 0.02;
        if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
        if (d.x < -4) d.x = w + 4;
        if (d.x > w + 4) d.x = -4;
        var alpha = d.a * (0.65 + 0.35 * Math.sin(d.tw));
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(43, 255, 158, " + alpha.toFixed(3) + ")";
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    size();
    window.addEventListener("resize", size, { passive: true });
    // Only burn frames while the hero is actually on screen.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      }).observe(canvas);
    } else {
      start();
    }
    document.addEventListener("visibilitychange", function () {
      document.hidden ? stop() : start();
    });
  })();

  /* ── Hero frame tilt (desktop only) ──────────────────────────────────── */
  (function tilt() {
    if (reduced || !finePointer) return;
    var stage = document.querySelector(".lx-stage");
    var frame = document.querySelector(".lx-frame");
    if (!stage || !frame) return;
    stage.addEventListener("pointermove", function (e) {
      var r = stage.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform =
        "rotateY(" + (px * 7).toFixed(2) + "deg) rotateX(" + (-py * 5).toFixed(2) + "deg)";
    });
    stage.addEventListener("pointerleave", function () {
      frame.style.transform = "rotateY(0deg) rotateX(0deg)";
    });
  })();

  /* ── Bento spotlight follows the cursor ──────────────────────────────── */
  (function spotlight() {
    if (!finePointer) return;
    document.querySelectorAll(".lx-cell").forEach(function (cell) {
      cell.addEventListener("pointermove", function (e) {
        var r = cell.getBoundingClientRect();
        cell.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
        cell.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      });
    });
  })();

  /* ── Terminal type-out (live logs bento cell) ────────────────────────── */
  (function terminal() {
    var term = document.querySelector("[data-lx-term]");
    if (!term) return;
    var LINES = [
      ["12:04:11", "JOIN  Vexa joined Ragnarok (42/70)"],
      ["12:04:37", "CHAT  [Riff] anyone selling element?"],
      ["12:05:02", "KILL  Yutyrannus (wild) → Daeodon (Apex)"],
      ["12:05:48", "TRIBE Apex claimed a Tek Transmitter"],
      ["12:06:15", "JOIN  Nyx joined The Island (38/70)"],
      ["12:06:51", "GUARD review flag: gamertag spoof heuristic"],
    ];
    var host = term.querySelector(".lines");
    var i = 0;
    function push() {
      if (!host) return;
      var pair = LINES[i % LINES.length];
      i++;
      var ln = document.createElement("span");
      ln.className = "ln";
      var t = document.createElement("span");
      t.className = "t";
      t.textContent = pair[0] + "  ";
      ln.appendChild(t);
      ln.appendChild(document.createTextNode(pair[1]));
      host.appendChild(ln);
      while (host.children.length > 4) host.removeChild(host.firstChild);
    }
    push(); push(); push();
    if (!reduced) setInterval(push, 2600);
  })();

  /* ── In-view triggers: browser frame rise + chart line draw ──────────── */
  (function inView() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".lx-browser, .lx-pop .draw").forEach(function (el) {
        el.classList.add("lx-in");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("lx-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    document.querySelectorAll(".lx-browser, .lx-pop .draw").forEach(function (el) {
      io.observe(el);
    });
  })();

  /* ── Live numbers: real server count + community avatars ─────────────── */
  (function liveData() {
    var base = (window.SITE_CONFIG && window.SITE_CONFIG.backendApiUrl) || "";
    fetch(base + "/api/servers", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(0); })
      .then(function (d) {
        var servers = (d && d.servers) || [];
        if (!servers.length) return;

        // Hero stat + directory copy get the real number.
        var statEl = document.querySelector("[data-lx-servers]");
        if (statEl) statEl.setAttribute("data-count-to", String(servers.length));
        if (statEl) statEl.textContent = String(servers.length);
        var countEl = document.querySelector("[data-servers-count]");
        if (countEl) {
          countEl.textContent =
            servers.length.toLocaleString() + " server" + (servers.length === 1 ? "" : "s");
        }

        // Swap the placeholder avatars for real server icons.
        var avWrap = document.querySelector("[data-servers-avatars]");
        var withIcon = servers.filter(function (s) { return s.icon; }).slice(0, 5);
        if (avWrap && withIcon.length) {
          avWrap.textContent = "";
          withIcon.forEach(function (s) {
            var img = document.createElement("img");
            img.className = "srv-av";
            img.src = String(s.icon).replace(/["'<>]/g, "");
            img.alt = "";
            img.loading = "lazy";
            img.width = 54;
            img.height = 54;
            avWrap.appendChild(img);
          });
          var extra = servers.length - withIcon.length;
          if (extra > 0) {
            var more = document.createElement("span");
            more.className = "srv-av";
            more.textContent = "+" + extra;
            avWrap.appendChild(more);
          }
        }
      })
      .catch(function () { /* static fallbacks stay */ });
  })();
})();
