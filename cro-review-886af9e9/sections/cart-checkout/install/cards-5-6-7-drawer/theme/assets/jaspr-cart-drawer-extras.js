/*
  Jaspr cart drawer extras — cards 5, 6 and 7. Upload as assets/jaspr-cart-drawer-extras.js.
  Reads window.JASPR_CART_EXTRAS (printed by snippets/jaspr-cart-drawer-extras.liquid).

  How it attaches to Rebuy without editing Rebuy's template:
  Rebuy re-renders the drawer whenever the cart changes. A MutationObserver watches the
  drawer and (re)inserts our two elements at fixed anchors that exist in the live drawer
  (checked Nov 2, 2026):
    [data-rebuy-component="checkout-area"]   -> trust block goes directly BEFORE it (cards 5/6)
    [data-rebuy-component="cart-subtotal"]   -> priority checkbox goes directly BEFORE it (card 7)
  Both are idempotent: they never insert twice.
*/
(function () {
  'use strict';
  var CFG = window.JASPR_CART_EXTRAS;
  if (!CFG) return;

  var busy = false;          // true while we are changing the cart ourselves
  var scheduled = false;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // textContent: never inject HTML from config
    return n;
  }

  function drawer() { return document.getElementById('rebuy-cart'); }
  function hasScrubber(d) { return !!$('.rebuy-cart__flyout-item.product-' + CFG.scrubberHandle, d); }
  function priorityLine(d) {
    return CFG.priority.handle ? $('.rebuy-cart__flyout-item.product-' + CFG.priority.handle, d) : null;
  }

  /* ---------- Cards 5 and 6: one block above Checkout ---------- */
  function trustMode() {
    var m = document.documentElement.getAttribute('data-cart-trust') || CFG.trustDefault || 'off';
    return (m === 'review' || m === 'founder') ? m : 'off';
  }

  function buildReview() {
    var r = CFG.review;
    var box = el('div', 'jaspr-trust jaspr-trust--review');
    box.setAttribute('role', 'note');
    box.setAttribute('aria-label', 'Owner review');
    var stars = el('div', 'jaspr-trust__stars', '★★★★★'.slice(0, r.stars || 5));
    stars.setAttribute('aria-label', (r.stars || 5) + ' out of 5 stars');
    stars.setAttribute('role', 'img');
    box.appendChild(stars);
    box.appendChild(el('p', 'jaspr-trust__quote', '“' + r.quote + '”'));
    var by = el('p', 'jaspr-trust__by');
    by.appendChild(el('span', 'jaspr-trust__name', r.name));
    by.appendChild(el('span', 'jaspr-trust__badge', r.badge));
    box.appendChild(by);
    return box;
  }

  function buildFounder() {
    var f = CFG.founder;
    var box = el('div', 'jaspr-trust jaspr-trust--founder');
    box.setAttribute('role', 'note');
    box.setAttribute('aria-label', 'From the founder');
    if (f.photo) {
      var img = el('img', 'jaspr-trust__photo');
      img.src = f.photo; img.alt = ''; img.width = 48; img.height = 48; img.loading = 'lazy';
      box.appendChild(img);
    }
    var body = el('div', 'jaspr-trust__body');
    body.appendChild(el('p', 'jaspr-trust__quote', '“' + f.quote + '”'));
    var by = el('p', 'jaspr-trust__by');
    by.appendChild(el('span', 'jaspr-trust__name', f.name));
    by.appendChild(el('span', 'jaspr-trust__badge', f.title));
    body.appendChild(by);
    box.appendChild(body);
    return box;
  }

  function placeTrust(d) {
    var mode = trustMode();
    var existing = $('.jaspr-trust', d);
    var anchor = $('[data-rebuy-component="checkout-area"]', d);
    var show = mode !== 'off' && anchor && hasScrubber(d);
    if (!show) { if (existing) existing.remove(); return; }
    if (existing && existing.classList.contains('jaspr-trust--' + mode) && existing.nextElementSibling === anchor) return;
    if (existing) existing.remove();
    anchor.parentNode.insertBefore(mode === 'review' ? buildReview() : buildFounder(), anchor);
  }

  /* ---------- Card 7: unchecked paid add-on ---------- */
  function refreshRebuy() {
    // Ask Rebuy to re-read the cart so the drawer totals update.
    // Rebuy.Cart.fetchCart() and Rebuy.SmartCart.setCart() both exist on the live store's
    // Rebuy object (checked Nov 2, 2026). Developer: confirm the drawer totals update in QA.
    try {
      if (window.Rebuy && Rebuy.Cart && typeof Rebuy.Cart.fetchCart === 'function') return Rebuy.Cart.fetchCart();
    } catch (e) {}
    return fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        try { if (window.Rebuy && Rebuy.SmartCart && Rebuy.SmartCart.setCart) Rebuy.SmartCart.setCart(cart); } catch (e) {}
      });
  }

  function setPriority(on) {
    busy = true;
    var req = on
      ? fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: CFG.priority.variantId, quantity: 1 }] })
        })
      : fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: String(CFG.priority.variantId), quantity: 0 })
        });
    return req.then(refreshRebuy).catch(function () {}).then(function () { busy = false; schedule(); });
  }

  function placePriority(d) {
    var P = CFG.priority;
    var existing = $('.jaspr-priority', d);
    var anchor = $('[data-rebuy-component="cart-subtotal"]', d);
    if (!P.enabled || !P.variantId || !anchor) { if (existing) existing.remove(); return; }

    var line = priorityLine(d);
    // Rule: the add-on never rides alone. If the scrubber leaves the cart, take it out too.
    if (!hasScrubber(d)) {
      if (existing) existing.remove();
      if (line && !busy) setPriority(false);
      return;
    }

    if (!existing) {
      existing = el('label', 'jaspr-priority');
      var box = el('input', 'jaspr-priority__box');
      box.type = 'checkbox';
      box.checked = false;                 // Rule: unchecked by default, every time.
      box.addEventListener('change', function () {
        existing.classList.add('is-busy');
        setPriority(box.checked);
      });
      existing.appendChild(box);
      var txt = el('span', 'jaspr-priority__text');
      txt.appendChild(el('span', 'jaspr-priority__label', P.label + ' '));
      txt.appendChild(el('span', 'jaspr-priority__price', '(+' + P.price + ')'));
      existing.appendChild(txt);
    }
    if (existing.nextElementSibling !== anchor) anchor.parentNode.insertBefore(existing, anchor);
    // The checkbox mirrors the cart, so it is right after a refresh or on another tab.
    var input = $('.jaspr-priority__box', existing);
    if (!busy) { input.checked = !!line; existing.classList.remove('is-busy'); }
  }

  /* ---------- wiring ---------- */
  function run() {
    scheduled = false;
    var d = drawer();
    if (!d) return;
    placeTrust(d);
    placePriority(d);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || setTimeout)(run);
  }

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var t = muts[i].target;
      if (t.closest && (t.closest('.jaspr-trust') || t.closest('.jaspr-priority'))) continue;
      schedule();
      return;
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Re-check when a test tool flips the variant after load.
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['data-cart-trust'] });

  schedule();
})();
