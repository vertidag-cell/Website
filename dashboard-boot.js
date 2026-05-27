/*
 * Arkoris — Dashboard safety boot
 * ------------------------------------------------------------
 * Loads BEFORE dashboard-app.js. If the SPA hasn't replaced the
 * initial loading state within 4 seconds (e.g. dashboard-app.js
 * 404, syntax error, blocked, or stale-cache mismatch), this
 * timer swaps the loading state for a clear error with a
 * cache/hard-refresh hint so the user is never stuck on
 * "Loading dashboard…" forever.
 *
 * dashboard-app.js sets window.__DASH_TOUCHED__ = true the moment
 * it runs, which cancels this fallback.
 */

(function () {
  "use strict";

  var ROOT_ID = "dashboard-root";
  var TIMEOUT_MS = 4000;

  function bootError(message) {
    var el = document.getElementById(ROOT_ID);
    if (!el) return;
    // Inline styles only (no class dependencies) so this still
    // renders even if styles.css somehow failed.
    el.innerHTML =
      '<div style="padding:20px 22px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);border-radius:12px">' +
        '<div style="font-weight:600;font-size:1.05rem;color:#f5f5f7;margin-bottom:8px">Dashboard script didn\'t boot</div>' +
        '<div style="font-size:0.92rem;color:#a1a1aa;line-height:1.6">' +
          message +
          '<br><br>' +
          '<strong style="color:#f5f5f7">Most common fix:</strong> hard-refresh the page ' +
          '(<kbd style="background:rgba(255,255,255,0.08);padding:2px 7px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.85em">Ctrl + Shift + R</kbd> on Windows / ' +
          '<kbd style="background:rgba(255,255,255,0.08);padding:2px 7px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.85em">Cmd + Shift + R</kbd> on Mac), ' +
          'or open the page in an incognito window. Your browser or Cloudflare\'s CDN is likely caching an older build.' +
          '<br><br>' +
          'Still stuck? Open DevTools (F12) → Console and look for red errors starting with <code>[dashboard]</code>.' +
        '</div>' +
        '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<button type="button" id="dash-boot-reload" style="background:linear-gradient(180deg,#ef4444,#dc2626);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit">Reload page</button>' +
          '<a href="index.html" style="background:rgba(255,255,255,0.04);color:#f5f5f7;border:1px solid rgba(255,255,255,0.14);padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;font-family:inherit">Back to home</a>' +
        '</div>' +
      '</div>';
    var btn = document.getElementById("dash-boot-reload");
    if (btn) btn.addEventListener("click", function () { location.reload(); });
  }

  window.setTimeout(function () {
    if (window.__DASH_TOUCHED__) return; // dashboard-app.js ran fine
    bootError(
      "The page loaded but <code>dashboard-app.js</code> didn't run within " +
      (TIMEOUT_MS / 1000) +
      " seconds."
    );
  }, TIMEOUT_MS);
})();
