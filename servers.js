/* Arkoris — public server directory. Fetches opted-in servers from the backend
   (proxied via the Pages function) and renders join cards. Read-only + escaped. */
(function () {
  "use strict";
  var grid = document.getElementById("servers-grid");
  var statusEl = document.getElementById("servers-status");
  if (!grid) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function card(s) {
    var validInvite = /^https:\/\/(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(s.invite || "");
    var avatar = s.icon
      ? '<img class="srv-icon" src="' + esc(s.icon) + '" alt="" width="56" height="56" loading="lazy">'
      : '<div class="srv-icon srv-fallback">' + esc((s.name || "?").slice(0, 1).toUpperCase()) + "</div>";
    var members = s.members ? '<span class="srv-meta"><b>' + Number(s.members).toLocaleString() + "</b> members</span>" : "";
    // Always render the body zone (even when empty) so cards align with/without a blurb.
    var blurb = '<div class="srv-body">' + (s.blurb ? '<p class="srv-blurb">' + esc(s.blurb) + "</p>" : "") + "</div>";
    var prem = s.premium ? '<span class="srv-prem">✦ Premium</span>' : "";
    // Every listed server has a real invite (the backend drops private ones);
    // keep a private fallback just in case a stray entry slips through.
    var join = validInvite
      ? '<a class="srv-join" href="' + esc(s.invite) + '" target="_blank" rel="noopener noreferrer">Join Server <span aria-hidden="true" class="srv-join-arr">→</span></a>'
      : '<span class="srv-private">Private — invite only</span>';
    // Premium servers expose shareable web leaderboards (XP + Cluster Alpha) — a
    // quiet secondary link to the per-guild hub. Free servers' leaderboards are
    // locked, so we don't surface a dead-end upsell on the public directory.
    var lb = (s.premium && s.id)
      ? '<a class="srv-lb" href="leaderboards.html?guild=' + esc(s.id) + '" style="display:block;text-align:center;margin-top:10px;font-size:13px;font-weight:600;color:var(--text-muted,#a1a1aa)">🏆 View leaderboards <span aria-hidden="true">→</span></a>'
      : "";
    return (
      '<div class="feature-card srv-card' + (s.premium ? " premium" : "") + '">' +
      prem +
      '<div class="srv-head">' + avatar +
      '<div class="srv-id"><h3 class="srv-name">' + esc(s.name) + "</h3>" + members + "</div></div>" +
      blurb +
      join +
      lb +
      "</div>"
    );
  }

  var base = (window.SITE_CONFIG && window.SITE_CONFIG.backendApiUrl) || "";
  if (statusEl) statusEl.textContent = "Loading servers…";

  fetch(base + "/api/servers", { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (d) {
      var servers = (d && d.servers) || [];
      if (!servers.length) {
        if (statusEl) statusEl.textContent = "Directory's warming up — check back in a moment.";
        return;
      }
      if (statusEl) statusEl.textContent = servers.length + " server" + (servers.length === 1 ? "" : "s") + " running Arkoris";
      grid.innerHTML = servers.map(card).join("");
    })
    .catch(function () {
      if (statusEl) statusEl.textContent = "Couldn't load the directory right now — check back soon.";
    });
})();
