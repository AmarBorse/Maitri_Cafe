// Photo storage on Supabase Storage (public bucket). Uses the Storage REST API directly.
const crypto = require('crypto');

const BUCKET = process.env.SUPABASE_BUCKET || 'menu-photos';
const base = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const enabled = () => Boolean(base() && key());
const headers = extra => ({ Authorization: `Bearer ${key()}`, apikey: key(), ...extra });
const publicPrefix = () => `${base()}/storage/v1/object/public/${BUCKET}/`;

// Is this URL one of our uploaded photos?
function isOurPhoto(url) {
  if (!enabled() || typeof url !== 'string' || !url.startsWith(publicPrefix())) return false;
  return /^[a-f0-9]{24}\.(jpg|png|webp)$/.test(url.slice(publicPrefix().length));
}

// Create the public bucket the first time it's needed (ignored if it already exists).
let bucketReady = null;
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = fetch(`${base()}/storage/v1/bucket`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 4 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
    }).then(r => r.text()).catch(e => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

async function upload(buffer, ext, contentType) {
  if (!enabled()) throw Object.assign(new Error('Photo storage is not set up. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'), { status: 503 });
  await ensureBucket();
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  const res = await fetch(`${base()}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'cache-control': 'max-age=31536000', 'x-upsert': 'false' }),
    body: buffer,
  });
  if (!res.ok) {
    console.error('Supabase upload failed:', res.status, await res.text().catch(() => ''));
    throw Object.assign(new Error('The photo could not be saved. Try again in a moment.'), { status: 502 });
  }
  return publicPrefix() + name;
}

async function remove(url) {
  if (!isOurPhoto(url)) return;
  const name = url.slice(publicPrefix().length);
  await fetch(`${base()}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [name] }),
  }).catch(() => {});
}

module.exports = { upload, remove, isOurPhoto, enabled };
