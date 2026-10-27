/* Lokka Design – storefront script
   Cart, favourites, search, VIP club, WhatsApp support, checkout, order tracking and account.
   Everything is client-side; data lives in localStorage so the demo works on any static host. */
(function () {
  'use strict';
  const D = window.LOKKA;
  if (!D) return;

  // ------------------------------------------------------------------ basics
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const html = document.documentElement;
  const lang = html.lang === 'en' ? 'en' : 'tr';
  const li = lang === 'tr' ? 0 : 1;
  const T = D.i18n[lang];
  const S = D.site;
  const ROOT = html.dataset.root || '';
  const PAGE = html.dataset.page || '';
  const PRODUCTS = D.products;
  const PM = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
  const OFF = window.LOKKA_OFFLINE || null; // set only in the single-file offline build
  const qs = new URLSearchParams(OFF ? OFF.query() : location.search);
  const href = (key, extra = '') => ROOT + D.urls[lang][key] + extra;
  const asset = (p) => (OFF ? OFF.asset('assets/' + p) : ROOT + 'assets/' + p);
  const go = (u) => { if (OFF) OFF.go(u); else location.href = u; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tpl = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : o[k]));
  const round2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n, d) => n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n, dec) => {
    const d = dec != null ? dec : Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2;
    return lang === 'tr' ? fmt(n, d) + ' TL' : 'TRY ' + fmt(n, d);
  };
  const waLink = (text) => 'https://wa.me/' + S.whatsapp + (text ? '?text=' + encodeURIComponent(text) : '');

  // storage with in-memory fallback (private mode, blocked storage, previews)
  const mem = {};
  const mkStore = (kind) => ({
    get(k, d) {
      try {
        const v = window[kind].getItem(k);
        if (v != null) return JSON.parse(v);
      } catch (e) { /* ignore */ }
      return Object.prototype.hasOwnProperty.call(mem, kind + k) ? mem[kind + k] : d;
    },
    set(k, v) {
      mem[kind + k] = v;
      try { window[kind].setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
    del(k) {
      delete mem[kind + k];
      try { window[kind].removeItem(k); } catch (e) { /* ignore */ }
    },
  });
  const store = mkStore('localStorage');
  const sstore = mkStore('sessionStorage');

  const P = {
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    bag: '<path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    arrow: '<path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5"/>',
    check: '<path d="M4.5 12.5l4.5 4.5 10.5-11"/>',
    box: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.3L12 20.8l8.5-4.5"/>',
    image: '<rect x="3.5" y="5" width="17" height="14"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4"/>',
    hanger: '<path d="M12 7.5a2 2 0 1 1 2-2c0 1-.9 1.6-2 2.3v1.2l8.4 5.2a1.5 1.5 0 0 1-.8 2.8H4.4a1.5 1.5 0 0 1-.8-2.8L12 9"/>',
    rotate: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19.5 4.5v4h-4"/>',
    shield: '<path d="M12 3.5l7 2.6v5.4c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6.1z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
    cube: '<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.8 7.9L12 12l7.2-4.1M12 12v8.3"/>',
  };
  const ico = (n) => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>';

  // ------------------------------------------------------------------ toast
  let toastTimer = 0;
  function toast(msg, link) {
    const el = $('[data-toast]');
    if (!el) return;
    el.innerHTML = esc(msg) + (link ? ' <a href="' + esc(link.href) + '">' + esc(link.text) + '</a>' : '');
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 3400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ------------------------------------------------------------------ overlays (drawers, modals, search)
  const scrim = $('[data-scrim]');
  let openEl = null;
  let lastFocus = null;
  const focusables = (el) => $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', el)
    .filter((n) => n.offsetParent !== null || n === document.activeElement);

  function openPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (openEl && openEl !== el) closePanel(true);
    lastFocus = document.activeElement;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    if (!el.classList.contains('modal') && scrim) scrim.classList.add('is-on');
    html.classList.add('is-locked');
    openEl = el;
    $$('[data-open="' + id + '"]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
    setTimeout(() => {
      const f = el.querySelector('[data-search-input]') || focusables(el).find((n) => !n.matches('.modal__close, [data-close]')) || focusables(el)[0];
      if (f) f.focus({ preventScroll: true });
    }, 80);
    el.dispatchEvent(new CustomEvent('lokka:open', { bubbles: true }));
  }

  function closePanel(silent) {
    if (!openEl) return;
    const el = openEl;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.classList.remove('is-on');
    html.classList.remove('is-locked');
    $$('[data-open="' + el.id + '"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    openEl = null;
    el.dispatchEvent(new CustomEvent('lokka:close', { bubbles: true }));
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  window.LokkaUI = { openPanel, closePanel, toast };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openEl) closePanel();
      closeWa();
      closeFilters();
      $$('.nav-item.is-open').forEach((n) => { n.classList.remove('is-open'); $('[data-mega-btn]', n).setAttribute('aria-expanded', 'false'); });
    }
    if (e.key === 'Tab' && openEl) {
      const f = focusables(openEl);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ------------------------------------------------------------------ header, mega menu, announcement
  const header = $('[data-header]');
  const ann = $('.announce');
  const onScroll = () => header && header.classList.toggle('is-solid', window.scrollY > (ann ? ann.offsetHeight : 0) + 2);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $$('[data-mega-btn]').forEach((b) => b.addEventListener('click', () => {
    const item = b.closest('.nav-item');
    const on = !item.classList.contains('is-open');
    item.classList.toggle('is-open', on);
    b.setAttribute('aria-expanded', String(on));
  }));
  document.addEventListener('click', (e) => {
    $$('.nav-item.is-open').forEach((n) => {
      if (!n.contains(e.target)) { n.classList.remove('is-open'); $('[data-mega-btn]', n).setAttribute('aria-expanded', 'false'); }
    });
  });

  const rot = $('[data-rotator]');
  if (rot) {
    const items = $$('span', rot);
    let ri = 0;
    if (items.length > 1) {
      setInterval(() => {
        items[ri].classList.remove('is-on');
        ri = (ri + 1) % items.length;
        items[ri].classList.add('is-on');
      }, 4500);
    }
  }

  // ------------------------------------------------------------------ product card markup (JS-rendered grids)
  function cardHTML(p) {
    const c0 = p.colors[0];
    const badge = p.compare ? '<span class="card__badge card__badge--sale">' + esc(lang === 'tr' ? 'İndirim' : 'Sale') + '</span>'
      : p.badge ? '<span class="card__badge">' + esc(p.badge[lang]) + '</span>' : '';
    const dots = p.colors.slice(0, 5).map((c) => '<span class="dot" style="background:' + esc(c.swatch) + '" title="' + esc(c.name[lang]) + '"></span>').join('')
      + (p.colors.length > 5 ? '<small>+' + (p.colors.length - 5) + '</small>' : '');
    const url = ROOT + p.url[lang];
    return '<article class="card" data-card data-id="' + esc(p.id) + '"><div class="card__visual">'
      + '<a class="card__media" href="' + esc(url) + '" tabindex="-1" aria-hidden="true">' + badge
      + '<img src="' + esc(asset(c0.img.front)) + '" alt="" loading="lazy" width="900" height="1125">'
      + '<img src="' + esc(asset(c0.img.back)) + '" alt="" loading="lazy" width="900" height="1125"></a>'
      + '<button class="icon-btn card__fav" type="button" data-fav="' + esc(p.id) + '" aria-pressed="false" aria-label="' + esc(T.favs) + ': ' + esc(p.name[lang]) + '">' + ico('heart') + '</button>'
      + '<button class="card__quick" type="button" data-quick="' + esc(p.id) + '">' + esc(lang === 'tr' ? 'Hızlı ekle' : 'Quick add') + '</button>'
      + '</div>'
      + '<a class="card__name" href="' + esc(url) + '">' + esc(p.name[lang]) + '</a>'
      + '<div class="card__meta"><span class="price' + (p.compare ? ' price--sale' : '') + '">' + money(p.price) + (p.compare ? '<s>' + money(p.compare) + '</s>' : '') + '</span>'
      + '<span class="dots">' + dots + '</span></div></article>';
  }

  // ------------------------------------------------------------------ cart
  const CART = 'lokka_cart';
  const getCart = () => {
    const c = store.get(CART, []);
    return Array.isArray(c) ? c.filter((l) => l && l.key && l.qty > 0 && (l.custom || PM[l.id])) : [];
  };
  const saveCart = (c) => { store.set(CART, c); renderCart(); };

  function lineInfo(l) {
    if (l.custom) {
      return {
        name: l.name[lang], img: l.thumb || asset(D.models[l.model].thumb), url: href('atelier'), unit: l.unit, qty: l.qty, custom: true,
        meta: (l.colorName ? T.color + ': ' + l.colorName[lang] + ' · ' : '') + Object.entries(l.sizes || {}).filter(([, q]) => q > 0).map(([s, q]) => s + ' × ' + q).join(', '),
      };
    }
    const p = PM[l.id];
    const col = p.colors.find((c) => c.key === l.color) || p.colors[0];
    return {
      name: p.name[lang], img: asset(col.img.front), url: ROOT + p.url[lang], unit: p.price, compare: p.compare, qty: l.qty,
      meta: T.color + ': ' + col.name[lang] + ' · ' + T.size + ': ' + l.size,
    };
  }

  function cartTotals(cart) {
    let count = 0;
    let sub = 0;
    cart.forEach((l) => { const i = lineInfo(l); count += l.qty; sub += i.unit * l.qty; });
    return { count, sub: round2(sub) };
  }

  function addToCart(item) {
    const cart = getCart();
    if (item.custom) cart.push(item);
    else {
      const key = item.id + '|' + item.color + '|' + item.size;
      const ex = cart.find((l) => l.key === key);
      if (ex) ex.qty = Math.min(999, ex.qty + item.qty);
      else cart.push({ key, id: item.id, color: item.color, size: item.size, qty: item.qty });
    }
    saveCart(cart);
  }
  window.LokkaCart = { add: addToCart, get: getCart };

  function lineHTML(l) {
    const i = lineInfo(l);
    const qty = i.custom
      ? '<span class="line__meta">' + l.qty + ' ' + esc(T.pieces) + '</span>'
      : '<div class="qty"><button type="button" data-line-qty="-1" aria-label="−">−</button><input type="number" min="1" max="999" value="' + l.qty + '" inputmode="numeric" aria-label="' + esc(T.qty) + '" data-line-input><button type="button" data-line-qty="1" aria-label="+">+</button></div>';
    return '<div class="line" data-key="' + esc(l.key) + '">'
      + '<a href="' + esc(i.url) + '" tabindex="-1"><img src="' + esc(i.img) + '" alt="" loading="lazy" width="900" height="1125"></a>'
      + '<div><a class="line__name" href="' + esc(i.url) + '">' + esc(i.name) + '</a><div class="line__meta">' + esc(i.meta) + '</div>'
      + (i.custom ? '<span class="line__custom">' + esc(T.custom) + '</span>' : '')
      + '<div class="line__actions">' + qty + '<button class="line__remove" type="button" data-line-remove>' + esc(T.remove) + '</button></div></div>'
      + '<div class="line__price">' + money(i.unit * l.qty) + (i.compare ? '<s>' + money(i.compare * l.qty) + '</s>' : '') + '</div></div>';
  }

  function renderCart() {
    const cart = getCart();
    const { count, sub } = cartTotals(cart);
    $$('[data-cart-count]').forEach((e) => { e.textContent = count ? String(count) : ''; e.dataset.n = String(count); });
    $$('[data-cart-count-text]').forEach((e) => { e.textContent = count ? tpl(T.cartN, { n: count }) : ''; });
    const free = S.free_shipping_over;
    $$('[data-ship-bar]').forEach((bar) => {
      bar.hidden = !count;
      $('[data-ship-text]', bar).textContent = sub >= free ? T.freeOk : tpl(T.freeLeft, { x: money(free - sub) });
      $('[data-ship-fill]', bar).style.width = Math.min(100, (sub / free) * 100) + '%';
    });
    $$('[data-cart-lines]').forEach((box) => {
      box.innerHTML = count ? cart.map(lineHTML).join('')
        : '<div class="lines-empty"><span class="empty__ico">' + ico('bag') + '</span><b>' + esc(T.empty) + '</b><span>' + esc(T.emptySub) + '</span>'
          + '<a class="btn" href="' + esc(href('shop')) + '">' + esc(T.shop) + '</a><a class="btn btn--ghost" href="' + esc(href('atelier')) + '">' + ico('cube') + ' ' + esc(lang === 'tr' ? '3D Atölye' : '3D Atelier') + '</a></div>';
    });
    $$('[data-cart-foot]').forEach((f) => { f.hidden = !count; });
    $$('[data-cart-subtotal]').forEach((e) => { e.textContent = money(sub); });
    $$('[data-cart-sum]').forEach((e) => {
      const ship = sub >= free ? 0 : S.shipping_fee;
      e.innerHTML = '<div><span>' + esc(T.subtotal) + '</span><span>' + money(sub) + '</span></div>'
        + '<div><span>' + esc(T.shipStd) + '</span><span>' + (ship ? money(ship) : esc(T.free)) + '</span></div>'
        + '<div class="total"><span>' + esc(T.total) + '</span><span>' + money(sub + ship) + '</span></div>';
    });
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    const qb = t.closest('[data-line-qty]');
    const rm = t.closest('[data-line-remove]');
    if (!qb && !rm) return;
    const key = t.closest('[data-key]').dataset.key;
    const cart = getCart();
    const l = cart.find((x) => x.key === key);
    if (!l) return;
    if (rm) saveCart(cart.filter((x) => x.key !== key));
    else { l.qty = Math.max(1, Math.min(999, l.qty + Number(qb.dataset.lineQty))); saveCart(cart); }
  });
  document.addEventListener('change', (e) => {
    const inp = e.target.closest('[data-line-input]');
    if (!inp) return;
    const key = inp.closest('[data-key]').dataset.key;
    const cart = getCart();
    const l = cart.find((x) => x.key === key);
    if (!l) return;
    l.qty = Math.max(1, Math.min(999, parseInt(inp.value, 10) || 1));
    saveCart(cart);
  });

  // ------------------------------------------------------------------ favourites
  const FAV = 'lokka_favs';
  const getFavs = () => (store.get(FAV, []) || []).filter((id) => PM[id]);
  function syncFavs() {
    const f = getFavs();
    $$('[data-fav]').forEach((b) => {
      const on = f.includes(b.dataset.fav);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $$('[data-fav-count]').forEach((e) => { e.textContent = f.length ? String(f.length) : ''; e.dataset.n = String(f.length); });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.fav;
    let f = getFavs();
    const on = !f.includes(id);
    f = on ? f.concat(id) : f.filter((x) => x !== id);
    store.set(FAV, f);
    syncFavs();
    toast(on ? T.favAdded : T.favRemoved, on ? { href: href('wishlist'), text: T.favs } : null);
    if (PAGE === 'wishlist') renderWishlist();
  });

  // ------------------------------------------------------------------ quick add modal
  let qm = null;
  let qmState = null;
  function buildQuick() {
    qm = document.createElement('div');
    qm.className = 'modal';
    qm.id = 'quick-modal';
    qm.setAttribute('role', 'dialog');
    qm.setAttribute('aria-modal', 'true');
    qm.setAttribute('aria-labelledby', 'qm-title');
    qm.setAttribute('aria-hidden', 'true');
    qm.innerHTML = '<div class="scrim is-on" data-close></div><div class="modal__box quick">'
      + '<button class="icon-btn modal__close" type="button" data-close aria-label="' + esc(T.close) + '">' + ico('close') + '</button>'
      + '<div class="quick__grid"><div class="quick__media"><img data-qm-img alt="" width="900" height="1125"></div><div class="quick__info">'
      + '<h2 class="pdp__title" id="qm-title" data-qm-name></h2><p class="pdp__price" data-qm-price></p>'
      + '<div><div class="opt-head"><span class="label">' + esc(T.color) + ': <b data-qm-color></b></span></div><div class="swatches" data-qm-swatches role="radiogroup" aria-label="' + esc(T.color) + '"></div></div>'
      + '<div><div class="opt-head"><span class="label">' + esc(T.size) + '</span></div><div class="sizes" data-qm-sizes role="radiogroup" aria-label="' + esc(T.size) + '"></div><p class="err-msg mt-1" data-qm-err hidden>' + esc(T.selectSize) + '</p></div>'
      + '<button class="btn btn--block" type="button" data-qm-add>' + ico('bag') + ' ' + esc(T.addToCart) + '</button>'
      + '<a class="link-u" data-qm-link style="justify-self:start">' + esc(T.viewDetails) + '</a></div></div></div>';
    document.body.appendChild(qm);
    qm.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-qm-c]');
      const sz = e.target.closest('[data-qm-s]');
      if (sw) { qmState.color = sw.dataset.qmC; paintQuick(); }
      if (sz) { qmState.size = sz.dataset.qmS; $('[data-qm-err]', qm).hidden = true; paintQuick(); }
      if (e.target.closest('[data-qm-add]')) {
        if (!qmState.size) { $('[data-qm-err]', qm).hidden = false; return; }
        addToCart({ id: qmState.p.id, color: qmState.color, size: qmState.size, qty: 1 });
        closePanel(true);
        toast(T.added, { href: href('cart'), text: T.viewCart });
        openPanel('cart');
      }
    });
  }
  function paintQuick() {
    const { p, color, size } = qmState;
    const col = p.colors.find((c) => c.key === color) || p.colors[0];
    $('[data-qm-img]', qm).src = asset(col.img.front);
    $('[data-qm-name]', qm).textContent = p.name[lang];
    $('[data-qm-price]', qm).innerHTML = '<span class="price' + (p.compare ? ' price--sale' : '') + '">' + money(p.price) + (p.compare ? '<s>' + money(p.compare) + '</s>' : '') + '</span>';
    $('[data-qm-color]', qm).textContent = col.name[lang];
    $('[data-qm-swatches]', qm).innerHTML = p.colors.map((c) => '<button class="swatch' + (c.key === color ? ' is-on' : '') + '" type="button" role="radio" aria-checked="' + (c.key === color) + '" style="background:' + esc(c.swatch) + '" data-qm-c="' + esc(c.key) + '" aria-label="' + esc(c.name[lang]) + '" title="' + esc(c.name[lang]) + '"></button>').join('');
    $('[data-qm-sizes]', qm).innerHTML = p.sizes.map((s) => '<button class="size" type="button" role="radio" aria-pressed="' + (s === size) + '" data-qm-s="' + esc(s) + '">' + esc(s) + '</button>').join('');
    $('[data-qm-link]', qm).href = ROOT + p.url[lang];
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const p = PM[b.dataset.quick];
    if (!p) return;
    if (!qm) buildQuick();
    qmState = { p, color: p.colors[0].key, size: null };
    $('[data-qm-err]', qm).hidden = true;
    paintQuick();
    openPanel('quick-modal');
  });

  // generic open/close triggers
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { e.preventDefault(); openPanel(o.dataset.open); return; }
    const c = e.target.closest('[data-close]');
    if (c && openEl && openEl.contains(c)) { e.preventDefault(); closePanel(); return; }
    if (scrim && e.target === scrim) { closePanel(); closeFilters(); }
  });

  // ------------------------------------------------------------------ search
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const SYN = {
    tisort: 'tisort tshirt t-shirt tee t shirt basic',
    sweatshirt: 'sweatshirt sweat hoodie kapusonlu kazak crewneck',
    jean: 'jean jeans denim kot pantolon',
    kumas_pantolon: 'pantolon chino trousers pants kumas',
    is_pantolonu: 'is pantolonu work trousers workwear is kiyafeti pantolon',
  };
  const INDEX = PRODUCTS.map((p) => {
    const cats = D.categories.filter((c) => p.cats.includes(c.key)).map((c) => c.name.tr + ' ' + c.name.en).join(' ');
    const cols = p.colors.map((c) => c.name.tr + ' ' + c.name.en).join(' ');
    const extra = Object.keys(p.prints || {}).length ? 'baskili graphic print logo' : '';
    return { p, name: norm(p.name.tr + ' ' + p.name.en), all: norm([p.name.tr, p.name.en, cats, cols, p.fabric.tr, p.fabric.en, p.fit.tr, p.fit.en, SYN[p.model], extra].join(' ')) };
  });
  function search(q) {
    const toks = norm(q).split(/[\s,.-]+/).filter((t) => t.length > 1 || /\d/.test(t));
    if (!toks.length) return [];
    return INDEX.map((x) => {
      let score = 0;
      for (const t of toks) {
        if (x.name.includes(t)) score += 3;
        else if (x.all.includes(t)) score += 1;
        else return null;
      }
      return { p: x.p, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).map((x) => x.p);
  }
  const sInput = $('[data-search-input]');
  const sResults = $('[data-search-results]');
  function renderMini() {
    if (!sResults) return;
    const q = sInput.value.trim();
    if (!q) { sResults.innerHTML = ''; return; }
    const list = search(q);
    sResults.innerHTML = list.length ? list.slice(0, 8).map(cardHTML).join('') : '<p class="muted" style="grid-column:1/-1">' + esc(T.searchNone) + '</p>';
    syncFavs();
  }
  if (sInput) {
    sInput.addEventListener('input', renderMini);
    const sf = $('[data-search-form]');
    sf.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = sInput.value.trim();
      sstore.set('lokka_q', q);
      go(href('search', q ? '?q=' + encodeURIComponent(q) : ''));
    });
  }
  document.addEventListener('click', (e) => {
    const h = e.target.closest('[data-hint]');
    if (!h) return;
    const panel = h.closest('#search');
    if (panel && sInput) { sInput.value = h.dataset.hint; renderMini(); sInput.focus(); return; }
    const pi = $('[data-search-page-input]');
    if (pi) { pi.value = h.dataset.hint; runPageSearch(); }
  });

  function runPageSearch() {
    const pi = $('[data-search-page-input]');
    const q = pi.value.trim();
    sstore.set('lokka_q', q);
    if (!OFF) { try { history.replaceState(null, '', q ? '?q=' + encodeURIComponent(q) : location.pathname); } catch (e) { /* ignore */ } }
    const list = q ? search(q) : PRODUCTS;
    $('[data-search-grid]').innerHTML = list.map(cardHTML).join('');
    $('[data-search-count]').textContent = q ? tpl(T.searchCount, { q, n: list.length }) : T.searchPrompt;
    $('[data-search-empty]').hidden = !(q && !list.length);
    syncFavs();
  }
  if ($('[data-search-page-form]')) {
    const pi = $('[data-search-page-input]');
    pi.value = qs.get('q') || sstore.get('lokka_q', '') || '';
    $('[data-search-page-form]').addEventListener('submit', (e) => { e.preventDefault(); runPageSearch(); });
    runPageSearch();
  }

  // ------------------------------------------------------------------ wishlist page
  function renderWishlist() {
    const grid = $('[data-wishlist]');
    if (!grid) return;
    const f = getFavs();
    grid.innerHTML = f.map((id) => cardHTML(PM[id])).join('');
    grid.hidden = !f.length;
    $('[data-wish-empty]').hidden = !!f.length;
    syncFavs();
  }
  renderWishlist();

  // ------------------------------------------------------------------ form helpers
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phoneOk = (v) => {
    const d = String(v).replace(/[\s()-]/g, '');
    return /^(?:\+?90|0)?5\d{9}$/.test(d) || /^\+\d{8,15}$/.test(d);
  };
  function markField(el, bad) {
    el.classList.toggle('is-error', bad);
    if (bad) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
  function validate(scope) {
    let ok = true;
    let first = null;
    $$('input, select, textarea', scope).forEach((el) => {
      if (el.disabled || el.closest('[hidden]')) { markField(el, false); return; }
      let bad = false;
      const v = (el.value || '').trim();
      if (el.type === 'checkbox') bad = el.required && !el.checked;
      else if (el.required && !v) bad = true;
      else if (v && el.type === 'email') bad = !EMAIL_RE.test(v);
      else if (v && el.hasAttribute('data-phone')) bad = !phoneOk(v);
      markField(el.type === 'checkbox' ? el.closest('.check') || el : el, bad);
      if (bad) { ok = false; first = first || el; }
    });
    if (first) first.focus({ preventScroll: false });
    return ok;
  }
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList && el.classList.contains('is-error')) markField(el, false);
    if (el.type === 'checkbox' && el.closest('.check.is-error')) markField(el.closest('.check'), false);
  });

  // contact / quote / support forms → prefilled WhatsApp message (works on any static host)
  $$('form[data-form]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-form-err]', f);
    const ok = $('[data-form-ok]', f);
    if (!validate(f)) { err.textContent = T.errForm; err.hidden = false; return; }
    err.hidden = true;
    const title = { quote: T.formQuote, contact: T.formContact, wa: T.formWa }[f.dataset.form] || '';
    const lines = [title, ''];
    $$('input, select, textarea', f).forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'file' || !el.name || !String(el.value).trim()) return;
      const lab = el.id ? f.querySelector('label[for="' + el.id + '"]') : null;
      lines.push((lab ? lab.textContent.trim() : el.name) + ': ' + String(el.value).trim());
    });
    const file = $('input[type="file"]', f);
    if (file && file.files && file.files.length) lines.push('', T.fileNote + ' (' + file.files[0].name + ')');
    const url = waLink(lines.join('\n'));
    window.open(url, '_blank', 'noopener');
    ok.innerHTML = esc(T.waReady) + ' <a class="link-u" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(T.openWa) + '</a>';
    ok.hidden = false;
  }));

  // ------------------------------------------------------------------ VIP club
  const VIP = 'lokka_vip';
  const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const randCode = (n) => {
    let s = '';
    const a = new Uint32Array(n);
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (let i = 0; i < n; i++) s += CODE_CHARS[a[i] % CODE_CHARS.length];
    return s;
  };
  function vipFor(email) {
    const v = store.get(VIP, null);
    if (v && v.email === email) return v;
    const rec = { email, code: 'LOKKA10-' + randCode(4), used: false, date: Date.now() };
    store.set(VIP, rec);
    return rec;
  }
  function showVipDone(form, rec) {
    $('.row', form).hidden = true;
    $$('.check', form).forEach((c) => { c.hidden = true; });
    $('[data-vip-err]', form).hidden = true;
    $('[data-code]', form).textContent = rec.code;
    $('[data-vip-done]', form).hidden = false;
  }
  $$('[data-vip-form]').forEach((form) => {
    const rec = store.get(VIP, null);
    if (rec && rec.code && !rec.used) showVipDone(form, rec);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('[data-vip-err]', form);
      const email = $('input[type="email"]', form).value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { err.textContent = T.errEmail; err.hidden = false; markField($('input[type="email"]', form), true); return; }
      if ($$('input[type="checkbox"]', form).some((c) => !c.checked)) { err.textContent = T.errConsent; err.hidden = false; return; }
      const r = vipFor(email);
      $$('[data-vip-form]').forEach((f2) => showVipDone(f2, r));
      store.set('lokka_vip_seen', Date.now());
    });
  });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy-code]');
    if (!b) return;
    const code = $('[data-code]', b).textContent.trim();
    if (await copyText(code)) toast(T.copied + ': ' + code);
  });
  if (!store.get(VIP, null) && !store.get('lokka_vip_seen', null)
      && !['checkout', 'cart', 'atelier', 'confirm', 'vip', '404', 'account'].includes(PAGE) && $('#vip-modal')) {
    setTimeout(() => {
      if (openEl || store.get(VIP, null)) return;
      openPanel('vip-modal');
      store.set('lokka_vip_seen', Date.now());
    }, 14000);
  }

  // ------------------------------------------------------------------ WhatsApp panel
  const waBtn = $('[data-wa-toggle]');
  const waPanel = $('#wa-panel');
  function closeWa() {
    if (!waPanel || !waPanel.classList.contains('is-open')) return;
    waPanel.classList.remove('is-open');
    waBtn.setAttribute('aria-expanded', 'false');
  }
  function istanbulNow() {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
      const wd = parts.find((x) => x.type === 'weekday').value;
      const h = parseInt(parts.find((x) => x.type === 'hour').value, 10);
      return { day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd), hour: h };
    } catch (e) {
      const d = new Date();
      return { day: d.getDay(), hour: d.getHours() };
    }
  }
  const now = istanbulNow();
  const online = now.day !== 0 && now.hour >= 9 && now.hour < 19;
  $$('[data-wa-status]').forEach((e) => { e.textContent = online ? T.waOnline : T.waOffline; });
  $$('[data-wa-dot]').forEach((e) => e.classList.toggle('off', !online));
  $$('[data-hours] tr').forEach((tr) => tr.classList.toggle('is-today', Number(tr.dataset.day) === now.day));
  if (waPanel) {
    const pid = PAGE.startsWith('product-') ? PAGE.slice(8) : null;
    const ctx = pid && PM[pid] ? '\n(' + PM[pid].name[lang] + ')' : '';
    $('[data-wa-topics]', waPanel).innerHTML = D.waTopics.map((t) => '<a class="wa-topic" href="' + esc(waLink(t.m[li] + ctx)) + '" target="_blank" rel="noopener"><i>' + ico(t.icon) + '</i><span><b>' + esc(t.t[li]) + '</b><small>' + esc(t.s[li]) + '</small></span>' + ico('arrow') + '</a>').join('');
    waBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const on = !waPanel.classList.contains('is-open');
      waPanel.classList.toggle('is-open', on);
      waBtn.setAttribute('aria-expanded', String(on));
    });
    document.addEventListener('click', (e) => { if (!waPanel.contains(e.target) && e.target !== waBtn) closeWa(); });
  }

  // ------------------------------------------------------------------ cookie notice
  const ck = $('[data-cookie]');
  if (ck && !store.get('lokka_cookie', null) && PAGE !== 'atelier') ck.hidden = false;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-cookie-ok]')) { store.set('lokka_cookie', 'all'); ck.hidden = true; }
    if (e.target.closest('[data-cookie-no]')) { store.set('lokka_cookie', 'essential'); ck.hidden = true; }
  });

  // ------------------------------------------------------------------ product page
  const pdp = $('[data-pdp]');
  if (pdp) {
    const p = PM[pdp.dataset.pdp];
    const stage = $('[data-stage]', pdp);
    let color = p.colors[0].key;
    let size = null;
    let view = 'front';
    const col = () => p.colors.find((c) => c.key === color) || p.colors[0];
    const setStage = () => {
      stage.src = view === 'q34' ? asset(p.colors[0].img.q34) : asset(col().img[view] || col().img.front);
      stage.alt = p.name[lang] + ' – ' + col().name[lang];
    };
    const personalise = $('[data-personalize]', pdp);
    const setPersonalise = () => {
      if (!personalise) return;
      personalise.href = href('atelier', '?model=' + encodeURIComponent(p.model) + '&color=' + encodeURIComponent(color) + '&product=' + encodeURIComponent(p.id));
    };
    if (personalise) personalise.addEventListener('click', () => sstore.set('lokka_at_pre', { model: p.model, color, product: p.id }));
    $$('[data-color]', pdp).forEach((b) => b.addEventListener('click', () => {
      color = b.dataset.color;
      pdp.dataset.color = color;
      $$('[data-color]', pdp).forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
      $('[data-color-name]', pdp).textContent = col().name[lang];
      const thumbs = $$('[data-thumbs] button', pdp);
      thumbs.forEach((t) => {
        const v = t.dataset.view;
        if (v === 'q34') { t.hidden = color !== p.colors[0].key; return; }
        $('img', t).src = asset(col().img[v]);
      });
      if (view === 'q34' && color !== p.colors[0].key) {
        view = 'front';
        thumbs.forEach((t) => t.setAttribute('aria-current', String(t.dataset.view === 'front')));
      }
      setStage();
      setPersonalise();
      document.dispatchEvent(new CustomEvent('lokka:color', { detail: { color } }));
    }));
    $$('[data-thumbs] button', pdp).forEach((t) => t.addEventListener('click', () => {
      view = t.dataset.view;
      $$('[data-thumbs] button', pdp).forEach((x) => x.setAttribute('aria-current', String(x === t)));
      setStage();
    }));
    $$('[data-size]', pdp).forEach((b) => b.addEventListener('click', () => {
      size = b.dataset.size;
      $$('[data-size]', pdp).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('[data-size-err]', pdp).hidden = true;
    }));
    const qIn = $('[data-qty-input]', pdp);
    $$('[data-qty]', pdp).forEach((b) => b.addEventListener('click', () => {
      qIn.value = Math.max(1, Math.min(999, (parseInt(qIn.value, 10) || 1) + Number(b.dataset.qty)));
    }));
    qIn.addEventListener('change', () => { qIn.value = Math.max(1, Math.min(999, parseInt(qIn.value, 10) || 1)); });
    $('[data-add]', pdp).addEventListener('click', () => {
      if (!size) {
        const er = $('[data-size-err]', pdp);
        er.hidden = false;
        const first = $('[data-size]', pdp);
        if (first) first.focus();
        return;
      }
      addToCart({ id: p.id, color, size, qty: parseInt(qIn.value, 10) || 1 });
      toast(T.added, { href: href('cart'), text: T.viewCart });
      openPanel('cart');
    });
    const b3d = $('[data-open-3d]', pdp);
    if (b3d) b3d.addEventListener('click', () => {
      openPanel('viewer-modal');
      document.dispatchEvent(new CustomEvent('lokka:viewer', { detail: { id: p.id, color } }));
    });
    pdp.dataset.color = color;
    setPersonalise();
  }

  // ------------------------------------------------------------------ shop filters
  const shop = $('[data-shop]');
  const filters = $('#filters');
  function closeFilters() {
    if (!filters || !filters.classList.contains('is-open')) return;
    filters.classList.remove('is-open');
    if (scrim && !openEl) scrim.classList.remove('is-on');
    html.classList.remove('is-locked');
  }
  if (shop) {
    const grid = $('[data-grid]', shop);
    const cards = $$('[data-card]', grid);
    cards.forEach((c, i) => { c.dataset.idx = String(i); });
    const st = { colors: new Set(), sizes: new Set(), price: null, sort: 'rec' };
    const apply = () => {
      let n = 0;
      cards.forEach((c) => {
        const cols = (c.dataset.colors || '').split('|');
        const sizes = (c.dataset.sizes || '').split(',');
        const price = Number(c.dataset.price);
        let ok = true;
        if (st.colors.size && !cols.some((x) => st.colors.has(x))) ok = false;
        if (st.sizes.size && !sizes.some((x) => st.sizes.has(x))) ok = false;
        if (st.price && (price < st.price[0] || price >= st.price[1])) ok = false;
        c.hidden = !ok;
        if (ok) n += 1;
      });
      const sorted = cards.slice().sort((a, b) => {
        if (st.sort === 'low') return a.dataset.price - b.dataset.price;
        if (st.sort === 'high') return b.dataset.price - a.dataset.price;
        if (st.sort === 'new') return (b.dataset.new - a.dataset.new) || (a.dataset.idx - b.dataset.idx);
        return a.dataset.idx - b.dataset.idx;
      });
      sorted.forEach((c) => grid.appendChild(c));
      $('[data-result-count]', shop).textContent = tpl(T.results, { n });
      $('[data-empty]', shop).hidden = n > 0;
    };
    shop.addEventListener('click', (e) => {
      const c = e.target.closest('[data-f-color]');
      const s = e.target.closest('[data-f-size]');
      if (c) {
        const v = c.dataset.fColor;
        const on = !st.colors.has(v);
        if (on) st.colors.add(v); else st.colors.delete(v);
        c.setAttribute('aria-pressed', String(on));
        apply();
      }
      if (s) {
        const v = s.dataset.fSize;
        const on = !st.sizes.has(v);
        if (on) st.sizes.add(v); else st.sizes.delete(v);
        s.setAttribute('aria-pressed', String(on));
        apply();
      }
      if (e.target.closest('[data-f-clear]')) {
        st.colors.clear(); st.sizes.clear(); st.price = null;
        $$('[data-f-color],[data-f-size]', shop).forEach((x) => x.setAttribute('aria-pressed', 'false'));
        $$('[data-f-price]', shop).forEach((x) => { x.checked = false; });
        apply();
      }
      if (e.target.closest('[data-filter-open]')) {
        filters.classList.add('is-open');
        if (scrim) scrim.classList.add('is-on');
        html.classList.add('is-locked');
      }
      if (e.target.closest('[data-filter-close]')) closeFilters();
    });
    shop.addEventListener('change', (e) => {
      if (e.target.matches('[data-f-price]')) { st.price = e.target.value.split('-').map(Number); apply(); }
      if (e.target.matches('[data-sort]')) { st.sort = e.target.value; apply(); }
    });
  }

  // ------------------------------------------------------------------ orders (shared by checkout, confirmation, tracking, account)
  const ORDERS = 'lokka_orders';
  const getOrders = () => { const o = store.get(ORDERS, []); return Array.isArray(o) ? o : []; };
  const INST = [{ n: 1, r: 0 }, { n: 2, r: 0 }, { n: 3, r: 0.039 }, { n: 6, r: 0.079 }, { n: 9, r: 0.119 }, { n: 12, r: 0.159 }];
  const shipName = (k) => ({ std: T.shipStd, exp: T.shipExp, pickup: T.shipPickup })[k] || k;
  const payName = (k) => ({ card: T.payCard, bank: T.payBank, cod: T.payCod })[k] || k;
  const dateStr = (ts) => new Date(ts).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  function orderStatus(o) {
    const h = (Date.now() - o.ts) / 36e5;
    return h < 2 ? 0 : h < 24 ? 1 : h < 72 ? 2 : h < 120 ? 3 : 4;
  }
  function coLineHTML(l) {
    const i = lineInfo(l);
    return '<div class="co-line"><img src="' + esc(i.img) + '" alt="" loading="lazy"><div>' + esc(i.name) + '<small>' + esc(i.meta) + '</small><small>' + l.qty + ' × ' + money(i.unit) + '</small></div><span class="price">' + money(i.unit * l.qty) + '</span></div>';
  }
  function sumHTML(t) {
    const row = (a, b, cls) => '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + esc(a) + '</span><span>' + b + '</span></div>';
    return row(T.subtotal, money(t.sub))
      + (t.disc ? row(T.vipLabel + ' (' + (lang === 'tr' ? '%' + S.vip_discount : S.vip_discount + '%') + ')', '−' + money(t.disc), 'disc') : '')
      + row(T.shipping, t.ship ? money(t.ship) : esc(T.free))
      + (t.cod ? row(T.codFee, money(t.cod)) : '')
      + (t.instFee ? row(T.instFee, money(t.instFee, 2)) : '')
      + row(T.total, money(t.total), 'total');
  }
  function timelineHTML(o, cur) {
    return T.st.map((s, i) => {
      const sub = i === 0 && o.pay === 'bank' ? T.stBank : T.stSub[i];
      return '<li class="' + (i < cur ? 'done' : i === cur ? 'now' : '') + '"><div><b>' + esc(s) + '</b><small>' + esc(sub) + '</small></div></li>';
    }).join('');
  }

  // ------------------------------------------------------------------ checkout
  const co = $('[data-checkout]');
  if (co) {
    const form = $('[data-co-form]', co);
    const st = { ship: 'std', pay: 'card', inst: 1, code: sstore.get('lokka_code', '') || '' };
    const prof = store.get('lokka_profile', null);
    const user = store.get('lokka_user', null);
    if (prof) {
      ['name', 'phone', 'email', 'district', 'address', 'zip', 'company', 'taxOffice', 'taxNo'].forEach((k) => { if (prof[k] && form.elements[k]) form.elements[k].value = prof[k]; });
      if (prof.city && form.elements.city) form.elements.city.value = prof.city;
    } else if (user && form.elements.email) form.elements.email.value = user.email;

    const calc = () => {
      const lines = getCart();
      const { sub } = cartTotals(lines);
      const hasCustom = lines.some((l) => l.custom);
      const vip = store.get(VIP, null);
      const codeOk = !!(st.code && vip && vip.code === st.code && !vip.used);
      const disc = codeOk ? round2((sub * S.vip_discount) / 100) : 0;
      const merch = round2(sub - disc);
      const ship = st.ship === 'pickup' ? 0 : st.ship === 'exp' ? S.express_fee : merch >= S.free_shipping_over ? 0 : S.shipping_fee;
      const cod = st.pay === 'cod' ? S.cod_fee : 0;
      const base = round2(merch + ship + cod);
      const rate = st.pay === 'card' ? (INST.find((x) => x.n === st.inst) || INST[0]).r : 0;
      const instFee = round2(base * rate);
      return { lines, sub, disc, merch, ship, cod, base, instFee, total: round2(base + instFee), hasCustom, codeOk };
    };

    const render = () => {
      const t = calc();
      if (!t.lines.length) { co.hidden = true; $('[data-co-empty]').hidden = false; return; }
      $('[data-co-lines]', co).innerHTML = t.lines.map(coLineHTML).join('');
      $('[data-co-sum]', co).innerHTML = sumHTML(t);
      $('[data-co-total]', co).textContent = money(t.total);
      $('[data-ship-std]', co).textContent = t.merch >= S.free_shipping_over ? T.free : money(S.shipping_fee);
      const codOpt = $('[data-cod-opt]', co);
      const codIn = $('input[value="cod"]', codOpt);
      codIn.disabled = t.hasCustom;
      codOpt.classList.toggle('is-disabled', t.hasCustom);
      $('[data-cod-msg]', co).hidden = !t.hasCustom;
      if (t.hasCustom && st.pay === 'cod') { st.pay = 'card'; $('input[value="card"]', co).checked = true; syncPanels(); }
      $('[data-inst-rows]', co).innerHTML = INST.map((x) => {
        const tot = round2(t.base * (1 + x.r));
        return '<tr><td><input type="radio" name="inst" value="' + x.n + '" id="inst-' + x.n + '"' + (x.n === st.inst ? ' checked' : '') + '></td>'
          + '<td><label for="inst-' + x.n + '">' + esc(x.n === 1 ? T.single : tpl(T.inst, { n: x.n })) + '</label></td>'
          + '<td>' + (x.n === 1 ? '—' : money(tot / x.n, 2)) + '</td><td>' + money(tot, 2) + '</td></tr>';
      }).join('');
      const msg = $('[data-code-msg]', co);
      const row = $('[data-code-form]', co);
      let chip = $('.code-chip', co);
      if (t.codeOk) {
        row.hidden = true;
        if (!chip) { chip = document.createElement('div'); chip.className = 'code-chip'; row.after(chip); }
        chip.innerHTML = esc(T.codeApplied) + ': <b>' + esc(st.code) + '</b> <button type="button" data-code-remove>' + esc(T.remove) + '</button>';
      } else {
        row.hidden = false;
        if (chip) chip.remove();
        if (st.code && msg.hidden) { msg.textContent = T.codeBad; msg.hidden = false; }
      }
    };

    const syncPanels = () => {
      $$('[data-pay-panel]', co).forEach((p) => { p.hidden = p.dataset.payPanel !== st.pay; });
      $('[data-address]', co).hidden = st.ship === 'pickup';
      const corp = form.elements.inv.value === 'corp';
      $('[data-corp]', co).hidden = !corp;
      $$('[data-corp-req]', co).forEach((el) => { el.required = corp; });
      $$('[data-card-req]', co).forEach((el) => { el.required = st.pay === 'card'; });
      $$('[data-address] [name="city"], [data-address] [name="district"], [data-address] [name="address"]', co).forEach((el) => { el.required = st.ship !== 'pickup'; });
      $('[data-bill]', co).hidden = form.elements.same.checked;
    };

    form.addEventListener('change', (e) => {
      const n = e.target.name;
      if (n === 'ship') st.ship = e.target.value;
      if (n === 'pay') st.pay = e.target.value;
      if (n === 'inst') st.inst = Number(e.target.value);
      if (['ship', 'pay', 'inv', 'same'].includes(n)) syncPanels();
      if (['ship', 'pay', 'inst'].includes(n)) render();
    });

    // card input formatting
    const brandOf = (d) => (/^4/.test(d) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(d) ? 'MASTERCARD' : /^(9792|65)/.test(d) ? 'TROY' : /^3[47]/.test(d) ? 'AMEX' : '');
    const luhn = (d) => {
      let s = 0;
      let alt = false;
      for (let i = d.length - 1; i >= 0; i--) {
        let n = d.charCodeAt(i) - 48;
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        s += n;
        alt = !alt;
      }
      return d.length >= 13 && s % 10 === 0;
    };
    const cardIn = $('[data-cardno]', co);
    cardIn.addEventListener('input', () => {
      const d = cardIn.value.replace(/\D/g, '').slice(0, 19);
      const amex = /^3[47]/.test(d);
      cardIn.value = amex ? d.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join(' ')) : d.replace(/(\d{4})(?=\d)/g, '$1 ');
      $('[data-card-brand]', co).textContent = brandOf(d);
    });
    const expIn = $('[data-exp]', co);
    expIn.addEventListener('input', (e) => {
      let d = expIn.value.replace(/\D/g, '').slice(0, 4);
      if (d.length === 1 && Number(d) > 1) d = '0' + d;
      expIn.value = d.length > 2 || (d.length === 2 && e.inputType !== 'deleteContentBackward') ? d.slice(0, 2) + '/' + d.slice(2) : d;
    });
    const cvcIn = $('[data-cvc]', co);
    cvcIn.addEventListener('input', () => { cvcIn.value = cvcIn.value.replace(/\D/g, '').slice(0, 4); });
    const taxIn = $('[data-taxno]', co);
    taxIn.addEventListener('input', () => { taxIn.value = taxIn.value.replace(/\D/g, '').slice(0, 11); });

    // discount code
    $('[data-code-form]', co).addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('input[name="code"]', e.target);
      const code = input.value.trim().toUpperCase();
      const msg = $('[data-code-msg]', co);
      const vip = store.get(VIP, null);
      if (!code) return;
      if (vip && vip.code === code && !vip.used) {
        st.code = code;
        sstore.set('lokka_code', code);
        msg.hidden = true;
        toast(T.codeOk);
      } else {
        st.code = '';
        msg.textContent = vip && vip.code === code && vip.used ? T.codeUsed : T.codeBad;
        msg.hidden = false;
      }
      render();
    });
    co.addEventListener('click', (e) => {
      if (!e.target.closest('[data-code-remove]')) return;
      st.code = '';
      sstore.del('lokka_code');
      $('[data-code-msg]', co).hidden = true;
      render();
    });

    // place order
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = $('[data-co-err]', co);
      syncPanels();
      let ok = validate(form);
      let reason = T.errForm;
      if (ok && st.pay === 'card') {
        const d = cardIn.value.replace(/\D/g, '');
        if (!luhn(d)) { ok = false; reason = T.errCard; markField(cardIn, true); cardIn.focus(); }
        else {
          const m = expIn.value.match(/^(\d{2})\/(\d{2})$/);
          const nowD = new Date();
          const valid = m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && (2000 + Number(m[2]) > nowD.getFullYear() || (2000 + Number(m[2]) === nowD.getFullYear() && Number(m[1]) >= nowD.getMonth() + 1));
          if (!valid) { ok = false; reason = T.errExp; markField(expIn, true); expIn.focus(); }
          else if (!/^\d{3,4}$/.test(cvcIn.value)) { ok = false; reason = T.errCvc; markField(cvcIn, true); cvcIn.focus(); }
        }
      }
      if (ok && form.elements.inv.value === 'corp' && !/^\d{10,11}$/.test(taxIn.value)) { ok = false; reason = T.errTax; markField(taxIn, true); taxIn.focus(); }
      if (ok === false && !form.elements.agree.checked && reason === T.errForm && $$('.is-error', form).length === 1) reason = T.errAgree;
      if (!ok) { err.textContent = reason; err.hidden = false; return; }
      err.hidden = true;
      const t = calc();
      if (!t.lines.length) return;
      const F = form.elements;
      const d = new Date();
      const no = 'LK-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(1000 + Math.random() * 9000));
      const digits = cardIn.value.replace(/\D/g, '');
      const order = {
        no, ts: Date.now(), lang, items: t.lines,
        totals: { sub: t.sub, disc: t.disc, ship: t.ship, cod: t.cod, instFee: t.instFee, total: t.total },
        ship: st.ship, pay: st.pay, inst: st.pay === 'card' ? st.inst : 1, code: t.codeOk ? st.code : '',
        card: st.pay === 'card' ? { brand: brandOf(digits), last4: digits.slice(-4) } : null,
        contact: { name: F.name.value.trim(), email: F.email.value.trim().toLowerCase(), phone: F.phone.value.trim() },
        address: st.ship === 'pickup' ? null : { city: F.city.value, district: F.district.value.trim(), address: F.address.value.trim(), zip: F.zip.value.trim() },
        invoice: { type: F.inv.value, company: F.company.value.trim(), taxOffice: F.taxOffice.value.trim(), taxNo: F.taxNo.value.trim(), billAddress: F.same.checked ? '' : F.billAddress.value.trim() },
        note: F.note.value.trim(), iys: F.iys.checked,
      };
      const orders = getOrders();
      orders.unshift(order);
      store.set(ORDERS, orders.slice(0, 30));
      if (t.codeOk) { const vip = store.get(VIP, null); vip.used = true; store.set(VIP, vip); sstore.del('lokka_code'); }
      store.set('lokka_profile', {
        name: order.contact.name, email: order.contact.email, phone: order.contact.phone,
        city: F.city.value, district: F.district.value.trim(), address: F.address.value.trim(), zip: F.zip.value.trim(),
        company: order.invoice.company, taxOffice: order.invoice.taxOffice, taxNo: order.invoice.taxNo,
      });
      if (!store.get('lokka_user', null)) store.set('lokka_user', { email: order.contact.email, since: Date.now() });
      store.set('lokka_last', no);
      sstore.set('lokka_last', no);
      store.set(CART, []);
      go(href('confirm', '?no=' + encodeURIComponent(no)));
    });

    syncPanels();
    render();
  }

  // ------------------------------------------------------------------ order confirmation
  const cf = $('[data-confirm]');
  if (cf) {
    const no = qs.get('no') || sstore.get('lokka_last', '') || store.get('lokka_last', '');
    const o = getOrders().find((x) => x.no === no);
    if (!o) $('[data-cf-empty]', cf).hidden = false;
    else {
      $('[data-cf-ok]', cf).hidden = false;
      $('[data-cf-body]', cf).hidden = false;
      const first = (o.contact.name || '').split(' ')[0];
      $('[data-cf-title]', cf).textContent = first ? tpl(T.thanks, { name: first }) : (lang === 'tr' ? 'Teşekkürler!' : 'Thank you!');
      $('[data-cf-lead]', cf).textContent = o.pay === 'bank' ? T.cfLeadBank : T.cfLead;
      $('[data-cf-no]', cf).textContent = o.no;
      if (o.pay === 'bank') {
        $('[data-cf-bank]', cf).hidden = false;
        $('[data-cf-ref]', cf).textContent = o.no;
        $('[data-cf-amount]', cf).textContent = money(o.totals.total, 2);
      }
      $('[data-cf-timeline]', cf).innerHTML = timelineHTML(o, 0);
      const custom = o.items.some((l) => l.custom);
      const wa = $('[data-cf-wa]', cf);
      wa.href = waLink(tpl(custom ? T.waDesignMsg : T.waOrderMsg, { no: o.no }));
      $('[data-cf-wa-text]', cf).textContent = custom ? T.waDesign : T.waOrder;
      $('[data-cf-track]', cf).href = href('track', '?no=' + encodeURIComponent(o.no));
      $('[data-cf-lines]', cf).innerHTML = o.items.map(coLineHTML).join('');
      $('[data-cf-sum]', cf).innerHTML = sumHTML(o.totals);
      const addr = o.address ? [o.address.address, o.address.district + ' / ' + o.address.city].join(', ') : (lang === 'tr' ? 'Turgutreis atölyesi' : 'Turgutreis workshop');
      const pay = payName(o.pay) + (o.card && o.card.last4 ? ' · ' + (o.card.brand ? o.card.brand + ' ' : '') + '•••• ' + o.card.last4 : '') + (o.inst > 1 ? ' · ' + tpl(T.inst, { n: o.inst }) : '');
      $('[data-cf-info]', cf).innerHTML = '<dt>' + esc(T.delivery) + '</dt><dd>' + esc(shipName(o.ship)) + '<br>' + esc(addr) + '</dd>'
        + '<dt>' + esc(T.payment) + '</dt><dd>' + esc(pay) + '</dd>'
        + '<dt>' + esc(T.contact) + '</dt><dd>' + esc(o.contact.email) + '<br>' + esc(o.contact.phone) + '</dd>'
        + '<dt>' + esc(T.invoice) + '</dt><dd>' + esc(o.invoice.type === 'corp' ? T.corp + ' · ' + o.invoice.company : T.ind) + '</dd>';
      $('[data-copy-order]', cf).addEventListener('click', async () => { if (await copyText(o.no)) toast(T.copied + ': ' + o.no); });
    }
  }

  // ------------------------------------------------------------------ order tracking
  const tf = $('[data-track-form]');
  if (tf) {
    const DEMO_NO = 'LK-261020-4821';
    const demo = () => ({
      no: DEMO_NO, ts: Date.now() - 50 * 36e5, pay: 'card', ship: 'std',
      items: [{ key: 'a', id: 'turgutreis-tisort', color: 'lacivert', size: 'M', qty: 2 }, { key: 'b', id: 'bodrum-sunset-sweatshirt', color: 'ekru', size: 'L', qty: 1 }],
    });
    const input = $('input[name="no"]', tf);
    const show = (no) => {
      const n = no.trim().toUpperCase();
      const err = $('[data-track-err]', tf);
      const o = n === DEMO_NO ? demo() : getOrders().find((x) => x.no === n);
      const box = $('[data-track-result]');
      if (!o) { err.textContent = T.notFound; err.hidden = false; box.hidden = true; $('[data-track-help]').hidden = false; return; }
      err.hidden = true;
      const cur = orderStatus(o);
      $('[data-tr-no]', box).textContent = o.no;
      $('[data-tr-date]', box).textContent = T.placed + ': ' + dateStr(o.ts);
      $('[data-tr-timeline]', box).innerHTML = timelineHTML(o, cur);
      $('[data-tr-lines]', box).innerHTML = o.items.map(coLineHTML).join('');
      $('[data-tr-wa]', box).href = waLink(tpl(T.waOrderMsg, { no: o.no }));
      box.hidden = false;
      $('[data-track-help]').hidden = true;
    };
    tf.addEventListener('submit', (e) => { e.preventDefault(); if (validate(tf)) show(input.value); });
    $('[data-track-demo]', tf).addEventListener('click', () => { input.value = DEMO_NO; show(DEMO_NO); });
    const pre = qs.get('no') || sstore.get('lokka_last', '');
    if (pre) { input.value = pre; show(pre); }
  }

  // ------------------------------------------------------------------ account
  const acc = $('[data-account]');
  if (acc) {
    const renderAcc = () => {
      const user = store.get('lokka_user', null);
      $('[data-acc-out]', acc).hidden = !!user;
      $('[data-acc-in]', acc).hidden = !user;
      if (!user) return;
      const prof = store.get('lokka_profile', null);
      $('[data-acc-email]', acc).textContent = user.email;
      const first = prof && prof.email === user.email && prof.name ? prof.name.split(' ')[0] : '';
      $('[data-acc-name]', acc).textContent = first ? ', ' + first : '';
      const orders = getOrders().filter((o) => (o.contact.email || '').toLowerCase() === user.email.toLowerCase());
      $('[data-acc-orders]', acc).innerHTML = orders.length ? orders.map((o) => {
        const s = orderStatus(o);
        const thumbs = o.items.slice(0, 6).map((l) => '<img src="' + esc(lineInfo(l).img) + '" alt="" loading="lazy">').join('');
        return '<div class="order-card"><div><b class="kbd">' + esc(o.no) + '</b><small>' + esc(dateStr(o.ts)) + ' · ' + o.items.reduce((a, l) => a + l.qty, 0) + ' ' + esc(T.items) + ' · ' + money(o.totals.total) + '</small></div>'
          + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="pill' + (s < 4 ? ' pill--now' : '') + '">' + esc(T.st[s]) + '</span><a class="link-u" style="font-size:var(--fs-xs)" href="' + esc(href('track', '?no=' + encodeURIComponent(o.no))) + '">' + esc(T.track) + '</a></div>'
          + '<div class="thumbs-row">' + thumbs + '</div></div>';
      }).join('') : '<p class="muted" style="margin:0">' + esc(T.noOrders) + ' <a class="link-u" style="font-size:var(--fs-xs)" href="' + esc(href('shop')) + '">' + esc(T.shop) + '</a></p>';
      const vip = store.get(VIP, null);
      $('[data-acc-vip]', acc).innerHTML = vip
        ? '<button class="vip-code" type="button" data-copy-code><span data-code>' + esc(vip.code) + '</span> <small>' + esc(lang === 'tr' ? 'Kopyala' : 'Copy') + '</small></button> <span class="pill' + (vip.used ? '' : ' pill--now') + '" style="margin-left:10px">' + esc(vip.used ? T.vipUsed : T.vipActive) + '</span>'
        : '<p class="muted" style="margin:0">' + esc(T.noVip) + ' <a class="link-u" style="font-size:var(--fs-xs)" href="' + esc(href('vip')) + '">' + esc(T.joinVip) + '</a></p>';
      $('[data-acc-addr]', acc).innerHTML = prof && prof.address
        ? '<p style="margin:0">' + esc(prof.name) + '<br>' + esc(prof.address) + '<br>' + esc(prof.district + ' / ' + prof.city) + '<br>' + esc(prof.phone) + '</p>'
        : '<p class="muted" style="margin:0">' + esc(T.noAddr) + '</p>';
    };
    $('[data-login-form]', acc).addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('input[type="email"]', e.target);
      const email = inp.value.trim().toLowerCase();
      const err = $('[data-login-err]', acc);
      if (!EMAIL_RE.test(email)) { err.textContent = T.errEmail; err.hidden = false; markField(inp, true); return; }
      err.hidden = true;
      store.set('lokka_user', { email, since: Date.now() });
      toast(T.signedIn);
      renderAcc();
    });
    $('[data-logout]', acc).addEventListener('click', () => { store.del('lokka_user'); toast(T.signedOut); renderAcc(); });
    renderAcc();
  }

  // ------------------------------------------------------------------ small page utilities
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-print]')) window.print();
    if (e.target.closest('[data-copy-url]')) { if (await copyText(location.href)) toast(T.copied); }
  });
  const shareWa = $('[data-share-wa]');
  if (shareWa) shareWa.href = 'https://wa.me/?text=' + encodeURIComponent(document.title.split(' | ')[0] + (OFF ? '' : ' ' + location.href));
  if (OFF) $$('[data-copy-url]').forEach((b) => { b.hidden = true; });

  // keep header counters in sync when another tab changes the cart
  window.addEventListener('storage', (e) => {
    if (e.key === CART) renderCart();
    if (e.key === FAV) syncFavs();
  });
  document.addEventListener('lokka:cart-changed', renderCart);

  renderCart();
  syncFavs();
})();
