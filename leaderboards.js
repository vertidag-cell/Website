// Per-guild leaderboards hub — combines the XP and Cluster Alpha leaderboards
// into one shareable page. Fetches both endpoints, shows a top-3 preview of
// each, and links to the full pages. External (CSP: script-src 'self').
(function () {
  var cfg = (window.SITE_CONFIG || {});
  var links = cfg.links || {};
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var v = links[a.getAttribute('data-link')];
    if (v) a.setAttribute('href', v);
  });

  var root = document.getElementById('lbhub-root');
  var params = new URLSearchParams(location.search);
  var guildId = (params.get('guild') || params.get('g') || '').trim();
  var subUrl = links.subscribe || 'pricing.html';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }
  function initial(s) { return esc((String(s || '?').trim().charAt(0) || '?').toUpperCase()); }

  var ICON_XP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>';
  var ICON_CA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6 2 2-6 6zM16 16l4 4M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/></svg>';
  var ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  function state(html, icon) {
    root.innerHTML = '<div class="lbhub-state"><div class="lbhub-ico" style="margin:0 auto 18px">' + (icon || ICON_LINK) + '</div>' + html + '</div>';
  }
  function crest(url, name) {
    if (url) return '<span class="lbhub-crest"><img src="' + esc(url) + '" alt="" loading="lazy"></span>';
    return '<span class="lbhub-crest lbhub-fb">' + initial(name) + '</span>';
  }

  // Build one leaderboard card (XP or CA) from its API payload.
  function card(opts) {
    var d = opts.data || {};
    var rows = (d.leaderboard || []).slice(0, 3);
    var body;
    if (d.premium === false) {
      body = '<div class="lbhub-empty">Locked — part of <b>Premium</b>. ' +
        '<a href="' + esc(subUrl) + '" style="color:var(--accent)">Upgrade</a> to publish it.</div>' +
        '<a class="btn btn-outline" href="' + esc(subUrl) + '">See Premium</a>';
    } else if (!rows.length) {
      body = '<div class="lbhub-empty">' + esc(opts.empty) + '</div>' +
        '<a class="btn btn-outline" href="' + esc(opts.href) + '">Open ' + esc(opts.label) + '</a>';
    } else {
      var list = '<ul class="lbhub-rows">';
      rows.forEach(function (r) {
        list += '<li class="lbhub-row">' +
          '<span class="lbhub-rk">' + (r.rank || '') + '</span>' +
          crest(opts.avatarOf(r), opts.nameOf(r)) +
          '<span class="lbhub-nm" title="' + esc(opts.nameOf(r)) + '">' + esc(opts.nameOf(r)) + '</span>' +
          '<span class="lbhub-val">' + esc(opts.valueOf(r)) + '</span>' +
          '</li>';
      });
      list += '</ul>';
      body = list + '<a class="btn btn-primary" href="' + esc(opts.href) + '">View full ' + esc(opts.label) + '</a>';
    }
    return '<div class="lbhub-card">' +
      '<div class="lbhub-card-head"><div class="lbhub-ico">' + opts.icon + '</div>' +
      '<div><h2>' + esc(opts.title) + '</h2><div class="lbhub-kind">' + esc(opts.kind) + '</div></div></div>' +
      body + '</div>';
  }

  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    state('<h2>No server selected</h2><p>This page needs a server link. Open it from the <a href="servers.html" style="color:var(--accent)">Servers directory</a>, or from Discord with <code>/leaderboard</code> or <code>/ca</code>.</p><a class="btn btn-primary" href="servers.html">Browse servers</a>', ICON_LINK);
    return;
  }

  var q = '?guild=' + encodeURIComponent(guildId);
  Promise.all([
    fetch('/api/dashboard/xp/leaderboard' + q + '&limit=3', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return { error: 'xp' }; }),
    fetch('/api/dashboard/ca/leaderboard' + q, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).catch(function () { return { error: 'ca' }; })
  ]).then(function (res) {
    var xp = res[0] || {}, ca = res[1] || {};
    // Prefer whichever payload carried real guild meta for the header/colour.
    var g = (xp.guild && xp.guild.guildName ? xp.guild : null) || (ca.guild && ca.guild.guildName ? ca.guild : null) || xp.guild || ca.guild || {};
    if (g.color) document.documentElement.style.setProperty('--accent', g.color);
    var gname = g.guildName || g.brandName || 'This server';
    document.title = gname + ' — Leaderboards';

    if (xp.error && ca.error) {
      state('<h2>Leaderboards unavailable</h2><p>We couldn\'t load this server\'s leaderboards right now. Please try again in a moment.</p><a class="btn btn-outline" href="index.html">Back to site</a>');
      return;
    }

    var headLogo = g.logo || g.guildIcon;
    var heroLogo = headLogo
      ? '<img class="lbhub-logo" src="' + esc(headLogo) + '" alt="" data-letter="' + initial(gname) + '">'
      : '<div class="lbhub-logo lbhub-fb">' + initial(gname) + '</div>';

    var html = '<div class="lbhub-hero">' + heroLogo +
      '<h1 class="lbhub-title">' + esc(gname) + '</h1>' +
      '<p class="lbhub-sub">Live leaderboards · powered by Arkoris</p></div>';

    html += '<div class="lbhub-grid">';
    html += card({
      title: 'XP Leaderboard', kind: 'Most active members', icon: ICON_XP, label: 'XP', empty: 'No XP earned yet.',
      href: 'xp-leaderboard.html' + q, data: xp.error ? {} : xp,
      nameOf: function (r) { return r.name; }, valueOf: function (r) { return 'Lv ' + fmt(r.level); }, avatarOf: function (r) { return r.avatar; }
    });
    html += card({
      title: 'Cluster Alpha', kind: 'Top tribes by points', icon: ICON_CA, label: 'CA', empty: 'No tribes added yet.',
      href: 'ca-leaderboard.html' + q, data: ca.error ? {} : ca,
      nameOf: function (r) { return r.tribe; }, valueOf: function (r) { return fmt(r.points) + ' pts'; }, avatarOf: function () { return null; }
    });
    html += '</div>';

    root.innerHTML = html;
    // Swap a broken hero logo for the initial fallback (CSP blocks inline onerror).
    var img = root.querySelector('img.lbhub-logo');
    if (img) img.addEventListener('error', function () {
      var d = document.createElement('div');
      d.className = 'lbhub-logo lbhub-fb';
      d.textContent = img.getAttribute('data-letter') || '';
      if (img.parentNode) img.parentNode.replaceChild(d, img);
    });
  });
})();
