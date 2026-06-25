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
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
  // Product price tag: a real "Free" label for £0 items, else the formatted price.
  function moneyTag(m, ccy) { return '<span class="prod-money">' + (Number(m) === 0 ? 'Free' : money(m, ccy)) + '</span>'; }
  function fmt(n) { return (Number(n) || 0).toLocaleString(); }
  function productById(id) { id = parseInt(id, 10); for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i]; return null; }
  function starDisplay(rating) {
    var full = Math.round(Number(rating) || 0), s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="star' + (i <= full ? ' on' : '') + '">★</span>';
    return '<span class="stars">' + s + '</span>';
  }
  function fmtDate(d) { try { return esc(new Date(String(d).replace(' ', 'T') + 'Z').toLocaleDateString()); } catch (e) { return ''; } }
  // Compact relative time ("just now" / "2h ago" / "3d ago"), date past ~30d.
  function relTime(ts) {
    if (!ts) return '';
    var d = new Date(String(ts).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? '' : 'Z'));
    var ms = d.getTime(); if (isNaN(ms)) return '';
    var diff = Date.now() - ms; if (diff < 0) diff = 0;
    var m = Math.floor(diff / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (h < 24) return h + 'h ago';
    if (days < 30) return days + 'd ago';
    return esc(d.toLocaleDateString());
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
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
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
          return toast((r.body && m[r.body.error]) || 'Could not add to cart', 'err');
        }
        S.cart = r.body; S.coupon = null; renderCartButton(); toast('Added to cart'); if (cartOpen) renderCartPanel();
        var fab = document.getElementById('cart-fab'); if (fab) { fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); }
        var card = document.querySelector('.prod[data-pid="' + productId + '"]');
        var bg = card && card.querySelector('.prod-badges');
        if (bg && !bg.querySelector('.prod-badge.incart')) bg.insertAdjacentHTML('afterbegin', '<span class="prod-badge incart">✓ In cart</span>');
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
  function clearCartAll() {
    if (!confirm('Remove all items from your cart?')) return;
    api('/api/dashboard/store/cart?guild=' + encodeURIComponent(guildId), { method: 'DELETE' })
      .then(function (r) { if (r.status === 401) return loginBounce(); if (r.ok) { S.cart = r.body; S.coupon = null; renderCartButton(); renderCartPanel(); } });
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
  // If the store collects delivery details (e.g. in-game name), gather them in a
  // dialog before placing the order; otherwise go straight to checkout.
  function checkout(rail) {
    var fields = (S.store && S.store.checkoutFields) || [];
    if (fields.length) return openCheckoutDetails(rail, fields);
    submitCheckout(rail, {});
  }
  function openCheckoutDetails(rail, fields) {
    var ov = document.createElement('div');
    ov.className = 'cart-overlay checkout-overlay';
    var rows = fields.map(function (f, i) {
      return '<label class="co-field"><span class="co-label">' + esc(f.label) + (f.required ? ' <em class="co-req">*</em>' : '') + '</span>' +
        '<input type="text" class="co-input" data-fid="' + esc(f.id) + '" data-req="' + (f.required ? 1 : 0) + '" data-label="' + esc(f.label) + '" placeholder="' + esc(f.placeholder || '') + '" maxlength="200"' + (i === 0 ? ' autofocus' : '') + '></label>';
    }).join('');
    ov.innerHTML = '<div class="checkout-panel" role="dialog" aria-label="Delivery details">' +
      '<div class="cart-head"><h2>Delivery details</h2><button type="button" class="cart-x co-close" aria-label="Close">✕</button></div>' +
      '<p class="co-intro">The store team needs this to deliver your order in-game.</p>' +
      '<div class="co-fields">' + rows + '</div>' +
      '<div class="co-err" hidden></div>' +
      '<button type="button" class="btn btn-primary co-submit">Place order</button></div>';
    document.body.appendChild(ov);
    // Capture-phase so Esc closes only this dialog (returning to the cart),
    // not the cart's own Esc handler underneath it.
    var onKey = function (e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
      else if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('co-input')) { e.preventDefault(); doSubmit(); }
    };
    function close() { document.removeEventListener('keydown', onKey, true); ov.remove(); }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.co-close').addEventListener('click', close);
    var errBox = ov.querySelector('.co-err');
    function doSubmit() {
      var answers = {}; var missing = [];
      ov.querySelectorAll('.co-input').forEach(function (inp) {
        var v = inp.value.trim();
        if (v) answers[inp.getAttribute('data-fid')] = v;
        else if (inp.getAttribute('data-req') === '1') missing.push(inp.getAttribute('data-label'));
      });
      if (missing.length) { errBox.hidden = false; errBox.textContent = 'Please fill in: ' + missing.join(', '); return; }
      close();
      submitCheckout(rail, answers);
    }
    ov.querySelector('.co-submit').addEventListener('click', doSubmit);
    var first = ov.querySelector('.co-input'); if (first) first.focus();
  }
  function submitCheckout(rail, customFields) {
    var btns = document.querySelectorAll('.cart-rail-btn');
    btns.forEach(function (b) { b.disabled = true; });
    var body = { rail: rail };
    if (customFields && Object.keys(customFields).length) body.customFields = customFields;
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
        var code = r.body.redeemCode;
        state(
          '<div class="store-badge">✓ Order #' + esc(String(r.body.orderId)) + '</div>' +
          '<h2>' + (done ? 'Order complete!' : 'Order placed!') + '</h2>' +
          '<p>' + (done ? 'Your items have been delivered — check Discord.' : 'Your roles were delivered instantly. To claim any in-game items, open a ticket in the server and paste your code below.') + '</p>' +
          (code ? '<div class="redeem-box"><span class="redeem-label">Your redemption code</span><code class="redeem-code">' + esc(code) + '</code><span class="redeem-hint">Open a ticket in the server and paste this to claim your items. We\'ve also DM\'d it to you.</span></div>' : '') +
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
      missing_fields: 'Please fill in the required delivery details.',
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
    _cartKey = function (e) { if (e.key === 'Escape') closeCart(); };
    document.addEventListener('keydown', _cartKey);
    loadCart().then(renderCartPanel);
  }
  var _cartKey = null;
  function closeCart() {
    cartOpen = false;
    var ov = document.getElementById('cart-overlay'); if (ov) ov.remove();
    if (_cartKey) { document.removeEventListener('keydown', _cartKey); _cartKey = null; }
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
    html += '<div class="cart-clear-wrap"><button type="button" class="cart-link cart-clear">Clear cart</button></div>';

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
    var clearBtn = body.querySelector('.cart-clear'); if (clearBtn) clearBtn.addEventListener('click', clearCartAll);

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
          var st = { delivered: '✅', granted: '⚡', pending: '⏳', failed: '⚠️' }[i.fulfillment_status] || '';
          return '<div class="order-item"><span>' + (st ? st + ' ' : '') + i.quantity + '× ' + esc(i.name) + '</span>' + rv + '</div>';
        }).join('');
        var date = o.created_at ? relTime(o.created_at) : '';
        var dateAbs = o.created_at ? esc(new Date(String(o.created_at).replace(' ', 'T') + 'Z').toLocaleString()) : '';
        var cf = (o.customFields || []).map(function (f) { return '<span class="order-cf"><b>' + esc(f.label) + ':</b> ' + esc(f.value) + '</span>'; }).join('');
        // Unredeemed code → show it so the buyer can paste it into a ticket.
        var codeHtml = (o.redeem_code && !o.redeemed_at)
          ? '<div class="order-code"><span>Redemption code</span><code>' + esc(o.redeem_code) + '</code><span class="order-code-hint">Paste in a ticket to claim</span></div>'
          : (o.redeemed_at ? '<div class="order-code redeemed"><span>Code redeemed ✓</span></div>' : '');
        html += '<li class="order-row"><div class="order-top"><b>#' + o.id + '</b><span>' + (STAT[o.status] || o.status) + '</span><b>' + total + '</b></div>' +
          '<div class="order-items">' + itemsHtml + '</div>' + codeHtml + (cf ? '<div class="order-cf-row">' + cf + '</div>' : '') + (date ? '<div class="order-date" title="' + dateAbs + '">' + date + '</div>' : '') + '</li>';
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
  // ── nested categories (store_categories tree) ───────────────────────────────
  // The store uses real categories when the payload includes a non-empty tree;
  // otherwise we fall back to the legacy free-text `category` chips below so
  // existing stores keep working until their owner creates real categories.
  function treeCats() { return !!(S.categories && S.categories.length); }
  var _catIndex = null;
  // A vivid per-category accent palette so an imageless catalogue still reads as a
  // colourful, intentional shop instead of a wall of identical green tiles. Each
  // top-level category gets a hue; its sub-categories inherit it. Uncategorised =
  // slate. Used to tint fallback tiles, labels, badges, hovers and chip dots.
  var CAT_PALETTE = ['#2bff9e', '#34d8ff', '#a78bfa', '#fbbf24', '#fb7185', '#b6ff5b', '#2dd4bf', '#60a5fa', '#e879f9', '#fb923c', '#f472b6', '#4ade80'];
  var _catColor = {};
  function catColor(id) {
    // "Match the logo" direction: the whole shop is themed to ONE brand colour, so
    // cards/tiles/labels fall back to var(--accent) — no per-category hues.
    return '';
  }
  // style="--c:.." attribute for an element tinted to a category (empty if none).
  function colorVar(id) { var c = catColor(id); return c ? '--c:' + c + ';' : ''; }

  // ── Iconography ──────────────────────────────────────────────────────────────
  // Imageless products/categories show a clean line glyph (matched on keywords)
  // instead of a bare letter, so the shop reads as designed, not unfinished.
  var GLYPHS = {
    box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
    layers: 'M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4',
    turret: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v4M12 18v4M2 12h4M18 12h4',
    bullet: 'M9 21V11l3-5 3 5v10zM9 16h6M11 6V3h2v3',
    blueprint: 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5',
    tek: 'M7 7h10v10H7zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3',
    ascension: 'M5 17l7-7 7 7M5 11l7-7 7 7',
    base: 'M3 21h18M5 21V9l3 2V6l4-3 4 3v5l3-2v12',
    dino: 'M12 13a2.6 2.6 0 0 1 2.6 2.6c0 1.8-2.6 3.4-2.6 3.4s-2.6-1.6-2.6-3.4A2.6 2.6 0 0 1 12 13zM6.5 9.5a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM17.5 9.5a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM9.5 6.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM14.5 6.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z',
    egg: 'M12 3c-3.5 0-6 5.4-6 9.4A6 6 0 0 0 18 12.4C18 8.4 15.5 3 12 3z',
    dna: 'M6 3c0 6 12 6 12 12M6 21c0-6 12-6 12-12M7 5h10M7 19h10M9 9h6M9 15h6',
    gift: 'M20 12v9H4v-9M2 7.5h20V12H2zM12 21V7.5M12 7.5S10.5 3.5 8 3.5 4.5 5.5 6 7.5M12 7.5s1.5-4 4-4 3.5 2 2 4',
    beer: 'M5 8h11v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM16 9h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M8 4v2M11 4v2',
    flask: 'M9 3h6M10 3v6l-4.5 8.5A2 2 0 0 0 7.3 21h9.4a2 2 0 0 0 1.8-3.5L14 9V3M7.5 15h9',
    element: 'M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z',
    star: 'M12 3l2.4 5.4L20 9l-4 4 1 6-5-2.8L7 19l1-6-4-4 5.6-.6z',
  };
  function glyphFor(text) {
    var t = String(text || '').toLowerCase();
    if (/mystery/.test(t)) return 'gift';
    if (/beer/.test(t)) return 'beer';
    if (/mutagen/.test(t)) return 'flask';
    if (/turret/.test(t)) return 'turret';
    if (/ammo|bullet|\barb\b/.test(t)) return 'bullet';
    if (/tek|mek/.test(t)) return 'tek';
    if (/blueprint/.test(t)) return 'blueprint';
    if (/ascension/.test(t)) return 'ascension';
    if (/base/.test(t)) return 'base';
    if (/breed|egg/.test(t)) return 'egg';
    if (/cloner/.test(t)) return 'dna';
    if (/dino|unbreedable/.test(t)) return 'dino';
    if (/dedi|resource/.test(t)) return 'layers';
    if (/element/.test(t)) return 'element';
    return 'box';
  }
  function iconSvg(kind) {
    return '<svg class="fb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (GLYPHS[kind] || GLYPHS.box) + '"/></svg>';
  }
  function glyphSvg(text) { return iconSvg(glyphFor(text)); }
  // Product icon: match the product NAME first; only fall back to its leaf
  // (sub-)category when the name has no keyword — so an "Ammo Packs" item isn't
  // mislabelled by the parent "Turrets & Ammo" category name.
  function productGlyph(p) {
    var k = glyphFor(p.name);
    if (k === 'box' && p.category_id != null && _catIndex && _catIndex.byId[p.category_id]) k = glyphFor(_catIndex.byId[p.category_id].name);
    return iconSvg(k);
  }
  function buildCatIndex() {
    var byId = {}, parentTop = {};
    _catColor = {};
    (S.categories || []).forEach(function (t, i) {
      byId[t.id] = t;
      _catColor[t.id] = CAT_PALETTE[i % CAT_PALETTE.length];
      (t.children || []).forEach(function (ch) { byId[ch.id] = ch; parentTop[ch.id] = t.id; _catColor[ch.id] = _catColor[t.id]; });
    });
    _catIndex = { byId: byId, parentTop: parentTop, tops: S.categories || [] };
    return _catIndex;
  }
  // Scroll-reveal: cards/sections fade-up as they enter the viewport (every render,
  // not just first paint) so a long store feels alive while you scroll. Robust by
  // default — content is shown if IO is unavailable, reduced-motion is on, or a
  // safety timeout elapses (never ships blank in headless/hidden tabs).
  function animateIn(box) {
    var els = box.querySelectorAll('.reveal-up');
    if (!els.length) return;
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.remove('reveal-up'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target; io.unobserve(el); el.classList.add('in');
        el.addEventListener('animationend', function () { el.classList.remove('reveal-up', 'in'); }, { once: true });
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    els.forEach(function (e) { io.observe(e); });
    setTimeout(function () { els.forEach(function (e) { if (e.classList.contains('reveal-up')) e.classList.remove('reveal-up', 'in'); }); }, 1500);
  }
  // Pointer-tilt: cards lean toward the cursor (mouse only) for a tactile, 3D feel.
  function enableTilt(box) {
    if (REDUCED) return;
    box.querySelectorAll('.prod').forEach(function (card) {
      card.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') card.style.transition = 'transform .08s linear'; });
      card.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(820px) rotateX(' + (-py * 4.5).toFixed(2) + 'deg) rotateY(' + (px * 5.5).toFixed(2) + 'deg) translateY(-5px)';
      });
      card.addEventListener('pointerleave', function () { card.style.transition = ''; card.style.transform = ''; });
    });
  }
  function animateGrid(box) { animateIn(box); enableTilt(box); }

  // ── Brand colour from the logo ───────────────────────────────────────────────
  // Pull the dominant vivid colour out of the store's logo and theme the whole
  // shop to it by setting --accent (every color-mix recolours live). Falls back
  // silently to the configured brand colour if the logo can't be read (CORS/taint).
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (x) { return ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2); }).join('');
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    var hue2rgb = function (p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
  }
  // Make any logo colour a vivid accent that reads on the near-black theme.
  function vivify(r, g, b) {
    var hsl = rgbToHsl(r, g, b);
    var rgb = hslToRgb(hsl[0], Math.max(hsl[1], 0.55), Math.min(Math.max(hsl[2], 0.52), 0.66));
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }
  function applyLogoColor(url) {
    if (!url) return;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var n = 40, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
        var ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, n, n);
        var d = ctx.getImageData(0, 0, n, n).data, buckets = {};
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
          if (a < 200) continue;
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, lum = (mx + mn) / 510;
          if (sat < 0.22 || lum < 0.1 || lum > 0.93) continue; // skip greys / near-black / near-white
          var key = (r >> 4) + '-' + (g >> 4) + '-' + (b >> 4);
          var bk = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0, s: 0 });
          bk.r += r; bk.g += g; bk.b += b; bk.n++; bk.s += sat;
        }
        var best = null, bestScore = -1;
        for (var k in buckets) { var bk2 = buckets[k], avgSat = bk2.s / bk2.n, sc = bk2.n * avgSat * avgSat; if (sc > bestScore) { bestScore = sc; best = bk2; } }
        if (best) document.documentElement.style.setProperty('--accent', vivify(best.r / best.n, best.g / best.n, best.b / best.n));
      } catch (e) { /* tainted canvas (logo served without CORS) — keep the brand colour */ }
    };
    img.src = url;
  }
  // "Top · Sub" (or just the name) for display on a card.
  function catFullName(id) {
    if (!_catIndex) return '';
    var n = _catIndex.byId[id]; if (!n) return '';
    var topId = _catIndex.parentTop[id];
    if (topId && _catIndex.byId[topId]) return _catIndex.byId[topId].name + ' · ' + n.name;
    return n.name;
  }
  // The category label shown on a product card: tree name when assigned, else
  // the legacy free-text category.
  function productCatLabel(p) {
    if (treeCats() && p.category_id != null && _catIndex && _catIndex.byId[p.category_id]) return catFullName(p.category_id);
    return p.category || '';
  }
  // True when product p belongs to the selected top-level category id (its own
  // products plus those of its sub-categories).
  function inSelectedCat(p, topId) {
    topId = parseInt(topId, 10);
    if (p.category_id === topId) return true;
    return !!(_catIndex && _catIndex.parentTop[p.category_id] === topId);
  }
  // A product is uncategorised when it has no category_id that resolves in the tree.
  function isUncategorised(p) { return !(p.category_id != null && _catIndex && _catIndex.byId[p.category_id]); }
  // Apply the active sort to a list (shared by flat + grouped views).
  function sortList(list) {
    var v = S.view, l = list.slice();
    if (v.sort === 'price_asc') l.sort(function (a, b) { return priceKey(a) - priceKey(b); });
    else if (v.sort === 'price_desc') l.sort(function (a, b) { return priceKey(b) - priceKey(a); });
    else if (v.sort === 'name') l.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    else if (v.sort === 'sales') l.sort(function (a, b) { return (b.soldCount || 0) - (a.soldCount || 0); });
    else if (v.sort === 'newest') l.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
    else l.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    return l;
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
    if (p.sale_price_money != null && p.price_money != null) price += moneyTag(p.sale_price_money, s.currency) + '<s class="prod-was">' + money(p.price_money, s.currency) + '</s>';
    else if (p.price_money != null) price += moneyTag(p.price_money, s.currency);
    if (p.price_money != null && p.price_credits != null) price += '<span class="prod-or">or</span>';
    if (p.price_credits != null) price += '<span class="prod-credits">🪙 ' + fmt(p.price_credits) + '</span>';
    return price;
  }
  // Human countdown to a sale's end ("2d 4h" / "5h 12m" / "23m"); '' if no/expired.
  function saleCountdown(iso) {
    if (!iso) return '';
    var end = Date.parse(iso); if (!isFinite(end)) return '';
    var ms = end - Date.now(); if (ms <= 0) return '';
    var mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
    if (days >= 1) return days + 'd ' + (hrs % 24) + 'h';
    if (hrs >= 1) return hrs + 'h ' + (mins % 60) + 'm';
    return Math.max(1, mins) + 'm';
  }
  function saleEndsHtml(p) {
    var cd = (p.sale_price_money != null && p.sale_ends_at) ? saleCountdown(p.sale_ends_at) : '';
    return cd ? '<div class="prod-sale-ends">⏳ Sale ends in ' + cd + '</div>' : '';
  }
  function bundleHtml(p) {
    if (!p.bundle || !p.bundle.length) return '';
    return '<div class="prod-bundle"><span class="prod-bundle-h">🎁 Includes</span>' +
      p.bundle.map(function (c) { return '<span class="prod-bundle-item">' + c.quantity + '× ' + esc(c.name) + '</span>'; }).join('') + '</div>';
  }
  // Stock pill (matches the reference: a coloured dot + short label).
  function stockHtml(p) {
    var varianty = hasVariants(p);
    if (!p.inStock && !varianty) return '<span class="prod-stock out">Sold out</span>';
    if (p.lowStock && !varianty) return '<span class="prod-stock low">' + p.lowStock + ' left</span>';
    return '<span class="prod-stock ok">In stock</span>';
  }
  // Image-forward product card (reference-style): a big media tile carries the
  // image/glyph + overlay badges + a hover "add" button; below sits a tight
  // price + stock row, then the name. Click opens the full product modal.
  function productCardHtml(p, idx) {
    var style = ' style="animation-delay:' + Math.min((idx || 0) * 45, 360) + 'ms"';
    var media = p.image_url
      ? '<img class="prod-img" src="' + esc(p.image_url) + '" alt="" loading="lazy" data-letter="' + initial(p.name) + '">'
      : '<div class="prod-img prod-fb">' + productGlyph(p) + '</div>';
    var ob = '';
    if (p.sale_price_money != null) ob += '<span class="prod-badge sale">Sale</span>';
    if (p.featured) ob += '<span class="prod-badge feat">★ Featured</span>';
    else if (p.bestseller) ob += '<span class="prod-badge best">🔥 Bestseller</span>';
    if (p.isBundle) ob += '<span class="prod-badge bundle">🎁 Bundle</span>';
    if (S.cart && S.cart.items && S.cart.items.some(function (it) { return it.productId === p.id; })) ob += '<span class="prod-badge incart">✓ In cart</span>';
    var varianty = hasVariants(p);
    var disabled = !varianty && !p.inStock;
    var btn = '<button class="btn btn-primary prod-add" type="button" data-pid="' + p.id + '"' + (disabled ? ' disabled' : '') + '>'
      + (disabled ? 'Sold out' : (varianty ? 'Choose options' : 'Add to cart')) + '</button>';
    return '<div class="prod prod-v2 reveal-up' + (p.featured ? ' is-feat' : '') + '" data-pid="' + p.id + '" tabindex="0" role="button"' + style + '>'
      + '<div class="prod-media">' + media
        + (ob ? '<div class="prod-badges">' + ob + '</div>' : '')
        + '<div class="prod-hover">' + btn + '</div>'
      + '</div>'
      + '<div class="prod-body">'
        + '<div class="prod-meta"><div class="prod-price">' + cardPriceHtml(p) + '</div>' + stockHtml(p) + '</div>'
        + '<h3 class="prod-name">' + esc(p.name) + '</h3>'
      + '</div></div>';
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
  // Keep the URL in sync so a filtered view is shareable / survives refresh.
  function updateUrl() {
    try {
      var u = new URL(location.href);
      if (S.view.q) u.searchParams.set('q', S.view.q); else u.searchParams.delete('q');
      if (S.view.cat) u.searchParams.set('cat', S.view.cat); else u.searchParams.delete('cat');
      if (S.view.sort && S.view.sort !== 'featured') u.searchParams.set('sort', S.view.sort); else u.searchParams.delete('sort');
      history.replaceState(null, '', u);
    } catch (e) {}
  }
  // Re-render just the results grid for the current search/category/sort.
  // `more` = true keeps growing the visible page (Load more); otherwise resets.
  var PAGE = 24;
  // Wire add-to-cart buttons + card open/keyboard handlers inside a container.
  function wireGridEvents(box) {
    box.querySelectorAll('.prod-add').forEach(function (btn) {
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
  function clearFiltersHandler() {
    S.view = { q: '', cat: '', sort: 'featured' };
    var se = document.getElementById('store-search'); if (se) se.value = '';
    var so = document.getElementById('store-sort'); if (so) so.value = 'featured';
    root.querySelectorAll('.store-cat').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-cat') === ''); });
    renderResults();
  }
  function sectionHeaderHtml(cat, count) {
    var img = cat.image_url
      ? '<img class="store-sec-img" src="' + esc(cat.image_url) + '" alt="" loading="lazy" data-letter="' + initial(cat.name) + '">'
      : '<div class="store-sec-img store-fb">' + glyphSvg(cat.name) + '</div>';
    return '<div class="store-section reveal-up" id="cat-' + (cat.id || 'other') + '" style="' + colorVar(cat.id) + '">' + img +
      '<div class="store-sec-text"><h2 class="store-sec-title">' + esc(cat.name) + '</h2>' +
      (cat.description ? '<p class="store-sec-desc">' + esc(cat.description) + '</p>' : '') +
      '</div><span class="store-sec-count">' + count + ' item' + (count === 1 ? '' : 's') + '</span></div>';
  }
  function renderResults(more) {
    var box = document.getElementById('store-results'); if (!box) return;
    updateUrl();
    var v = S.view, q = (v.q || '').trim().toLowerCase();
    // Category browse: when the store has real categories and the buyer isn't
    // searching, the landing is a grid of category CARDS (like products); the
    // buyer clicks one to open that category's products. A search always
    // flattens to one ranked result grid across everything.
    if (treeCats() && !q) {
      if (!v.cat) { renderCategoryTiles(box); return; } // landing: category cards
      renderGrouped(box); return;                       // drilled into one category
    }

    S._shown = more ? (S._shown || PAGE) + PAGE : PAGE;
    var list = sortList(S.products.filter(function (p) {
      if (v.cat) {
        if (treeCats()) { if (!inSelectedCat(p, v.cat)) return false; }
        else if ((p.category || '') !== v.cat) return false;
      }
      if (q) {
        var hay = (String(p.name || '') + ' ' + String(p.description || '') + ' ' + String(productCatLabel(p) || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }));

    if (!list.length) {
      box.innerHTML = '<div class="store-state" style="margin-top:4px"><div class="store-state-ico">' + ICON.bag + '</div><h2>No matches</h2><p>Nothing matches your search or filter.</p><button type="button" class="btn btn-primary" id="store-clear">Clear filters</button></div>';
      var cb = document.getElementById('store-clear');
      if (cb) cb.addEventListener('click', clearFiltersHandler);
      return;
    }
    var shown = Math.min(S._shown, list.length);
    var slice = list.slice(0, shown);
    box.innerHTML = '<div class="store-count">' + (shown < list.length ? 'Showing ' + shown + ' of ' + list.length : list.length + ' ' + (list.length === 1 ? 'product' : 'products')) + '</div>' +
      '<div class="store-grid">' + slice.map(productCardHtml).join('') + '</div>' +
      (shown < list.length ? '<div class="store-more"><button type="button" class="btn btn-outline" id="store-loadmore">Load more (' + (list.length - shown) + ')</button></div>' : '');
    S._revealed = true;
    var lm = document.getElementById('store-loadmore');
    if (lm) lm.addEventListener('click', function () { renderResults(true); });
    wireImgFallbacks(box);
    wireGridEvents(box);
    animateGrid(box);
  }
  // Grouped browse view: one section per top-level category (image + name),
  // directly-assigned products first, then a labelled sub-group per sub-category
  // that has products, then an "Other" section for uncategorised products. When
  // a category chip is selected we drill into just that section.
  // "← All categories" back link shown when drilled into one category.
  function backRowHtml() {
    return '<div class="store-back-row"><button type="button" class="btn btn-outline" id="store-back">← All categories</button></div>';
  }
  function wireBack(box) {
    var b = box.querySelector('#store-back');
    if (b) b.addEventListener('click', function () {
      S.view.cat = '';
      root.querySelectorAll('.store-cat').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-cat') === ''); });
      renderResults();
    });
  }
  function renderGrouped(box) {
    var v = S.view;
    // Drilled into the uncategorised ("Other") bucket.
    if (v.cat === 'other') {
      var items = sortList(S.products.filter(isUncategorised));
      box.innerHTML = backRowHtml() + sectionHeaderHtml({ name: 'Other', image_url: null, id: 'other' }, items.length) +
        '<div class="store-grid">' + items.map(productCardHtml).join('') + '</div>';
      S._revealed = true; wireImgFallbacks(box); wireGridEvents(box); animateGrid(box); wireBack(box);
      return;
    }
    var selected = v.cat ? parseInt(v.cat, 10) : null;
    var sections = [];
    _catIndex.tops.forEach(function (t) {
      if (selected && t.id !== selected) return;
      var direct = sortList(S.products.filter(function (p) { return p.category_id === t.id; }));
      var subs = [];
      (t.children || []).forEach(function (ch) {
        var sp = sortList(S.products.filter(function (p) { return p.category_id === ch.id; }));
        if (sp.length) subs.push({ cat: ch, products: sp });
      });
      if (direct.length || subs.length) sections.push({ cat: t, direct: direct, subs: subs });
    });
    var other = selected ? [] : sortList(S.products.filter(isUncategorised));

    if (!sections.length && !other.length) {
      box.innerHTML = (selected ? backRowHtml() : '') + '<div class="store-state" style="margin-top:4px"><div class="store-state-ico">' + ICON.bag + '</div><h2>Nothing here yet</h2><p>This category has no products yet.</p><button type="button" class="btn btn-primary" id="store-clear">Show all</button></div>';
      var cb = document.getElementById('store-clear'); if (cb) cb.addEventListener('click', clearFiltersHandler);
      wireBack(box);
      return;
    }
    var html = selected ? backRowHtml() : '';
    sections.forEach(function (sec) {
      var count = sec.direct.length + sec.subs.reduce(function (n, s) { return n + s.products.length; }, 0);
      html += sectionHeaderHtml(sec.cat, count);
      if (sec.direct.length) html += '<div class="store-grid">' + sec.direct.map(productCardHtml).join('') + '</div>';
      sec.subs.forEach(function (sub) {
        html += '<div class="store-subhead">' +
          (sub.cat.image_url ? '<img class="store-subhead-ico" src="' + esc(sub.cat.image_url) + '" alt="" loading="lazy">' : '') +
          '<span class="store-subhead-name">' + esc(sub.cat.name) + '</span><span class="store-subhead-n">' + sub.products.length + '</span></div>' +
          '<div class="store-grid">' + sub.products.map(productCardHtml).join('') + '</div>';
      });
    });
    if (other.length) {
      html += sectionHeaderHtml({ name: sections.length ? 'More' : 'All products', image_url: null }, other.length);
      html += '<div class="store-grid">' + other.map(productCardHtml).join('') + '</div>';
    }
    box.innerHTML = html;
    S._revealed = true;
    wireImgFallbacks(box);
    wireGridEvents(box);
    animateGrid(box);
    wireBack(box);
  }

  // Landing view: top-level categories as product-style cards. Clicking one
  // opens that category's products (renderGrouped drilled-in). An "Other" tile
  // appears when there are uncategorised products.
  // Products belonging to a top-level category (its own + its sub-categories), or
  // the uncategorised bucket for 'other'.
  function catProducts(catKey) {
    return S.products.filter(function (p) {
      if (catKey === 'other') return isUncategorised(p);
      return p.category_id === catKey || (_catIndex && _catIndex.parentTop[p.category_id] === catKey);
    });
  }
  // A "£min – £max" range (or a single price) across a set of products.
  function priceRangeHtml(prods) {
    var ccy = S.store && S.store.currency;
    var ms = prods.map(function (p) { return p.sale_price_money != null ? p.sale_price_money : p.price_money; }).filter(function (v) { return v != null; });
    if (ms.length) {
      var mn = Math.min.apply(null, ms), mx = Math.max.apply(null, ms);
      return '<span class="prod-money">' + money(mn, ccy) + (mx !== mn ? ' – ' + money(mx, ccy) : '') + '</span>';
    }
    var cs = prods.map(function (p) { return p.price_credits; }).filter(function (v) { return v != null; });
    if (cs.length) { var c0 = Math.min.apply(null, cs), c1 = Math.max.apply(null, cs); return '<span class="prod-credits">🪙 ' + fmt(c0) + (c1 !== c0 ? ' – ' + fmt(c1) : '') + '</span>'; }
    return '';
  }
  // Image-forward category tile (reference-style): big media + a price range and
  // product count, then the category name. Click drills into the category.
  function categoryTileHtml(catKey, name, image, count, desc, idx) {
    var media = image
      ? '<img class="prod-img" src="' + esc(image) + '" alt="" loading="lazy" data-letter="' + initial(name) + '">'
      : '<div class="prod-img prod-fb">' + glyphSvg(name) + '</div>';
    var range = priceRangeHtml(catProducts(catKey));
    var style = ' style="animation-delay:' + Math.min((idx || 0) * 50, 400) + 'ms"';
    return '<div class="prod prod-v2 cat-tile reveal-up" data-cat="' + esc(String(catKey)) + '" tabindex="0" role="button"' + style + '>'
      + '<div class="prod-media">' + media + '<div class="prod-hover"><span class="prod-add">Browse →</span></div></div>'
      + '<div class="prod-body">'
        + '<div class="prod-meta">' + (range || '<span class="prod-money muted-price">View</span>') + '<span class="prod-stock ok">' + count + ' item' + (count === 1 ? '' : 's') + '</span></div>'
        + '<h3 class="prod-name">' + esc(name) + '</h3>'
      + '</div></div>';
  }
  function renderCategoryTiles(box) {
    var tops = _catIndex.tops || [];
    var tiles = tops.map(function (t, i) {
      var count = t.totalProductCount != null ? t.totalProductCount : (t.productCount || 0);
      return categoryTileHtml(t.id, t.name, t.image_url, count, t.description, i);
    });
    var otherCount = S.products.filter(isUncategorised).length;
    if (otherCount) tiles.push(categoryTileHtml('other', 'Other', null, otherCount, null, tiles.length));
    // No category tiles at all → just show the products (drill into "Other").
    if (!tiles.length) { S.view.cat = 'other'; return renderGrouped(box); }
    box.innerHTML = '<div class="store-grid">' + tiles.join('') + '</div>';
    S._revealed = true;
    wireImgFallbacks(box);
    animateGrid(box);
    box.querySelectorAll('.cat-tile[data-cat]').forEach(function (tile) {
      var go = function () {
        var key = tile.getAttribute('data-cat');
        // Open the category as a variant-style picker of its products. The chip
        // nav above still drills into the grid browse for anyone who wants it.
        openCategory(key === 'other' ? 'other' : parseInt(key, 10));
      };
      tile.addEventListener('click', go);
      tile.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  // ── product detail modal (description + reviews + review form) ──────────────
  var _pmKey = null;
  function setProductParam(id) {
    try { var u = new URL(location.href); if (id) u.searchParams.set('product', id); else u.searchParams.delete('product'); history.replaceState(null, '', u); } catch (e) {}
  }
  function closeProductModal() {
    var ov = document.getElementById('prod-overlay'); if (ov) ov.remove();
    if (_pmKey) { document.removeEventListener('keydown', _pmKey); _pmKey = null; }
    setProductParam(null);
  }
  function openProduct(p) {
    closeProductModal();
    var s = S.store, ccy = s.currency;
    var varianty = hasVariants(p);
    var img = p.image_url ? '<img class="pm-img" src="' + esc(p.image_url) + '" alt="">' : '';
    var badge = p.isBundle ? '<span class="prod-badge bundle">🎁 Bundle</span>' : (p.fulfillment_type === 'role' ? '<span class="prod-badge role">⚡ Instant role</span>' : '<span class="prod-badge">📦 In-game delivery</span>');
    var soldOut = !varianty && p.inStock === false;
    // Prev/next neighbours in the catalogue order (lightbox-style browsing).
    var pIdx = -1; for (var pi = 0; pi < S.products.length; pi++) { if (S.products[pi].id === p.id) { pIdx = pi; break; } }
    var prevP = pIdx > 0 ? S.products[pIdx - 1] : null;
    var nextP = (pIdx >= 0 && pIdx < S.products.length - 1) ? S.products[pIdx + 1] : null;
    var ov = document.createElement('div');
    ov.id = 'prod-overlay'; ov.className = 'pm-overlay';
    ov.innerHTML = '<button type="button" class="pm-nav pm-prev" aria-label="Previous product"' + (prevP ? '' : ' style="display:none"') + '>‹</button>' +
      '<div class="pm-panel" role="dialog" aria-label="Product details">' +
      '<button type="button" class="pm-share" id="pm-share" aria-label="Copy product link" title="Copy link">🔗</button>' +
      '<button type="button" class="pm-x" aria-label="Close">✕</button>' + img +
      '<div class="pm-body">' +
        (productCatLabel(p) ? '<div class="prod-cat">' + esc(productCatLabel(p)) + '</div>' : '') +
        '<h2 class="pm-name">' + esc(p.name) + '</h2>' +
        '<div class="pm-rating" id="pm-rating"></div>' +
        ((p.soldCount && p.soldCount >= 1) ? '<div class="pm-sold">🔥 ' + fmt(p.soldCount) + ' sold</div>' : '') +
        (p.description ? '<p class="pm-desc">' + esc(p.description) + '</p>' : '') +
        '<div class="prod-badges">' + (p.sale_price_money != null ? '<span class="prod-badge sale">Sale</span>' : '') + (p.bestseller ? '<span class="prod-badge best">🔥 Bestseller</span>' : '') + badge + (soldOut ? '<span class="prod-badge oos">Out of stock</span>' : '') + '</div>' +
        bundleHtml(p) +
        saleEndsHtml(p) +
        (varianty ? '<div class="pm-variants" id="pm-variants"></div>' : '') +
        '<div class="pm-stock" id="pm-stock"></div>' +
        '<div class="pm-buy"><div class="prod-price" id="pm-price"></div>' +
          '<div class="pm-actions"><div class="pm-qty"><button type="button" class="pm-qd" data-d="-1" aria-label="Less">−</button><span id="pm-qn">1</span><button type="button" class="pm-qd" data-d="1" aria-label="More">+</button></div>' +
          '<button class="btn btn-primary" id="pm-add">Add to cart</button></div></div>' +
        '<div class="pm-reviews" id="pm-reviews"><div class="pm-rev-load">Loading reviews…</div></div>' +
        '<div class="pm-related" id="pm-related"></div>' +
      '</div></div>' +
      '<button type="button" class="pm-nav pm-next" aria-label="Next product"' + (nextP ? '' : ' style="display:none"') + '>›</button>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeProductModal(); });
    var xBtn = ov.querySelector('.pm-x');
    xBtn.addEventListener('click', closeProductModal);
    var prevBtn = ov.querySelector('.pm-prev'); if (prevBtn && prevP) prevBtn.addEventListener('click', function () { openProduct(prevP); });
    var nextBtn = ov.querySelector('.pm-next'); if (nextBtn && nextP) nextBtn.addEventListener('click', function () { openProduct(nextP); });
    var shareBtn = ov.querySelector('.pm-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var link = location.href; // ?product=<id> is set on open
      try { navigator.clipboard.writeText(link).then(function () { toast('Link copied'); }, function () { toast('Link copied'); }); }
      catch (e) { toast('Link copied'); }
    });
    _pmKey = function (e) {
      if (e.key === 'Escape') { closeProductModal(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        var t = document.activeElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
        if (e.key === 'ArrowLeft' && prevP) openProduct(prevP);
        else if (e.key === 'ArrowRight' && nextP) openProduct(nextP);
      }
    };
    document.addEventListener('keydown', _pmKey);
    try { xBtn.focus(); } catch (e) {}

    var selected = null, qty = 1;
    function priceForVariant(v) {
      var m, was = null;
      if (v && v.price_money != null) m = v.price_money;
      else if (!v && p.sale_price_money != null) { m = p.sale_price_money; was = p.price_money; }
      else m = p.price_money;
      var c = v && v.price_credits != null ? v.price_credits : p.price_credits;
      var out = '';
      if (m != null) out += moneyTag(m, ccy) + (was != null ? '<s class="prod-was">' + money(was, ccy) + '</s>' : '');
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
        p.variants.map(function (v, idx) { return '<button type="button" class="pm-var" data-i="' + idx + '"' + (v.inStock === false ? ' disabled' : '') + '>' + esc(v.name) + (v.inStock === false ? ' · out' : (v.lowStock ? ' · ' + v.lowStock + ' left' : '')) + '</button>'; }).join('') + '</div>';
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
    setProductParam(p.id); // make the open product shareable / deep-linkable
    loadProductReviews(p);
    renderRelated(p);
  }
  // Open a CATEGORY as a variant-style picker (reference-style): every product in
  // the category (and its sub-categories) becomes a selectable row — pick one, set
  // a quantity, Add to Cart. A product with its own tiers expands into one row per
  // tier, so everything in the category is directly addable from a single list.
  function openCategory(catKey) {
    closeProductModal();
    var ccy = S.store && S.store.currency;
    var cat = catKey === 'other'
      ? { id: 'other', name: 'Other', image_url: null, description: null }
      : (_catIndex && _catIndex.byId[catKey]) || { id: catKey, name: 'Products', image_url: null, description: null };
    // Flatten the category's products → addable options (one per tier when tiered).
    var opts = [];
    sortList(catProducts(catKey)).forEach(function (p) {
      if (hasVariants(p)) {
        p.variants.forEach(function (v) {
          opts.push({ pid: p.id, vid: v.id, title: v.name, sub: p.name,
            m: v.price_money != null ? v.price_money : p.price_money, was: null,
            c: v.price_credits != null ? v.price_credits : p.price_credits,
            inStock: v.inStock !== false, lowStock: v.lowStock });
        });
      } else {
        var sale = p.sale_price_money != null;
        opts.push({ pid: p.id, vid: null, title: p.name, sub: p.description || '',
          m: sale ? p.sale_price_money : p.price_money, was: sale ? p.price_money : null,
          c: p.price_credits, inStock: p.inStock !== false, lowStock: p.lowStock });
      }
    });
    // Empty category (e.g. only sub-categories with no products) → fall back to the
    // grouped grid browse so the click still does something useful.
    if (!opts.length) { S.view.cat = String(cat.id); renderResults(); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} return; }

    function priceHtml(o) {
      if (o.m != null) return moneyTag(o.m, ccy) + (o.was != null ? '<s class="prod-was">' + money(o.was, ccy) + '</s>' : '');
      if (o.c != null) return '<span class="prod-credits">🪙 ' + fmt(o.c) + '</span>';
      return '';
    }
    var rows = opts.map(function (o, i) {
      var stock = o.inStock === false ? 'Sold out' : (o.lowStock ? '🔥 ' + o.lowStock + ' left' : '∞ In Stock');
      return '<button type="button" class="pm-prow' + (o.inStock === false ? ' oos' : '') + '" data-i="' + i + '" style="animation-delay:' + Math.min(i * 45, 380) + 'ms"' + (o.inStock === false ? ' disabled' : '') + '>' +
        '<span class="pm-prow-info"><span class="pm-prow-title">' + esc(o.title) + '</span>' +
        (o.sub ? '<span class="pm-prow-sub">' + esc(o.sub) + '</span>' : '') +
        '<span class="pm-prow-stock' + (o.inStock === false ? ' out' : '') + '">' + stock + '</span></span>' +
        '<span class="pm-prow-price">' + priceHtml(o) + '</span>' +
        '<span class="pm-prow-check" aria-hidden="true">✓</span></button>';
    }).join('');

    var media = cat.image_url
      ? '<img class="catp-img" src="' + esc(cat.image_url) + '" alt="" data-letter="' + initial(cat.name) + '">'
      : '<div class="catp-img catp-fb">' + glyphSvg(cat.name) + '</div>';

    // Deep-link / share, and hide the landing's toolbar + reviews while open.
    try { var u = new URL(location.href); u.searchParams.set('cat', String(cat.id)); u.searchParams.delete('product'); history.replaceState(null, '', u); } catch (e) {}
    S._catOpen = String(cat.id);
    var tools = document.querySelector('.store-tools'); if (tools) tools.style.display = 'none';
    var showcase = document.getElementById('store-reviews-showcase'); if (showcase) showcase.style.display = 'none';

    box.innerHTML =
      '<div class="catp">' +
        '<button type="button" class="catp-back" id="catp-back">‹ All categories</button>' +
        '<div class="catp-grid">' +
          '<div class="catp-media">' + media + '</div>' +
          '<div class="catp-panel">' +
            '<h1 class="catp-name">' + esc(cat.name) + '</h1>' +
            (cat.description ? '<p class="catp-desc">' + esc(cat.description) + '</p>' : '') +
            '<div class="catp-rows-label">' + (opts.length === 1 ? 'Option' : 'Choose an option') + '</div>' +
            '<div class="pm-prows catp-rows">' + rows + '</div>' +
            '<div class="catp-buy"><div class="prod-price" id="catp-price"></div>' +
              '<div class="pm-actions"><div class="pm-qty"><button type="button" class="pm-qd" data-d="-1" aria-label="Less">−</button><span id="catp-qn">1</span><button type="button" class="pm-qd" data-d="1" aria-label="More">+</button></div>' +
              '<button class="btn btn-primary" id="catp-add" disabled>Choose an option</button></div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    wireImgFallbacks(box);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}

    var selected = null, qty = 1;
    function refresh() {
      var priceEl = document.getElementById('catp-price'), addEl = document.getElementById('catp-add'), qn = document.getElementById('catp-qn');
      if (!priceEl || !addEl) return;
      var max = selected && selected.lowStock && selected.lowStock > 0 ? selected.lowStock : 99;
      if (qty > max) qty = max; if (qty < 1) qty = 1;
      if (qn) qn.textContent = qty;
      if (selected) {
        priceEl.innerHTML = priceHtml(selected);
        addEl.disabled = false; addEl.textContent = 'Add to cart';
      } else {
        priceEl.innerHTML = '<span class="pm-norate">Choose an option</span>';
        addEl.disabled = true; addEl.textContent = 'Choose an option';
      }
    }
    var rowBtns = box.querySelectorAll('.pm-prow');
    rowBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        selected = opts[parseInt(b.getAttribute('data-i'), 10)];
        rowBtns.forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); refresh();
      });
    });
    box.querySelectorAll('.pm-qd').forEach(function (b) {
      b.addEventListener('click', function () { qty += parseInt(b.getAttribute('data-d'), 10); refresh(); });
    });
    document.getElementById('catp-add').addEventListener('click', function () {
      if (selected) addToCart(selected.pid, selected.vid, qty); // stay on the page so they can add more
    });
    document.getElementById('catp-back').addEventListener('click', closeCategory);
    // One option → pre-select it so the picker is one tap.
    if (opts.length === 1 && opts[0].inStock !== false) { selected = opts[0]; rowBtns[0].classList.add('on'); }
    refresh();
  }

  // Leave the category page → restore the landing (tiles) + toolbar + reviews.
  function closeCategory() {
    S._catOpen = null;
    try { var u = new URL(location.href); u.searchParams.delete('cat'); history.replaceState(null, '', u); } catch (e) {}
    var tools = document.querySelector('.store-tools'); if (tools) tools.style.display = '';
    var showcase = document.getElementById('store-reviews-showcase'); if (showcase) showcase.style.display = '';
    S.view.cat = '';
    renderResults();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  }
  // Cross-sell — "You might also like": same category first, then bestsellers/
  // featured, then anything else. In-stock preferred, up to 4.
  function relatedProducts(p) {
    var pool = S.products.filter(function (x) { return x.id !== p.id; });
    var inStock = function (x) { return x.inStock !== false || hasVariants(x); };
    var score = function (x) {
      var s = 0;
      if (p.category_id != null && x.category_id === p.category_id) s += 100;
      else if (p.category && x.category === p.category) s += 100;
      if (x.bestseller) s += 30;
      if (x.featured) s += 20;
      s += Math.min(x.soldCount || 0, 50) / 10;
      if (!inStock(x)) s -= 200;
      return s;
    };
    return pool.sort(function (a, b) { return score(b) - score(a); }).slice(0, 4);
  }
  function renderRelated(p) {
    var box = document.getElementById('pm-related'); if (!box) return;
    var rel = relatedProducts(p);
    if (!rel.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h3 class="pm-rel-title">You might also like</h3><div class="pm-rel-grid">' +
      rel.map(function (x) {
        var thumb = x.image_url ? '<img class="pm-rel-img" src="' + esc(x.image_url) + '" alt="" loading="lazy" data-letter="' + initial(x.name) + '">' : '<div class="pm-rel-img pm-rel-fb">' + initial(x.name) + '</div>';
        var tags = (x.bestseller ? '<span class="pm-rel-tag best">🔥</span>' : '') + (x.sale_price_money != null ? '<span class="pm-rel-tag sale">Sale</span>' : '');
        return '<button type="button" class="pm-rel-card" data-pid="' + x.id + '">' + thumb + tags +
          '<div class="pm-rel-info"><span class="pm-rel-name">' + esc(x.name) + '</span>' +
          '<span class="pm-rel-price">' + cardPriceHtml(x) + '</span></div></button>';
      }).join('') + '</div>';
    wireImgFallbacks(box);
    box.querySelectorAll('.pm-rel-card').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = productById(parseInt(b.getAttribute('data-pid'), 10));
        if (x) openProduct(x);
      });
    });
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
      if (rb && rv.summary.reviewCount) {
        rb.classList.add('pm-rating-link'); rb.setAttribute('title', 'See reviews');
        rb.addEventListener('click', function () { var rr = document.getElementById('pm-reviews'); if (rr) rr.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      }
      var sortable = rv.reviews.length > 2;
      box.innerHTML = '<div class="pm-rev-head"><h3 class="pm-rev-title">Reviews</h3>' +
        (sortable ? '<select id="pm-rev-sort" class="pm-rev-sort" aria-label="Sort reviews"><option value="recent">Most recent</option><option value="high">Highest rated</option><option value="low">Lowest rated</option></select>' : '') +
        '</div><div id="pm-form"></div><div id="pm-rev-listwrap"></div>';
      function reviewLi(r) {
        return '<li class="pm-rev"><div class="pm-rev-top"><span class="pm-rev-who"><b>' + esc(r.username || 'Buyer') + '</b><span class="pm-verified" title="Reviews are only from verified buyers">✓ Verified</span></span>' + starDisplay(r.rating) + '</div>' + (r.created_at ? '<div class="pm-rev-date">' + fmtDate(r.created_at) + '</div>' : '') + (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') + (r.reply ? '<div class="pm-rev-reply"><b>↳ Store reply:</b> ' + esc(r.reply) + '</div>' : '') + '</li>';
      }
      function renderRevList(mode) {
        var w = document.getElementById('pm-rev-listwrap'); if (!w) return;
        if (!rv.reviews.length) { w.innerHTML = '<p class="pm-rev-empty">No reviews yet — be the first.</p>'; return; }
        var arr = rv.reviews.slice();
        if (mode === 'high') arr.sort(function (a, b) { return b.rating - a.rating; });
        else if (mode === 'low') arr.sort(function (a, b) { return a.rating - b.rating; });
        w.innerHTML = '<ul class="pm-rev-list">' + arr.map(reviewLi).join('') + '</ul>';
      }
      var sortSel = document.getElementById('pm-rev-sort');
      if (sortSel) sortSel.addEventListener('change', function () { renderRevList(sortSel.value); });
      renderRevList('recent');
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
    S.categories = data.categories || [];
    buildCatIndex();
    if (!S.view) S.view = { q: params.get('q') || '', cat: params.get('cat') || '', sort: params.get('sort') || 'featured' };
    var s = S.store;
    // Theme the shop to the brand: the configured accent first (instant), then the
    // logo's own dominant colour once it loads (overrides live if readable).
    if (s.color && /^#[0-9a-f]{6}$/i.test(s.color)) document.documentElement.style.setProperty('--accent', s.color);
    applyLogoColor(s.logo || s.guildIcon);
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

    // Full-bleed cinematic hero: the banner image (if a clean https URL) becomes
    // the background, else a brand-coloured gradient. Legibility overlay is in CSS.
    var heroImg = (s.banner && /^https:\/\/[^\s"'()<>]+$/.test(s.banner))
      ? "url('" + s.banner + "')"
      : 'radial-gradient(120% 130% at 50% -10%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 58%)';
    var html = '<div class="store-hero" style="--hero-img:' + heroImg + '">';
    html += '<div class="store-hero-inner">';
    html += logo ? '<img class="store-logo" src="' + esc(logo) + '" alt="" data-letter="' + initial(name) + '">' : '<div class="store-logo store-fb">' + initial(name) + '</div>';
    html += '<div class="store-htext"><h1 class="store-title">' + esc(name) + '</h1>' +
      (s.description ? '<p class="store-desc">' + esc(s.description) + '</p>' : '') +
      (pays.length ? '<div class="store-pays">' + pays.map(function (p) { return '<span class="store-pay">' + p + '</span>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      (pc ? '<div class="store-trust">' + trust.join('') + '</div>' : '') +
      '</div>';

    if (s.testMode) html += '<div class="store-test">Test mode — checkout is free and orders are flagged as tests. No real payment is taken.</div>';
    if (s.announcement) html += '<div class="store-announce">📣 ' + esc(s.announcement) + '</div>';

    if (!S.products.length) {
      html += '<div class="store-state"><div class="store-state-ico">' + ICON.bag + '</div><h2>No products yet</h2><p>This store hasn\'t added any products yet. Check back soon!</p></div>';
      root.innerHTML = html;
      wireImgFallbacks(root);
      return;
    }

    // Toolbar removed entirely — no search, no chips, no sort. The landing is just
    // the category tiles; category pages list options in catalog (featured) order.
    html += '<div id="store-results"></div>';
    html += '<div id="store-reviews-showcase" class="store-reviews-showcase"></div>';
    root.innerHTML = html;
    wireImgFallbacks(root); // hero logo

    renderResults();
    renderCartButton();
    loadStoreReviews(); // "What buyers say" showcase at the bottom
    // Deep-link: ?cat=<id> opens that category page; ?product=<id> opens a product.
    var dlc = params.get('cat');
    if (dlc) { openCategory(dlc === 'other' ? 'other' : parseInt(dlc, 10)); }
    var dlp = parseInt(params.get('product'), 10);
    if (dlp) { var dp = productById(dlp); if (dp) openProduct(dp); }
  }

  // Store-wide reviews showcase — a "What buyers say" section at the very bottom
  // of the shop. Verified-buyer reviews only; the section hides itself when there
  // are none, so a brand-new store shows nothing rather than an empty shell.
  function loadStoreReviews() {
    var box = document.getElementById('store-reviews-showcase'); if (!box) return;
    api('/api/dashboard/store/reviews/recent?guild=' + encodeURIComponent(guildId)).then(function (r) {
      var data = (r && r.ok && r.body) || { reviews: [], summary: { rating: 0, reviewCount: 0 } };
      var revs = data.reviews || [];
      if (!revs.length) { box.innerHTML = ''; return; }
      var sum = data.summary || { rating: 0, reviewCount: 0 };
      var head = '<div class="sr-head"><h2 class="sr-title">What buyers say</h2>' +
        (sum.reviewCount ? '<div class="sr-overall">' + starDisplay(sum.rating) + '<span class="sr-overall-n"><b>' + Number(sum.rating).toFixed(1) + '</b> · ' + sum.reviewCount + ' review' + (sum.reviewCount === 1 ? '' : 's') + '</span></div>' : '') +
        '</div>';
      var cards = revs.map(function (rv) {
        return '<figure class="sr-card">' +
          '<div class="sr-stars">' + starDisplay(rv.rating) + '</div>' +
          (rv.comment ? '<blockquote class="sr-quote">“' + esc(rv.comment) + '”</blockquote>' : '<blockquote class="sr-quote sr-noquote">Rated ' + rv.rating + '/5</blockquote>') +
          '<figcaption class="sr-by"><span class="sr-who"><b>' + esc(rv.username || 'Buyer') + '</b><span class="sr-verified" title="Reviews are only from verified buyers">✓ Verified</span></span>' +
          (rv.product_name ? '<span class="sr-prod">' + esc(rv.product_name) + '</span>' : '') + '</figcaption>' +
          (rv.reply ? '<div class="sr-reply"><b>↳ Store reply:</b> ' + esc(rv.reply) + '</div>' : '') +
          '</figure>';
      }).join('');
      box.innerHTML = '<section class="sr-wrap">' + head + '<div class="sr-grid">' + cards + '</div></section>';
    });
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
      if (S.user && data.premium !== false && data.enabled !== false) loadCart().then(function () { renderCartButton(); if (S.cart && S.cart.items && S.cart.items.length) renderResults(); });
    }).catch(function () {
      state('<h2>Couldn\'t reach the store</h2><p>The store service didn\'t respond. Please try again shortly.</p><a class="btn btn-outline" href="index.html">Back to site</a>', ICON.alert);
    });
  }

  init();
})();
