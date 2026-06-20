// Per-guild Cluster Alpha (tribe) leaderboard page logic. Mirrors
// xp-leaderboard.js. External (not inline) because the site CSP is
// `script-src 'self'`, which blocks inline scripts AND inline event handlers.
(function () {
  var cfg = (window.SITE_CONFIG || {});
  var links = cfg.links || {};
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var v = links[a.getAttribute('data-link')];
    if (v) a.setAttribute('href', v);
  });

  var root = document.getElementById('xplb-root');
  var params = new URLSearchParams(location.search);
  var guildId = (params.get('guild') || params.get('g') || '').trim();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }
  function initial(s) { return esc((String(s || '?').trim().charAt(0) || '?').toUpperCase()); }
  // Logo <img> with a data-letter fallback (CSP blocks inline onerror).
  function logo(url, name, cls, fallbackUrl) {
    cls = cls || 'xplb-logo';
    if (url) {
      var fb = (fallbackUrl && fallbackUrl !== url) ? ' data-fallback-src="' + esc(fallbackUrl) + '"' : '';
      return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" data-letter="' + initial(name) + '"' + fb + '>';
    }
    return '<div class="' + cls + ' xplb-avfb">' + initial(name) + '</div>';
  }
  // Tribes have no avatar — render the tribe's initial in the circle.
  function crest(name, cls) {
    cls = cls || 'xprow-av';
    return '<div class="' + cls + ' xplb-avfb">' + initial(name) + '</div>';
  }
  // map · spot line (either may be missing).
  function place(t) {
    var parts = [];
    if (t.map) parts.push(esc(t.map));
    if (t.spot) parts.push(esc(t.spot));
    return parts.join(' · ');
  }
  var STATE_ICONS = {
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  function state(html, icon) {
    var ic = STATE_ICONS[icon] || STATE_ICONS.trophy;
    root.innerHTML = '<div class="xplb-state"><div class="xplb-state-ico">' + ic + '</div>' + html + '</div>';
  }
  function wireImageFallbacks() {
    root.querySelectorAll('img[data-letter]').forEach(function (img) {
      var onErr = function () {
        var fb = img.getAttribute('data-fallback-src');
        if (fb) { img.removeAttribute('data-fallback-src'); img.src = fb; return; }
        var d = document.createElement('div');
        d.className = img.className + ' xplb-avfb';
        d.textContent = img.getAttribute('data-letter') || '';
        if (img.parentNode) img.parentNode.replaceChild(d, img);
      };
      if (img.complete && img.naturalWidth === 0) onErr();
      else img.addEventListener('error', onErr);
    });
  }

  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    state('<h2>No server selected</h2><p>This page needs a server link. Open it from your Discord server with <code>/ca</code> &rarr; <b>View on the web</b>.</p><a class="btn btn-primary" href="index.html">Back to site</a>', 'link');
    return;
  }

  fetch('/api/dashboard/ca/leaderboard?guild=' + encodeURIComponent(guildId), { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return { error: 'http_' + r.status }; }); })
    .then(function (data) {
      if (!data || data.error) {
        state('<h2>Leaderboard unavailable</h2><p>We couldn\'t load this server\'s Cluster Alpha leaderboard right now. Please try again in a moment.</p><a class="btn btn-outline" href="index.html">Back to site</a>', 'alert');
        return;
      }
      var g = data.guild || {};
      if (g.color) document.documentElement.style.setProperty('--accent', g.color);
      var gname = g.guildName || g.brandName || 'This server';
      document.title = gname + ' — Cluster Alpha Leaderboard';

      if (data.premium === false) {
        state(
          '<div class="xplb-badge">✦ Premium feature</div>' +
          '<h2>' + esc(gname) + '\'s web leaderboard is locked</h2>' +
          '<p>The shareable web Cluster Alpha leaderboard is part of <b>Premium</b>. The in-Discord <code>/ca</code> leaderboard is always free — upgrade to publish it on the web.</p>' +
          '<a class="btn btn-primary" href="' + esc(links.subscribe || 'pricing.html') + '">See Premium</a>'
        );
        return;
      }

      var board = data.leaderboard || [];
      if (!board.length) {
        state('<div class="xplb-badge">' + esc(gname) + '</div><h2>No tribes yet</h2><p>No tribes have been added to this server\'s Cluster Alpha leaderboard yet. Admins can add them with <code>/ca create</code> in Discord.</p><a class="btn btn-outline" href="index.html">Back to site</a>');
        return;
      }

      var totalPts = 0;
      board.forEach(function (t) { totalPts += Number(t.points) || 0; });

      var top = board.slice(0, 3);
      var rest = board.slice(3);
      var maxPts = Math.max(1, Number(board[0].points) || 0);
      var headLogo = g.logo || g.guildIcon;
      var title = g.title || 'Cluster Alpha Leaderboard';

      var html = '';
      html += '<div class="xplb-hero">';
      html += '<div class="xplb-badge">⚔️ ' + esc(title) + '</div>';
      html += logo(headLogo, gname, 'xplb-logo', g.guildIcon);
      html += '<h1 class="xplb-title">' + esc(gname) + '</h1>';
      html += '<p class="xplb-sub">Top ' + board.length + ' tribe' + (board.length === 1 ? '' : 's') + ' by points · updated just now</p>';
      html += '<div class="xplb-totals">' +
        '<span>🛡️ ' + fmt(board.length) + ' tribe' + (board.length === 1 ? '' : 's') + '</span>' +
        '<span>⭐ ' + fmt(totalPts) + ' total points</span>' +
        '<span>🥇 ' + esc(board[0].tribe) + '</span>' +
        '</div>';
      html += '</div>';

      // Podium — silver / gold / bronze stage order.
      var podClass = ['gold', 'silver', 'bronze'];
      var podMedal = ['🥇', '🥈', '🥉'];
      var podOrder = top.length >= 3 ? [1, 0, 2] : top.map(function (_, i) { return i; });
      html += '<div class="xplb-podium">';
      podOrder.forEach(function (idx) {
        var t = top[idx]; if (!t) return;
        var pl = place(t);
        html += '<div class="pod ' + podClass[idx] + '">' +
          '<div class="pod-medal">' + podMedal[idx] + '</div>' +
          crest(t.tribe, 'pod-av') +
          '<p class="pod-name" title="' + esc(t.tribe) + '">' + esc(t.tribe) + '</p>' +
          '<div class="pod-lvl">' + fmt(t.points) + ' pts</div>' +
          (pl ? '<div class="pod-meta">📍 ' + pl + '</div>' : '') +
        '</div>';
      });
      html += '</div>';

      if (rest.length) {
        html += '<div class="xplb-list">';
        rest.forEach(function (t) {
          var pct = Math.max(4, Math.round((Number(t.points) || 0) / maxPts * 100));
          var pl = place(t);
          html += '<div class="xprow">' +
            '<div class="xprow-rank">' + t.rank + '</div>' +
            crest(t.tribe, 'xprow-av') +
            '<div class="xprow-main"><div class="xprow-name" title="' + esc(t.tribe) + '">' + esc(t.tribe) + '</div>' +
              (pl ? '<div class="xprow-meta">📍 ' + pl + '</div>' : '') +
              '<div class="xprow-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<div class="xprow-stats"><div class="xprow-lvl">' + fmt(t.points) + '</div>' +
              '<div class="xprow-xp">points</div></div>' +
          '</div>';
        });
        html += '</div>';
      }

      root.innerHTML = html;
      wireImageFallbacks();
    })
    .catch(function () {
      state('<h2>Couldn\'t reach the server</h2><p>The leaderboard service didn\'t respond. Please try again shortly.</p><a class="btn btn-outline" href="index.html">Back to site</a>', 'alert');
    });
})();
