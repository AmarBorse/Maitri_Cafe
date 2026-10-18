// Maitri Cafe — Express app (runs on Vercel as a function, or locally via server/index.js).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { q, one, tx, init, newToken } = require('./db');
const storage = require('./storage');

const APP_VERSION = '5.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ACTIVE = ['PENDING', 'APPROVED', 'PREPARING', 'READY'];
const NEXT_STATUS = { PENDING: ['APPROVED', 'REJECTED'], APPROVED: ['PREPARING', 'REJECTED'], PREPARING: ['READY'], READY: ['SERVED'] };
const CUSTOMER_SESSION_HOURS = 6;
const ADMIN_SESSION_HOURS = 12;
const MAX_TABLE = 99;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const smallJson = express.json({ limit: '32kb' });
const uploadJson = express.json({ limit: '4mb' });
app.use((req, res, next) => (req.path === '/api/admin/upload' ? uploadJson : smallJson)(req, res, next));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});
// Make sure the database is set up before any API call.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); init().then(() => next(), next); });

// ---------- helpers ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
const token = () => crypto.randomBytes(24).toString('base64url');
const iso = d => (d instanceof Date ? d.toISOString() : d);
const parseCookies = (header = '') => Object.fromEntries(header.split(';').map(p => p.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

function cleanMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw httpError(400, 'Enter a valid 10-digit mobile number.');
  return digits;
}
function cleanName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) throw httpError(400, 'Enter your name (2–40 letters).');
  return name;
}
function cleanText(raw, { min = 1, max = 60, label = 'Text' } = {}) {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw httpError(400, `${label} must be ${min ? min + '–' : 'up to '}${max} characters.`);
  return s;
}
function cleanPrice(raw) {
  const p = Number(raw);
  if (!Number.isInteger(p) || p < 1 || p > 5000) throw httpError(400, 'Price must be a whole number between ₹1 and ₹5000.');
  return p;
}
function cleanTableNumber(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TABLE) throw httpError(400, `Table number must be between 1 and ${MAX_TABLE}.`);
  return n;
}
function cleanImage(raw, allowEmpty) {
  const s = String(raw ?? '');
  if (allowEmpty && s === '') return '';
  if (/^\/menu-images\/[a-z0-9-]+\.jpg$/.test(s) || storage.isOurPhoto(s)) return s;
  throw httpError(400, 'Upload the photo again.');
}
const cleanNote = raw => String(raw || '').trim().slice(0, 200) || null;
async function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'category';
  let slug = base, i = 2;
  while (await one('SELECT 1 FROM menu_categories WHERE slug = $1', [slug])) slug = `${base}-${i++}`;
  return slug;
}
// Delete an uploaded photo once nothing points at it.
async function releaseImage(url) {
  if (!storage.isOurPhoto(url)) return;
  const used = await one('SELECT 1 FROM menu_items WHERE image = $1 UNION SELECT 1 FROM menu_categories WHERE image = $1', [url]);
  if (!used) await storage.remove(url);
}

// Per-instance rate limiter (fixed window).
const hits = new Map();
function limit(bucket, max, windowMs) {
  return (req, res, next) => {
    const k = bucket + ':' + req.ip, now = Date.now(), h = hits.get(k);
    if (hits.size > 5000) hits.clear();
    if (!h || now - h.start > windowMs) hits.set(k, { start: now, count: 1 });
    else if (++h.count > max) return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
    next();
  };
}

// ---------- queries ----------
const tableByNumber = n => one('SELECT * FROM tables WHERE table_number = $1 AND active', [n]);
const menuItemById = id => one('SELECT * FROM menu_items WHERE id = $1 AND NOT deleted', [id]);
const categoryById = id => one('SELECT * FROM menu_categories WHERE id = $1 AND NOT deleted', [id]);
const upsertCustomer = (name, mobile) => one(`INSERT INTO customers (name, mobile) VALUES ($1, $2)
  ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name RETURNING *`, [name, mobile]);
