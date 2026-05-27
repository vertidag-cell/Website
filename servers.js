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
    var safeInvite = /^https:\/\/(discord\.gg|discord(?:app)?\.com\/invite)\//i.test(s.invite || "") ? s.invite : "#";
    var avatar = s.icon
      ? '<img class="srv-icon" src="' + esc(s.icon) + '" alt="" width="56" height="56" loading="lazy">'
      : '<div class="srv-icon srv-fallback">' + esc((s.name || "?").slice(0, 1).toUpperCase()) + "</div>";
    var members = s.members ? '<span class="srv-meta">👥 ' + Number(s.members).toLocaleString() + " members</span>" : "";
    var blurb = s.blurb ? '<p class="srv-blurb">' + esc(s.blurb) + "</p>" : "";
    return (
      '<div class="feature-card srv-card">' +
      '<div class="srv-head">' + avatar +
      '<div class="srv-id"><h3 class="srv-name">' + esc(s.name) + "</h3>" + members + "</div></div>" +
      blurb +
      '<a class="btn btn-primary srv-join" href="' + esc(safeInvite) + '" target="_blank" rel="noopener noreferrer">Join Server</a>' +
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
        if (statusEl) statusEl.textContent = "No servers listed yet — be the first! Run /listserver in your server.";
        return;
      }
      if (statusEl) statusEl.textContent = servers.length + " server" + (servers.length === 1 ? "" : "s") + " running Arkoris";
      grid.innerHTML = servers.map(card).join("");
    })
    .catch(function () {
      if (statusEl) statusEl.textContent = "Couldn't load the directory right now — check back soon.";
    });
})();
