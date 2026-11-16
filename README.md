# Maitri Cafe — QR Ordering & Table Management (Vercel + Supabase)

Customers scan the QR on their table, enter name and mobile, and order. Staff approve and track orders, manage the menu, tables, invoices and QR codes from one dashboard.

**Stack:** Node.js + Express (as a Vercel function) · PostgreSQL on Supabase · photos on Supabase Storage · plain HTML/CSS/JavaScript.
Screens refresh automatically every 4 seconds (staff) and every 4 seconds on a customer's order screen.

## 1. Supabase (database + photo storage)

1. Create a free project at supabase.com. Save the database password.
2. **Connect** button → **Transaction pooler** → copy the connection string (port **6543**). Put your password in place of `[YOUR-PASSWORD]`. This is `DATABASE_URL`.
3. **Project Settings → API** (or **API Keys**): copy the **Project URL** (`SUPABASE_URL`) and the **service_role / secret** key (`SUPABASE_SERVICE_ROLE_KEY`). Keep this key private.

Tables, the starting menu, 10 tables and the first staff login are created automatically on first use. The photo bucket `menu-photos` is created automatically on the first upload.

## 2. Vercel

1. Put this folder in a GitHub repository (do not upload `node_modules` or `.env`).
2. On vercel.com: **Add New → Project** → import the repository. Framework preset: **Other**. Leave build settings empty.
3. **Environment Variables** — add:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` (first staff login)
4. **Deploy.** Open `https://your-project.vercel.app/admin` and sign in.
5. Custom domain (optional): Project → **Settings → Domains** → add `order.yourdomain.com` and add the DNS record Vercel shows at GoDaddy.
6. Print QR codes from **QR codes** after the final address is set.

Vercel's free Hobby plan is for non-commercial use; a business may need the Pro plan.

## Run on your computer

```
npm install
copy .env.example .env      (then fill in the values)
npm start
```
Open http://localhost:3000/admin. Change a staff password: `npm run set-admin -- admin "new-password"`.

## Pages

Customer: `/order?table=N&k=KEY` → details → choose a type → items → cart → order tracking → bill.
Staff: `/admin` (tables + order board), `/admin/orders` (active + history by date), `/admin/tables`, `/admin/manual-order`, `/admin/menu`, `/admin/qr-codes`, `/admin/settings` (invoice details).

## Rules built in

- One guest per table; other phones are blocked until staff tap **Mark table free** (or after 6 hours).
- Order flow: PENDING → APPROVED → PREPARING → READY → SERVED (REJECTED from Pending/Approved).
- Totals are always calculated on the server from database prices. All input is validated on the server.
- Staff login uses an HttpOnly, SameSite=Strict, Secure cookie; logins are rate-limited.

## Backups

Supabase → **Database → Backups**, or export tables from the Table Editor. Download a copy regularly.

## Project layout

```
api/index.js          Vercel entry point
server/app.js         API (Express)
server/db.js          PostgreSQL connection, tables, first-run setup
server/storage.js     Photo storage (Supabase Storage)
server/menu-seed.js   Starting menu
server/set-admin.js   Create or reset a staff login
server/index.js       Local runner (npm start)
public/               Customer and staff pages, styles, food photos
vercel.json           Routes and caching for Vercel
.env.example          Settings template
```
