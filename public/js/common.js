/* Shared helpers for the customer and admin apps. */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupees = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const itemLabel = i => i.name + (i.variant ? ` (${i.variant})` : '');
  const maskMobile = m => (m ? String(m).slice(0, 2) + 'XXXXXX' + String(m).slice(-2) : '');
  const timeAgo = iso => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min ago';
  };
  const clock = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  const STATUS = {
    PENDING: { label: 'Waiting for approval', short: 'Pending', tone: 'saffron' },
    APPROVED: { label: 'Approved', short: 'Approved', tone: 'leaf' },
    PREPARING: { label: 'Preparing', short: 'Preparing', tone: 'amber' },
    READY: { label: 'Ready to serve', short: 'Ready', tone: 'green' },
    SERVED: { label: 'Served', short: 'Served', tone: 'muted' },
    REJECTED: { label: 'Not accepted', short: 'Rejected', tone: 'chilli' },
  };
  const TABLE_STATUS = {
    AVAILABLE: { label: 'Available', tone: 'free' },
    OCCUPIED: { label: 'Guest seated', tone: 'occupied' },
    ORDER_PENDING: { label: 'New order', tone: 'saffron' },
    APPROVED: { label: 'Approved', tone: 'leaf' },
    PREPARING: { label: 'Preparing', tone: 'amber' },
    READY: { label: 'Ready', tone: 'green' },
  };

  // Group menu items for display: momos variants become one entry with options.
  function groupMenu(menu) {
    const byCat = menu.categories.map(c => ({ ...c, entries: [] }));
    const catMap = Object.fromEntries(byCat.map(c => [c.id, c]));
    for (const it of menu.items) {
      const cat = catMap[it.category_id];
      if (!cat) continue;
      if (it.variant) {
        let entry = cat.entries.find(e => e.name === it.name && e.variants);
        if (!entry) { entry = { key: 'g' + it.id, name: it.name, image: it.image, variants: [] }; cat.entries.push(entry); }
        entry.variants.push(it);
      } else cat.entries.push({ key: 'i' + it.id, name: it.name, image: it.image, item: it });
    }
    return byCat;
  }

  function toast(message, tone = 'ink', ms = 3200) {
    let host = document.getElementById('toasts');
    if (!host) { host = document.createElement('div'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const t = document.createElement('div');
    t.className = 'toast toast-' + tone;
    t.textContent = message;
    host.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // Two-note chime via Web Audio (only plays after any user interaction, per browser policy).
  let audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [880, 1318].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = audioCtx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.55);
      });
    } catch (e) { /* audio not available */ }
  }

  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  // Navigation adapter. Server mode uses real URLs; demo mode overrides window.Nav.
  window.Nav = window.Nav || {
    path: () => location.pathname.replace(/\/$/, '') || '/',
    params: () => new URLSearchParams(location.search),
    go(path, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', path); window.dispatchEvent(new Event('navchange')); },
  };
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('navchange')));


  // ---- dates ----
  const dateTime = iso => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const shortDate = iso => {
    const d = new Date(iso), today = new Date(), y = new Date(Date.now() - 864e5);
    const same = (a, b) => a.toDateString() === b.toDateString();
    const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (same(d, today)) return 'Today, ' + t;
    if (same(d, y)) return 'Yesterday, ' + t;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + t;
  };
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---- invoice ----
  function words(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thousand = Math.floor((n % 1e5) / 1e3), rest = n % 1e3;
    if (crore) parts.push(two(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thousand) parts.push(two(thousand) + ' Thousand');
    if (rest) parts.push(three(rest));
    return parts.join(' ');
  }
  function invoiceHTML(o, s = {}) {
    const qty = o.items.reduce((t, i) => t + i.quantity, 0);
    return `<article class="invoice" aria-label="Invoice ${esc(o.order_number)}">
      <header class="inv-head">
        <div class="brand inv-brand">${esc((s.cafe_name || 'Maitri Cafe').replace(/\s*cafe$/i, '')) || 'Maitri'}</div>
        <div class="inv-sub">${esc(s.cafe_name || 'Maitri Cafe')}</div>
        ${s.address ? `<div>${esc(s.address)}</div>` : ''}
        ${s.phone ? `<div>Phone: ${esc(s.phone)}</div>` : ''}
        ${s.gstin ? `<div>GSTIN: ${esc(s.gstin)}</div>` : ''}
      </header>
      <div class="inv-title">${o.status === 'SERVED' ? 'Invoice' : o.status === 'REJECTED' ? 'Cancelled order' : 'Bill (order in progress)'}</div>
      <dl class="inv-meta">
        <div><dt>Invoice no.</dt><dd>${esc(o.order_number)}</dd></div>
        <div><dt>Date</dt><dd>${esc(dateTime(o.created_at))}</dd></div>
        <div><dt>Table</dt><dd>${o.table_number}</dd></div>
        <div><dt>Order type</dt><dd>${o.order_type === 'QR' ? 'QR order' : 'Manual order'}</dd></div>
        <div><dt>Customer</dt><dd>${esc(o.customer.name)}</dd></div>
        <div><dt>Mobile</dt><dd>${esc(o.customer.mobile)}</dd></div>
      </dl>
      <table class="inv-items">
        <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${o.items.map(i => `<tr><td>${esc(i.item_name)}</td><td class="r">${i.quantity}</td><td class="r">${i.price}</td><td class="r">${i.quantity * i.price}</td></tr>`).join('')}</tbody>
      </table>
      <div class="inv-totals">
        <div><span>Items</span><span>${qty}</span></div>
        <div><span>Subtotal</span><span>${rupees(o.total_amount)}</span></div>
        <div class="inv-grand"><span>Total</span><span>${rupees(o.total_amount)}</span></div>
        <div class="inv-words">Rupees ${words(o.total_amount)} only</div>
      </div>
      ${o.note ? `<p class="inv-note">Note: ${esc(o.note)}</p>` : ''}
      <footer class="inv-foot">${esc(s.invoice_footer || 'Thank you! Visit again.')}<br><small>Printed ${esc(dateTime(new Date().toISOString()))}</small></footer>
    </article>`;
  }
  function printInvoice(o, s) {
    let area = document.getElementById('invoice-print');
    if (!area) { area = document.createElement('div'); area.id = 'invoice-print'; document.body.appendChild(area); }
    area.innerHTML = invoiceHTML(o, s);
    document.body.classList.add('printing-invoice');
    const done = () => { document.body.classList.remove('printing-invoice'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 100);
  }

  // ---- dialog ----
  function openModal(html, { side = false, label = 'Dialog', onClick } = {}) {
    const scrim = document.createElement('div');
    scrim.className = 'scrim' + (side ? ' right' : '');
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div>`;
    const prev = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', key);
      document.body.classList.remove('no-scroll');
      const done = () => { scrim.remove(); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
      if (window.Motion && Motion.on()) { scrim.classList.add('closing'); setTimeout(done, 230); } else done();
    };
    const key = e => { if (e.key === 'Escape') close(); };
    scrim.addEventListener('click', e => {
      if (e.target === scrim || e.target.closest('[data-close]')) return close();
      if (onClick) onClick(e, close);
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(scrim);
    document.body.classList.add('no-scroll');
    if (!side && window.Motion) Motion.swipeToClose(scrim.querySelector('.sheet'), close);
    const f = scrim.querySelector('[autofocus], input, select, textarea, button');
    if (f) f.focus({ preventScroll: true });
    return { el: scrim, close };
  }

  // ---- photos: shrink in the browser before upload (fast uploads, light pages) ----
  function resizeImage(file, max = 900) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Choose a JPG, PNG or WebP photo.'));
      if (file.size > 15 * 1024 * 1024) return reject(new Error('That photo is over 15 MB. Choose a smaller one.'));
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const scale = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read.')); };
      im.src = url;
    });
  }

  // Footer credit shown on customer and staff pages.
  const creditHTML = (extra = '') => `<footer class="credit ${extra}">Website design &amp; manage by <a href="https://www.hiresnix.co.in/" target="_blank" rel="noopener">Hiresnix</a></footer>`;

  const img = src => (window.MC_IMAGES && window.MC_IMAGES[src]) || src;
  window.MC = { creditHTML, dateTime, shortDate, localDay, invoiceHTML, printInvoice, openModal, resizeImage, img, esc, rupees, itemLabel, maskMobile, timeAgo, clock, STATUS, TABLE_STATUS, groupMenu, toast, chime, store };
})();