// Per-guild storefront — Phase 1: browse products. Reads ?guild=<id>, fetches
// /api/dashboard/store, renders the shop tinted to the guild's brand colour.
// Cart + checkout arrive in Phase 2 (the "Add to cart" button is wired to a
// placeholder for now). External JS (site CSP is script-src 'self').
(function () {
  var cfg = (window.SITE_CONFIG || {});
  var links = cfg.links || {};
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var v = links[a.getAttribute('data-link')];
    if (v) a.setAttribute('href', v);
  });

  var root = document.getElementById('store-root');
  var params = new URLSearchParams(location.search);
  var guildId = (params.get('guild') || params.get('g') || '').trim();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initial(s) { return esc((String(s || '?').trim().charAt(0) || '?').toUpperCase()); }
  var CCY = { GBP: '£', USD: '$', EUR: '€' };
  function money(n, currency) {
    var sym = CCY[currency] || '';
    return sym + (Number(n) || 0).toFixed(2);
  }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }

  var ICON = {
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  function state(html, icon) {
    root.innerHTML = '<div class="store-state"><div class="store-state-ico">' + (icon || ICON.bag) + '</div>' + html + '</div>';
  }
  function wireImageFallbacks() {
    root.querySelectorAll('img[data-letter]').forEach(function (img) {
      var onErr = function () {
        var d = document.createElement('div');
        d.className = img.className + (img.classList.contains('prod-img') ? ' prod-fb' : ' store-fb');
        d.textContent = img.getAttribute('data-letter') || '';
        if (img.parentNode) img.parentNode.replaceChild(d, img);
      };
      if (img.complete && img.naturalWidth === 0) onErr();
      else img.addEventListener('error', onErr);
    });
  }

  // Placeholder until Phase 2 (cart + checkout) lands. Wired via addEventListener
  // (the site CSP `script-src 'self'` blocks inline onclick handlers).
  function wireBuyButtons() {
    root.querySelectorAll('.prod-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        alert('Cart & checkout arrive in the next update — you can browse the store for now.');
      });
    });
  }

  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    state('<h2>No store selected</h2><p>This page needs a server link, e.g. <code>store.html?guild=&lt;server id&gt;</code>. Open it from the server\'s dashboard or the Servers directory.</p><a class="btn btn-primary" href="servers.html">Browse servers</a>', ICON.bag);
    return;
  }

  fetch('/api/dashboard/store?guild=' + encodeURIComponent(guildId), { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return { error: 'http_' + r.status }; }); })
    .then(function (data) {
      if (!data || data.error) {
        state('<h2>Store unavailable</h2><p>We couldn\'t load this server\'s store right now. Please try again in a moment.</p><a class="btn btn-outline" href="index.html">Back to site</a>', ICON.alert);
        return;
      }
      var s = data.store || {};
      if (s.color) document.documentElement.style.setProperty('--accent', s.color);
      var name = s.title || s.guildName || 'Store';
      document.title = name + ' — Store';

      if (data.premium === false) {
        state(
          '<div class="store-badge">✦ Premium feature</div>' +
          '<h2>' + esc(name) + '\'s store isn\'t open</h2>' +
          '<p>Web stores are part of <b>Premium</b>. The server can unlock its shop by subscribing.</p>' +
          '<a class="btn btn-primary" href="' + esc(links.subscribe || 'pricing.html') + '">See Premium</a>',
          ICON.lock
        );
        return;
      }
      if (data.enabled === false) {
        state('<div class="store-badge">' + esc(name) + '</div><h2>The store is closed</h2><p>This server has a store but it isn\'t open yet. Check back soon!</p><a class="btn btn-outline" href="index.html">Back to site</a>');
        return;
      }

      var products = data.products || [];
      var logo = s.logo || s.guildIcon;
      var pays = [];
      if (s.acceptMoney) pays.push('💳 Card / PayPal');
      if (s.acceptCredits) pays.push('🪙 Server credits');

      var html = '<div class="store-hero">';
      if (s.banner) html += '<img class="store-hero-banner" src="' + esc(s.banner) + '" alt="">';
      html += '<div class="store-hero-inner">';
      html += logo
        ? '<img class="store-logo" src="' + esc(logo) + '" alt="" data-letter="' + initial(name) + '">'
        : '<div class="store-logo store-fb">' + initial(name) + '</div>';
      html += '<div class="store-htext"><h1 class="store-title">' + esc(name) + '</h1>' +
        (s.description ? '<p class="store-desc">' + esc(s.description) + '</p>' : '') +
        (pays.length ? '<div class="store-pays">' + pays.map(function (p) { return '<span class="store-pay">' + p + '</span>'; }).join('') + '</div>' : '') +
        '</div></div></div>';

      if (!products.length) {
        html += '<div class="store-state"><div class="store-state-ico">' + ICON.bag + '</div><h2>No products yet</h2><p>This store hasn\'t added any products yet. Check back soon!</p></div>';
        root.innerHTML = html;
        return;
      }

      html += '<p class="store-note">Browsing ' + products.length + ' product' + (products.length === 1 ? '' : 's') + ' · cart &amp; checkout arrive in the next update</p>';
      html += '<div class="store-grid">';
      products.forEach(function (p) {
        var img = p.image_url
          ? '<img class="prod-img" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-letter="' + initial(p.name) + '">'
          : '<div class="prod-img prod-fb">' + initial(p.name) + '</div>';
        var badges = '';
        badges += p.fulfillment_type === 'role'
          ? '<span class="prod-badge role">⚡ Instant role</span>'
          : '<span class="prod-badge">📦 In-game delivery</span>';
        if (!p.inStock) badges += '<span class="prod-badge oos">Out of stock</span>';

        var price = '';
        if (p.price_money != null) price += '<span class="prod-money">' + money(p.price_money, s.currency) + '</span>';
        if (p.price_money != null && p.price_credits != null) price += '<span class="prod-or">or</span>';
        if (p.price_credits != null) price += '<span class="prod-credits">🪙 ' + fmt(p.price_credits) + '</span>';

        html += '<div class="prod">' + img + '<div class="prod-body">' +
          (p.category ? '<div class="prod-cat">' + esc(p.category) + '</div>' : '') +
          '<h3 class="prod-name">' + esc(p.name) + '</h3>' +
          (p.description ? '<p class="prod-desc">' + esc(p.description) + '</p>' : '') +
          '<div class="prod-badges">' + badges + '</div>' +
          '<div class="prod-foot"><div class="prod-price">' + price + '</div>' +
          '<button class="btn btn-primary prod-btn" type="button"' + (p.inStock ? '' : ' disabled') + '>Add to cart</button>' +
          '</div></div></div>';
      });
      html += '</div>';

      root.innerHTML = html;
      wireImageFallbacks();
      wireBuyButtons();
    })
    .catch(function () {
      state('<h2>Couldn\'t reach the store</h2><p>The store service didn\'t respond. Please try again shortly.</p><a class="btn btn-outline" href="index.html">Back to site</a>', ICON.alert);
    });
})();