const sessionByToken = t => one(`SELECT cs.*, c.name, c.mobile, t.table_number FROM customer_sessions cs
  JOIN customers c ON c.id = cs.customer_id JOIN tables t ON t.id = cs.table_id
  WHERE cs.token = $1 AND cs.expires_at > now() AND t.active`, [t]);
const holderOf = tableId => one(`SELECT cs.token, cs.created_at, c.name, c.mobile FROM customer_sessions cs
  JOIN customers c ON c.id = cs.customer_id WHERE cs.table_id = $1 AND cs.expires_at > now()
  ORDER BY cs.created_at DESC LIMIT 1`, [tableId]);

// Orders with their items in two queries.
async function fetchOrders(where = 'TRUE', params = [], order = 'o.id', limitN = 500) {
  const rows = await q(`SELECT o.*, t.table_number, c.name AS customer_name, c.mobile AS customer_mobile
    FROM orders o JOIN tables t ON t.id = o.table_id JOIN customers c ON c.id = o.customer_id
    WHERE ${where} ORDER BY ${order} LIMIT ${Number(limitN)}`, params);
  if (!rows.length) return [];
  const items = await q(`SELECT id, order_id, menu_item_id, item_name, quantity, price FROM order_items
    WHERE order_id = ANY($1::int[]) ORDER BY id`, [rows.map(r => r.id)]);
  const byOrder = new Map(rows.map(r => [r.id, []]));
  for (const { order_id, ...rest } of items) byOrder.get(order_id).push(rest);
  return rows.map(o => ({
    id: o.id, order_number: o.order_number, table_number: o.table_number, order_type: o.order_type,
    status: o.status, total_amount: o.total_amount, note: o.note,
    customer: { name: o.customer_name, mobile: o.customer_mobile },
    created_at: iso(o.created_at), updated_at: iso(o.updated_at),
    session_token: o.session_token, items: byOrder.get(o.id),
  }));
}
const orderView = async id => (await fetchOrders('o.id = $1', [id]))[0] || null;
const publicOrder = o => { if (!o) return o; const { session_token, ...rest } = o; return rest; };
const activeOrders = () => fetchOrders('o.status = ANY($1::text[])', [ACTIVE], 'o.created_at');

async function menuPayload() {
  const cats = await q('SELECT id, slug, name, image FROM menu_categories WHERE NOT deleted ORDER BY sort_order, id');
  const catImg = Object.fromEntries(cats.map(c => [c.id, c.image]));
  const items = await q(`SELECT id, category_id, name, variant, price, image, available FROM menu_items
    WHERE NOT deleted AND category_id IN (SELECT id FROM menu_categories WHERE NOT deleted)
    ORDER BY category_id, sort_order, id`);
  return { categories: cats, items: items.map(i => ({ ...i, own_image: i.image, image: i.image || catImg[i.category_id] })) };
}
const publicMenu = async () => { const m = await menuPayload(); m.items.forEach(i => delete i.own_image); return m; };
const settingsPayload = async () => Object.fromEntries((await q('SELECT key, value FROM settings')).map(r => [r.key, r.value]));

async function tablesPayload(active) {
  active = active || await activeOrders();
  const tables = await q('SELECT id, table_number FROM tables WHERE active ORDER BY table_number');
  const holders = await q(`SELECT DISTINCT ON (cs.table_id) cs.table_id, c.name, c.mobile, cs.created_at FROM customer_sessions cs
    JOIN customers c ON c.id = cs.customer_id WHERE cs.expires_at > now() ORDER BY cs.table_id, cs.created_at DESC`);
  const rank = { PENDING: 0, READY: 1, PREPARING: 2, APPROVED: 3 };
  return tables.map(t => {
    const orders = active.filter(o => o.table_number === t.table_number);
    const guest = holders.find(h => h.table_id === t.id);
    let status = 'AVAILABLE';
    if (orders.length) {
      const top = [...orders].sort((a, b) => rank[a.status] - rank[b.status])[0].status;
      status = top === 'PENDING' ? 'ORDER_PENDING' : top;
    } else if (guest) status = 'OCCUPIED';
    return {
      table_number: t.table_number, status, orders: orders.map(publicOrder),
      guest: guest ? { name: guest.name, mobile: guest.mobile, since: iso(guest.created_at) } : null,
    };
  });
}

