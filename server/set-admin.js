// Usage: npm run set-admin -- <username> <password>
const bcrypt = require('bcryptjs');
const { q, init, getPool } = require('./db');
const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: npm run set-admin -- <username> <password>   (password: 8+ characters)');
  process.exit(1);
}
(async () => {
  await init();
  await q(`INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
    ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [username, bcrypt.hashSync(password, 12)]);
  await q('DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admin_users WHERE username = $1)', [username]);
  console.log(`Saved admin "${username}". Existing sessions for this user were signed out.`);
  await getPool().end();
})().catch(e => { console.error(e.message); process.exit(1); });
