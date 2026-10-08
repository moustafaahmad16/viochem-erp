import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, nowdate

from viochem.utils import REQUIRED_IMPORT_DOCUMENTS
from viochem.viochem.doctype.import_shipment.import_shipment import make_landed_cost_voucher

# Records are created by the tests themselves on the site's own company.
test_ignore = ["Company", "Supplier", "Item", "UOM", "Account", "Purchase Order", "Purchase Receipt", "Landed Cost Voucher"]


def get_company():
	return frappe.db.get_single_value("Global Defaults", "default_company") or frappe.get_all("Company", limit=1)[0].name


def make_item(item_code, cas_number="78-70-6"):
	if frappe.db.exists("Item", item_code):
		return frappe.get_doc("Item", item_code)
	return frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": item_code,
			"item_name": item_code,
			"item_group": "All Item Groups",
			"stock_uom": "Kg",
			"is_stock_item": 1,
			"has_batch_no": 1,
			"cas_number": cas_number,
			"hazard_class": "Not Hazardous",
		}
	).insert()


def make_supplier(name="_Test Aroma Supplier"):
	if not frappe.db.exists("Supplier", name):
		frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": "All Supplier Groups"}).insert()
	return name


def make_purchase_receipt(item_code, supplier, qty=100, rate=500):
	company = get_company()
	warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0, "warehouse_name": "Stores"})
	batch = frappe.get_doc(
		{"doctype": "Batch", "item": item_code, "batch_id": frappe.generate_hash(length=8), "supplier_batch_no": "SUP-1"}
	).insert()
	pr = frappe.get_doc(
		{
			"doctype": "Purchase Receipt",
			"company": company,
			"supplier": supplier,
			"posting_date": nowdate(),
			"items": [
				{
					"item_code": item_code,
					"qty": qty,
					"rate": rate,
					"warehouse": warehouse,
					"batch_no": batch.name,
					"use_serial_batch_fields": 1,
				}
			],
		}
	).insert()
	pr.submit()
	return pr


class TestImportShipment(FrappeTestCase):
	def test_custom_fields_installed(self):
		for dt, field in (("Item", "cas_number"), ("Item", "sds_review_date"), ("Batch", "coa_file"), ("Batch", "import_shipment")):
			self.assertTrue(frappe.get_meta(dt).has_field(field), f"{dt}.{field} missing")

	def test_invalid_cas_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			make_item("_Test Bad CAS", cas_number="78-70-5")

	def test_checklist_and_dates(self):
		supplier = make_supplier()
		item = make_item("_Test Linalool")
		shipment = frappe.get_doc(
			{
				"doctype": "Import Shipment",
				"supplier": supplier,
				"company": get_company(),
				"etd": "2026-10-01",
				"eta": "2026-10-20",
				"items": [{"item_code": item.name, "qty": 100}],
			}
		).insert()
		self.assertEqual([d.document_type for d in shipment.documents], list(REQUIRED_IMPORT_DOCUMENTS))
		self.assertEqual(shipment.documents_complete, 0)

		for d in shipment.documents:
			d.received = 1
		shipment.save()
		self.assertEqual(shipment.documents_complete, 1)

		shipment.eta = "2026-09-01"
		with self.assertRaises(frappe.ValidationError):
			shipment.save()

	def test_landed_cost_raises_stock_value(self):
		company = get_company()
		supplier = make_supplier()
		item = make_item("_Test Vanillin", cas_number="121-33-5")
		pr = make_purchase_receipt(item.name, supplier, qty=100, rate=500)
		expense_account = frappe.get_cached_value("Company", company, "expenses_included_in_valuation")

		shipment = frappe.get_doc(
			{
				"doctype": "Import Shipment",
				"supplier": supplier,
				"company": company,
				"items": [{"item_code": item.name, "qty": 100, "purchase_receipt": pr.name}],
				"charges": [
					{"charge_type": "Freight", "expense_account": expense_account, "amount": 3000},
					{"charge_type": "Customs Duty", "expense_account": expense_account, "amount": 2000},
				],
			}
		).insert()
		self.assertEqual(flt(shipment.total_charges), 5000)

		lcv_name = make_landed_cost_voucher(shipment.name)
		shipment.reload()
		self.assertEqual(shipment.landed_cost_voucher, lcv_name)

		lcv = frappe.get_doc("Landed Cost Voucher", lcv_name)
		self.assertEqual(flt(lcv.total_taxes_and_charges), 5000)
		lcv.submit()

		# 100 kg at 500 plus 5,000 of charges = 550 per kg
		rate = frappe.db.get_value(
			"Purchase Receipt Item", {"parent": pr.name}, "valuation_rate"
		)
		self.assertAlmostEqual(flt(rate), 550, places=2)

		with self.assertRaises(frappe.ValidationError):
			make_landed_cost_voucher(shipment.name)
