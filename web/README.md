# VIOCHEM

Imports, stock by lot, sales invoices and margins for VIOCHEM, an importer of aroma chemicals in Egypt.

## What it does

- **Import shipments**: products and prices in the supplier's currency, the exchange rate, and every charge (freight, duty, clearance). Receiving a shipment turns each product into a lot with its real landed cost per kg.
- **Late bills**: adding or changing a charge after the goods arrived re-costs the lots and every sale already made from them.
- **Stock by lot**: expiry dates, supplier batch numbers, full history, stock count corrections, opening stock.
- **Sales invoices**: draft, post, cancel. Posting takes stock earliest-expiry first (or a chosen lot) and won't sell stock that isn't there on that date. Bilingual printed tax invoice.
- **Payments**: what each customer owes and what is owed to each supplier, by how late it is; payments received and paid; running statements and a printable bilingual customer statement.
- **Accounting**: bank accounts and cash boxes with balances from every payment, charge, expense and transfer; expenses by category; profit and loss by month.
- **E-invoicing**: sends posted invoices to the Egyptian Tax Authority and keeps the result on the invoice.
- **Excel import**: products, suppliers, customers (with opening balances) and opening stock, from downloadable templates. A file with any problem saves nothing.
- **Reports**: profit and loss; margin by product, customer, shipment or lot; expiring lots; dashboard.
- **Dates** are stored as calendar days and always shown as `08 Oct 2026`, so day and month can't be swapped.

## Run it locally

Needs Node 22 and PostgreSQL.

```bash
cp .env.example .env   # then edit the values
npm install
npx prisma migrate deploy
npm run db:seed        # creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev
```

## Tests

```bash
npm test
```

Unit tests cover costing, lot picking, VAT and dates. Integration tests run the import-to-sale flow against a separate database (`viochem_test`, or `TEST_DATABASE_URL`), which is emptied first.

## Deploy

The `Dockerfile` builds a production image. On start it applies database migrations and creates the first admin user if there are none. Set:

| Variable | What |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random text, at least 32 characters |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin user (only used when there are no users) |

### Vercel and Neon

Import the repository in Vercel with **Root Directory** set to `web`, and add the variables above. Use Neon's connection string with connection pooling turned off. Each deploy applies migrations and creates the first admin if needed (see `vercel.json`).

## Windows app

The same system also comes as a Windows app that keeps all its data on one computer, with no
internet needed except to send e-invoices. It lives in `desktop/` and runs this server inside
an Electron window, with the data in a SQLite file instead of PostgreSQL.

- **Install**: download `VIOCHEM-Setup` from the latest run of the *Windows app* workflow (or a
  `desktop-v*` release) and run it on the computer that will hold the data. It isn't code-signed
  yet, so Windows asks once: choose More info, then Run anyway. The first start asks for the first admin.
- **Data**: `%APPDATA%\VIOCHEM\viochem.db`, with everything and all its history. Nothing is ever archived away.
- **Other devices**: any computer or phone on the same Wi-Fi opens `http://viochem.local:3000`
  (or the number address shown under Settings → Sharing and backups) and signs in with its own user.
  The installer allows this through the Windows firewall. It works while the app is open on the main computer.
- **Backups**: a full copy once a day and before every update, to `Documents\VIOCHEM Backups`
  or a folder chosen in the app; the newest 30 are kept. File → Restore from backup puts one back,
  saving the current data first.
- **E-invoicing**: the client ID and secret are entered under Settings → E-invoice. The app runs the
  e-seal signer itself (E-invoice → Start e-seal signer), so invoices sent from any device are signed
  with the token plugged into the main computer.

Build it on Windows with `cd desktop && npm ci && npm run dist`; the installer lands in `desktop/dist`.
`npm start` in `desktop/` runs it without installing, after `node prepare.mjs`.

### Changing the database

The website and the app share `prisma/schema.prisma`. After changing it, add the PostgreSQL migration
as usual (`npx prisma migrate dev`), and the SQLite one beside it:

```bash
node scripts/sqlite-schema.mjs
npx prisma migrate diff --from-migrations prisma/sqlite/migrations --to-schema-datamodel prisma/sqlite/schema.prisma \
  --shadow-database-url file:./shadow.db --script > prisma/sqlite/migrations/<timestamp>_<name>/migration.sql
node scripts/sqlite-schema.mjs --check
```

Tests run against SQLite with `TEST_DATABASE_URL=file:./viochem_test.db npm test`, after
`npx prisma generate --schema prisma/sqlite/schema.prisma` (and `npx prisma generate` to go back).

## E-invoicing (Egyptian Tax Authority)

1. Register the system on the ETA portal (ERP system registration) and add its client ID and secret to Vercel as `ETA_CLIENT_ID` and `ETA_CLIENT_SECRET`. Set `ETA_ENVIRONMENT` to `preprod` to test or `production` for real invoices, then redeploy.
2. As an admin, open **Settings → E-invoice** and enter the tax registration number, activity code, branch and address exactly as registered with ETA. **Test the login** checks the credentials.
3. Give every product its **ETA item code** and every company customer a tax registration number and address (governorate, city, street, building). Both can come in through the Excel import.
4. Test in pre-production with document version **0.9**, which needs no signature.
5. Real invoices use version **1.0** and must be signed with VIOCHEM's e-seal USB token. Run a small signing service on the PC holding the token and set `ETA_SIGNER_URL` (and `ETA_SIGNER_TOKEN` if it has a password). It receives `{"serialized": "..."}` and returns `{"signature": "<base64 CAdES-BES>"}`.

A posted invoice shows an **E-invoice** card listing anything missing, a **Send to ETA** button, and the result: the ETA link when accepted, or the reasons when refused. Cancelling a sent invoice cancels it at ETA too.
