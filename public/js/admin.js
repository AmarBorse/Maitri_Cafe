/* Admin / staff app. mountAdmin(root) returns destroy(). */
window.mountAdmin = function mountAdmin(root) {
  const { creditHTML, esc, rupees, itemLabel, timeAgo, clock, STATUS, TABLE_STATUS, groupMenu, toast, chime, store, img, shortDate, localDay, dateTime, invoiceHTML, printInvoice, openModal, resizeImage } = window.MC;
  const S = {
    me: null, orders: [], history: [], tables: [], menu: null, qr: null,
    ordersTab: 'active', fresh: new Set(), connected: true, menuSearch: '', histDay: localDay(), settings: {},
    mo: { table: null, name: '', mobile: '', cart: {}, cat: 'all', search: '', note: '', saving: false },
  };
  const timers = [];
  const M = window.Motion;
  const seen = new Set();
  let live = null, drawerTable = null, destroyed = false;
  const NEXT = {
    PENDING: [['APPROVED', 'Approve order', 'btn-primary'], ['REJECTED', 'Reject', 'btn-danger']],
    APPROVED: [['PREPARING', 'Start preparing', 'btn-primary'], ['REJECTED', 'Reject', 'btn-danger']],
    PREPARING: [['READY', 'Mark ready', 'btn-saffron']],
    READY: [['SERVED', 'Mark served', 'btn-primary']],
  };
  const NAV = [
    ['/admin', 'Dashboard', '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>'],
    ['/admin/orders', 'Orders', '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>'],
    ['/admin/tables', 'Tables', '<path d="M3 9h18M5 9v10M19 9v10M8 5h8"/>'],
    ['/admin/manual-order', 'New order', '<path d="M12 5v14M5 12h14"/>'],
    ['/admin/menu', 'Menu', '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    ['/admin/qr-codes', 'QR codes', '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2h4v-4"/>'],
    ['/admin/settings', 'Invoice', '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4M10 16h2"/>'],
  ];
  const icon = d => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  boot();
  async function boot() {
    try { S.me = await API.get('/admin/me'); }
    catch (e) { return loginView(); }
    if (Nav.path() === '/admin/login') Nav.go('/admin', true);
    await startApp();
  }

  // ---------- login ----------
  function loginView() {
    if (window.MCSplash) MCSplash.hide();
    if (Nav.path() !== '/admin/login') Nav.go('/admin/login', true);
    root.innerHTML = `<div class="login">
      <div class="login-art"><div><div class="brand">Maitri</div><p style="margin-top:6px">Order management</p></div>
        <p class="big">Approve orders, track every table and print table QR codes, all from one screen.</p></div>
      <div class="login-form"><form id="lf" novalidate>
        <h1>Staff sign in</h1>
        <div class="field"><label for="lu">Username</label><input id="lu" class="input" name="username" autocomplete="username" required></div>
        <div class="field"><label for="lp">Password</label><input id="lp" class="input" type="password" name="password" autocomplete="current-password" required></div>
        <p class="err" id="le" role="alert"></p>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign in</button>
        ${window.MC_DEMO_HINT ? `<p class="hint">${window.MC_DEMO_HINT}</p>` : ''}
        ${creditHTML()}
      </form></div></div>`;
    const f = root.querySelector('#lf');
    f.username.focus();
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        S.me = await API.post('/admin/login', { username: f.username.value.trim(), password: f.password.value });
        Nav.go('/admin', true);
        await startApp();
      } catch (e) { f.querySelector('#le').textContent = e.message; btn.disabled = false; }
    });
  }

  // ---------- app ----------
  async function startApp() {
    root.innerHTML = `<div class="a-shell">
      <aside class="a-side"><div class="a-logo"><div class="brand">Maitri</div><small>Order management</small></div>
        <nav class="a-nav" aria-label="Admin">${NAV.map(([p, l, d]) => `<a href="${p}" data-nav="${p}">${icon(d)}<span>${l}</span>${p === '/admin' ? '<span class="count" id="pend-count" hidden></span>' : ''}</a>`).join('')}</nav>
        <div class="a-side-foot"><span class="live" id="live"><i></i>Live</span><span>Signed in as ${esc(S.me.username)} · v5.1</span><button data-act="logout">Sign out</button></div>
      </aside>
      <main class="a-main" id="am"></main></div><div class="print-area" id="print-area"></div>`;
    await Promise.all([loadOrders(), loadTables(), loadMenu(), API.get('/admin/settings').then(x => { S.settings = x; })]);
    live = API.connect({ admin: true });
    // Automatic refresh: every 4 s while the dashboard is visible, menu every minute.
    timers.push(setInterval(() => { if (!document.hidden) poll(); }, 4000));
    timers.push(setInterval(() => { if (!document.hidden) loadMenu().then(() => renderRoute(true)).catch(() => {}); }, 60000));
    document.addEventListener('visibilitychange', onVisible);
    timers.push(setInterval(() => { if (!document.activeElement || document.activeElement === document.body) renderRoute(true); }, 30000));
    renderRoute();
    if (window.MCSplash) MCSplash.hide();
  }

  let polling = false, lastSig = '';
  async function poll() {
    if (polling || destroyed) return;
    polling = true;
    try {
      const live = await API.get('/admin/live');
      const sig = JSON.stringify(live);
      if (!S.connected) { S.connected = true; renderLive(); }
      if (sig === lastSig) return;
      lastSig = sig;
      const before = new Set(S.orders.map(o => o.id));
      S.orders = live.orders; S.tables = live.tables; updateBadge();
      const newOnes = S.orders.filter(o => !before.has(o.id) && o.status === 'PENDING');
      newOnes.forEach(onNewOrder);
      renderRoute(true);
    } catch (e) {
      if (e.status === 401) return location.reload();
      if (S.connected) { S.connected = false; renderLive(); }
    } finally { polling = false; }
  }
  const onVisible = () => { if (!document.hidden) poll(); };
  async function loadOrders() { S.orders = await API.get('/admin/orders?scope=active'); updateBadge(); }
  async function loadTables() { S.tables = await API.get('/admin/tables'); }
  async function loadMenu() { S.menu = await API.get('/admin/menu'); }

  function upsert(o) {
    const active = !['SERVED', 'REJECTED'].includes(o.status);
    const i = S.orders.findIndex(x => x.id === o.id);
    if (active) { if (i >= 0) S.orders[i] = o; else S.orders.push(o); }
    else {
      if (i >= 0) S.orders.splice(i, 1);
      const h = S.history.findIndex(x => x.id === o.id);
      if (h >= 0) S.history[h] = o; else S.history.unshift(o);
    }
    updateBadge();
  }
  function onNewOrder(o) {
    if (o.order_type === 'MANUAL' && S.lastCreated === o.id) { renderRoute(true); return; }
    S.fresh.add(o.id);
    setTimeout(() => S.fresh.delete(o.id), 8000);
    chime();
    toast(`🔔 New order #${o.order_number} · Table ${o.table_number} · ${rupees(o.total_amount)} · ${o.order_type === 'QR' ? 'QR order' : 'Manual order'}`, 'ink', 6000);
    renderRoute(true);
  }
  function updateBadge() {
    const n = S.orders.filter(o => o.status === 'PENDING').length;
    const b = root.querySelector('#pend-count');
    if (b) { b.hidden = !n; b.textContent = n; }
    document.title = (n ? `(${n}) ` : '') + 'Maitri Cafe · Orders';
  }
  function renderLive() {
    const l = root.querySelector('#live');
    if (l) { l.classList.toggle('off', !S.connected); l.lastChild.textContent = S.connected ? 'Live' : 'Reconnecting…'; }
  }

  // ---------- routing ----------
  function renderRoute(isUpdate) {
    if (destroyed) return;
    const path = Nav.path();
    const main = root.querySelector('#am');
    if (!main) return;
    root.querySelectorAll('[data-nav]').forEach(a => a.setAttribute('aria-current', a.dataset.nav === path ? 'page' : 'false'));
    const mobileTop = `<div class="a-mobile-top"><span class="brand">Maitri</span><button class="btn btn-ghost btn-sm" data-act="logout">Sign out</button></div>`;
    // Keep forms intact while staff are typing.
    if (isUpdate && path === '/admin/manual-order') { renderMoMenu(); renderMoSummary(); return; }
    if (isUpdate && path === '/admin/menu' && main.contains(document.activeElement) && document.activeElement.matches('input')) return;
    if (isUpdate && (path === '/admin/qr-codes' || path === '/admin/settings')) { if (path === '/admin/qr-codes' && S.qrTables !== S.tables.length) { S.qr = null; } else return; }
    if (isUpdate && path === '/admin/orders' && S.ordersTab === 'history') return;
    const views = { '/admin': dashboard, '/admin/orders': ordersPage, '/admin/tables': tablesPage, '/admin/manual-order': manualPage, '/admin/menu': menuPage, '/admin/qr-codes': qrPage, '/admin/settings': settingsPage };
    const view = views[path] || dashboard;
    main.innerHTML = mobileTop + view() + creditHTML('credit-admin');
    if (view === manualPage) bindManual();
    if (view === menuPage) bindMenu();
    if (view === qrPage) loadQr();
    if (view === settingsPage) bindSettings();
    if (view === ordersPage && S.ordersTab === 'history') loadHistory();
    if (drawerTable) renderDrawer();
  }

  // ---------- order card ----------
  function orderCard(o, named) {
    const acts = NEXT[o.status] || [];
    const isNew = !seen.has(o.id); seen.add(o.id);
    return `<article class="o-card ${S.fresh.has(o.id) ? 'fresh' : ''} ${isNew ? 'm-rise' : ''}" aria-label="Order ${esc(o.order_number)}" ${named === true ? `style="view-transition-name:o-${o.id}"` : ''}>
      <div class="o-top"><div><div class="ono">#${esc(o.order_number)}</div>
        <div class="o-sub"><span class="tag ${o.order_type === 'QR' ? 'tag-qr' : 'tag-manual'}">${o.order_type === 'QR' ? 'QR order' : 'Manual order'}</span><span title="${esc(dateTime(o.created_at))}">${esc(shortDate(o.created_at))}${['SERVED', 'REJECTED'].includes(o.status) ? '' : ' · ' + timeAgo(o.created_at)}</span></div></div>
        <span class="tbl">Table ${o.table_number}</span></div>
      <div class="o-cust"><b>${esc(o.customer.name)}</b> · <a href="tel:${esc(o.customer.mobile)}">${esc(o.customer.mobile)}</a></div>
      <ul class="o-items">${o.items.map(i => `<li><span class="q">${i.quantity}×</span><span>${esc(i.item_name)}</span><span class="p">${rupees(i.quantity * i.price)}</span></li>`).join('')}</ul>
      ${o.note ? `<div class="o-note">Note: ${esc(o.note)}</div>` : ''}
      <div class="o-total"><span>Total</span><span class="num">${rupees(o.total_amount)}</span></div>
      ${acts.length ? `<div class="o-actions ${acts.length > 1 ? 'two' : ''}">${acts.map(([s, l, c]) => `<button class="btn ${c}" data-act="status" data-id="${o.id}" data-status="${s}">${l}</button>`).join('')}</div>` : ''}
      <div class="o-foot">${acts.length ? '' : `<span class="badge tone-${STATUS[o.status].tone}">${STATUS[o.status].short}</span>`}<button class="link-btn" data-act="invoice" data-id="${o.id}">${o.status === 'SERVED' ? 'Invoice' : 'Bill'}</button></div>
    </article>`;
  }

  // ---------- dashboard ----------
  function tableStrip() {
    return `<div class="t-strip">${S.tables.map(t => `<button class="t-chip" data-s="${t.status}" data-act="table" data-n="${t.table_number}" aria-label="Table ${t.table_number}: ${TABLE_STATUS[t.status].label}">
      <span>Table</span><b>${t.table_number}</b><span>${TABLE_STATUS[t.status].label}</span></button>`).join('')}</div>`;
  }
  function dashboard() {
    const cols = [['PENDING', 'New orders', 'pending'], ['APPROVED', 'Approved', ''], ['PREPARING', 'Preparing', ''], ['READY', 'Ready to serve', '']];
    const pending = S.orders.filter(o => o.status === 'PENDING').length;
    return `<div class="a-head"><div><h1>Order management</h1><p>${pending ? `${pending} ${pending === 1 ? 'order needs' : 'orders need'} approval` : 'No orders waiting for approval'}</p></div>
      <div class="actions"><button class="btn btn-saffron" data-go="/admin/manual-order">+ New manual order</button></div></div>
      ${tableStrip()}
      <div class="board">${cols.map(([s, title, cls]) => {
        const list = S.orders.filter(o => o.status === s);
        return `<section class="col ${cls}" aria-label="${title}"><div class="col-head"><h2>${title}</h2><span>${list.length}</span></div>
          <div class="col-list">${list.length ? list.map(o => orderCard(o, true)).join('') : `<p class="col-empty">${s === 'PENDING' ? 'New QR and manual orders show up here.' : 'Nothing here right now.'}</p>`}</div></section>`;
      }).join('')}</div>`;
  }

  // ---------- orders ----------
  function ordersPage() {
    const tabs = `<div class="tabs" role="group" aria-label="Order list"><button data-act="otab" data-tab="active" aria-pressed="${S.ordersTab === 'active'}">Active (${S.orders.length})</button><button data-act="otab" data-tab="history" aria-pressed="${S.ordersTab === 'history'}">History by date</button></div>`;
    if (S.ordersTab === 'history') {
      return `<div class="a-head"><div><h1>Orders</h1><p>Pick a date to see every order placed that day.</p></div>${tabs}</div>
        <div class="hist-bar">
          <button class="btn btn-ghost btn-sm" data-act="hday" data-d="-1" aria-label="Previous day">‹</button>
          <input type="date" class="input" id="hist-date" value="${S.histDay}" max="${localDay()}" aria-label="Date">
          <button class="btn btn-ghost btn-sm" data-act="hday" data-d="1" aria-label="Next day" ${S.histDay >= localDay() ? 'disabled' : ''}>›</button>
          <button class="btn btn-ghost btn-sm" data-act="hday" data-d="0">Today</button>
        </div>
        <div id="hist"><p class="col-empty">Loading…</p></div>`;
    }
    const list = [...S.orders].sort((a, b) => (a.status === 'PENDING' ? -1 : 0) - (b.status === 'PENDING' ? -1 : 0) || a.id - b.id);
    return `<div class="a-head"><div><h1>Orders</h1><p>Every QR and manual order in progress, pending first.</p></div>${tabs}</div>
      ${list.length ? `<div class="o-grid">${list.map(o => orderCard(o, true)).join('')}</div>` : '<div class="panel empty"><h2>No active orders</h2><p>Orders appear here the moment a table places one. Older orders are under History by date.</p></div>'}`;
  }
  async function loadHistory() {
    const inp = root.querySelector('#hist-date');
    if (inp) inp.addEventListener('change', () => { if (inp.value) { S.histDay = inp.value; renderRoute(); } });
    const [y, m, d] = S.histDay.split('-').map(Number);
    const from = new Date(y, m - 1, d), to = new Date(y, m - 1, d + 1);
    const day = S.histDay;
    try {
      const list = await API.get(`/admin/orders?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
      if (day !== S.histDay) return;
      S.history = list;
      const host = root.querySelector('#hist');
      if (!host) return;
      const served = list.filter(o => o.status === 'SERVED'), rejected = list.filter(o => o.status === 'REJECTED');
      const open = list.length - served.length - rejected.length;
      const label = from.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      host.innerHTML = `<div class="day-sum panel"><div><span>${esc(label)}</span><b>${list.length} ${list.length === 1 ? 'order' : 'orders'}</b></div>
          <div><span>Served</span><b>${served.length} · ${rupees(served.reduce((t, o) => t + o.total_amount, 0))}</b></div>
          <div><span>In progress</span><b>${open}</b></div><div><span>Rejected</span><b>${rejected.length}</b></div></div>
        ${list.length ? `<div class="o-grid">${list.map(o => orderCard(o, true)).join('')}</div>` : '<div class="panel empty"><h2>No orders on this day</h2><p>Choose another date above.</p></div>'}`;
    } catch (e) { const host = root.querySelector('#hist'); if (host) host.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  async function openInvoice(id) {
    let o = S.orders.find(x => x.id === id) || S.history.find(x => x.id === id);
    if (!o) { try { o = await API.get('/admin/orders/' + id); } catch (e) { return toast(e.message, 'chilli'); } }
    openModal(`<div class="sheet-head"><h2 style="font-size:20px">${o.status === 'SERVED' ? 'Invoice' : 'Bill'} #${esc(o.order_number)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">${invoiceHTML(o, S.settings)}</div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block" data-print>Print or save as PDF</button></div>`,
      { label: 'Invoice ' + o.order_number, onClick: e => { if (e.target.closest('[data-print]')) printInvoice(o, S.settings); } });
  }

  // ---------- tables ----------
  function tablesPage() {
    return `<div class="a-head"><div><h1>Tables</h1><p>${S.tables.length} tables. Tap one to see who’s there and what they ordered.</p></div>
      <div class="actions"><button class="btn btn-saffron" data-act="add-table">+ Add table</button></div></div>
      ${S.tables.length ? '' : '<div class="panel empty"><h2>No tables yet</h2><p>Add your first table to create its QR code.</p></div>'}
      <div class="t-grid">${S.tables.map(t => {
        const st = TABLE_STATUS[t.status];
        const o = t.orders[0];
        const cls = { ORDER_PENDING: 'wait', APPROVED: 'busy', PREPARING: 'busy', READY: 'ready' }[t.status] || '';
        const who = o ? o.customer.name : (t.guest ? t.guest.name : '');
        return `<button class="t-card ${cls}" data-act="table" data-n="${t.table_number}">
          <div class="n"><div><small>Table</small><b>${t.table_number}</b></div><span class="badge tone-${st.tone}">${st.label}</span></div>
          ${o ? `<p><b>#${esc(o.order_number)}</b> · ${rupees(t.orders.reduce((s, x) => s + x.total_amount, 0))}${t.orders.length > 1 ? ` · ${t.orders.length} orders` : ''}</p>` : ''}
          ${who ? `<p>${esc(who)}${o ? ' · ' + timeAgo(o.created_at) : ' · seated ' + timeAgo(t.guest.since)}</p>` : '<p style="color:var(--muted)">Ready for guests</p>'}
        </button>`;
      }).join('')}</div>`;
  }

  function renderDrawer() {
    let scrim = document.querySelector('#t-drawer');
    const t = S.tables.find(x => x.table_number === drawerTable);
    if (!t) return closeDrawer();
    if (scrim) scrim.classList.add('still');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'scrim right'; scrim.id = 't-drawer';
      scrim.addEventListener('click', e => { if (e.target === scrim) closeDrawer(); else onClick(e); });
      document.body.appendChild(scrim);
    }
    const st = TABLE_STATUS[t.status];
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Table ${t.table_number}">
      <div class="sheet-head"><div><h2 style="font-size:26px">Table ${t.table_number}</h2></div><div style="display:flex;gap:10px;align-items:center"><span class="badge tone-${st.tone}">${st.label}</span><button class="icon-btn" data-act="close-drawer" aria-label="Close">×</button></div></div>
      <div class="sheet-body">
        ${t.guest ? `<div class="detail-row"><span>Guest</span><b>${esc(t.guest.name)}</b></div><div class="detail-row"><span>Mobile</span><a href="tel:${esc(t.guest.mobile)}">${esc(t.guest.mobile)}</a></div><div class="detail-row"><span>Seated since</span><b>${esc(shortDate(t.guest.since))}</b></div>
          <p class="fineprint" style="margin:10px 0 14px">This table is held for ${esc(t.guest.name)}. Other phones can’t order here until you mark it free.</p>` : ''}
        ${!t.orders.length && !t.guest ? '<div class="empty" style="padding:30px 0"><h2>Table is free</h2><p>No active order on this table.</p></div>' : ''}
        <div style="display:grid;gap:12px">${t.orders.map(o => orderCard(o, false)).join('')}</div>
      </div>
      <div class="sheet-foot" style="display:grid;gap:8px">
        <button class="btn btn-saffron btn-block" data-go="/admin/manual-order?table=${t.table_number}">+ New order for Table ${t.table_number}</button>
        ${!t.orders.length && t.guest ? `<button class="btn btn-primary btn-block" data-act="clear-table" data-n="${t.table_number}">Mark table free</button>` : ''}
        ${t.orders.length && t.guest ? '<p class="fineprint" style="text-align:center">Serve or reject the open orders, then you can mark the table free.</p>' : ''}
        ${!t.orders.length ? `<button class="btn btn-danger btn-block" data-act="remove-table" data-n="${t.table_number}">Remove table ${t.table_number}</button>` : ''}
      </div></div>`;
  }
  function closeDrawer() {
    drawerTable = null; const d = document.querySelector('#t-drawer');
    if (!d) return;
    if (M.on()) { d.id = ''; d.classList.add('closing'); setTimeout(() => d.remove(), 230); } else d.remove();
  }

  // ---------- manual order ----------
  function manualPage() {
    const pre = Number(Nav.params().get('table'));
    if (S.tables.some(t => t.table_number === pre)) S.mo.table = pre;
    if (S.mo.table && !S.tables.some(t => t.table_number === S.mo.table)) S.mo.table = null;
    const groups = groupMenu(S.menu);
    return `<div class="a-head"><div><h1>New manual order</h1><p>For guests who can’t use the QR. It goes into the same order queue.</p></div></div>
      <div class="mo">
        <div style="display:grid;gap:18px;min-width:0">
          <section class="panel" style="padding:18px;display:grid;gap:14px">
            <div class="field"><label id="mo-tl">Table</label><div class="mo-tables" role="group" aria-labelledby="mo-tl">${S.tables.map(t => `<button data-act="mo-table" data-n="${t.table_number}" aria-pressed="${S.mo.table === t.table_number}">${t.table_number}</button>`).join('') || '<p class="fineprint">Add a table first under Tables.</p>'}</div></div>
            <div class="mo-row">
              <div class="field"><label for="mo-n">Customer name</label><input id="mo-n" class="input" value="${esc(S.mo.name)}" maxlength="40" autocomplete="off"></div>
              <div class="field"><label for="mo-m">Mobile number</label><div class="input-prefix"><span>+91</span><input id="mo-m" class="input" inputmode="numeric" maxlength="10" value="${esc(S.mo.mobile)}" autocomplete="off"></div></div>
            </div>
          </section>
          <section class="panel" style="padding:18px;display:grid;gap:12px">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><h2 style="font-size:18px">Menu</h2>
              <input id="mo-s" class="input" type="search" placeholder="Search items" style="max-width:260px;min-height:40px" value="${esc(S.mo.search)}"></div>
            <div class="mo-filter" role="group" aria-label="Category"><button class="chip" data-act="mo-cat" data-cat="all" aria-pressed="${S.mo.cat === 'all'}">All</button>${groups.map(g => `<button class="chip" data-act="mo-cat" data-cat="${g.id}" aria-pressed="${String(S.mo.cat) === String(g.id)}">${esc(g.name)}</button>`).join('')}</div>
            <div class="mo-menu" id="mo-menu"></div>
          </section>
        </div>
        <aside class="panel mo-summary" id="mo-sum"></aside>
      </div>`;
  }
  function bindManual() {
    const n = root.querySelector('#mo-n'), m = root.querySelector('#mo-m'), s = root.querySelector('#mo-s');
    n.addEventListener('input', () => { S.mo.name = n.value; renderMoSummary(); });
    m.addEventListener('input', () => { m.value = m.value.replace(/\D/g, '').slice(0, 10); S.mo.mobile = m.value; renderMoSummary(); });
    s.addEventListener('input', () => { S.mo.search = s.value; renderMoMenu(); });
    renderMoMenu(); renderMoSummary();
  }
  function renderMoMenu() {
    const host = root.querySelector('#mo-menu');
    if (!host) return;
    const q = S.mo.search.trim().toLowerCase();
    const cats = Object.fromEntries(S.menu.categories.map(c => [c.id, c.name]));
    const items = S.menu.items.filter(i => (S.mo.cat === 'all' || String(i.category_id) === String(S.mo.cat)) && (!q || itemLabel(i).toLowerCase().includes(q) || cats[i.category_id].toLowerCase().includes(q)));
    host.innerHTML = items.length ? items.map(i => {
      const qty = S.mo.cart[i.id] || 0;
      return `<button class="mo-item" data-act="mo-add" data-id="${i.id}" ${i.available ? '' : 'disabled'} aria-label="Add ${esc(itemLabel(i))}">
        <span><span class="nm">${esc(itemLabel(i))}</span><br><span class="pr">${i.available ? rupees(i.price) : 'Out of stock'}</span></span>
        <span class="plus ${qty ? 'qty' : ''}">${qty || '+'}</span></button>`;
    }).join('') : '<p class="col-empty">No items match.</p>';
  }
  function renderMoSummary() {
    const host = root.querySelector('#mo-sum');
    if (!host) return;
    const lines = Object.entries(S.mo.cart).map(([id, q]) => ({ item: S.menu.items.find(i => i.id === Number(id)), qty: q })).filter(l => l.item);
    const total = lines.reduce((s, l) => s + l.qty * l.item.price, 0);
    const ready = S.mo.table && S.mo.name.trim().length >= 2 && /^[6-9]\d{9}$/.test(S.mo.mobile) && lines.length;
    const missing = !S.mo.table ? 'Select a table' : S.mo.name.trim().length < 2 ? 'Enter the customer name' : !/^[6-9]\d{9}$/.test(S.mo.mobile) ? 'Enter a valid 10-digit mobile' : !lines.length ? 'Add at least one item' : '';
    host.innerHTML = `<div class="panel-head"><h2>Order summary</h2>${S.mo.table ? `<span class="tbl-badge">Table ${S.mo.table}</span>` : ''}</div>
      <div class="sheet-body" style="max-height:52vh">${lines.length ? lines.map(l => `<div class="line">
        <div><div class="name">${esc(itemLabel(l.item))}</div><button class="rm" data-act="mo-rm" data-id="${l.item.id}">Remove</button></div>
        <div class="stepper"><button data-act="mo-dec" data-id="${l.item.id}" aria-label="Remove one">−</button><output>${l.qty}</output><button data-act="mo-inc" data-id="${l.item.id}" aria-label="Add one">+</button></div>
        <div class="each">${rupees(l.item.price)} each</div><div class="amt">${rupees(l.qty * l.item.price)}</div></div>`).join('') : '<p class="col-empty">Tap items on the left to add them.</p>'}</div>
      <div class="sheet-foot" style="border-radius:0 0 18px 18px">
        <label class="field" style="margin-bottom:10px"><span class="sr-only">Kitchen note</span><textarea class="input note-input" id="mo-note" rows="1" maxlength="200" placeholder="Kitchen note (optional)">${esc(S.mo.note)}</textarea></label>
        <div class="totals"><div><span>Subtotal</span><span class="num">${rupees(total)}</span></div><div class="grand"><span>Total</span><span class="num">${rupees(total)}</span></div></div>
        <button class="btn btn-primary btn-lg btn-block" style="margin-top:12px" data-act="mo-create" ${ready && !S.mo.saving ? '' : 'disabled'}>${S.mo.saving ? 'Creating…' : 'Create order'}</button>
        ${missing ? `<p class="fineprint" style="text-align:center;margin-top:8px">${missing}</p>` : ''}
      </div>`;
    const note = host.querySelector('#mo-note');
    note.addEventListener('input', () => { S.mo.note = note.value; });
  }
  function moQty(id, d, set) {
    const it = S.menu.items.find(i => i.id === Number(id));
    if (!it || !it.available) return;
    const q = Math.max(0, Math.min(25, set !== undefined ? set : (S.mo.cart[id] || 0) + d));
    if (q) S.mo.cart[id] = q; else delete S.mo.cart[id];
    renderMoMenu(); renderMoSummary();
  }
  async function createManual() {
    S.mo.saving = true; renderMoSummary();
    try {
      const o = await API.post('/admin/orders', {
        table_number: S.mo.table, name: S.mo.name.trim(), mobile: S.mo.mobile, note: S.mo.note,
        items: Object.entries(S.mo.cart).map(([id, q]) => ({ menu_item_id: Number(id), quantity: q })),
      });
      S.lastCreated = o.id;
      upsert(o);
      toast(`Order #${o.order_number} created for Table ${o.table_number}`, 'leaf');
      S.mo = { table: null, name: '', mobile: '', cart: {}, cat: 'all', search: '', note: '', saving: false };
      Nav.go('/admin');
    } catch (e) { toast(e.message, 'chilli', 5000); S.mo.saving = false; renderMoSummary(); }
  }

  // ---------- menu management ----------
  function menuPage() {
    const q = S.menuSearch.trim().toLowerCase();
    const off = S.menu.items.filter(i => !i.available).length;
    const cats = S.menu.categories.map(c => {
      const all = S.menu.items.filter(i => i.category_id === c.id);
      const items = all.filter(i => !q || itemLabel(i).toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
      if (q && !items.length) return '';
      return `<section class="panel m-cat">
        <div class="m-cat-head">
          <label class="m-photo" title="Change ${esc(c.name)} photo"><img src="${esc(img(c.image))}" alt="" width="64" height="48"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo-cat="${c.id}" class="sr-only"><span>Change</span></label>
          <div class="grow"><h2>${esc(c.name)}</h2><p>${all.length} ${all.length === 1 ? 'item' : 'items'}</p></div>
          <div class="m-acts"><button class="btn btn-ghost btn-sm" data-act="item-new" data-cat="${c.id}">+ Item</button><button class="btn btn-ghost btn-sm" data-act="cat-edit" data-id="${c.id}">Edit</button><button class="btn btn-ghost btn-sm m-del" data-act="cat-del" data-id="${c.id}">Delete</button></div>
        </div>
        ${items.length ? `<div class="scroll-x"><table class="menu-table"><thead class="sr-only"><tr><th>Photo</th><th>Item</th><th>Price</th><th>Availability</th><th>Actions</th></tr></thead><tbody>${items.map(i => `<tr>
          <td style="width:64px"><label class="m-photo sm" title="Change photo"><img class="thumb" src="${esc(img(i.image))}" alt="" width="44" height="34" loading="lazy"><input type="file" accept="image/jpeg,image/png,image/webp" data-photo-item="${i.id}" class="sr-only"></label></td>
          <td><b style="font-weight:650">${esc(i.name)}</b>${i.variant ? ` <span class="tag">${esc(i.variant)}</span>` : ''}${i.own_image ? '' : '<br><small class="muted">Uses the category photo</small>'}</td>
          <td><input class="input price-in" type="number" min="1" max="5000" step="1" value="${i.price}" data-price="${i.id}" aria-label="Price of ${esc(itemLabel(i))}"></td>
          <td><label class="switch"><input type="checkbox" data-avail="${i.id}" ${i.available ? 'checked' : ''}><span class="track-sw"></span><span class="${i.available ? 'on' : 'off'}">${i.available ? 'Available' : 'Out of stock'}</span></label></td>
          <td class="m-row-acts"><button class="link-btn" data-act="item-edit" data-id="${i.id}">Edit</button><button class="link-btn danger" data-act="item-del" data-id="${i.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="col-empty">No items yet. Use “+ Item” to add one.</p>'}
      </section>`;
    }).join('');
    return `<div class="a-head"><div><h1>Menu</h1><p>${S.menu.items.length} items${off ? `, ${off} out of stock` : ''}. Changes reach customers instantly.</p></div>
      <div class="actions"><input id="menu-q" class="input" type="search" placeholder="Search items" style="width:220px;min-height:44px" value="${esc(S.menuSearch)}"><button class="btn btn-ghost" data-act="cat-new">+ Add type</button><button class="btn btn-saffron" data-act="item-new">+ Add item</button></div></div>
      <div class="m-list">${cats || (q ? '<div class="panel empty"><h2>No items match</h2></div>' : '<div class="panel empty"><h2>No menu types yet</h2><p>Add a type such as Burgers, then add items to it.</p></div>')}</div>`;
  }

  async function uploadPhoto(file) {
    const data = await resizeImage(file);
    return (await API.post('/admin/upload', { data })).url;
  }
  async function saveItem(id, body, okMsg) {
    try {
      if (id) await API.patch('/admin/menu/items/' + id, body); else await API.post('/admin/menu/items', body);
      await loadMenu(); if (okMsg) toast(okMsg, 'leaf'); renderRoute(); return true;
    } catch (e) { toast(e.message, 'chilli'); return false; }
  }

  function bindMenu() {
    const q = root.querySelector('#menu-q');
    q.addEventListener('input', () => {
      S.menuSearch = q.value; const pos = q.selectionStart; renderRoute();
      const nq = root.querySelector('#menu-q'); nq.focus(); nq.setSelectionRange(pos, pos);
    });
    root.querySelectorAll('[data-price]').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', async () => {
        const id = Number(inp.dataset.price), it = S.menu.items.find(i => i.id === id), price = Number(inp.value);
        if (!Number.isInteger(price) || price < 1 || price > 5000) { toast('Price must be a whole number between ₹1 and ₹5000.', 'chilli'); inp.value = it.price; return; }
        try { await API.patch('/admin/menu/items/' + id, { price }); it.price = price; toast(`${itemLabel(it)} is now ${rupees(price)}`, 'leaf'); }
        catch (e) { toast(e.message, 'chilli'); inp.value = it.price; }
      });
    });
    root.querySelectorAll('[data-avail]').forEach(cb => cb.addEventListener('change', async () => {
      const id = Number(cb.dataset.avail), it = S.menu.items.find(i => i.id === id);
      try { await API.patch('/admin/menu/items/' + id, { available: cb.checked }); it.available = cb.checked; renderRoute(); }
      catch (e) { toast(e.message, 'chilli'); cb.checked = it.available; }
    }));
    root.querySelectorAll('[data-photo-item],[data-photo-cat]').forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files[0]; if (!file) return;
      const label = inp.closest('.m-photo'); label.classList.add('busy');
      try {
        const url = await uploadPhoto(file);
        if (inp.dataset.photoItem) await API.patch('/admin/menu/items/' + inp.dataset.photoItem, { image: url });
        else await API.patch('/admin/menu/categories/' + inp.dataset.photoCat, { image: url });
        await loadMenu(); toast('Photo updated', 'leaf'); renderRoute();
      } catch (e) { toast(e.message, 'chilli'); label.classList.remove('busy'); }
    }));
  }

  function photoField(current, fallbackNote) {
    return `<div class="field"><span class="flabel">Photo</span><div class="photo-pick">
      <img src="${esc(current ? img(current) : '')}" alt="" width="120" height="90" data-preview ${current ? '' : 'hidden'}>
      <div style="display:grid;gap:6px"><label class="btn btn-ghost btn-sm">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-photo-input></label>
      ${fallbackNote ? `<button type="button" class="link-btn" data-photo-clear>${esc(fallbackNote)}</button>` : ''}
      <small class="muted" data-photo-status>JPG, PNG or WebP. It’s resized automatically.</small></div></div></div>`;
  }
  function wirePhoto(m, state) {
    const input = m.el.querySelector('[data-photo-input]'), prev = m.el.querySelector('[data-preview]'), status = m.el.querySelector('[data-photo-status]');
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      status.textContent = 'Uploading…'; state.uploading = true;
      try { state.image = await uploadPhoto(file); prev.src = state.image; prev.hidden = false; status.textContent = 'Photo ready.'; }
      catch (e) { status.textContent = e.message; }
      state.uploading = false;
    });
    const clr = m.el.querySelector('[data-photo-clear]');
    if (clr) clr.addEventListener('click', () => { state.image = ''; prev.src = img(state.catImage()); prev.hidden = false; status.textContent = 'Will use the category photo.'; });
  }

  function itemModal(id, catId) {
    const it = id ? S.menu.items.find(i => i.id === id) : null;
    const state = { image: it ? it.own_image : '', uploading: false, catImage: () => (S.menu.categories.find(c => c.id === Number(m.el.querySelector('[name=category_id]').value)) || {}).image };
    if (!S.menu.categories.length) return toast('Add a menu type first.', 'chilli');
    const cid = it ? it.category_id : (catId || S.menu.categories[0].id);
    const m = openModal(`<form novalidate>
      <div class="sheet-head"><h2 style="font-size:22px">${it ? 'Edit item' : 'Add item'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body form-grid">
        <div class="field"><label for="f-name">Item name</label><input id="f-name" name="name" class="input" maxlength="60" value="${esc(it ? it.name : '')}" required autofocus></div>
        <div class="form-row">
          <div class="field"><label for="f-price">Price (₹)</label><input id="f-price" name="price" class="input" type="number" min="1" max="5000" value="${it ? it.price : ''}" required></div>
          <div class="field"><label for="f-var">Variant <span class="muted">(optional)</span></label><input id="f-var" name="variant" class="input" maxlength="20" placeholder="e.g. Steam" value="${esc(it && it.variant ? it.variant : '')}"></div>
        </div>
        <p class="fineprint" style="margin-top:-6px">For an item sold two ways (like Steam and Fried momos), add it twice with the same name and a different variant. Customers then choose between them.</p>
        <div class="field"><label for="f-cat">Type</label><select id="f-cat" name="category_id" class="input">${S.menu.categories.map(c => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        ${photoField(it ? it.image : (S.menu.categories.find(c => c.id === cid) || {}).image, 'Use the category photo instead')}
        <label class="switch"><input type="checkbox" name="available" ${!it || it.available ? 'checked' : ''}><span class="track-sw"></span><span>Available to order</span></label>
        <p class="err" data-err role="alert"></p>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block btn-lg" type="submit">${it ? 'Save changes' : 'Add item'}</button></div></form>`, { label: it ? 'Edit item' : 'Add item' });
    wirePhoto(m, state);
    const f = m.el.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const err = f.querySelector('[data-err]');
      if (state.uploading) { err.textContent = 'Wait for the photo to finish uploading.'; return; }
      const body = { name: f.name.value, price: Number(f.price.value), variant: f.variant.value, category_id: Number(f.category_id.value), available: f.available.checked, image: state.image };
      if (!body.name.trim()) { err.textContent = 'Enter the item name.'; return; }
      if (!Number.isInteger(body.price) || body.price < 1) { err.textContent = 'Enter a price in whole rupees.'; return; }
      f.querySelector('[type=submit]').disabled = true;
      if (await saveItem(id, body, it ? 'Item saved' : `${body.name.trim()} added`)) m.close();
      else f.querySelector('[type=submit]').disabled = false;
    });
  }

  function categoryModal(id) {
    const c = id ? S.menu.categories.find(x => x.id === id) : null;
    const state = { image: c ? c.image : '', uploading: false };
    const m = openModal(`<form novalidate>
      <div class="sheet-head"><h2 style="font-size:22px">${c ? 'Edit type' : 'Add menu type'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body form-grid">
        <div class="field"><label for="c-name">Type name</label><input id="c-name" name="name" class="input" maxlength="30" placeholder="e.g. Desserts" value="${esc(c ? c.name : '')}" autofocus></div>
        ${photoField(c ? c.image : '', '')}
        <p class="fineprint">Customers see this photo on the type card. Items without their own photo use it too.</p>
        <p class="err" data-err role="alert"></p>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block btn-lg" type="submit">${c ? 'Save changes' : 'Add type'}</button></div></form>`, { label: c ? 'Edit type' : 'Add type' });
    wirePhoto(m, state);
    const f = m.el.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const err = f.querySelector('[data-err]');
      if (state.uploading) { err.textContent = 'Wait for the photo to finish uploading.'; return; }
      if (!f.name.value.trim()) { err.textContent = 'Enter a name.'; return; }
      if (!state.image) { err.textContent = 'Choose a photo for this type.'; return; }
      try {
        if (c) await API.patch('/admin/menu/categories/' + c.id, { name: f.name.value, image: state.image });
        else await API.post('/admin/menu/categories', { name: f.name.value, image: state.image });
        await loadMenu(); toast(c ? 'Type saved' : `${f.name.value.trim()} added`, 'leaf'); m.close(); renderRoute();
      } catch (ex) { err.textContent = ex.message; }
    });
  }

  // ---------- invoice details ----------
  function settingsPage() {
    const st = S.settings;
    const sample = { order_number: 'MC-1001', table_number: 4, order_type: 'QR', status: 'SERVED', total_amount: 240, created_at: new Date().toISOString(), note: null,
      customer: { name: 'Rahul', mobile: '98XXXXXX10' }, items: [{ item_name: 'Veg Burger', quantity: 2, price: 60 }, { item_name: 'French Fries', quantity: 1, price: 70 }, { item_name: 'Cold Coffee', quantity: 1, price: 50 }] };
    return `<div class="a-head"><div><h1>Invoice details</h1><p>These details print at the top and bottom of every bill.</p></div></div>
      <div class="set-grid">
        <form class="panel form-grid" id="set-f" style="padding:18px" novalidate>
          <div class="field"><label for="s-n">Cafe name</label><input id="s-n" class="input" name="cafe_name" maxlength="40" value="${esc(st.cafe_name || '')}"></div>
          <div class="field"><label for="s-a">Address</label><textarea id="s-a" class="input" name="address" maxlength="160" rows="2">${esc(st.address || '')}</textarea></div>
          <div class="form-row"><div class="field"><label for="s-p">Phone</label><input id="s-p" class="input" name="phone" maxlength="40" value="${esc(st.phone || '')}"></div>
          <div class="field"><label for="s-g">GSTIN <span class="muted">(optional)</span></label><input id="s-g" class="input" name="gstin" maxlength="20" value="${esc(st.gstin || '')}"></div></div>
          <div class="field"><label for="s-f">Message at the bottom</label><input id="s-f" class="input" name="invoice_footer" maxlength="120" value="${esc(st.invoice_footer || '')}"></div>
          <p class="err" data-err role="alert"></p>
          <button class="btn btn-primary btn-lg" type="submit">Save details</button>
        </form>
        <div><p class="fineprint" style="margin:0 0 8px">Preview</p><div class="panel" style="padding:14px" id="set-prev">${invoiceHTML(sample, st)}</div></div>
      </div>`;
  }
  function bindSettings() {
    const f = root.querySelector('#set-f');
    const fields = ['cafe_name', 'address', 'phone', 'gstin', 'invoice_footer'];
    const values = () => Object.fromEntries(fields.map(k => [k, f[k].value]));
    f.addEventListener('input', () => {
      const prev = root.querySelector('#set-prev');
      const sample = { order_number: 'MC-1001', table_number: 4, order_type: 'QR', status: 'SERVED', total_amount: 240, created_at: new Date().toISOString(),
        customer: { name: 'Rahul', mobile: '98XXXXXX10' }, items: [{ item_name: 'Veg Burger', quantity: 2, price: 60 }, { item_name: 'French Fries', quantity: 1, price: 70 }, { item_name: 'Cold Coffee', quantity: 1, price: 50 }] };
      prev.innerHTML = invoiceHTML(sample, values());
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try { S.settings = await API.put('/admin/settings', values()); toast('Invoice details saved', 'leaf'); f.querySelector('[data-err]').textContent = ''; }
      catch (ex) { f.querySelector('[data-err]').textContent = ex.message; }
      btn.disabled = false;
    });
  }

  // ---------- QR codes ----------
  function qrPage() {
    const base = store.get('mc_qr_base') || '';
    return `<div class="a-head"><div><h1>Table QR codes</h1><p>Print one card per table. Each code opens the menu already set to that table.</p></div>
      <div class="actions"><button class="btn btn-primary" data-act="qr-print-all">Print all ${S.tables.length}</button></div></div>
      <div class="panel" style="padding:14px 18px;margin-bottom:18px;display:grid;gap:8px">
        <div class="field"><label for="qr-base">Ordering address</label>
        <input id="qr-base" class="input" placeholder="${esc(window.MC_DEFAULT_BASE || location.origin)}" value="${esc(base)}" style="max-width:460px"></div>
        <p class="fineprint">The web address customers reach, such as https://order.maitricafe.in. Leave empty to use ${esc(window.MC_DEFAULT_BASE || location.origin)}. Reprint the cards if you change it.</p></div>
      <div class="qr-grid" id="qr-grid"><p class="col-empty">Loading codes…</p></div>`;
  }
  function qrUrl(t) {
    const base = (store.get('mc_qr_base') || window.MC_DEFAULT_BASE || '').replace(/\/$/, '');
    if (!base) return t.url;
    const u = new URL(t.url); return base + u.pathname + u.search;
  }
  function qrDataUrl(text, cell = 6) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  }
  function qrCardHTML(t) {
    return `<div class="qr-print"><div class="brand">Maitri</div><div class="qr-tbl">Table ${t.table_number}</div>
      <div class="qr-box"><img src="${qrDataUrl(qrUrl(t))}" alt="QR code for Table ${t.table_number}"></div><p>Scan to see the menu and order</p></div>`;
  }
  async function loadQr() {
    const base = root.querySelector('#qr-base');
    base.addEventListener('change', () => { store.set('mc_qr_base', base.value.trim()); drawQr(); });
    try { if (!S.qr) { S.qr = await API.get('/admin/qr'); S.qrTables = S.tables.length; } drawQr(); }
    catch (e) { root.querySelector('#qr-grid').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  function drawQr() {
    const grid = root.querySelector('#qr-grid');
    if (!grid || !S.qr) return;
    if (typeof qrcode !== 'function') { grid.innerHTML = '<p class="err">The QR generator did not load. Refresh the page.</p>'; return; }
    grid.innerHTML = S.qr.map(t => `<div class="qr-card">${qrCardHTML(t)}
      <p class="qr-url">${esc(qrUrl(t))}</p>
      <div class="qr-actions"><button class="btn btn-ghost" data-act="qr-open" data-n="${t.table_number}">Open</button><button class="btn btn-ghost" data-act="qr-dl" data-n="${t.table_number}">Download</button><button class="btn btn-ghost" data-act="qr-print" data-n="${t.table_number}">Print</button></div></div>`).join('');
  }
  function printCards(list) {
    const area = root.querySelector('#print-area');
    area.innerHTML = list.map(qrCardHTML).join('');
    area.classList.add('print-on');
    const done = () => { area.classList.remove('print-on'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { try { window.print(); } catch (e) { toast('Printing is blocked here. Use Download instead.', 'chilli'); } setTimeout(done, 1500); }, 150);
  }
  async function downloadCard(t) {
    const W = 900, H = 1200, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await document.fonts.load('120px "Caveat Brush"'); await document.fonts.load('800 80px "Manrope"'); } catch (e) { /* fallback fonts */ }
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1C1512'; g.lineWidth = 10; g.strokeRect(30, 30, W - 60, H - 60);
    g.fillStyle = '#1C1512'; g.textAlign = 'center';
    g.font = '150px "Caveat Brush", cursive'; g.fillText('Maitri', W / 2, 220);
    g.font = '700 34px "Manrope", sans-serif'; g.fillStyle = '#C2410C'; g.fillText('C A F E', W / 2, 275);
    g.fillStyle = '#C2410C'; g.font = '800 92px "Manrope", sans-serif'; g.fillText('Table ' + t.table_number, W / 2, 400);
    const qr = qrcode(0, 'M'); qr.addData(qrUrl(t)); qr.make();
    const n = qr.getModuleCount(), size = 540, cell = Math.floor(size / (n + 4)), qs = cell * (n + 4), x0 = (W - qs) / 2, y0 = 450;
    g.fillStyle = '#fff'; g.fillRect(x0, y0, qs, qs);
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(x0 + (col + 2) * cell, y0 + (r + 2) * cell, cell, cell);
    g.fillStyle = '#5E5650'; g.font = '600 38px "Manrope", sans-serif'; g.fillText('Scan to see the menu and order', W / 2, y0 + qs + 80);
    g.font = '500 28px "Manrope", sans-serif'; g.fillText('Good food ~ Good vibes ~ Always', W / 2, y0 + qs + 130);
    c.toBlob(blob => (window.MC_SAVE_FILE || defaultSave)(`maitri-table-${t.table_number}-qr.png`, blob), 'image/png');
  }
  function defaultSave(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- actions ----------
  const armed = new Map();
  function confirmTap(btn, text) {
    if (btn.dataset.armed) return true;
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = text;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = orig; } }, 3000);
    return false;
  }
  function addTableModal() {
    const next = (S.tables.reduce((mx, t) => Math.max(mx, t.table_number), 0) || 0) + 1;
    const m = openModal(`<form novalidate><div class="sheet-head"><h2 style="font-size:22px">Add table</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="sheet-body form-grid"><div class="field"><label for="t-n">Table number</label><input id="t-n" name="n" class="input" type="number" min="1" max="99" value="${next}" autofocus></div>
      <p class="fineprint">A new QR code is created for it. Print it from QR codes.</p><p class="err" data-err role="alert"></p></div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block btn-lg" type="submit">Add table</button></div></form>`, { label: 'Add table' });
    const f = m.el.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await API.post('/admin/tables', { table_number: Number(f.n.value) }); await loadTables(); S.qr = null; m.close(); toast(`Table ${r.table_number} added`, 'leaf'); renderRoute(); }
      catch (ex) { f.querySelector('[data-err]').textContent = ex.message; }
    });
  }
  async function setStatus(btn) {
    const id = Number(btn.dataset.id), status = btn.dataset.status;
    if (status === 'REJECTED' && !armed.get(id)) {
      armed.set(id, true); btn.textContent = 'Tap again to reject';
      setTimeout(() => { armed.delete(id); if (btn.isConnected) btn.textContent = 'Reject'; }, 3000);
      return;
    }
    armed.delete(id);
    btn.disabled = true;
    try { const o = await API.post(`/admin/orders/${id}/status`, { status }); M.haptic(10); await M.vt(() => { upsert(o); renderRoute(true); }); }
    catch (e) { toast(e.message, 'chilli'); btn.disabled = false; await loadOrders(); renderRoute(true); }
  }

  function onClick(e) {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); closeDrawer(); Nav.go(go.dataset.go); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); Nav.go(nav.dataset.nav); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;
    if (a === 'status') setStatus(t);
    else if (a === 'table') { drawerTable = Number(t.dataset.n); renderDrawer(); }
    else if (a === 'close-drawer') closeDrawer();
    else if (a === 'invoice') openInvoice(Number(t.dataset.id));
    else if (a === 'add-table') addTableModal();
    else if (a === 'remove-table') { if (confirmTap(t, 'Tap again to remove')) API.del('/admin/tables/' + t.dataset.n).then(loadTables).then(() => { S.qr = null; closeDrawer(); toast(`Table ${t.dataset.n} removed. Its QR code no longer works.`, 'leaf'); renderRoute(); }).catch(err => toast(err.message, 'chilli')); }
    else if (a === 'hday') { const d = Number(t.dataset.d); if (d === 0) S.histDay = localDay(); else { const [y, m, dd] = S.histDay.split('-').map(Number); const nd = new Date(y, m - 1, dd + d); if (localDay(nd) <= localDay()) S.histDay = localDay(nd); } renderRoute(); }
    else if (a === 'item-new') itemModal(null, Number(t.dataset.cat) || null);
    else if (a === 'item-edit') itemModal(Number(t.dataset.id));
    else if (a === 'item-del') { if (confirmTap(t, 'Tap to confirm')) API.del('/admin/menu/items/' + t.dataset.id).then(loadMenu).then(() => { toast('Item removed', 'leaf'); renderRoute(); }).catch(err => toast(err.message, 'chilli')); }
    else if (a === 'cat-new') categoryModal(null);
    else if (a === 'cat-edit') categoryModal(Number(t.dataset.id));
    else if (a === 'cat-del') { if (confirmTap(t, 'Tap to confirm')) API.del('/admin/menu/categories/' + t.dataset.id).then(loadMenu).then(() => { toast('Type removed', 'leaf'); renderRoute(); }).catch(err => toast(err.message, 'chilli')); }
    else if (a === 'clear-table') { if (confirmTap(t, 'Tap again to free the table')) API.post(`/admin/tables/${t.dataset.n}/clear`).then(loadTables).then(() => { renderRoute(true); toast(`Table ${t.dataset.n} is free`, 'leaf'); }).catch(err => toast(err.message, 'chilli')); }
    else if (a === 'otab') { S.ordersTab = t.dataset.tab; renderRoute(); }
    else if (a === 'mo-table') { S.mo.table = Number(t.dataset.n); root.querySelectorAll('[data-act="mo-table"]').forEach(b => b.setAttribute('aria-pressed', b === t)); renderMoSummary(); }
    else if (a === 'mo-cat') { S.mo.cat = t.dataset.cat; root.querySelectorAll('[data-act="mo-cat"]').forEach(b => b.setAttribute('aria-pressed', b === t)); renderMoMenu(); }
    else if (a === 'mo-add' || a === 'mo-inc') moQty(t.dataset.id, 1);
    else if (a === 'mo-dec') moQty(t.dataset.id, -1);
    else if (a === 'mo-rm') moQty(t.dataset.id, 0, 0);
    else if (a === 'mo-create') createManual();
    else if (a === 'qr-open') { const q = S.qr.find(x => x.table_number === Number(t.dataset.n)); (window.MC_OPEN_TABLE || (u => window.open(u, '_blank', 'noopener')))(q.url, qrUrl(q)); }
    else if (a === 'qr-dl') downloadCard(S.qr.find(x => x.table_number === Number(t.dataset.n)));
    else if (a === 'qr-print') printCards([S.qr.find(x => x.table_number === Number(t.dataset.n))]);
    else if (a === 'qr-print-all') { if (S.qr) printCards(S.qr); }
    else if (a === 'logout') API.post('/admin/logout').finally(() => { if (live) live.close(); live = null; timers.splice(0).forEach(clearInterval); loginView(); });
  }
  root.addEventListener('click', onClick);
  const onNav = () => { if (S.me && root.querySelector('#am')) { closeDrawer(); M.vt(() => { renderRoute(); window.scrollTo(0, 0); }); } };
  window.addEventListener('navchange', onNav);
  const onKey = e => { if (e.key === 'Escape') closeDrawer(); };
  document.addEventListener('keydown', onKey);

  return function destroy() {
    destroyed = true;
    root.removeEventListener('click', onClick);
    window.removeEventListener('navchange', onNav);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    timers.forEach(clearInterval);
    if (live) live.close();
    closeDrawer();
    root.innerHTML = '';
  };
};