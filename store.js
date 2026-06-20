// Per-guild storefront — browse, cart, checkout, and "my orders". Reads
// ?guild=<id>, renders the shop tinted to the guild's brand, and drives the
// buyer API (/api/dashboard/store/*). Buying requires a Discord login; on a 401
// we stash this page and bounce through /auth/discord/login, returning here
// after the dashboard establishes the session. External JS + addEventListener
// only (site CSP is script-src 'self' — no inline handlers).
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

  var S = { store: null, products: [], user: null, cart: null, coupon: null }; // page state

  // ── helpers ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function initial(s) { return esc((String(s || '?').trim().charAt(0) || '?').toUpperCase()); }
  var CCY = { GBP: '£', USD: '$', EUR: '€' };
  function money(n, currency) { return (CCY[currency] || '') + (Number(n) || 0).toFixed(2); }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }

  // ── tiny API client (credentials + CSRF for unsafe methods) ─────────────────
  var _csrf = '';
  function getCsrf() {
    if (_csrf) return Promise.resolve(_csrf);
    return fetch('/auth/csrf', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (b) { _csrf = (b && b.csrfToken) || ''; return _csrf; })
      .catch(function () { return ''; });
  }
  function api(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var headers = { Accept: 'application/json' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    var pre = (method === 'GET' || method === 'HEAD') ? Promise.resolve('') : getCsrf();
    return pre.then(function (tok) {
      if (tok) headers['X-Arkoris-CSRF'] = tok;
      return fetch(path, {
        method: method, credentials: 'include', headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (body) {
        // Refresh a stale CSRF token once.
        if (r.status === 403 && body && body.error === 'csrf_failed' && !opts._retry) {
          _csrf = ''; return api(path, Object.assign({}, opts, { _retry: true }));
        }
        return { ok: r.ok, status: r.status, body: body };
      });
    });
  }

  function loginBounce() {
    try { sessionStorage.setItem('storeReturn', location.href); } catch (e) {}
    location.href = '/auth/discord/login';
  }

  var ICON = {
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };
  function state(html, icon) {
    root.innerHTML = '<div class="store-state"><div class="store-state-ico">' + (icon || ICON.bag) + '</div>' + html + '</div>';
  }
  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'store-toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('in'); }, 10);
    setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 250); }, 2600);
  }

  // ── data loads ───────────────────────────────────────────────────────────────
  function loadStore() {
    return api('/api/dashboard/store?guild=' + encodeURIComponent(guildId)).then(function (r) { return r.body; });
  }
  function loadMe() {
    return api('/api/dashboard/me').then(function (r) { S.user = r.ok && r.body ? r.body.user : null; return S.user; });
  }
  function loadCart() {
    if (!S.user) { S.cart = null; return Promise.resolve(null); }
    return api('/api/dashboard/store/cart?guild=' + encodeURIComponent(guildId)).then(function (r) {
      S.cart = r.ok ? r.body : null; return S.cart;
    });
  }

  // ── cart mutations ─────────────────────────────────────────────────────────
  // Changing the cart invalidates any previewed coupon discount (it was priced
  // against the old subtotal) — drop it so the buyer re-applies against the new total.
  function addToCart(productId) {
    api('/api/dashboard/store/cart/items?guild=' + encodeURIComponent(guildId), { method: 'POST', body: { productId: productId, quantity: 1 } })
      .then(function (r) {
        if (r.status === 401) return loginBounce();
        if (!r.ok) return toast((r.body && r.body.error) || 'Could not add to cart', 'err');
        S.cart = r.body; S.coupon = null; renderCartButton(); toast('Added to cart'); if (cartOpen) renderCartPanel();
      });
  }
  function setQty(productId, qty) {
    api('/api/dashboard/store/cart/items/' + productId + '?guild=' + encodeURIComponent(guildId), { method: 'PATCH', body: { quantity: qty } })
      .then(function (r) { if (r.status === 401) return loginBounce(); if (r.ok) { S.cart = r.body; S.coupon = null; renderCartButton(); renderCartPanel(); } });
  }
  function removeItem(productId) {
    api('/api/dashboard/store/cart/items/' + productId + '?guild=' + encodeURIComponent(guildId), { method: 'DELETE' })
      .then(function (r) { if (r.ok) { S.cart = r.body; S.coupon = null; renderCartButton(); renderCartPanel(); } });
  }
  function couponErr(e) {
    var map = { coupon_invalid_code: "That code isn't valid.", coupon_expired: "That code has expired.", coupon_not_started: "That code isn't active yet.", coupon_exhausted: "That code has been fully used.", coupon_user_limit: "You've already used that code.", coupon_min_not_met: "Your cart doesn't meet this code's minimum.", coupon_not_applicable: "That code doesn't apply to this payment method.", coupon_no_discount: "That code gives no discount here." };
    return map[e] || "Couldn't apply that code.";
  }
  function applyCoupon(code) {
    code = (code || '').trim(); if (!code) return;
    var r = (S.cart && S.cart.rails) || {};
    var rails = [];
    if (r.canMoney && S.store.acceptMoney) rails.push('money');
    if (r.canCredits && S.store.acceptCredits) rails.push('credits');
    if (!rails.length) return;
    var msg = document.querySelector('.cart-promo-msg'); if (msg) msg.textContent = 'Checking…';
    Promise.all(rails.map(function (rail) {
      return api('/api/dashboard/store/coupon/preview?guild=' + encodeURIComponent(guildId), { method: 'POST', body: { code: code, rail: rail } }).then(function (res) { return { rail: rail, res: res }; });
    })).then(function (results) {
      var coupon = { code: code.toUpperCase(), money: null, credits: null }; var anyOk = false, lastErr = null;
      results.forEach(function (o) {
        if (o.res.ok) { anyOk = true; coupon.code = o.res.body.code; if (o.rail === 'money') coupon.money = { discount: o.res.body.discountMoney, newTotal: o.res.body.newTotalMoney }; else coupon.credits = { discount: o.res.body.discountCredits, newTotal: o.res.body.newTotalCredits }; }
        else lastErr = o.res.body && o.res.body.error;
      });
      if (!anyOk) { if (msg) msg.textContent = couponErr(lastErr); return; }
      S.coupon = coupon; renderCartPanel();
    });
  }
  function checkout(rail) {
    var btns = document.querySelectorAll('.cart-rail-btn');
    btns.forEach(function (b) { b.disabled = true; });
    var body = { rail: rail };
    if (S.coupon && S.coupon.code) body.coupon = S.coupon.code;
    api('/api/dashboard/store/checkout?guild=' + encodeURIComponent(guildId), { method: 'POST', body: body })
      .then(function (r) {
        if (r.status === 401) return loginBounce();
        if (!r.ok) { btns.forEach(function (b) { b.disabled = false; }); return toast(checkoutError(r.body), 'err'); }
        if (rail === 'money' && r.body.checkoutUrl) { window.location.href = r.body.checkoutUrl; return; }
        // credits — instant
        closeCart();
        S.cart = null; renderCartButton();
        var done = r.body.status === 'completed';
        state(
          '<div class="store-badge">✓ Order #' + esc(String(r.body.orderId)) + '</div>' +
          '<h2>' + (done ? 'Order complete!' : 'Order placed!') + '</h2>' +
          '<p>' + (done ? 'Your items have been delivered — check Discord.' : 'Your roles were delivered instantly; any in-game items are now with the staff team, who\'ve been notified.') + '</p>' +
          '<a class="btn btn-primary" id="back-to-store" href="#">Back to store</a>',
          ICON.bag
        );
        var back = document.getElementById('back-to-store');
        if (back) back.addEventListener('click', function (e) { e.preventDefault(); init(); });
      });
  }
  function checkoutError(b) {
    var e = b && b.error;
    var map = {
      insufficient_credits: 'You don\'t have enough credits for this order.',
      not_premium: 'This store is no longer available.',
      store_closed: 'The store is currently closed.',
      no_payment_provider: 'Card/PayPal checkout isn\'t set up for this store yet.',
      cart_empty: 'Your cart is empty.',
      cart_has_unavailable_items: 'Some items are no longer available — please review your cart.',
      cart_not_money_payable: 'This cart can\'t be paid with money (some items are credits-only).',
      cart_not_credits_payable: 'This cart can\'t be paid with credits (some items are money-only).',
      per_user_limit: 'You\'ve hit the purchase limit on one of these items.',
    };
    return map[e] || 'Checkout failed — please try again.';
  }

  // ── cart UI (modal) ──────────────────────────────────────────────────────────
  var cartOpen = false;
  function renderCartButton() {
    var n = S.cart && S.cart.rails ? S.cart.rails.itemCount : 0;
    var fab = document.getElementById('cart-fab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'cart-fab'; fab.type = 'button'; fab.className = 'cart-fab';
      fab.addEventListener('click', openCart);
      document.body.appendChild(fab);
    }
    fab.innerHTML = ICON.bag + '<span>Cart</span>' + (n ? '<b class="cart-count">' + n + '</b>' : '');
    fab.style.display = (S.store && S.store.enabled) ? 'inline-flex' : 'none';
  }
  function openCart() {
    if (!S.user) return loginBounce();
    cartOpen = true;
    var ov = document.createElement('div');
    ov.id = 'cart-overlay'; ov.className = 'cart-overlay';
    ov.innerHTML = '<div class="cart-panel" role="dialog" aria-label="Cart"><div class="cart-head"><h2>Your cart</h2>' +
      '<div class="cart-head-actions"><button type="button" id="cart-orders" class="cart-link">My orders</button>' +
      '<button type="button" id="cart-close" class="cart-x" aria-label="Close">✕</button></div></div>' +
      '<div id="cart-body"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeCart(); });
    document.getElementById('cart-close').addEventListener('click', closeCart);
    document.getElementById('cart-orders').addEventListener('click', showOrders);
    loadCart().then(renderCartPanel);
  }
  function closeCart() {
    cartOpen = false;
    var ov = document.getElementById('cart-overlay'); if (ov) ov.remove();
  }
  function renderCartPanel() {
    var body = document.getElementById('cart-body'); if (!body) return;
    var c = S.cart;
    if (!c || !c.items || !c.items.length) {
      body.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
      return;
    }
    var ccy = c.currency || (S.store && S.store.currency) || 'GBP';
    var html = '<ul class="cart-lines">';
    c.items.forEach(function (i) {
      var p = i.product || {};
      var name = p.name || ('Item ' + i.productId);
      var line = '';
      if (i.lineMoney != null) line += money(i.lineMoney, ccy);
      if (i.lineMoney != null && i.lineCredits != null) line += ' / ';
      if (i.lineCredits != null) line += '🪙' + fmt(i.lineCredits);
      var issue = i.issue ? '<span class="cart-issue">' + (i.issue === 'out_of_stock' ? 'out of stock' : 'unavailable') + '</span>' : '';
      html += '<li class="cart-line' + (i.issue ? ' bad' : '') + '" data-pid="' + i.productId + '">' +
        '<div class="cart-line-main"><span class="cart-line-name">' + esc(name) + '</span>' + issue + '<span class="cart-line-price">' + line + '</span></div>' +
        '<div class="cart-qty"><button type="button" class="qbtn" data-act="dec">−</button>' +
        '<span class="qn">' + i.quantity + '</span>' +
        '<button type="button" class="qbtn" data-act="inc">+</button>' +
        '<button type="button" class="qbtn rm" data-act="rm" aria-label="Remove">🗑</button></div></li>';
    });
    html += '</ul>';

    var r = c.rails || {};
    html += '<div class="cart-totals">';
    if (r.totalMoney) html += '<div><span>Total (money)</span><b>' + money(r.totalMoney, ccy) + '</b></div>';
    if (r.totalCredits) html += '<div><span>Total (credits)</span><b>🪙 ' + fmt(r.totalCredits) + '</b></div>';
    if (typeof c.creditBalance === 'number') html += '<div class="cart-bal"><span>Your balance</span><b>🪙 ' + fmt(c.creditBalance) + '</b></div>';
    html += '</div>';

    var blocked = r.blocked;
    var cm = S.coupon && S.coupon.money, cc = S.coupon && S.coupon.credits;

    // Promo code row.
    if (!blocked) {
      html += '<div class="cart-promo">';
      if (S.coupon) html += '<div class="cart-promo-applied">🎟️ <b>' + esc(S.coupon.code) + '</b> applied <button type="button" class="cart-promo-x">remove</button></div>';
      else html += '<input type="text" class="cart-promo-input" placeholder="Promo code" autocomplete="off"><button type="button" class="cart-promo-apply">Apply</button>';
      html += '<div class="cart-promo-msg"></div></div>';
    }

    html += '<div class="cart-rails">';
    if (blocked) {
      html += '<p class="cart-warn">Some items can\'t be checked out together — remove the flagged ones to continue.</p>';
    } else {
      var canMoney = r.canMoney && S.store.acceptMoney;
      var canCredits = r.canCredits && S.store.acceptCredits;
      if (!canMoney && !canCredits) html += '<p class="cart-warn">This cart can\'t be checked out (mixed money-only and credits-only items).</p>';
      if (canMoney) {
        var mTotal = cm ? cm.newTotal : r.totalMoney;
        html += '<button type="button" class="btn btn-primary cart-rail-btn" data-rail="money">Pay ' + money(mTotal, ccy) + (cm && cm.discount > 0 ? ' <s style="opacity:.6;font-weight:400">' + money(r.totalMoney, ccy) + '</s>' : '') + '</button>';
      }
      if (canCredits) {
        var cTotal = cc ? cc.newTotal : r.totalCredits;
        var lacking = typeof c.creditBalance === 'number' && c.creditBalance < cTotal;
        html += '<button type="button" class="btn ' + (canMoney ? 'btn-outline' : 'btn-primary') + ' cart-rail-btn" data-rail="credits"' + (lacking ? ' disabled title="Not enough credits"' : '') + '>Pay 🪙 ' + fmt(cTotal) + (cc && cc.discount > 0 ? ' <s style="opacity:.6;font-weight:400">' + fmt(r.totalCredits) + '</s>' : '') + (lacking ? ' (low balance)' : '') + '</button>';
      }
    }
    html += '</div>';
    body.innerHTML = html;

    var promoApply = body.querySelector('.cart-promo-apply'), promoInput = body.querySelector('.cart-promo-input'), promoX = body.querySelector('.cart-promo-x');
    if (promoApply) promoApply.addEventListener('click', function () { applyCoupon(promoInput.value); });
    if (promoInput) promoInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyCoupon(promoInput.value); });
    if (promoX) promoX.addEventListener('click', function () { S.coupon = null; renderCartPanel(); });

    body.querySelectorAll('.cart-line').forEach(function (li) {
      var pid = parseInt(li.getAttribute('data-pid'), 10);
      var qn = li.querySelector('.qn');
      li.querySelectorAll('.qbtn').forEach(function (b) {
        b.addEventListener('click', function () {
          var act = b.getAttribute('data-act');
          var cur = parseInt(qn.textContent, 10) || 1;
          if (act === 'inc') setQty(pid, cur + 1);
          else if (act === 'dec') setQty(pid, Math.max(0, cur - 1));
          else if (act === 'rm') removeItem(pid);
        });
      });
    });
    body.querySelectorAll('.cart-rail-btn').forEach(function (b) {
      b.addEventListener('click', function () { if (!b.disabled) checkout(b.getAttribute('data-rail')); });
    });
  }

  function showOrders() {
    var body = document.getElementById('cart-body');
    if (body) body.innerHTML = '<p class="cart-empty">Loading your orders…</p>';
    api('/api/dashboard/store/orders?guild=' + encodeURIComponent(guildId)).then(function (r) {
      if (!body) return;
      if (r.status === 401) return loginBounce();
      var orders = (r.ok && r.body && r.body.orders) || [];
      if (!orders.length) { body.innerHTML = '<p class="cart-empty">You haven\'t ordered anything yet.</p>'; return; }
      var STAT = { completed: '✅ Completed', needs_delivery: '⏳ Awaiting delivery', paid: '✅ Paid', pending: '… Pending', cancelled: '⚪ Cancelled', refunded: '↩️ Refunded', failed: '❌ Failed' };
      var html = '<ul class="order-list">';
      orders.forEach(function (o) {
        var ccy = o.currency || 'GBP';
        var total = o.rail === 'credits' ? '🪙 ' + fmt(o.total_credits) : money(o.total_money, ccy);
        var items = (o.items || []).map(function (i) { return i.quantity + '× ' + esc(i.name); }).join(', ');
        html += '<li class="order-row"><div class="order-top"><b>#' + o.id + '</b><span>' + (STAT[o.status] || o.status) + '</span><b>' + total + '</b></div>' +
          '<div class="order-items">' + items + '</div></li>';
      });
      html += '</ul>';
      body.innerHTML = html;
    });
  }

  // ── render storefront ────────────────────────────────────────────────────────
  function renderStore(data) {
    S.store = data.store || {};
    S.products = data.products || [];
    var s = S.store;
    if (s.color) document.documentElement.style.setProperty('--accent', s.color);
    var name = s.title || s.guildName || 'Store';
    document.title = name + ' — Store';

    if (data.premium === false) {
      state('<div class="store-badge">✦ Premium feature</div><h2>' + esc(name) + '\'s store isn\'t open</h2><p>Web stores are part of <b>Premium</b>. The server can unlock its shop by subscribing.</p><a class="btn btn-primary" href="' + esc(links.subscribe || 'pricing.html') + '">See Premium</a>', ICON.lock);
      return;
    }
    if (data.enabled === false) {
      state('<div class="store-badge">' + esc(name) + '</div><h2>The store is closed</h2><p>This server has a store but it isn\'t open yet. Check back soon!</p><a class="btn btn-outline" href="index.html">Back to site</a>');
      return;
    }

    var logo = s.logo || s.guildIcon;
    var pays = [];
    if (s.acceptMoney) pays.push('💳 Card / PayPal');
    if (s.acceptCredits) pays.push('🪙 Server credits');

    var html = '<div class="store-hero">';
    if (s.banner) html += '<img class="store-hero-banner" src="' + esc(s.banner) + '" alt="">';
    html += '<div class="store-hero-inner">';
    html += logo ? '<img class="store-logo" src="' + esc(logo) + '" alt="" data-letter="' + initial(name) + '">' : '<div class="store-logo store-fb">' + initial(name) + '</div>';
    html += '<div class="store-htext"><h1 class="store-title">' + esc(name) + '</h1>' +
      (s.description ? '<p class="store-desc">' + esc(s.description) + '</p>' : '') +
      (pays.length ? '<div class="store-pays">' + pays.map(function (p) { return '<span class="store-pay">' + p + '</span>'; }).join('') + '</div>' : '') +
      '</div></div></div>';

    if (!S.products.length) {
      html += '<div class="store-state"><div class="store-state-ico">' + ICON.bag + '</div><h2>No products yet</h2><p>This store hasn\'t added any products yet. Check back soon!</p></div>';
      root.innerHTML = html; return;
    }

    html += '<div class="store-grid">';
    S.products.forEach(function (p) {
      var img = p.image_url ? '<img class="prod-img" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-letter="' + initial(p.name) + '">' : '<div class="prod-img prod-fb">' + initial(p.name) + '</div>';
      var badges = p.fulfillment_type === 'role' ? '<span class="prod-badge role">⚡ Instant role</span>' : '<span class="prod-badge">📦 In-game delivery</span>';
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
        '<button class="btn btn-primary prod-btn" type="button" data-pid="' + p.id + '"' + (p.inStock ? '' : ' disabled') + '>Add to cart</button>' +
        '</div></div></div>';
    });
    html += '</div>';
    root.innerHTML = html;

    root.querySelectorAll('img[data-letter]').forEach(function (img) {
      img.addEventListener('error', function () {
        var d = document.createElement('div');
        d.className = img.className + (img.classList.contains('prod-img') ? ' prod-fb' : ' store-fb');
        d.textContent = img.getAttribute('data-letter') || '';
        if (img.parentNode) img.parentNode.replaceChild(d, img);
      });
    });
    root.querySelectorAll('.prod-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { if (!btn.disabled) addToCart(parseInt(btn.getAttribute('data-pid'), 10)); });
    });
    renderCartButton();
  }

  // ── boot ──────────────────────────────────────────────────────────────────────
  function init() {
    if (!guildId || !/^\d{5,25}$/.test(guildId)) {
      state('<h2>No store selected</h2><p>This page needs a server link, e.g. <code>store.html?guild=&lt;server id&gt;</code>. Open it from the server\'s dashboard or the Servers directory.</p><a class="btn btn-primary" href="servers.html">Browse servers</a>', ICON.bag);
      return;
    }
    Promise.all([loadStore(), loadMe()]).then(function (res) {
      var data = res[0];
      if (!data || data.error) {
        state('<h2>Store unavailable</h2><p>We couldn\'t load this server\'s store right now. Please try again in a moment.</p><a class="btn btn-outline" href="index.html">Back to site</a>', ICON.alert);
        return;
      }
      renderStore(data);
      if (S.user && data.premium !== false && data.enabled !== false) loadCart().then(renderCartButton);
    }).catch(function () {
      state('<h2>Couldn\'t reach the store</h2><p>The store service didn\'t respond. Please try again shortly.</p><a class="btn btn-outline" href="index.html">Back to site</a>', ICON.alert);
    });
  }

  init();
})();
