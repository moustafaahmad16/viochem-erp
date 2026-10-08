# VIOCHEM

Imports, stock by lot, sales invoices and margins for VIOCHEM, an importer of aroma chemicals in Egypt.

## What it does

- **Import shipments**: products and prices in the supplier's currency, the exchange rate, and every charge (freight, duty, clearance). Receiving a shipment turns each product into a lot with its real landed cost per kg.
- **Late bills**: adding or changing a charge after the goods arrived re-costs the lots and every sale already made from them.
- **Stock by lot**: expiry dates, supplier batch numbers, full history, stock count corrections, opening stock.
- **Sales invoices**: draft, post, cancel. Posting takes stock earliest-expiry first (or a chosen lot) and won't sell stock that isn't there on that date. Bilingual printed tax invoice.
- **Reports**: margin by product, customer, shipment or lot; expiring lots; dashboard.
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
