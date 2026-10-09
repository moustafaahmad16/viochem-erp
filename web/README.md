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

## E-invoicing (Egyptian Tax Authority)

1. Register the system on the ETA portal (ERP system registration) and add its client ID and secret to Vercel as `ETA_CLIENT_ID` and `ETA_CLIENT_SECRET`. Set `ETA_ENVIRONMENT` to `preprod` to test or `production` for real invoices, then redeploy.
2. As an admin, open **Settings → E-invoice** and enter the tax registration number, activity code, branch and address exactly as registered with ETA. **Test the login** checks the credentials.
3. Give every product its **ETA item code** and every company customer a tax registration number and address (governorate, city, street, building). Both can come in through the Excel import.
4. Test in pre-production with document version **0.9**, which needs no signature.
5. Real invoices use version **1.0** and must be signed with VIOCHEM's e-seal USB token. Run a small signing service on the PC holding the token and set `ETA_SIGNER_URL` (and `ETA_SIGNER_TOKEN` if it has a password). It receives `{"serialized": "..."}` and returns `{"signature": "<base64 CAdES-BES>"}`.

A posted invoice shows an **E-invoice** card listing anything missing, a **Send to ETA** button, and the result: the ETA link when accepted, or the reasons when refused. Cancelling a sent invoice cancels it at ETA too.
