// PostgreSQL (Supabase) database layer.
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const MENU = require('./menu-seed');

function poolConfig() {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new Error('DATABASE_URL is not set. Add your Supabase connection string to the environment.');
  const url = new URL(raw);
  url.searchParams.delete('sslmode'); // SSL is configured below
  const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX) || 3, // serverless: keep it small, use Supabase's pooler
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

let pool;
const getPool = () => (pool ||= new Pool(poolConfig()));

// Run a query and return rows.
async function q(text, params = []) {
  return (await getPool().query(text, params)).rows;
}
async function one(text, params = []) {
  return (await q(text, params))[0] || null;
}
// Run several queries in one transaction. fn receives a query function with the same shape as q().
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn((text, params = []) => client.query(text, params).then(r => r.rows));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  table_number INTEGER NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS menu_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  variant TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  image TEXT NOT NULL DEFAULT '',
  available BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  token TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  table_id INTEGER NOT NULL REFERENCES tables(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  session_token TEXT,
  order_type TEXT NOT NULL CHECK (order_type IN ('QR','MANUAL')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','PREPARING','READY','SERVED','REJECTED')),
  total_amount INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admin_users(id),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_token);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_sessions_table ON customer_sessions(table_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_items_category ON menu_items(category_id, sort_order);
`;

const newToken = () => crypto.randomBytes(6).toString('base64url');

async function setup() {
  await tx(async run => {
    // Only one instance sets up the database at a time.
    await run('SELECT pg_advisory_xact_lock(4242001)');
    await run(SCHEMA);
    const [{ c: tableCount }] = await run('SELECT COUNT(*)::int AS c FROM tables');
    if (tableCount === 0) {
      for (let n = 1; n <= 10; n++) await run('INSERT INTO tables (table_number, qr_token) VALUES ($1, $2)', [n, newToken()]);
    }
    const [{ c: catCount }] = await run('SELECT COUNT(*)::int AS c FROM menu_categories');
    if (catCount === 0) {
      for (const [ci, cat] of MENU.entries()) {
        const [{ id: catId }] = await run('INSERT INTO menu_categories (slug, name, image, sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
          [cat.slug, cat.name, `/menu-images/${cat.slug}.jpg`, ci]);
        let order = 0;
        for (const [name, price] of cat.items) {
          if (typeof price === 'object') {
            for (const [variant, p] of Object.entries(price)) {
              await run('INSERT INTO menu_items (category_id, name, variant, price, sort_order) VALUES ($1,$2,$3,$4,$5)', [catId, name, variant, p, order++]);
            }
          } else await run('INSERT INTO menu_items (category_id, name, variant, price, sort_order) VALUES ($1,$2,NULL,$3,$4)', [catId, name, price, order++]);
        }
      }
    }
    const defaults = { cafe_name: 'Maitri Cafe', address: '', phone: '', gstin: '', invoice_footer: 'Thank you! Visit again.' };
    for (const [k, v] of Object.entries(defaults)) await run('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
    const [{ c: adminCount }] = await run('SELECT COUNT(*)::int AS c FROM admin_users');
    if (adminCount === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'maitri@123';
      await run('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', [username, bcrypt.hashSync(password, 12)]);
      if (!process.env.ADMIN_PASSWORD) console.warn(`Created default admin "${username}" / "${password}". Set ADMIN_PASSWORD or run: npm run set-admin`);
    }
  });
}

// Set up once per server instance; retried on the next request if it fails.
let ready = null;
function init() {
  if (!ready) ready = setup().catch(e => { ready = null; throw e; });
  return ready;
}

module.exports = { q, one, tx, init, newToken, getPool };