// Build validated order lines from database prices — never trust client prices.
async function priceLines(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw httpError(400, 'Add at least one item.');
  if (rawItems.length > 60) throw httpError(400, 'Too many different items in one order.');
  const merged = new Map();
  for (const it of rawItems) {
    const id = Number(it && it.menu_item_id), qty = Number(it && it.quantity);
    if (!Number.isInteger(id) || id < 1) throw httpError(400, 'Invalid item.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 25) throw httpError(400, 'Quantity must be between 1 and 25.');
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  const rows = await q(`SELECT mi.* FROM menu_items mi JOIN menu_categories mc ON mc.id = mi.category_id
    WHERE mi.id = ANY($1::int[]) AND NOT mi.deleted AND NOT mc.deleted`, [[...merged.keys()]]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const lines = [];
  for (const [id, qty] of merged) {
    if (qty > 25) throw httpError(400, 'Quantity must be between 1 and 25.');
    const mi = byId.get(id);
    if (!mi) throw httpError(409, 'An item in your cart is no longer on the menu.');
    const label = mi.name + (mi.variant ? ` (${mi.variant})` : '');
    if (!mi.available) throw httpError(409, `${label} is currently unavailable.`);
    lines.push({ menu_item_id: id, item_name: label, quantity: qty, price: mi.price });
  }
  return lines;
}
function createOrder({ tableId, customerId, sessionToken, type, lines, note }) {
  return tx(async run => {
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const [{ id }] = await run(`INSERT INTO orders (table_id, customer_id, session_token, order_type, total_amount, note)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [tableId, customerId, sessionToken, type, total, note]);
    await run('UPDATE orders SET order_number = $1 WHERE id = $2', ['MC-' + (1000 + id), id]);
    for (const l of lines) {
      await run('INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, price) VALUES ($1,$2,$3,$4,$5)',
        [id, l.menu_item_id, l.item_name, l.quantity, l.price]);
    }
    return id;
  });
}
const endTableSessions = tableId => q(`UPDATE customer_sessions SET expires_at = now() WHERE table_id = $1 AND expires_at > now()`, [tableId]);
const openOrderCount = async (col, val) => (await one(`SELECT COUNT(*)::int AS c FROM orders WHERE ${col} = $1 AND status = ANY($2::text[])`, [val, ACTIVE])).c;

// ---------- auth ----------
const requireCustomer = wrap(async (req, res, next) => {
  const t = req.get('X-Session');
  const s = t && await sessionByToken(t);
  if (!s) return res.status(401).json({ error: 'Your table session has ended. Scan the table QR again.' });
  req.session = s;
  next();
});
const requireAdmin = wrap(async (req, res, next) => {
  const t = parseCookies(req.headers.cookie).mc_admin;
  const a = t && await one(`SELECT a.id, a.username FROM admin_sessions s JOIN admin_users a ON a.id = s.admin_id
    WHERE s.token = $1 AND s.expires_at > now()`, [t]);
  if (!a) return res.status(401).json({ error: 'Sign in to continue.' });
  req.admin = a;
  next();
});

// ---------- public / customer API ----------
app.get('/api/version', (req, res) => res.json({ version: APP_VERSION }));
app.get('/api/menu', wrap(async (req, res) => res.json(await publicMenu())));
app.get('/api/settings', wrap(async (req, res) => res.json(await settingsPayload())));

async function tableForQr(n, k) {
  const t = await tableByNumber(cleanTableNumber(n));
  if (!t || k !== t.qr_token) throw httpError(404, 'This QR code is not valid. Ask the staff for help.');
  return t;
}
app.get('/api/tables/:n/verify', wrap(async (req, res) => {
  const t = await tableForQr(req.params.n, req.query.k);
  res.json({ table_number: t.table_number, in_use: !!(await holderOf(t.id)) });
}));

app.post('/api/session', limit('session', 20, 60e3), wrap(async (req, res) => {
  const t = await tableForQr(req.body.table, req.body.k);
  const name = cleanName(req.body.name), mobile = cleanMobile(req.body.mobile);
  const result = await tx(async run => {
    // Lock this table's row so two phones can't take it at the same moment.
    await run('SELECT id FROM tables WHERE id = $1 FOR UPDATE', [t.id]);
    const [held] = await run(`SELECT cs.token, c.name, c.mobile FROM customer_sessions cs JOIN customers c ON c.id = cs.customer_id
      WHERE cs.table_id = $1 AND cs.expires_at > now() ORDER BY cs.created_at DESC LIMIT 1`, [t.id]);
    if (held) {
      if (held.mobile !== mobile) throw httpError(409, `Table ${t.table_number} is already taken by another guest. Please ask the staff for help.`);
      return { token: held.token, customer: { name: held.name, mobile: held.mobile } };
    }
    const [c] = await run(`INSERT INTO customers (name, mobile) VALUES ($1, $2)
      ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name RETURNING *`, [name, mobile]);
    const tok = token();
    await run(`INSERT INTO customer_sessions (token, customer_id, table_id, expires_at) VALUES ($1,$2,$3, now() + make_interval(hours => $4))`,
      [tok, c.id, t.id, CUSTOMER_SESSION_HOURS]);
    return { token: tok, customer: { name: c.name, mobile: c.mobile } };
  });
  res.json({ ...result, table_number: t.table_number });
}));

app.delete('/api/session', requireCustomer, wrap(async (req, res) => {
  if (await openOrderCount('session_token', req.session.token)) throw httpError(409, 'Your order is still in progress. Ask the staff if you need to change who is at this table.');
  await q('UPDATE customer_sessions SET expires_at = now() WHERE token = $1', [req.session.token]);
  res.json({ ok: true });
}));

app.get('/api/session', requireCustomer, wrap(async (req, res) => {
  const orders = await fetchOrders('o.session_token = $1', [req.session.token], 'o.id DESC', 20);
  res.json({ table_number: req.session.table_number, customer: { name: req.session.name, mobile: req.session.mobile }, orders: orders.map(publicOrder) });
}));

app.post('/api/orders', limit('order', 10, 60e3), requireCustomer, wrap(async (req, res) => {
  const lines = await priceLines(req.body.items);
  const pending = (await one(`SELECT COUNT(*)::int AS c FROM orders WHERE session_token = $1 AND status = 'PENDING'`, [req.session.token])).c;
  if (pending >= 3) throw httpError(429, 'You already have orders waiting for confirmation.');
  const id = await createOrder({ tableId: req.session.table_id, customerId: req.session.customer_id, sessionToken: req.session.token, type: 'QR', lines, note: cleanNote(req.body.note) });
  res.status(201).json(publicOrder(await orderView(id)));
}));

app.get('/api/orders/:id', requireCustomer, wrap(async (req, res) => {
  const o = await orderView(Number(req.params.id) || 0);
  if (!o || o.session_token !== req.session.token) throw httpError(404, 'Order not found.');
  res.json(publicOrder(o));
}));

// ---------- admin API ----------
app.post('/api/admin/login', limit('login', 8, 60e3), wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const a = await one('SELECT * FROM admin_users WHERE username = $1', [String(username || '')]);
  const ok = bcrypt.compareSync(String(password || ''), a ? a.password_hash : DUMMY_HASH);
  if (!a || !ok) throw httpError(401, 'Wrong username or password.');
  const tok = token();
  await q(`INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`, [tok, a.id, ADMIN_SESSION_HOURS]);
  q(`DELETE FROM admin_sessions WHERE expires_at < now()`).catch(() => {});
  res.set('Set-Cookie', `mc_admin=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_HOURS * 3600}${req.secure ? '; Secure' : ''}`);
  res.json({ username: a.username });
}));
app.post('/api/admin/logout', wrap(async (req, res) => {
  const t = parseCookies(req.headers.cookie).mc_admin;
  if (t) await q('DELETE FROM admin_sessions WHERE token = $1', [t]);
  res.set('Set-Cookie', 'mc_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

const admin = express.Router();
admin.use(requireAdmin);
admin.get('/me', (req, res) => res.json({ username: req.admin.username }));

// One call for the dashboard's automatic refresh: active orders + table states.
admin.get('/live', wrap(async (req, res) => {
  const active = await activeOrders();
  res.json({ orders: active.map(publicOrder), tables: await tablesPayload(active) });
}));

admin.get('/orders', wrap(async (req, res) => {
  if (req.query.from && req.query.to) {
    const from = new Date(req.query.from), to = new Date(req.query.to);
    if (isNaN(from) || isNaN(to) || to <= from || to - from > 32 * 864e5) throw httpError(400, 'Choose a valid date range.');
    return res.json((await fetchOrders('o.created_at >= $1 AND o.created_at < $2', [from, to], 'o.id DESC', 1000)).map(publicOrder));
  }
  res.json((await activeOrders()).map(publicOrder));
}));
admin.get('/orders/:id', wrap(async (req, res) => {
  const o = await orderView(Number(req.params.id) || 0);
  if (!o) throw httpError(404, 'Order not found.');
  res.json(publicOrder(o));
}));
admin.post('/orders/:id/status', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const o = await orderView(id);
  if (!o) throw httpError(404, 'Order not found.');
  const next = String(req.body.status || '');
  if (!(NEXT_STATUS[o.status] || []).includes(next)) throw httpError(409, `Can’t move an order from ${o.status} to ${next}.`);
  const updated = await q('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 AND status = $3 RETURNING id', [next, id, o.status]);
  if (!updated.length) throw httpError(409, 'Someone else just updated this order. Refreshing.');
  res.json(publicOrder(await orderView(id)));
}));
admin.post('/orders', wrap(async (req, res) => {
  const t = await tableByNumber(cleanTableNumber(req.body.table_number));
  if (!t) throw httpError(400, 'That table no longer exists.');
  const customer = await upsertCustomer(cleanName(req.body.name), cleanMobile(req.body.mobile));
  const lines = await priceLines(req.body.items);
  const id = await createOrder({ tableId: t.id, customerId: customer.id, sessionToken: null, type: 'MANUAL', lines, note: cleanNote(req.body.note) });
  res.status(201).json(publicOrder(await orderView(id)));
}));

// Tables
admin.get('/tables', wrap(async (req, res) => res.json(await tablesPayload())));
admin.post('/tables', wrap(async (req, res) => {
  let n = req.body.table_number;
  if (n === undefined || n === null || n === '') n = ((await one('SELECT MAX(table_number) AS m FROM tables WHERE active')).m || 0) + 1;
  n = cleanTableNumber(n);
  const existing = await one('SELECT * FROM tables WHERE table_number = $1', [n]);
  if (existing && existing.active) throw httpError(409, `Table ${n} already exists.`);
  if (existing) await q(`UPDATE tables SET active = true, status = 'AVAILABLE', qr_token = $1 WHERE id = $2`, [newToken(), existing.id]);
  else await q('INSERT INTO tables (table_number, qr_token) VALUES ($1, $2)', [n, newToken()]);
  res.status(201).json({ table_number: n });
}));
admin.delete('/tables/:n', wrap(async (req, res) => {
  const t = await tableByNumber(cleanTableNumber(req.params.n));
  if (!t) throw httpError(404, 'Table not found.');
  if (await openOrderCount('table_id', t.id)) throw httpError(409, `Table ${t.table_number} has active orders. Serve or reject them first.`);
  await tx(async run => {
    await run('UPDATE tables SET active = false WHERE id = $1', [t.id]);
    await run('UPDATE customer_sessions SET expires_at = now() WHERE table_id = $1 AND expires_at > now()', [t.id]);
  });
  res.json({ ok: true });
}));
admin.post('/tables/:n/clear', wrap(async (req, res) => {
  const t = await tableByNumber(cleanTableNumber(req.params.n));
  if (!t) throw httpError(404, 'Table not found.');
  if (await openOrderCount('table_id', t.id)) throw httpError(409, `Table ${t.table_number} still has orders in progress. Serve or reject them first.`);
  await endTableSessions(t.id);
  res.json({ ok: true });
}));

// Menu
admin.get('/menu', wrap(async (req, res) => res.json(await menuPayload())));
admin.post('/menu/categories', wrap(async (req, res) => {
  const name = cleanText(req.body.name, { max: 30, label: 'Category name' });
  const image = cleanImage(req.body.image);
  const sort = ((await one('SELECT MAX(sort_order) AS m FROM menu_categories')).m ?? -1) + 1;
  const row = await one('INSERT INTO menu_categories (slug, name, image, sort_order) VALUES ($1,$2,$3,$4) RETURNING id', [await slugify(name), name, image, sort]);
  res.status(201).json({ id: row.id });
}));
admin.patch('/menu/categories/:id', wrap(async (req, res) => {
  const c = await categoryById(Number(req.params.id) || 0);
  if (!c) throw httpError(404, 'Category not found.');
  const name = req.body.name !== undefined ? cleanText(req.body.name, { max: 30, label: 'Category name' }) : c.name;
  const image = req.body.image !== undefined ? cleanImage(req.body.image) : c.image;
  await q('UPDATE menu_categories SET name = $1, image = $2 WHERE id = $3', [name, image, c.id]);
  if (image !== c.image) await releaseImage(c.image);
  res.json({ ok: true });
}));
admin.delete('/menu/categories/:id', wrap(async (req, res) => {
  const c = await categoryById(Number(req.params.id) || 0);
  if (!c) throw httpError(404, 'Category not found.');
  const n = (await one('SELECT COUNT(*)::int AS c FROM menu_items WHERE category_id = $1 AND NOT deleted', [c.id])).c;
  if (n) throw httpError(409, `Remove or move the ${n} ${n === 1 ? 'item' : 'items'} in ${c.name} first.`);
  await q('UPDATE menu_categories SET deleted = true WHERE id = $1', [c.id]);
  res.json({ ok: true });
}));

async function itemFields(body, current = {}) {
  const has = k => body[k] !== undefined;
  const category_id = has('category_id') ? Number(body.category_id) : current.category_id;
  if (!Number.isInteger(category_id) || !(await categoryById(category_id))) throw httpError(400, 'Choose a category.');
  const variantRaw = has('variant') ? String(body.variant ?? '').trim() : (current.variant || '');
  return {
    category_id,
    name: has('name') ? cleanText(body.name, { max: 60, label: 'Item name' }) : current.name,
    variant: variantRaw ? cleanText(variantRaw, { max: 20, label: 'Variant' }) : null,
    price: has('price') ? cleanPrice(body.price) : current.price,
    image: has('image') ? cleanImage(body.image, true) : (current.image || ''),
    available: has('available') ? Boolean(body.available) : (current.available ?? true),
  };
}
const itemOut = async id => (await menuPayload()).items.find(i => i.id === id);
admin.post('/menu/items', wrap(async (req, res) => {
  const f = await itemFields(req.body, { available: true });
  if (f.name === undefined || f.price === undefined) throw httpError(400, 'Enter a name and price.');
  const sort = ((await one('SELECT MAX(sort_order) AS m FROM menu_items WHERE category_id = $1', [f.category_id])).m ?? -1) + 1;
  const row = await one(`INSERT INTO menu_items (category_id, name, variant, price, image, available, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [f.category_id, f.name, f.variant, f.price, f.image, f.available, sort]);
  res.status(201).json(await itemOut(row.id));
}));
admin.patch('/menu/items/:id', wrap(async (req, res) => {
  const cur = await menuItemById(Number(req.params.id) || 0);
  if (!cur) throw httpError(404, 'Item not found.');
  const f = await itemFields(req.body, cur);
  await q(`UPDATE menu_items SET category_id = $1, name = $2, variant = $3, price = $4, image = $5, available = $6 WHERE id = $7`,
    [f.category_id, f.name, f.variant, f.price, f.image, f.available, cur.id]);
  if (f.image !== cur.image) await releaseImage(cur.image);
  res.json(await itemOut(cur.id));
}));
admin.delete('/menu/items/:id', wrap(async (req, res) => {
  const cur = await menuItemById(Number(req.params.id) || 0);
  if (!cur) throw httpError(404, 'Item not found.');
  // Kept (hidden) so past orders and invoices still show it.
  await q(`UPDATE menu_items SET deleted = true, image = '' WHERE id = $1`, [cur.id]);
  await releaseImage(cur.image);
  res.json({ ok: true });
}));

// Photo upload: data URL from the browser (already resized there).
admin.post('/upload', limit('upload', 30, 60e3), wrap(async (req, res) => {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.data || ''));
  if (!m) throw httpError(400, 'Choose a JPG, PNG or WebP photo.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw httpError(400, 'Photo is too large (max 3 MB).');
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  const ext = isJpg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
  if (!ext) throw httpError(400, 'That file is not a valid photo.');
  const url = await storage.upload(buf, ext, ext === 'jpg' ? 'image/jpeg' : 'image/' + ext);
  res.status(201).json({ url });
}));

// Invoice details
admin.get('/settings', wrap(async (req, res) => res.json(await settingsPayload())));
admin.put('/settings', wrap(async (req, res) => {
  const limits = { cafe_name: [1, 40], address: [0, 160], phone: [0, 40], gstin: [0, 20], invoice_footer: [0, 120] };
  const updates = [];
  for (const [k, [min, max]] of Object.entries(limits)) {
    if (req.body[k] !== undefined) updates.push([k, cleanText(req.body[k], { min, max, label: k.replace('_', ' ') })]);
  }
  await tx(async run => {
    for (const [k, v] of updates) await run('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v]);
  });
  res.json(await settingsPayload());
}));

admin.get('/qr', wrap(async (req, res) => {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.json((await q('SELECT table_number, qr_token FROM tables WHERE active ORDER BY table_number'))
    .map(t => ({ table_number: t.table_number, url: `${base}/order?table=${t.table_number}&k=${t.qr_token}` })));
}));
app.use('/api/admin', admin);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  if (!err.status) console.error(err);
  const msg = err.status ? err.message : /DATABASE_URL/.test(err.message) ? err.message : 'Something went wrong. Try again.';
  res.status(err.status || 500).json({ error: msg });
});

// ---------- pages (used when running locally; on Vercel, vercel.json serves these) ----------
const noCache = res => res.set('Cache-Control', 'no-cache');
app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders: res => { if (res.req.query.v) res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); },
}));
app.get(['/', '/order'], (req, res) => { noCache(res); res.sendFile(path.join(PUBLIC_DIR, 'order.html')); });
app.get(['/admin', '/admin/*'], (req, res) => { noCache(res); res.sendFile(path.join(PUBLIC_DIR, 'admin.html')); });

app.APP_VERSION = APP_VERSION;
module.exports = app;