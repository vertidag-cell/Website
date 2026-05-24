// Per-guild XP leaderboard page logic. External (not inline) because the site
// CSP is `script-src 'self'` — which blocks BOTH inline <script> AND inline
// event handlers like onerror, so broken-image fallbacks are wired here.
(function () {
  var cfg = (window.SITE_CONFIG || {});
  var links = cfg.links || {};
  // Wire the header CTAs from config.
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
  function vctime(min) {
    min = Math.round(Number(min) || 0);
    if (min < 60) return min + 'm';
    var h = Math.floor(min / 60), m = min % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }
  function initial(s) { return esc((String(s || '?').trim().charAt(0) || '?').toUpperCase()); }
  // Avatar/logo <img> with a data-letter fallback. CSP blocks inline onerror,
  // so a failed image is swapped for its initial by wireImageFallbacks().
  function avatar(url, name, cls, fallbackUrl) {
    cls = cls || 'xprow-av';
    if (url) {
      // Optional secondary source (e.g. broken branding logo → real Discord icon).
      var fb = (fallbackUrl && fallbackUrl !== url) ? ' data-fallback-src="' + esc(fallbackUrl) + '"' : '';
      return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" data-letter="' + initial(name) + '"' + fb + '>';
    }
    return '<div class="' + cls + ' xplb-avfb">' + initial(name) + '</div>';
  }
  function state(html) { root.innerHTML = '<div class="xplb-state">' + html + '</div>'; }
  // Replace any broken <img data-letter> with an initial-letter fallback div.
  function wireImageFallbacks() {
    root.querySelectorAll('img[data-letter]').forEach(function (img) {
      var onErr = function () {
        // Try the secondary source once (broken branding logo → Discord icon)
        // before giving up and showing the initial-letter fallback.
        var fb = img.getAttribute('data-fallback-src');
        if (fb) { img.removeAttribute('data-fallback-src'); img.src = fb; return; }
        var d = document.createElement('div');
        d.className = img.className + ' xplb-avfb';
        d.textContent = img.getAttribute('data-letter') || '';
        if (img.parentNode) img.parentNode.replaceChild(d, img);
      };
      if (img.complete && img.naturalWidth === 0) onErr();   // already failed (cached)
      else img.addEventListener('error', onErr);             // fails later
    });
  }

  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    state('<h2>No server selected</h2><p>This page needs a server link. Open it from your Discord server with <code>/leaderboard</code> &rarr; <b>View on the web</b>.</p><a class="btn btn-primary" href="index.html">Back to site</a>');
    return;
  }

  fetch('/api/dashboard/xp/leaderboard?guild=' + encodeURIComponent(guildId) + '&limit=15', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return { error: 'http_' + r.status }; }); })
    .then(function (data) {
      if (!data || data.error) {
        state('<h2>Leaderboard unavailable</h2><p>We couldn\'t load this server\'s leaderboard right now. Please try again in a moment.</p><a class="btn btn-outline" href="index.html">Back to site</a>');
        return;
      }
      var g = data.guild || {};
      if (g.color) document.documentElement.style.setProperty('--accent', g.color);
      var gname = g.guildName || g.brandName || 'This server';
      document.title = gname + ' — XP Leaderboard';

      if (data.premium === false) {
        state(
          '<div class="xplb-badge">✨ Premium feature</div>' +
          '<h2>' + esc(gname) + '\'s web leaderboard is locked</h2>' +
          '<p>The shareable web XP leaderboard is part of <b>Premium</b>. The in-Discord <code>/leaderboard</code> is always free — upgrade to publish it on the web.</p>' +
          '<a class="btn btn-primary" href="' + esc(links.subscribe || 'pricing.html') + '">See Premium</a>'
        );
        return;
      }

      var board = data.leaderboard || [];
      if (!board.length) {
        state('<div class="xplb-badge">' + esc(gname) + '</div><h2>No XP yet</h2><p>No one has earned XP on this server yet. Start chatting in Discord to climb the board!</p><a class="btn btn-outline" href="index.html">Back to site</a>');
        return;
      }

      // Server totals for the summary strip.
      var totMsg = 0, totVc = 0, totXp = 0;
      board.forEach(function (p) { totMsg += Number(p.messages) || 0; totVc += Number(p.voiceMinutes) || 0; totXp += Number(p.xp) || 0; });

      var top = board.slice(0, 3);
      var rest = board.slice(3);
      var maxXp = board[0].xp || 1;
      var logo = g.logo || g.guildIcon;

      var html = '';
      html += '<div class="xplb-hero">';
      html += '<div class="xplb-badge">🏆 XP Leaderboard</div>';
      html += avatar(logo, gname, 'xplb-logo', g.guildIcon);
      html += '<h1 class="xplb-title">' + esc(gname) + '</h1>';
      html += '<p class="xplb-sub">Top ' + board.length + ' members by XP · updated just now</p>';
      html += '<div class="xplb-totals">' +
        '<span>📈 ' + fmt(totXp) + ' XP</span>' +
        '<span>💬 ' + fmt(totMsg) + ' messages</span>' +
        '<span>🎙️ ' + vctime(totVc) + ' in voice</span>' +
        '</div>';
      html += '</div>';

      // Podium — order silver / gold / bronze for the classic stage look.
      var podClass = ['gold', 'silver', 'bronze'];
      var podMedal = ['🥇', '🥈', '🥉'];
      var podOrder = top.length >= 3 ? [1, 0, 2] : top.map(function (_, i) { return i; });
      html += '<div class="xplb-podium">';
      podOrder.forEach(function (idx) {
        var p = top[idx]; if (!p) return;
        html += '<div class="pod ' + podClass[idx] + '">' +
          '<div class="pod-medal">' + podMedal[idx] + '</div>' +
          avatar(p.avatar, p.name, 'pod-av') +
          '<p class="pod-name" title="' + esc(p.name) + '">' + esc(p.name) + '</p>' +
          '<div class="pod-lvl">Level ' + fmt(p.level) + '</div>' +
          '<div class="pod-xp">' + fmt(p.xp) + ' XP</div>' +
          '<div class="pod-meta">💬 ' + fmt(p.messages) + ' · 🎙️ ' + vctime(p.voiceMinutes) + '</div>' +
        '</div>';
      });
      html += '</div>';

      if (rest.length) {
        html += '<div class="xplb-list">';
        rest.forEach(function (p) {
          var pct = Math.max(4, Math.round((p.xp / maxXp) * 100));
          html += '<div class="xprow">' +
            '<div class="xprow-rank">' + p.rank + '</div>' +
            avatar(p.avatar, p.name, 'xprow-av') +
            '<div class="xprow-main"><div class="xprow-name" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' +
              '<div class="xprow-meta">💬 ' + fmt(p.messages) + ' msgs · 🎙️ ' + vctime(p.voiceMinutes) + '</div>' +
              '<div class="xprow-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<div class="xprow-stats"><div class="xprow-lvl">Lv ' + fmt(p.level) + '</div>' +
              '<div class="xprow-xp">' + fmt(p.xp) + ' XP</div></div>' +
          '</div>';
        });
        html += '</div>';
      }

      root.innerHTML = html;
      wireImageFallbacks();
    })
    .catch(function () {
      state('<h2>Couldn\'t reach the server</h2><p>The leaderboard service didn\'t respond. Please try again shortly.</p><a class="btn btn-outline" href="index.html">Back to site</a>');
    });
})();
