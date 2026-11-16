/* Public landing page (maitricafe.hiresnix.co.in with no table QR).
   Browse-only: shows the cafe, how to order, the menu and contact details. Ordering happens via the table QR. */
window.mountLanding = function mountLanding(root) {
  const { creditHTML, esc, groupMenu, img, openModal } = window.MC;
  let groups = [], settings = {}, io = null;
  const ICONS = {
    seat: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10h16M6 10v9M18 10v9M8 6h8"/></svg>',
    scan: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9h2v2H9zM13 13h2v2h-2zM13 9h2M9 13v2"/></svg>',
    serve: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5M10 5h4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  };

  render();
  if (window.MCSplash) MCSplash.hide();
  Promise.all([API.get('/menu').catch(() => null), API.get('/settings').catch(() => ({}))]).then(([menu, s]) => {
    settings = s || {};
    if (menu) groups = groupMenu(menu).filter(g => g.entries.length);
    fill();
  });

  function render() {
    root.innerHTML = `
      <div class="lp">
        <header class="lp-hero">
          <nav class="lp-nav"><span class="brand">Maitri</span><a href="#lp-menu" class="lp-navlink">Menu</a></nav>
          <div class="lp-hero-in">
            <p class="lp-kicker m-in" style="--d:0">Cafe · Burgers · Momos · Shakes · Chai</p>
            <h1 class="lp-title m-in" style="--d:1"><span class="brand">Maitri</span><small>CAFE</small></h1>
            <p class="lp-tag m-in" style="--d:2">Good Food ~ Good Vibes ~ Always</p>
            <p class="lp-lead m-in" style="--d:3">Freshly made burgers, pizzas, momos, shakes and desi chai. Sit at any table, scan the QR code, and order straight from your phone.</p>
            <div class="lp-cta m-in" style="--d:4">
              <a class="btn btn-saffron btn-lg" href="#lp-menu">See the menu</a>
              <a class="btn btn-ghost-dark btn-lg" href="#lp-how">How to order</a>
            </div>
            <div class="lp-stats m-in" style="--d:5" id="lp-stats"></div>
          </div>
          <a class="lp-scroll" href="#lp-how" aria-label="Scroll down"><span></span></a>
        </header>

        <section class="lp-section" id="lp-how" aria-labelledby="lp-how-h">
          <div class="lp-wrap">
            <p class="lp-eyebrow reveal">Order in 3 easy steps</p>
            <h2 id="lp-how-h" class="lp-h2 reveal">No app. No waiting. No password.</h2>
            <ol class="lp-steps">
              ${[['seat', 'Take a seat', 'Pick any table. Each one has its own QR code card.'],
                 ['scan', 'Scan the QR', 'Point your phone camera at the code, enter your name and mobile, and choose from the menu.'],
                 ['serve', 'We bring it to you', 'Track your order live — from approved to ready — and pay at the counter.']]
                .map(([ic, t, d], i) => `<li class="lp-step reveal" style="--i:${i}"><span class="lp-step-n">${i + 1}</span><span class="lp-step-ic">${ICONS[ic]}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}
            </ol>
          </div>
        </section>

        <section class="lp-section lp-menu" id="lp-menu" aria-labelledby="lp-menu-h">
          <div class="lp-wrap">
            <p class="lp-eyebrow reveal">Our menu</p>
            <h2 id="lp-menu-h" class="lp-h2 reveal">Something for every craving</h2>
            <p class="lp-sub reveal">Made fresh, served fast. Tap a category to see everything we make.</p>
            <div class="lp-icons" id="lp-grid">${'<div class="sk lp-sk-ic"></div>'.repeat(6)}</div>
          </div>
        </section>

        <section class="lp-banner reveal" aria-label="Order at your table">
          <div class="lp-banner-in">
            <span class="lp-qr" aria-hidden="true">${ICONS.scan}</span>
            <div><h2>Hungry already?</h2><p>Visit Maitri Cafe and scan the QR code on your table to order in seconds.</p></div>
          </div>
        </section>

        <section class="lp-section" id="lp-visit" aria-labelledby="lp-visit-h" hidden>
          <div class="lp-wrap">
            <p class="lp-eyebrow reveal">Visit us</p>
            <h2 id="lp-visit-h" class="lp-h2 reveal">Come say hello</h2>
            <div class="lp-visit reveal" id="lp-visit-body"></div>
          </div>
        </section>

        <footer class="lp-foot">
          <span class="brand">Maitri</span>
          <p>Good Food ~ Good Vibes ~ Always</p>
          <a href="/admin" class="lp-staff">Staff login</a>
          ${creditHTML()}
        </footer>
      </div>`;
    revealOnScroll();
  }

  function fill() {
    const grid = root.querySelector('#lp-grid');
    if (!grid) return;
    const items = groups.reduce((n, g) => n + g.entries.length, 0);
    if (groups.length) {
      root.querySelector('#lp-stats').innerHTML = `<div><b>${items}+</b><span>dishes & drinks</span></div><div><b>${groups.length}</b><span>categories</span></div>`;
    }
    grid.innerHTML = groups.length ? groups.map((g, i) => `<button class="lp-ic reveal" style="--i:${i % 6}" data-cat="${esc(g.slug)}" aria-label="${esc(g.name)}: ${g.entries.length} items">
        <span class="lp-ic-img"><img src="${esc(img(g.image))}" alt="" ${i < 6 ? '' : 'loading="lazy"'} decoding="async" width="124" height="124"></span>
        <b>${esc(g.name)}</b><small>${g.entries.length} ${g.entries.length === 1 ? 'item' : 'items'}</small>
      </button>`).join('') : '<p class="col-empty">The menu is being updated. Please check back soon.</p>';
    const visit = [];
    if (settings.address) visit.push(`<a class="lp-visit-row" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((settings.cafe_name || 'Maitri Cafe') + ' ' + settings.address)}" target="_blank" rel="noopener">${ICONS.pin}<span>${esc(settings.address)}</span></a>`);
    if (settings.phone) visit.push(`<a class="lp-visit-row" href="tel:${esc(settings.phone.replace(/[^\d+]/g, ''))}">${ICONS.phone}<span>${esc(settings.phone)}</span></a>`);
    if (visit.length) { root.querySelector('#lp-visit-body').innerHTML = visit.join(''); root.querySelector('#lp-visit').hidden = false; }
    revealOnScroll();
  }

  function showCategory(slug) {
    const g = groups.find(x => x.slug === slug);
    if (!g) return;
    const rows = g.entries.map(e => {
      const opts = e.variants || [e.item];
      const off = opts.every(x => !x.available);
      return `<li class="lp-item ${off ? 'off' : ''}"><span><span class="veg" title="Vegetarian"></span>${esc(e.name)}${off ? ' <small>Currently unavailable</small>' : ''}</span>
        ${opts.some(x => x.variant) ? `<span class="lp-vars">${opts.map(x => `<small>${esc(x.variant)}</small>`).join('')}</span>` : ''}</li>`;
    }).join('');
    openModal(`<div class="grab" aria-hidden="true"></div>
      <div class="lp-modal-head"><img src="${esc(img(g.image))}" alt="" width="84" height="84"><div><h2>${esc(g.name)}</h2><p>${g.entries.length} ${g.entries.length === 1 ? 'item' : 'items'}</p></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body"><ul class="lp-items">${rows}</ul></div>
      <div class="sheet-foot lp-modal-foot">${ICONS.scan}<span>To order, scan the QR code on your table at the cafe.</span></div>`, { label: g.name + ' menu' });
  }

  function revealOnScroll() {
    const els = root.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window) || !(window.Motion && Motion.on())) { els.forEach(el => el.classList.add('in')); return; }
    if (!io) io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  }

  function onClick(e) {
    const card = e.target.closest('[data-cat]');
    if (card) return showCategory(card.dataset.cat);
    const a = e.target.closest('a[href^="#"]');
    if (a) {
      const t = root.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: window.Motion && Motion.on() ? 'smooth' : 'auto', block: 'start' }); }
    }
  }
  root.addEventListener('click', onClick);
  return function destroy() { root.removeEventListener('click', onClick); if (io) io.disconnect(); root.innerHTML = ''; };
};