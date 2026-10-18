/* Customer QR ordering app. mountCustomer(root) returns a destroy() function. */
window.mountCustomer = function mountCustomer(root) {
  const { creditHTML, esc, rupees, itemLabel, maskMobile, STATUS, groupMenu, toast, store, img, shortDate, invoiceHTML, printInvoice, openModal } = window.MC;
  const M = window.Motion;
  const params = Nav.params();
  const table = Number(params.get('table'));
  const key = params.get('k') || '';
  const S = {
    session: null, menu: null, groups: [], orders: [], cart: {}, pick: {}, note: '',
    search: '', view: 'menu', trackId: null, cat: null, placing: false, settings: {}, seenIdx: {},
  };
  const timers = [];
  let live = null, destroyed = false, heroObs = null;
  const cartKey = 'mc_cart_' + table;
  const sessKey = 'mc_session_' + table;

  const ICON_SEARCH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const ICON_BAG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';
  const STEPS = [
    ['Order received', 'Sent to the cafe'], ['Order approved', 'The cafe accepted your order'],
    ['Preparing', 'Your food is being made'], ['Ready', 'On its way to your table'], ['Served', 'Enjoy your meal'],
  ];
  const ORDER_IDX = { PENDING: 0, APPROVED: 1, PREPARING: 2, READY: 3, SERVED: 4 };
  const STATUS_COPY = {
    PENDING: ['wait', 'Waiting for confirmation', 'Your order has been sent to the cafe.'],
    APPROVED: ['good', 'Order confirmed', 'The cafe has accepted your order. The kitchen starts shortly.'],
    PREPARING: ['good', 'Being prepared', 'Your food is being made fresh.'],
    READY: ['good', 'Your order is ready', 'It will be at your table in a moment.'],
    SERVED: ['good', 'Served', 'Enjoy your meal. You can order more from the menu.'],
    REJECTED: ['bad', 'Sorry, your order could not be accepted.', 'Please speak to the cafe staff for help.'],
  };
  const brandBlock = `<div class="brand c-word m-in" style="--d:0">Maitri<small>CAFE</small></div><p class="c-tagline m-in" style="--d:1">Good food ~ Good vibes ~ Always</p>`;

  // ---------- boot ----------
  boot();
  async function boot() {
    if (!Number.isInteger(table) || table < 1 || table > 99) return message('Scan the QR code on your table', 'Each table has its own code. Point your phone camera at it to open the menu.');
    skeleton();
    let verify;
    try {
      verify = await API.get(`/tables/${table}/verify?k=${encodeURIComponent(key)}`);
    } catch (e) {
      return message('This QR code is not valid', e.status === 0 ? e.message : 'Ask the cafe staff for help, or scan the code on your table again.');
    }
    S.cart = store.get(cartKey, {});
    const saved = store.get(sessKey);
    if (saved && saved.token) {
      API.setSessionToken(saved.token);
      try {
        const s = await API.get('/session');
        S.session = { ...saved, customer: s.customer };
        S.orders = s.orders;
      } catch (e) { store.del(sessKey); API.setSessionToken(null); }
    }
    if (!S.session) return verify.in_use ? blocked() : welcome();
    start();
  }

  function skeleton() {
    root.innerHTML = `<div class="c-shell" aria-busy="true"><header class="c-hero"><div class="c-hero-in"><div>${brandBlock}</div>
      <div class="tent sk-tent"><span>TABLE</span><strong>${Number.isInteger(table) ? table : ''}</strong></div></div></header>
      <div class="c-main"><div class="sk sk-line" style="width:60%"></div><div class="type-grid">${'<div class="sk sk-tile"></div>'.repeat(6)}</div></div></div>`;
  }

  function splashDone() { if (window.MCSplash) MCSplash.hide(); }
  function message(title, body, action) {
    splashDone();
    root.innerHTML = `<div class="screen-msg"><div><div class="brand m-in" style="--d:0">Maitri</div><h1 class="m-in" style="--d:1">${esc(title)}</h1><p class="m-in" style="--d:2">${esc(body)}</p>${action ? `<div class="m-in" style="--d:3">${action}</div>` : ''}</div>${creditHTML('credit-screen')}</div>`;
  }

  // ---------- table already taken ----------
  function blocked() {
    splashDone();
    root.innerHTML = `<div class="welcome">
        <div class="welcome-top">${brandBlock}</div>
        <div class="welcome-card m-sheet"><div>
          <div class="seat seat-busy m-in" style="--d:2"><strong>${table}</strong><p><b>This table is already taken</b>Another guest has started ordering at Table ${table}.</p></div>
          <p class="m-in" style="--d:3;margin:0">Only one person can order per table. Please ask the person who scanned first to add your items, or ask the staff for help.</p>
          <button class="btn btn-ghost btn-lg btn-block m-in" style="--d:4" data-act="recheck">Check again</button>
          <button class="link-btn m-in" style="--d:5;justify-self:center" data-act="its-me">I started the order on another phone</button>
          ${creditHTML()}
        </div></div></div>`;
  }
  function ended() {
    timers.splice(0).forEach(clearInterval);
    if (live) { live.close(); live = null; }
    if (heroObs) { heroObs.disconnect(); heroObs = null; }
    store.del(sessKey); store.del(cartKey); API.setSessionToken(null);
    S.session = null; S.orders = []; S.cart = {};
    document.querySelectorAll('.scrim').forEach(x => x.remove());
    M.vt(() => message('Thank you for visiting!', `Table ${table} has been closed by the staff. We hope to see you again soon.`,
      '<button class="btn btn-ghost" data-act="recheck">Start a new order</button>'));
  }

  // ---------- welcome ----------
  function welcome() {
    splashDone();
    root.innerHTML = `
      <div class="welcome">
        <div class="welcome-top">${brandBlock}<div class="welcome-steam" aria-hidden="true"><i></i><i></i><i></i></div></div>
        <div class="welcome-card m-sheet"><div>
          <div class="seat m-in" style="--d:2"><strong>${table}</strong><p><b>You’re at Table ${table}</b>Your order comes straight to this table.</p></div>
          <form id="wf" novalidate style="display:grid;gap:16px">
            <div class="field m-in" style="--d:3"><label for="wn">Your name</label>
              <input id="wn" class="input" name="name" autocomplete="given-name" maxlength="40" required placeholder="e.g. Rahul" enterkeyhint="next"></div>
            <div class="field m-in" style="--d:4"><label for="wm">Mobile number</label>
              <div class="input-prefix"><span>+91</span><input id="wm" class="input" name="mobile" inputmode="numeric" autocomplete="tel-national" maxlength="10" required placeholder="10-digit number" enterkeyhint="go"></div></div>
            <p class="err" id="we" role="alert"></p>
            <button class="btn btn-saffron btn-lg btn-block m-in" style="--d:5" type="submit"><span>See the menu</span></button>
            <p class="fineprint m-in" style="--d:6">No account or password needed. We use your number only to reach you about this order.</p>
          </form>
          ${creditHTML()}
        </div></div>
      </div>`;
    const f = root.querySelector('#wf');
    const m = f.querySelector('#wm');
    m.addEventListener('input', () => { m.value = m.value.replace(/\D/g, '').slice(0, 10); });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const name = f.name.value.trim(), mobile = m.value.trim();
      const err = f.querySelector('#we');
      const fail = (msg, el) => { err.textContent = msg; M.bump(el || err, 'm-shake'); M.haptic(30); };
      if (name.length < 2) return fail('Enter your name.', f.name.closest('.field'));
      if (!/^[6-9]\d{9}$/.test(mobile)) return fail('Enter a valid 10-digit mobile number.', m.closest('.field'));
      err.textContent = '';
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.classList.add('is-loading');
      try {
        const s = await API.post('/session', { table, k: key, name, mobile });
        S.session = { token: s.token, customer: s.customer };
        store.set(sessKey, S.session);
        API.setSessionToken(s.token);
        start();
      } catch (e) {
        fail(e.message); btn.disabled = false; btn.classList.remove('is-loading');
      }
    });
  }

  // ---------- main ----------
  async function start() {
    API.get('/settings').then(x => { S.settings = x; }).catch(() => {});
    try { S.menu = await API.get('/menu'); }
    catch (e) { return message('The menu could not load', e.message, '<button class="btn btn-ghost" data-act="recheck">Try again</button>'); }
    S.groups = groupMenu(S.menu);
    pruneCart(false);
    live = API.connect({ sessionToken: S.session.token });
    live.on('order:update', onOrderUpdate);
    live.on('session:ended', ended);
    live.on('menu:update', menu => {
      S.menu = menu; S.groups = groupMenu(menu);
      if (S.cat && !S.groups.some(g => g.slug === S.cat)) S.cat = null;
      pruneCart(true);
      if (S.view === 'menu') { renderChips(); renderMain(); }
    });
    // Automatic refresh: order status every 4 s while the page is visible, menu every minute.
    timers.push(setInterval(() => { if (!document.hidden) refreshOrders(); }, 4000));
    timers.push(setInterval(() => { if (!document.hidden) refreshMenu(); }, 60000));
    S.view = 'menu';
    M.vt(renderMenuShell);
  }

  let lastMenuSig = '';
  async function refreshMenu() {
    try {
      const menu = await API.get('/menu');
      const sig = JSON.stringify(menu);
      if (!lastMenuSig) { lastMenuSig = JSON.stringify(S.menu); }
      if (sig === lastMenuSig) return;
      lastMenuSig = sig;
      S.menu = menu; S.groups = groupMenu(menu);
      if (S.cat && !S.groups.some(g => g.slug === S.cat)) S.cat = null;
      pruneCart(true);
      if (S.view === 'menu' && !document.querySelector('#cart-scrim')) { renderChips(); renderMain(); }
    } catch (e) { /* try again next minute */ }
  }
  let refreshing = false;
  async function refreshOrders() {
    if (refreshing) return;
    refreshing = true;
    try { await refreshOrdersNow(); } finally { refreshing = false; }
  }
  async function refreshOrdersNow() {
    try {
      const s = await API.get('/session');
      s.orders.forEach(o => onOrderUpdate(o));
    } catch (e) { if (e.status === 401) ended(); }
  }

  function onOrderUpdate(o) {
    const i = S.orders.findIndex(x => x.id === o.id);
    const prev = i >= 0 ? S.orders[i] : null;
    if (i >= 0) S.orders[i] = o; else S.orders.unshift(o);
    const changed = prev && prev.status !== o.status;
    if (changed) {
      toast(`#${o.order_number}: ${STATUS_COPY[o.status][1]}`, o.status === 'REJECTED' ? 'chilli' : 'leaf', 4500);
      M.haptic(o.status === 'READY' ? [60, 60, 60] : 40);
    }
    if (S.view === 'track') { if (changed || !prev) M.vt(() => renderTrack()); }
    else renderStrip(changed);
  }

  function pruneCart(announce) {
    const byId = Object.fromEntries(S.menu.items.map(i => [i.id, i]));
    const removed = [];
    for (const id of Object.keys(S.cart)) {
      const it = byId[id];
      if (!it || !it.available) { if (it) removed.push(itemLabel(it)); delete S.cart[id]; }
    }
    saveCart();
    if (announce && removed.length) toast(`${removed.join(', ')} ${removed.length > 1 ? 'are' : 'is'} now unavailable and was removed from your cart.`, 'chilli', 5000);
  }
  const saveCart = () => store.set(cartKey, S.cart);
  const itemById = id => S.menu.items.find(i => i.id === Number(id));
  const cartLines = () => Object.entries(S.cart).map(([id, qty]) => ({ item: itemById(id), qty })).filter(l => l.item);
  const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);
  const cartTotal = () => cartLines().reduce((s, l) => s + l.qty * l.item.price, 0);
  function setQty(id, qty) {
    const it = itemById(id);
    if (!it || !it.available) return false;
    qty = Math.max(0, Math.min(25, qty));
    if (qty === 0) delete S.cart[id]; else S.cart[id] = qty;
    saveCart();
    return true;
  }

  function renderMenuShell() {
    splashDone();
    const c = S.session.customer;
    root.innerHTML = `
      <div class="c-shell">
        <header class="c-hero" id="hero"><div class="c-hero-in">
          <div>
            ${brandBlock}
            <p class="c-greet m-in" style="--d:2">Hi <b>${esc(c.name.split(' ')[0])}</b>, what are you having today? <button class="not-me" data-act="not-me">Not you?</button></p>
          </div>
          <div class="tent m-drop" aria-label="Table ${table}"><span>TABLE</span><strong>${table}</strong></div>
        </div></header>
        <div class="c-bar" id="cbar"><div class="c-bar-in">
          <label class="search"><span class="sr-only">Search the menu</span>${ICON_SEARCH}
            <input class="input" id="q" type="search" placeholder="Search burgers, momos, shakes…" autocomplete="off" enterkeyhint="search" value="${esc(S.search)}">
            <span class="mini-tbl" aria-hidden="true">T${table}</span></label>
          <nav class="cats" aria-label="Menu types" id="cats"></nav>
        </div></div>
        <div id="strip-host" class="strip-host"></div>
        <main class="c-main with-cart" id="main"><div class="c-menu" id="menu"></div><aside class="cart-panel" id="cart-panel" aria-label="Your cart"></aside></main>
        ${creditHTML('credit-menu')}
        <div id="fab-host"></div>
      </div>`;
    const q = root.querySelector('#q');
    let qt;
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { S.search = q.value; renderChips(); renderMain(); }, 120); });
    // Compact sticky bar once the hero scrolls away.
    if (heroObs) heroObs.disconnect();
    if ('IntersectionObserver' in window) {
      heroObs = new IntersectionObserver(([e]) => { const b = root.querySelector('#cbar'); if (b) b.classList.toggle('stuck', !e.isIntersecting); }, { rootMargin: '-40px 0px 0px 0px' });
      heroObs.observe(root.querySelector('#hero'));
    }
    renderChips();
    renderMain();
    renderStrip();
  }

  function renderStrip(animate) {
    const host = root.querySelector('#strip-host');
    if (!host) return;
    const latest = S.orders[0];
    const o = S.orders.find(x => !['SERVED', 'REJECTED'].includes(x.status)) ||
      (latest && latest.status === 'REJECTED' && (Date.now() - new Date(latest.updated_at)) < 15 * 60e3 ? latest : null);
    host.innerHTML = o ? `<button class="order-strip ${animate ? 'm-pop' : 'm-in'}" data-act="track" data-id="${o.id}">
        ${o.status === 'PENDING' ? '<span class="pulse"></span>' : '<span class="strip-ic" aria-hidden="true">✓</span>'}
        <span class="grow"><b>Order #${esc(o.order_number)}</b><small>${esc(STATUS_COPY[o.status][1])}</small></span>
        <span class="badge tone-${STATUS[o.status].tone}">${esc(STATUS[o.status].short)}</span></button>` : '';
  }

  const matches = name => { const q = S.search.trim().toLowerCase(); return !q || name.toLowerCase().includes(q); };
  function pickedVariant(e) {
    const avail = e.variants.filter(v => v.available);
    const pickId = S.pick[e.key] && e.variants.find(v => v.id === S.pick[e.key]) ? S.pick[e.key] : (avail[0] || e.variants[0]).id;
    return e.variants.find(v => v.id === pickId);
  }
  function controlHTML(item, anim) {
    if (!item.available) return '<span class="off-label">Currently unavailable</span>';
    const qty = S.cart[item.id] || 0;
    return qty
      ? `<div class="stepper ${anim === 'pop' ? 'm-pop' : ''}" role="group" aria-label="Quantity of ${esc(itemLabel(item))}"><button data-act="dec" data-id="${item.id}" aria-label="Remove one">−</button><output aria-live="polite" class="${anim === 'num' ? 'm-num' : ''}">${qty}</output><button data-act="inc" data-id="${item.id}" aria-label="Add one">+</button></div>`
      : `<button class="add-btn ${anim === 'pop' ? 'm-pop' : ''}" data-act="inc" data-id="${item.id}" aria-label="Add ${esc(itemLabel(item))}">ADD<span aria-hidden="true">+</span></button>`;
  }
  function entryHTML(e, i, still) {
    let item, variantsHTML = '', note = '';
    if (e.variants) {
      item = pickedVariant(e);
      variantsHTML = `<div class="variants" role="group" aria-label="Choose style for ${esc(e.name)}">${e.variants.map(v =>
        `<button data-act="variant" data-key="${e.key}" data-id="${v.id}" aria-pressed="${v.id === item.id}" ${v.available ? '' : 'disabled title="Currently unavailable"'}>${esc(v.variant)}<small>${rupees(v.price)}</small></button>`).join('')}</div>`;
      const inCart = e.variants.filter(v => S.cart[v.id]).map(v => `${v.variant} × ${S.cart[v.id]}`);
      if (inCart.length) note = `<div class="in-cart-note">In cart: ${esc(inCart.join(', '))}</div>`;
    } else item = e.item;
    const off = !item.available;
    return `<article class="item ${off ? 'off' : ''} ${still ? '' : 'm-rise'}" style="--i:${Math.min(i || 0, 12)}" data-key="${e.key}">
      <div><h3><span class="veg" title="Vegetarian"></span>${esc(e.name)}</h3><div class="price">${rupees(item.price)}</div>${variantsHTML}<div class="note-slot">${note}</div></div>
      <div class="item-pic"><img src="${esc(img(e.image))}" alt="" loading="lazy" decoding="async" width="104" height="92"><div class="ctl" data-ctl="${item.id}">${controlHTML(item)}</div></div></article>`;
  }

  // Update just one item card after +/− (no full re-render: fast and keeps animations smooth).
  function refreshEntry(itemId, anim) {
    const entry = findEntry(itemId);
    if (!entry) return;
    root.querySelectorAll(`.item[data-key="${entry.key}"]`).forEach(card => {
      const item = entry.variants ? pickedVariant(entry) : entry.item;
      const ctl = card.querySelector('.ctl');
      if (ctl) { ctl.dataset.ctl = item.id; ctl.innerHTML = controlHTML(item, anim); }
      if (entry.variants) {
        const inCart = entry.variants.filter(v => S.cart[v.id]).map(v => `${v.variant} × ${S.cart[v.id]}`);
        card.querySelector('.note-slot').innerHTML = inCart.length ? `<div class="in-cart-note m-in">In cart: ${esc(inCart.join(', '))}</div>` : '';
      }
    });
  }
  function findEntry(itemId) {
    for (const g of S.groups) for (const e of g.entries) {
      if (e.item && e.item.id === Number(itemId)) return e;
      if (e.variants && e.variants.some(v => v.id === Number(itemId))) return e;
    }
    return null;
  }

  function renderChips() {
    const host = root.querySelector('#cats');
    if (!host) return;
    const searching = !!S.search.trim();
    host.innerHTML = `<button class="cat cat-all" data-act="types" aria-current="${!S.cat && !searching}">All types</button>` +
      S.groups.filter(g => g.entries.length).map(g => `<button class="cat" data-act="cat" data-slug="${esc(g.slug)}" aria-current="${S.cat === g.slug && !searching}"><img src="${esc(img(g.image))}" alt="" width="32" height="32" decoding="async">${esc(g.name)}</button>`).join('');
    const on = host.querySelector('[aria-current="true"]');
    if (on) {
      const l = on.offsetLeft - host.clientWidth / 2 + on.clientWidth / 2;
      host.scrollTo({ left: l, behavior: M.on() ? 'smooth' : 'auto' });
    }
  }

  function typeGridHTML(heroSlug) {
    const groups = S.groups.filter(g => g.entries.length);
    if (!groups.length) return '<div class="empty"><h2>The menu is being updated</h2><p>Please check back in a minute or ask the staff.</p></div>';
    return `<div><div class="types-head m-in"><h2>What would you like?</h2><p>Choose a type to see its items.</p></div>
      <div class="type-grid">${groups.map((g, i) => {
        const prices = g.entries.flatMap(e => (e.variants || [e.item]).filter(x => x.available).map(x => x.price));
        return `<button class="type-tile m-rise" style="--i:${Math.min(i, 12)}" data-act="cat" data-slug="${esc(g.slug)}">
          <span class="tt-img"><img src="${esc(img(g.image))}" alt="" ${i > 5 ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" width="240" height="180" ${g.slug === heroSlug ? 'style="view-transition-name:hero-img"' : ''}></span>
          <span class="tt-body"><b>${esc(g.name)}</b><small>${g.entries.length} ${g.entries.length === 1 ? 'item' : 'items'}${prices.length ? ' · from ' + rupees(Math.min(...prices)) : ' · unavailable'}</small></span>
          <span class="tt-go" aria-hidden="true">→</span></button>`;
      }).join('')}</div></div>`;
  }

  function sectionHTML(g, entries, withBack, hero) {
    return `<section class="c-section" data-slug="${esc(g.slug)}">
      ${withBack ? '<button class="back-link" data-act="types"><span aria-hidden="true">←</span> All types</button>' : ''}
      <div class="c-banner"><div><h2>${esc(g.name)}</h2><p>${entries.length} ${entries.length === 1 ? 'item' : 'items'}</p></div><img src="${esc(img(g.image))}" alt="${esc(g.name)}" width="240" height="180" decoding="async" ${hero ? 'style="view-transition-name:hero-img"' : ''}></div>
      <div class="items">${entries.map((e, i) => entryHTML(e, i)).join('')}</div></section>`;
  }

  function renderMain(heroSlug) {
    const menuEl = root.querySelector('#menu');
    if (!menuEl) return;
    const q = S.search.trim();
    if (q) {
      const html = S.groups.map(g => {
        const entries = g.entries.filter(e => matches(e.name) || matches(g.name));
        return entries.length ? sectionHTML(g, entries, false) : '';
      }).join('');
      menuEl.innerHTML = html || `<div class="empty m-in"><h2>Nothing matches “${esc(q)}”</h2><p>Try another word, like “paneer” or “shake”.</p></div>`;
    } else if (!S.cat) {
      menuEl.innerHTML = typeGridHTML(heroSlug);
    } else {
      const g = S.groups.find(x => x.slug === S.cat);
      menuEl.innerHTML = g ? sectionHTML(g, g.entries, true, true) : typeGridHTML();
    }
    renderCart();
  }

  function scrollToMenu() {
    const bar = root.querySelector('.c-bar'), menu = root.querySelector('#menu');
    if (!bar || !menu) return;
    const top = menu.getBoundingClientRect().top + window.scrollY - bar.offsetHeight - 12;
    if (Math.abs(window.scrollY - top) > 4 && window.scrollY > top - 400) window.scrollTo({ top, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  }

  // Type tile -> category page: the photo morphs into the banner.
  function showType(slug, sourceImg) {
    const from = S.cat;
    if (from === slug && !S.search.trim()) return;
    if (sourceImg) sourceImg.style.viewTransitionName = 'hero-img';
    M.vt(() => {
      if (sourceImg) sourceImg.style.viewTransitionName = '';
      S.cat = slug; S.search = '';
      const q = root.querySelector('#q'); if (q) q.value = '';
      renderChips();
      renderMain(slug ? null : from);
      scrollToMenu();
    }, slug ? 'vt-forward' : 'vt-back').then(() => {
      // Clear the shared name so the next transition starts clean.
      root.querySelectorAll('[style*="view-transition-name"]').forEach(el => { if (el.closest('.type-grid')) el.style.viewTransitionName = ''; });
    });
  }

  // ---------- cart ----------
  function cartBodyHTML() {
    const lines = cartLines();
    if (!lines.length) return '<div class="empty cart-empty"><div class="empty-ic" aria-hidden="true">' + ICON_BAG + '</div><h2>Your cart is empty</h2><p>Tap ADD on anything you like.</p></div>';
    return lines.map(l => `<div class="line" data-line="${l.item.id}">
        <div><div class="name">${esc(itemLabel(l.item))}</div><div class="each">${rupees(l.item.price)} each</div></div>
        <div class="stepper" role="group" aria-label="Quantity"><button data-act="dec" data-id="${l.item.id}" aria-label="Remove one">−</button><output>${l.qty}</output><button data-act="inc" data-id="${l.item.id}" aria-label="Add one">+</button></div>
        <div class="each">${l.qty} × ${rupees(l.item.price)}</div><div class="amt">${rupees(l.qty * l.item.price)}</div></div>`).join('');
  }
  function cartFootHTML() {
    const c = S.session.customer, total = cartTotal(), n = cartCount();
    return `<label class="field" style="margin-bottom:12px"><span class="sr-only">Cooking instructions</span>
        <textarea class="input note-input" data-note rows="1" maxlength="200" placeholder="Cooking instructions (optional)">${esc(S.note)}</textarea></label>
      <div class="meta"><div><span>Table</span><b>${table}</b></div><div><span>Name</span><b>${esc(c.name)}</b></div><div><span>Mobile</span><b>${esc(maskMobile(c.mobile))}</b></div></div>
      <div class="totals"><div><span>Items</span><span class="num">${n}</span></div><div class="grand"><span>Subtotal</span><span class="num" data-total>${rupees(total)}</span></div></div>
      <button class="btn btn-saffron btn-lg btn-block place-btn ${S.placing ? 'is-loading' : ''}" style="margin-top:14px" data-act="place" ${n && !S.placing ? '' : 'disabled'}><span>Place order · ${rupees(total)}</span></button>`;
  }

  function renderCart() {
    const n = cartCount(), total = cartTotal();
    const panel = root.querySelector('#cart-panel');
    if (panel) {
      panel.innerHTML = `<div class="sheet-head"><h2 style="font-size:20px">Your order</h2><span class="badge tone-muted">Table ${table}</span></div>
        <div class="sheet-body">${cartBodyHTML()}</div>${n ? `<div class="sheet-foot" style="border-radius:0 0 18px 18px">${cartFootHTML()}</div>` : ''}`;
      bindNote(panel);
    }
    const host = root.querySelector('#fab-host');
    if (host) {
      let fab = host.querySelector('.cart-fab');
      if (!n) { if (fab) { fab.classList.add('m-out'); setTimeout(() => { if (!cartCount()) host.innerHTML = ''; }, 220); } }
      else {
        if (!fab || fab.classList.contains('m-out')) {
          host.innerHTML = `<button class="cart-fab has-panel" data-act="open-cart"><span class="fab-ic">${ICON_BAG}<i data-count>${n}</i></span><span class="fab-txt"><b><span data-n>${n} ${n === 1 ? 'item' : 'items'}</span> · <span data-total>${rupees(total)}</span></b><small>Table ${table}</small></span><span class="go">View cart</span></button>`;
          fab = host.querySelector('.cart-fab');
          fab.querySelector('[data-total]')._mv = total;
        } else {
          fab.querySelector('[data-n]').textContent = `${n} ${n === 1 ? 'item' : 'items'}`;
          const c = fab.querySelector('[data-count]');
          if (c.textContent !== String(n)) { c.textContent = n; M.bump(c, 'm-num'); }
          M.countTo(fab.querySelector('[data-total]'), total, rupees);
        }
      }
    }
    const sheet = document.querySelector('#cart-sheet');
    if (sheet) {
      sheet.querySelector('.sheet-body').innerHTML = cartBodyHTML();
      const foot = sheet.querySelector('.sheet-foot');
      if (n) { foot.hidden = false; foot.innerHTML = cartFootHTML(); bindNote(foot); } else foot.hidden = true;
    }
  }
  function bindNote(scope) {
    const t = scope.querySelector('[data-note]');
    if (t) t.addEventListener('input', () => { S.note = t.value; });
  }

  function openCart() {
    if (document.querySelector('#cart-scrim')) return;
    const wrap = document.createElement('div');
    wrap.className = 'scrim'; wrap.id = 'cart-scrim';
    wrap.innerHTML = `<div class="sheet" id="cart-sheet" role="dialog" aria-modal="true" aria-label="Your cart">
      <div class="grab" aria-hidden="true"></div>
      <div class="sheet-head"><h2 style="font-size:22px">Your order</h2><button class="icon-btn" data-act="close-cart" aria-label="Close">×</button></div>
      <div class="sheet-body"></div><div class="sheet-foot"></div></div>`;
    wrap.addEventListener('click', e => { if (e.target === wrap) closeCart(); });
    wrap.addEventListener('click', onClick);
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    M.swipeToClose(wrap.querySelector('.sheet'), closeCart);
    renderCart();
    wrap.querySelector('.icon-btn').focus({ preventScroll: true });
  }
  function closeCart(instant) {
    const s = document.querySelector('#cart-scrim');
    if (!s) return;
    document.body.classList.remove('no-scroll');
    if (instant || !M.on()) return s.remove();
    s.classList.add('closing');
    setTimeout(() => s.remove(), 240);
  }

  async function placeOrder(btn) {
    const lines = cartLines();
    if (!lines.length || S.placing) return;
    S.placing = true;
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    try {
      const o = await API.post('/orders', { items: lines.map(l => ({ menu_item_id: l.item.id, quantity: l.qty })), note: S.note });
      S.cart = {}; S.note = ''; saveCart();
      S.orders.unshift(o);
      S.placing = false;
      closeCart(true);
      S.view = 'track'; S.trackId = o.id;
      M.haptic([20, 40, 20]);
      await M.vt(() => renderTrack(true), 'vt-forward');
      setTimeout(() => M.confetti(root.querySelector('.success-mark')), 250);
    } catch (e) {
      S.placing = false;
      toast(e.message, 'chilli', 5000);
      if (btn) { btn.classList.remove('is-loading'); M.bump(btn, 'm-shake'); }
      if (e.status === 409) { try { S.menu = await API.get('/menu'); S.groups = groupMenu(S.menu); pruneCart(true); renderMain(); } catch (_) { /* keep menu */ } }
      if (e.status === 401) return ended();
      renderCart();
    }
  }

  // ---------- tracking ----------
  function renderTrack(justPlaced) {
    splashDone();
    const o = S.orders.find(x => x.id === S.trackId) || S.orders[0];
    if (!o) { S.view = 'menu'; return renderMenuShell(); }
    const [tone, title, body] = STATUS_COPY[o.status];
    const idx = ORDER_IDX[o.status];
    const seen = S.seenIdx[o.id] ?? (justPlaced ? -1 : idx);
    S.seenIdx[o.id] = idx;
    const steps = o.status === 'REJECTED' ? '' : `<ol class="steps" style="--p:${idx / 4}">${STEPS.map((s, i) => {
      const cls = i <= idx ? 'done' : (i === idx + 1 ? 'now' : '');
      const fresh = i <= idx && i > seen ? ' just' : '';
      return `<li class="${cls}${fresh}" style="--i:${i}"><span class="dot">${i <= idx ? '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span><span>${s[0]}<small>${i === 1 && o.status === 'PENDING' ? 'Waiting for the cafe to accept' : s[1]}</small></span></li>`;
    }).join('')}</ol>`;
    const others = S.orders.filter(x => x.id !== o.id);
    root.innerHTML = `
      <div class="c-topnav m-in"><button class="icon-btn" data-act="menu" aria-label="Back to menu">←</button><span class="brand">Maitri</span><span class="badge tone-muted">Table ${table}</span></div>
      <div class="track">
        ${justPlaced ? `<div class="success m-in"><svg class="success-mark" viewBox="0 0 64 64" width="76" height="76" aria-hidden="true"><circle cx="32" cy="32" r="29" /><path d="M19 33.5l9 9L46 23" /></svg></div>` : ''}
        <div class="track-card m-rise" style="--i:0">
          <div class="track-head"><div><h1>${justPlaced ? 'Order sent successfully' : 'Your order'}</h1><p>${esc(o.customer.name)} · Table ${o.table_number}<br>${esc(shortDate(o.created_at))}</p></div><span class="ordno">#${esc(o.order_number)}</span></div>
          <div class="status-hero ${tone}" role="status" aria-live="polite" style="view-transition-name:status-hero">${tone === 'wait' ? '<span class="pulse"></span>' : ''}<div><b>${esc(title)}</b><p>${esc(body)}</p></div></div>
          ${steps}
        </div>
        <div class="track-card m-rise" style="--i:1">
          <h2 style="font-size:18px;margin-bottom:6px">Items</h2>
          ${o.items.map(i => `<div class="line"><div><div class="name">${esc(i.item_name)}</div><div class="each">${i.quantity} × ${rupees(i.price)}</div></div><div class="amt">${rupees(i.quantity * i.price)}</div></div>`).join('')}
          ${o.note ? `<p class="o-note" style="margin:10px 0 0">Note: ${esc(o.note)}</p>` : ''}
          <div class="totals"><div class="grand"><span>Total</span><span class="num">${rupees(o.total_amount)}</span></div></div>
          <p class="fineprint" style="margin-top:8px">Pay at the counter when you’re done.</p>
          ${o.status !== 'REJECTED' ? `<button class="btn btn-ghost btn-block" style="margin-top:12px" data-act="bill" data-id="${o.id}">View bill</button>` : ''}
        </div>
        <button class="btn btn-primary btn-lg btn-block m-rise" style="--i:2" data-act="menu">${o.status === 'REJECTED' ? 'Back to menu' : 'Order more'}</button>
        ${others.length ? `<div class="track-card m-rise" style="--i:3"><h2 style="font-size:18px;margin-bottom:8px">Earlier orders this visit</h2>${others.map(x =>
          `<button class="order-strip" style="margin-top:8px;box-shadow:none" data-act="track" data-id="${x.id}"><span class="grow"><b>#${esc(x.order_number)} · ${rupees(x.total_amount)}</b><small>${esc(shortDate(x.created_at))} · ${x.items.length} ${x.items.length === 1 ? 'item' : 'items'}</small></span><span class="badge tone-${STATUS[x.status].tone}">${STATUS[x.status].short}</span></button>`).join('')}</div>` : ''}
        ${creditHTML()}
      </div>`;
    window.scrollTo(0, 0);
  }

  function showBill(id) {
    const o = S.orders.find(x => x.id === id);
    if (!o) return;
    openModal(`<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2 style="font-size:20px">Bill</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">${invoiceHTML(o, S.settings)}</div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block" data-print>Print or save as PDF</button></div>`,
      { label: 'Bill ' + o.order_number, onClick: e => { if (e.target.closest('[data-print]')) printInvoice(o, S.settings); } });
  }

  async function leaveTable() {
    try { await API.del('/session'); }
    catch (e) { if (e.status !== 401) return toast(e.message, 'chilli', 5000); }
    store.del(sessKey); store.del(cartKey); API.setSessionToken(null);
    S.session = null; S.orders = []; S.cart = {};
    if (live) { live.close(); live = null; }
    if (heroObs) { heroObs.disconnect(); heroObs = null; }
    timers.splice(0).forEach(clearInterval);
    M.vt(welcome);
  }

  // ---------- events ----------
  function changeQty(t, delta) {
    const id = t.dataset.id;
    const before = S.cart[id] || 0;
    if (!setQty(id, before + delta)) return;
    const after = S.cart[id] || 0;
    M.haptic(8);
    const anim = (before === 0) !== (after === 0) ? 'pop' : 'num';
    if (S.view !== 'menu') return renderCart();
    const card = t.closest('.item');
    refreshEntry(id, anim);
    renderCart();
    // First add from a menu card: fly the photo to the cart (bottom button on phones, side panel on desktop).
    if (delta > 0 && before === 0 && card) {
      const pic = card.querySelector('.item-pic img');
      const fab = root.querySelector('.cart-fab');
      const fabShown = fab && getComputedStyle(fab).display !== 'none';
      const target = fabShown ? fab.querySelector('.fab-ic') : root.querySelector('#cart-panel .sheet-head');
      M.fly(pic, target).then(() => { if (fabShown) M.bump(root.querySelector('.cart-fab'), 'm-land'); });
    }
  }

  function onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act, id = t.dataset.id;
    if (act === 'inc') changeQty(t, 1);
    else if (act === 'dec') changeQty(t, -1);
    else if (act === 'variant') {
      const entryKey = t.dataset.key;
      S.pick[entryKey] = Number(id);
      const card = t.closest('.item');
      const group = S.groups.flatMap(g => g.entries).find(x => x.key === entryKey);
      if (card && group) { const fresh = document.createElement('div'); fresh.innerHTML = entryHTML(group, 0, true); card.replaceWith(fresh.firstElementChild); }
    }
    else if (act === 'cat') showType(t.dataset.slug, t.querySelector('.tt-img img'));
    else if (act === 'types') showType(null);
    else if (act === 'bill') showBill(Number(id));
    else if (act === 'open-cart') openCart();
    else if (act === 'close-cart') closeCart();
    else if (act === 'place') placeOrder(t);
    else if (act === 'track') { S.view = 'track'; S.trackId = Number(id); if (heroObs) { heroObs.disconnect(); heroObs = null; } M.vt(() => renderTrack(), 'vt-forward'); }
    else if (act === 'menu') { S.view = 'menu'; M.vt(renderMenuShell, 'vt-back'); }
    else if (act === 'recheck') { root.innerHTML = ''; boot(); }
    else if (act === 'its-me') M.vt(welcome, 'vt-forward');
    else if (act === 'not-me') leaveTable();
  }
  root.addEventListener('click', onClick);
  const onKey = e => { if (e.key === 'Escape') closeCart(); };
  document.addEventListener('keydown', onKey);

  return function destroy() {
    destroyed = true;
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    timers.forEach(clearInterval);
    if (live) live.close();
    if (heroObs) heroObs.disconnect();
    closeCart(true);
    root.innerHTML = '';
  };
};