# VIOCHEM ERP

ERPNext add-on for VIOCHEM, an Egyptian importer and distributor of aroma chemicals.
It runs on ERPNext v15 (hosted on Frappe Cloud) and adds what a generic ERP lacks for chemical imports.

## What it adds

- **Chemical details on items:** CAS number (check digit verified on save), chemical name, synonyms, FEMA number, origin, hazard class, UN number, storage conditions, odour description.
- **Safety data sheets:** SDS file per item with revision and review dates; a warning shows when the review date has passed.
- **Lots:** supplier batch number, certificate of analysis, retest date and the import shipment each batch came in on.
- **Import Shipment:** one record per container with ETD/ETA, vessel, bill of lading, forwarder and customs broker; the items and purchase orders it carries; a checklist of the eight import documents; and the landed costs (freight, insurance, duty, clearance, port, inland transport).
- **Landed cost in one click:** "Create Landed Cost Voucher" spreads the shipment's charges over its purchase receipts by amount or quantity, so stock is valued at true cost per kg.

## Install

```bash
bench get-app https://github.com/moustafaahmad16/viochem-erp
bench --site your-site install-app viochem
bench --site your-site migrate
```

On Frappe Cloud, add this repository as a custom app on the bench and install it on the site.

## Tests

```bash
pip install pytest
python -m pytest
```

The unit tests cover the pure logic in `viochem/utils.py` and run without a Frappe site.
