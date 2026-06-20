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
  function productById(id) { id = parseInt(id, 10); for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i]; return null; }
  function starDisplay(rating) {
    var full = Math.round(Number(rating) || 0), s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="star' + (i <= full ? ' on' : '') + '">★</span>';
    return '<span class="stars">' + s + '</span>';
  }

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
  function addToCart(productId, variantId, qty) {
    var body = { productId: productId, quantity: (qty && qty > 0) ? qty : 1 };
    if (variantId) body.variantId = variantId;
    api('/api/dashboard/store/cart/items?guild=' + encodeURIComponent(guildId), { method: 'POST', body: body })
      .then(function (r) {
        if (r.status === 401) return loginBounce();
        if (!r.ok) {
          var m = { variant_required: 'Choose an option first.', variant_unavailable: 'That option isn\'t available.', product_unavailable: 'That product is no longer available.' };
          return toast((r.body && m[r.body.error]) || (r.body && r.body.error) || 'Could not add to cart', 'err');
        }
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
    var hd = document.querySelector('.cart-head h2');
    if (!c || !c.items || !c.items.length) {
      if (hd) hd.textContent = 'Your cart';
      body.innerHTML = '<div class="cart-empty-state"><div class="cart-empty-ico">' + ICON.bag + '</div><p>Your cart is empty.</p><button type="button" class="btn btn-outline" id="cart-browse">Browse products</button></div>';
      var br = body.querySelector('#cart-browse'); if (br) br.addEventListener('click', closeCart);
      return;
    }
    var ccy = c.currency || (S.store && S.store.currency) || 'GBP';
    var count = (c.rails && c.rails.itemCount) || c.items.reduce(function (s, i) { return s + (i.quantity || 0); }, 0);
    if (hd) hd.textContent = 'Your cart (' + count + ')';
    var html = '<ul class="cart-lines">';
    c.items.forEach(function (i) {
      var p = i.product || {};
      var name = (p.name || ('Item ' + i.productId)) + (i.variantName ? ' — ' + i.variantName : '');
      var line = '';
      if (i.lineMoney != null) line += money(i.lineMoney, ccy);
      if (i.lineMoney != null && i.lineCredits != null) line += ' / ';
      if (i.lineCredits != null) line += '🪙' + fmt(i.lineCredits);
      var unit = '';
      if (i.quantity > 1) {
        if (i.lineMoney != null) unit = money(i.lineMoney / i.quantity, ccy) + ' each';
        else if (i.lineCredits != null) unit = '🪙' + fmt(Math.round(i.lineCredits / i.quantity)) + ' each';
      }
      var thumb = p.image_url ? '<img class="cart-thumb" src="' + esc(p.image_url) + '" alt="" data-letter="' + initial(p.name) + '">' : '<div class="cart-thumb cart-thumb-fb">' + initial(p.name || '?') + '</div>';
      var issue = i.issue ? '<span class="cart-issue">' + (i.issue === 'out_of_stock' ? 'out of stock' : 'unavailable') + '</span>' : '';
      html += '<li class="cart-line' + (i.issue ? ' bad' : '') + '" data-pid="' + i.productId + '">' + thumb +
        '<div class="cart-line-info">' +
          '<div class="cart-line-top"><span class="cart-line-name">' + esc(name) + '</span>' + issue + '</div>' +
          (unit ? '<div class="cart-line-unit">' + unit + '</div>' : '') +
          '<div class="cart-qty"><button type="button" class="qbtn" data-act="dec">−</button>' +
          '<span class="qn">' + i.quantity + '</span>' +
          '<button type="button" class="qbtn" data-act="inc">+</button>' +
          '<button type="button" class="qbtn rm" data-act="rm" aria-label="Remove">🗑</button></div>' +
        '</div>' +
        '<span class="cart-line-price">' + line + '</span></li>';
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
    wireImgFallbacks(body);

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
        var reviewable = ['completed', 'paid', 'needs_delivery'].indexOf(o.status) >= 0;
        var itemsHtml = (o.items || []).map(function (i) {
          var rv = (reviewable && i.product_id) ? '<button type="button" class="order-review" data-pid="' + i.product_id + '">★ Review</button>' : '';
          return '<div class="order-item"><span>' + i.quantity + '× ' + esc(i.name) + '</span>' + rv + '</div>';
        }).join('');
        var date = o.created_at ? esc(new Date(String(o.created_at).replace(' ', 'T') + 'Z').toLocaleDateString()) : '';
        html += '<li class="order-row"><div class="order-top"><b>#' + o.id + '</b><span>' + (STAT[o.status] || o.status) + '</span><b>' + total + '</b></div>' +
          '<div class="order-items">' + itemsHtml + '</div>' + (date ? '<div class="order-date">' + date + '</div>' : '') + '</li>';
      });
      html += '</ul>';
      body.innerHTML = html;
      body.querySelectorAll('.order-review').forEach(function (b) {
        b.addEventListener('click', function () {
          var pid = parseInt(b.getAttribute('data-pid'), 10);
          openProduct(productById(pid) || { id: pid, name: 'Product' });
        });
      });
    });
  }

  // ── render storefront ────────────────────────────────────────────────────────
  function distinctCategories() {
    var seen = {}, out = [];
    S.products.forEach(function (p) {
      var c = (p.category || '').trim();
      if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }
  // money-or-credits sort key (money wins; credits scaled to a rough comparable).
  function priceKey(p) {
    if (p.price_money != null) return Number(p.price_money);
    if (p.price_credits != null) return Number(p.price_credits) / 1000;
    return Number.MAX_SAFE_INTEGER;
  }
  function hasVariants(p) { return p.variants && p.variants.length > 0; }
  // Card price: a fixed price, or "from <cheapest tier>" when variants exist.
  function cardPriceHtml(p) {
    var s = S.store;
    if (hasVariants(p)) {
      var ms = [], cs = [];
      p.variants.forEach(function (v) {
        var m = v.price_money != null ? v.price_money : p.price_money;
        var c = v.price_credits != null ? v.price_credits : p.price_credits;
        if (m != null) ms.push(m); if (c != null) cs.push(c);
      });
      if (ms.length) return '<span class="prod-money">from ' + money(Math.min.apply(null, ms), s.currency) + '</span>';
      if (cs.length) return '<span class="prod-credits">from 🪙 ' + fmt(Math.min.apply(null, cs)) + '</span>';
      return '';
    }
    var price = '';
    if (p.price_money != null) price += '<span class="prod-money">' + money(p.price_money, s.currency) + '</span>';
    if (p.price_money != null && p.price_credits != null) price += '<span class="prod-or">or</span>';
    if (p.price_credits != null) price += '<span class="prod-credits">🪙 ' + fmt(p.price_credits) + '</span>';
    return price;
  }
  function productCardHtml(p) {
    var img = p.image_url ? '<img class="prod-img" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-letter="' + initial(p.name) + '">' : '<div class="prod-img prod-fb">' + initial(p.name) + '</div>';
    var badges = '';
    if (p.featured) badges += '<span class="prod-badge feat">★ Featured</span>';
    badges += p.fulfillment_type === 'role' ? '<span class="prod-badge role">⚡ Instant role</span>' : '<span class="prod-badge">📦 In-game delivery</span>';
    if (!p.inStock && !hasVariants(p)) badges += '<span class="prod-badge oos">Out of stock</span>';
    else if (p.lowStock && !hasVariants(p)) badges += '<span class="prod-badge low">Only ' + p.lowStock + ' left</span>';
    var rating = p.reviewCount ? '<div class="prod-rating">' + starDisplay(p.rating) + '<span class="prod-rating-n">' + Number(p.rating).toFixed(1) + ' (' + p.reviewCount + ')</span></div>' : '';
    var varianty = hasVariants(p);
    var disabled = !varianty && !p.inStock;
    return '<div class="prod' + (p.featured ? ' is-feat' : '') + '" data-pid="' + p.id + '" tabindex="0" role="button">' + img + '<div class="prod-body">' +
      (p.category ? '<div class="prod-cat">' + esc(p.category) + '</div>' : '') +
      '<h3 class="prod-name">' + esc(p.name) + '</h3>' +
      rating +
      (p.description ? '<p class="prod-desc">' + esc(p.description) + '</p>' : '') +
      '<div class="prod-badges">' + badges + '</div>' +
      '<div class="prod-foot"><div class="prod-price">' + cardPriceHtml(p) + '</div>' +
      '<button class="btn btn-primary prod-btn" type="button" data-pid="' + p.id + '"' + (disabled ? ' disabled' : '') + '>' + (varianty ? 'Choose options' : 'Add to cart') + '</button>' +
      '</div></div></div>';
  }
  function wireImgFallbacks(container) {
    container.querySelectorAll('img[data-letter]').forEach(function (img) {
      img.addEventListener('error', function () {
        var d = document.createElement('div');
        var fb = img.classList.contains('prod-img') ? ' prod-fb' : img.classList.contains('cart-thumb') ? ' cart-thumb-fb' : ' store-fb';
        d.className = img.className + fb;
        d.textContent = img.getAttribute('data-letter') || '';
        if (img.parentNode) img.parentNode.replaceChild(d, img);
      });
    });
  }
  // Re-render just the results grid for the current search/category/sort.
  function renderResults() {
    var box = document.getElementById('store-results'); if (!box) return;
    var v = S.view, q = (v.q || '').trim().toLowerCase();
    var list = S.products.filter(function (p) {
      if (v.cat && (p.category || '') !== v.cat) return false;
      if (q) {
        var hay = (String(p.name || '') + ' ' + String(p.description || '') + ' ' + String(p.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (v.sort === 'price_asc') list.sort(function (a, b) { return priceKey(a) - priceKey(b); });
    else if (v.sort === 'price_desc') list.sort(function (a, b) { return priceKey(b) - priceKey(a); });
    else if (v.sort === 'name') list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    else list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); }); // featured first

    if (!list.length) {
      box.innerHTML = '<div class="store-state" style="margin-top:4px"><div class="store-state-ico">' + ICON.bag + '</div><h2>No matches</h2><p>Nothing matches your search or filter — try clearing them.</p></div>';
      return;
    }
    box.innerHTML = '<div class="store-count">' + list.length + ' ' + (list.length === 1 ? 'product' : 'products') + '</div>' +
      '<div class="store-grid">' + list.map(productCardHtml).join('') + '</div>';
    wireImgFallbacks(box);
    box.querySelectorAll('.prod-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        var p = productById(btn.getAttribute('data-pid'));
        if (p && hasVariants(p)) openProduct(p); // must pick a tier
        else addToCart(parseInt(btn.getAttribute('data-pid'), 10));
      });
    });
    box.querySelectorAll('.prod[data-pid]').forEach(function (card) {
      function open() { var p = productById(card.getAttribute('data-pid')); if (p) openProduct(p); }
      card.addEventListener('click', function (e) { if (!e.target.closest('.prod-btn')) open(); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }
  // ── product detail modal (description + reviews + review form) ──────────────
  function closeProductModal() { var ov = document.getElementById('prod-overlay'); if (ov) ov.remove(); }
  function openProduct(p) {
    closeProductModal();
    var s = S.store, ccy = s.currency;
    var varianty = hasVariants(p);
    var img = p.image_url ? '<img class="pm-img" src="' + esc(p.image_url) + '" alt="">' : '';
    var badge = p.fulfillment_type === 'role' ? '<span class="prod-badge role">⚡ Instant role</span>' : '<span class="prod-badge">📦 In-game delivery</span>';
    var soldOut = !varianty && p.inStock === false;
    var ov = document.createElement('div');
    ov.id = 'prod-overlay'; ov.className = 'pm-overlay';
    ov.innerHTML = '<div class="pm-panel" role="dialog" aria-label="Product details">' +
      '<button type="button" class="pm-x" aria-label="Close">✕</button>' + img +
      '<div class="pm-body">' +
        (p.category ? '<div class="prod-cat">' + esc(p.category) + '</div>' : '') +
        '<h2 class="pm-name">' + esc(p.name) + '</h2>' +
        '<div class="pm-rating" id="pm-rating"></div>' +
        (p.description ? '<p class="pm-desc">' + esc(p.description) + '</p>' : '') +
        '<div class="prod-badges">' + badge + (soldOut ? '<span class="prod-badge oos">Out of stock</span>' : '') + '</div>' +
        (varianty ? '<div class="pm-variants" id="pm-variants"></div>' : '') +
        '<div class="pm-stock" id="pm-stock"></div>' +
        '<div class="pm-buy"><div class="prod-price" id="pm-price"></div>' +
          '<div class="pm-actions"><div class="pm-qty"><button type="button" class="pm-qd" data-d="-1" aria-label="Less">−</button><span id="pm-qn">1</span><button type="button" class="pm-qd" data-d="1" aria-label="More">+</button></div>' +
          '<button class="btn btn-primary" id="pm-add">Add to cart</button></div></div>' +
        '<div class="pm-reviews" id="pm-reviews"><div class="pm-rev-load">Loading reviews…</div></div>' +
      '</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeProductModal(); });
    ov.querySelector('.pm-x').addEventListener('click', closeProductModal);

    var selected = null, qty = 1;
    function priceForVariant(v) {
      var m = v && v.price_money != null ? v.price_money : p.price_money;
      var c = v && v.price_credits != null ? v.price_credits : p.price_credits;
      var out = '';
      if (m != null) out += '<span class="prod-money">' + money(m, ccy) + '</span>';
      if (m != null && c != null) out += '<span class="prod-or">or</span>';
      if (c != null) out += '<span class="prod-credits">🪙 ' + fmt(c) + '</span>';
      return out;
    }
    function maxQty() {
      var low = varianty ? (selected && selected.lowStock) : p.lowStock;
      return low && low > 0 ? low : 99;
    }
    function refreshBuy() {
      var priceEl = document.getElementById('pm-price'), addEl = document.getElementById('pm-add');
      var stockEl = document.getElementById('pm-stock'), qn = document.getElementById('pm-qn');
      var low = varianty ? (selected && selected.lowStock) : p.lowStock;
      stockEl.innerHTML = low ? '🔥 Only <b>' + low + '</b> left in stock' : '';
      var max = maxQty();
      if (qty > max) qty = max; if (qty < 1) qty = 1;
      if (qn) qn.textContent = qty;
      if (varianty) {
        priceEl.innerHTML = selected ? priceForVariant(selected) : '<span class="pm-norate">Choose an option</span>';
        var oos = selected && selected.inStock === false;
        addEl.disabled = !selected || oos;
        addEl.textContent = oos ? 'Out of stock' : 'Add to cart';
      } else {
        priceEl.innerHTML = priceForVariant(null);
        addEl.disabled = soldOut; addEl.textContent = soldOut ? 'Out of stock' : 'Add to cart';
      }
    }
    ov.querySelectorAll('.pm-qd').forEach(function (b) {
      b.addEventListener('click', function () { qty += parseInt(b.getAttribute('data-d'), 10); refreshBuy(); });
    });
    if (varianty) {
      var vc = document.getElementById('pm-variants');
      vc.innerHTML = '<div class="pm-var-label">Choose an option</div><div class="pm-var-opts">' +
        p.variants.map(function (v, idx) { return '<button type="button" class="pm-var" data-i="' + idx + '"' + (v.inStock === false ? ' disabled' : '') + '>' + esc(v.name) + (v.inStock === false ? ' · out' : '') + '</button>'; }).join('') + '</div>';
      var firstIdx = -1;
      for (var i = 0; i < p.variants.length; i++) { if (p.variants[i].inStock !== false) { firstIdx = i; break; } }
      var optBtns = vc.querySelectorAll('.pm-var');
      optBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          if (b.disabled) return;
          selected = p.variants[parseInt(b.getAttribute('data-i'), 10)];
          optBtns.forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on'); refreshBuy();
        });
      });
      if (firstIdx >= 0) { selected = p.variants[firstIdx]; optBtns[firstIdx].classList.add('on'); }
    }
    refreshBuy();
    document.getElementById('pm-add').addEventListener('click', function () {
      if (varianty) { if (selected) { addToCart(p.id, selected.id, qty); closeProductModal(); } }
      else { addToCart(p.id, null, qty); closeProductModal(); }
    });
    wireImgFallbacks(ov);
    loadProductReviews(p);
  }
  function loadProductReviews(p) {
    var box = document.getElementById('pm-reviews'); if (!box) return;
    var qs = '?guild=' + encodeURIComponent(guildId) + '&id=' + p.id;
    Promise.all([
      api('/api/dashboard/store/product/reviews' + qs),
      S.user ? api('/api/dashboard/store/reviews/mine?guild=' + encodeURIComponent(guildId) + '&productId=' + p.id) : Promise.resolve({ ok: false }),
    ]).then(function (res) {
      var rv = (res[0].ok && res[0].body) || { reviews: [], summary: { rating: 0, reviewCount: 0 } };
      var mine = (res[1] && res[1].ok && res[1].body) || { review: null, canReview: false };
      var rb = document.getElementById('pm-rating');
      if (rb) rb.innerHTML = rv.summary.reviewCount
        ? starDisplay(rv.summary.rating) + '<span class="prod-rating-n">' + Number(rv.summary.rating).toFixed(1) + ' · ' + rv.summary.reviewCount + ' review' + (rv.summary.reviewCount === 1 ? '' : 's') + '</span>'
        : '<span class="pm-norate">No reviews yet</span>';
      var html = '<h3 class="pm-rev-title">Reviews</h3><div id="pm-form"></div>';
      if (!rv.reviews.length) html += '<p class="pm-rev-empty">No reviews yet — be the first.</p>';
      else {
        html += '<ul class="pm-rev-list">';
        rv.reviews.forEach(function (r) {
          html += '<li class="pm-rev"><div class="pm-rev-top"><b>' + esc(r.username || 'Buyer') + '</b>' + starDisplay(r.rating) + '</div>' + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + '</li>';
        });
        html += '</ul>';
      }
      box.innerHTML = html;
      renderReviewForm(p, mine);
    });
  }
  function renderReviewForm(p, mine) {
    var f = document.getElementById('pm-form'); if (!f) return;
    if (!S.user) {
      f.innerHTML = '<p class="pm-rev-cta">Bought this? <button type="button" class="cart-link" id="pm-login">Log in</button> to leave a review.</p>';
      var l = document.getElementById('pm-login'); if (l) l.addEventListener('click', loginBounce);
      return;
    }
    if (!mine.canReview) { f.innerHTML = '<p class="pm-rev-cta">Purchase this product to leave a review.</p>'; return; }
    var cur = mine.review ? mine.review.rating : 0, picked = cur;
    var stars = '';
    for (var i = 1; i <= 5; i++) stars += '<button type="button" class="star-pick' + (i <= cur ? ' on' : '') + '" data-v="' + i + '" aria-label="' + i + ' stars">★</button>';
    f.innerHTML = '<div class="pm-form-box"><div class="pm-form-h">' + (mine.review ? 'Edit your review' : 'Leave a review') + '</div>' +
      '<div class="star-input">' + stars + '</div>' +
      '<textarea id="pm-comment" class="pm-comment" maxlength="1000" placeholder="Share your experience (optional)">' + esc(mine.review && mine.review.comment ? mine.review.comment : '') + '</textarea>' +
      '<button type="button" class="btn btn-primary" id="pm-submit">' + (mine.review ? 'Update review' : 'Submit review') + '</button>' +
      '<div class="pm-form-msg" id="pm-form-msg"></div></div>';
    f.querySelectorAll('.star-pick').forEach(function (b) {
      b.addEventListener('click', function () { picked = parseInt(b.getAttribute('data-v'), 10); f.querySelectorAll('.star-pick').forEach(function (x) { x.classList.toggle('on', parseInt(x.getAttribute('data-v'), 10) <= picked); }); });
    });
    document.getElementById('pm-submit').addEventListener('click', function () {
      var msg = document.getElementById('pm-form-msg');
      if (!picked) { msg.textContent = 'Pick a star rating first.'; return; }
      var btn = document.getElementById('pm-submit'); btn.disabled = true;
      api('/api/dashboard/store/reviews?guild=' + encodeURIComponent(guildId), { method: 'POST', body: { productId: p.id, rating: picked, comment: document.getElementById('pm-comment').value } })
        .then(function (r) {
          btn.disabled = false;
          if (r.status === 401) return loginBounce();
          if (!r.ok) { msg.textContent = (r.body && r.body.error === 'not_purchased') ? 'Only buyers can review this.' : 'Could not save your review.'; return; }
          toast('Thanks for your review!'); loadProductReviews(p);
        });
    });
  }

  function renderStore(data) {
    S.store = data.store || {};
    S.products = data.products || [];
    if (!S.view) S.view = { q: '', cat: '', sort: 'featured' };
    var s = S.store;
    // Only accept a valid hex accent (CSS vars can't run script, but stay strict).
    if (s.color && /^#[0-9a-f]{6}$/i.test(s.color)) document.documentElement.style.setProperty('--accent', s.color);
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

    // Live trust signals from the catalogue.
    var pc = S.products.length, totalReviews = 0, ratingSum = 0;
    S.products.forEach(function (pp) { if (pp.reviewCount) { totalReviews += pp.reviewCount; ratingSum += pp.rating * pp.reviewCount; } });
    var avgRating = totalReviews ? ratingSum / totalReviews : 0;
    var trust = [];
    if (pc) trust.push('<span class="store-trust-pill">' + pc + ' product' + (pc === 1 ? '' : 's') + '</span>');
    if (totalReviews) trust.push('<span class="store-trust-pill">' + starDisplay(avgRating) + '<b>' + avgRating.toFixed(1) + '</b> · ' + totalReviews + ' review' + (totalReviews === 1 ? '' : 's') + '</span>');
    if (S.products.some(function (pp) { return pp.fulfillment_type === 'role'; })) trust.push('<span class="store-trust-pill">⚡ Instant delivery</span>');
    trust.push('<span class="store-trust-pill">🔒 Secure checkout</span>');

    var html = '<div class="store-hero">';
    if (s.banner) html += '<img class="store-hero-banner" src="' + esc(s.banner) + '" alt="">';
    html += '<div class="store-hero-inner">';
    html += logo ? '<img class="store-logo" src="' + esc(logo) + '" alt="" data-letter="' + initial(name) + '">' : '<div class="store-logo store-fb">' + initial(name) + '</div>';
    html += '<div class="store-htext"><h1 class="store-title">' + esc(name) + '</h1>' +
      (s.description ? '<p class="store-desc">' + esc(s.description) + '</p>' : '') +
      (pays.length ? '<div class="store-pays">' + pays.map(function (p) { return '<span class="store-pay">' + p + '</span>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      (pc ? '<div class="store-trust">' + trust.join('') + '</div>' : '') +
      '</div>';

    if (!S.products.length) {
      html += '<div class="store-state"><div class="store-state-ico">' + ICON.bag + '</div><h2>No products yet</h2><p>This store hasn\'t added any products yet. Check back soon!</p></div>';
      root.innerHTML = html;
      wireImgFallbacks(root);
      return;
    }

    // Toolbar: search + sort, then category chips.
    var cats = distinctCategories();
    html += '<div class="store-tools">' +
      '<input type="search" id="store-search" class="store-search" placeholder="Search products…" autocomplete="off">' +
      '<select id="store-sort" class="store-sort" aria-label="Sort products">' +
      '<option value="featured">Featured first</option>' +
      '<option value="price_asc">Price: low to high</option>' +
      '<option value="price_desc">Price: high to low</option>' +
      '<option value="name">Name A–Z</option></select></div>';
    if (cats.length) {
      html += '<div class="store-cats"><button type="button" class="store-cat" data-cat="">All</button>' +
        cats.map(function (c) { return '<button type="button" class="store-cat" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>';
    }
    html += '<div id="store-results"></div>';
    root.innerHTML = html;
    wireImgFallbacks(root); // hero logo

    var search = document.getElementById('store-search');
    if (search) { search.value = S.view.q; search.addEventListener('input', function () { S.view.q = search.value; renderResults(); }); }
    var sort = document.getElementById('store-sort');
    if (sort) { sort.value = S.view.sort; sort.addEventListener('change', function () { S.view.sort = sort.value; renderResults(); }); }
    root.querySelectorAll('.store-cat').forEach(function (b) {
      if (b.getAttribute('data-cat') === (S.view.cat || '')) b.classList.add('on');
      b.addEventListener('click', function () {
        S.view.cat = b.getAttribute('data-cat');
        root.querySelectorAll('.store-cat').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        renderResults();
      });
    });
    renderResults();
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
