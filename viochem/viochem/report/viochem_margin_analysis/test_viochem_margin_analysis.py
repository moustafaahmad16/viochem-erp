import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, today

from viochem.viochem.doctype.import_shipment.import_shipment import make_landed_cost_voucher
from viochem.viochem.doctype.import_shipment.test_import_shipment import (
	get_company,
	make_item,
	make_purchase_receipt,
	make_supplier,
)
from viochem.viochem.report.lots_near_expiry.lots_near_expiry import execute as lots_near_expiry
from viochem.viochem.report.supplier_balances_by_currency.supplier_balances_by_currency import (
	execute as supplier_balances,
)
from viochem.viochem.report.viochem_margin_analysis.viochem_margin_analysis import execute as margin_analysis

test_ignore = ["Company", "Customer", "Supplier", "Item", "Account", "Purchase Invoice", "Sales Invoice", "Batch"]


def make_customer(name="_Test Report Customer"):
	if not frappe.db.exists("Customer", name):
		frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}),
			}
		).insert()
	return name


def receipt_batch(pr):
	return frappe.db.get_value(
		"Serial and Batch Entry",
		{"parent": frappe.db.get_value("Purchase Receipt Item", {"parent": pr.name}, "serial_and_batch_bundle")},
		"batch_no",
	) or frappe.db.get_value("Purchase Receipt Item", {"parent": pr.name}, "batch_no")


class TestReports(FrappeTestCase):
	def test_margin_by_shipment_and_customer_uses_landed_cost(self):
		company = get_company()
		supplier = make_supplier()
		item = make_item("_Test Report Linalool", cas_number="78-70-6")
		pr = make_purchase_receipt(item.name, supplier, qty=100, rate=500)
		account = frappe.get_cached_value("Company", company, "expenses_included_in_valuation")

		shipment = frappe.get_doc(
			{
				"doctype": "Import Shipment",
				"supplier": supplier,
				"company": company,
				"items": [{"item_code": item.name, "qty": 100, "purchase_receipt": pr.name}],
				"charges": [{"charge_type": "Freight", "expense_account": account, "amount": 5000}],
			}
		).insert()
		frappe.get_doc("Landed Cost Voucher", make_landed_cost_voucher(shipment.name)).submit()

		batch = receipt_batch(pr)
		warehouse = frappe.db.get_value("Purchase Receipt Item", {"parent": pr.name}, "warehouse")
		si = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"company": company,
				"customer": make_customer(),
				"update_stock": 1,
				"posting_date": today(),
				"due_date": today(),
				"items": [
					{
						"item_code": item.name,
						"qty": 40,
						"rate": 800,
						"warehouse": warehouse,
						"batch_no": batch,
						"use_serial_batch_fields": 1,
					}
				],
			}
		).insert()
		si.submit()

		filters = {"company": company, "from_date": add_days(today(), -1), "to_date": today()}
		_cols, rows, _msg, chart = margin_analysis({**filters, "group_by": "Shipment"})
		row = next(r for r in rows if r["group"] == shipment.name)
		self.assertAlmostEqual(row["qty"], 40)
		self.assertAlmostEqual(row["revenue"], 32000, places=2)
		# 40 kg at 550 per kg (500 purchase + 50 freight)
		self.assertAlmostEqual(row["cost"], 22000, places=2)
		self.assertAlmostEqual(row["margin"], 10000, places=2)
		self.assertTrue(chart)

		_cols, rows, *_ = margin_analysis({**filters, "group_by": "Customer"})
		self.assertIn("_Test Report Customer", [r["group"] for r in rows])

	def test_lots_near_expiry(self):
		supplier = make_supplier()
		item = make_item("_Test Report Vanillin", cas_number="121-33-5")
		pr = make_purchase_receipt(item.name, supplier, qty=10, rate=100)
		batch = receipt_batch(pr)
		frappe.db.set_value("Batch", batch, {"expiry_date": add_days(today(), 30), "retest_date": None})

		_cols, rows = lots_near_expiry({"days": 90})
		row = next(r for r in rows if r.batch_no == batch)
		self.assertEqual(row.status, "Expiring")
		self.assertEqual(row.days_left, 30)
		self.assertEqual(row.cas_number, "121-33-5")

		_cols, rows = lots_near_expiry({"days": 10})
		self.assertNotIn(batch, [r.batch_no for r in rows])

	def test_supplier_balances_show_exchange_difference(self):
		company = get_company()
		abbr = frappe.get_cached_value("Company", company, "abbr")

		account = f"Creditors USD - {abbr}"
		if not frappe.db.exists("Account", account):
			frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": "Creditors USD",
					"company": company,
					"parent_account": frappe.db.get_value("Account", {"company": company, "account_type": "Payable"}, "parent_account"),
					"account_type": "Payable",
					"account_currency": "USD",
				}
			).insert()

		supplier = "_Test USD Supplier"
		if not frappe.db.exists("Supplier", supplier):
			frappe.get_doc(
				{
					"doctype": "Supplier",
					"supplier_name": supplier,
					"supplier_group": frappe.db.get_value("Supplier Group", {"is_group": 0}),
					"default_currency": "USD",
					"accounts": [{"company": company, "account": account}],
				}
			).insert()

		if not frappe.db.exists("Item", "_Test Service Fee"):
			frappe.get_doc(
				{"doctype": "Item", "item_code": "_Test Service Fee", "item_group": "All Item Groups", "stock_uom": "Nos", "is_stock_item": 0}
			).insert()

		frappe.get_doc(
			{"doctype": "Currency Exchange", "date": today(), "from_currency": "USD", "to_currency": "EGP", "exchange_rate": 50}
		).insert(ignore_if_duplicate=True)

		pi = frappe.get_doc(
			{
				"doctype": "Purchase Invoice",
				"company": company,
				"supplier": supplier,
				"currency": "USD",
				"conversion_rate": 48,
				"credit_to": account,
				"posting_date": today(),
				"due_date": today(),
				"items": [{"item_code": "_Test Service Fee", "qty": 1, "rate": 1000}],
			}
		).insert()
		pi.submit()

		_cols, rows, message = supplier_balances({"company": company})
		row = next(r for r in rows if r["supplier"] == supplier)
		self.assertAlmostEqual(row["outstanding"], 1000)
		self.assertAlmostEqual(row["booked"], 48000)
		self.assertAlmostEqual(flt(row["current"]), 50000)
		self.assertAlmostEqual(flt(row["fx_difference"]), 2000)

	def test_egp_symbol(self):
		self.assertEqual(frappe.db.get_value("Currency", "EGP", "symbol"), "EGP")

	def test_workspace_and_cards_installed(self):
		self.assertTrue(frappe.db.exists("Workspace", "VIOCHEM"))
		for card in ("Open Import Shipments", "Lots Expiring in 90 Days", "Sales This Month", "Overdue Supplier Invoices"):
			self.assertTrue(frappe.db.exists("Number Card", card), card)
