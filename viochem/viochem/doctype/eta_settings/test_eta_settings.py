import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from viochem.eta import build_invoice, submit_invoice

test_ignore = ["Company", "Customer", "Item", "Account", "Address", "Sales Invoice"]


def get_company():
	return frappe.db.get_single_value("Global Defaults", "default_company") or frappe.get_all("Company", limit=1)[0].name


def setup_eta_settings(version="0.9"):
	settings = frappe.get_single("ETA Settings")
	settings.update(
		{
			"enabled": 1,
			"environment": "Pre-production",
			"document_version": version,
			"auto_submit": 0,
			"client_id": "test-client",
			"client_secret": "test-secret",
			"issuer_id": "100324932",
			"issuer_name": "VIOCHEM",
			"activity_code": "4669",
			"branch_id": "0",
			"governate": "Cairo",
			"region_city": "Nasr City",
			"street": "Abbas El Akkad",
			"building_number": "12",
		}
	)
	settings.save()
	return settings


def make_customer():
	name = "_Test ETA Fragrance Co"
	if not frappe.db.exists("Customer", name):
		frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}),
				"tax_id": "200111222",
				"eta_receiver_type": "B",
			}
		).insert()
		frappe.get_doc(
			{
				"doctype": "Address",
				"address_title": name,
				"address_type": "Billing",
				"address_line1": "Industrial Zone",
				"building_number": "7",
				"city": "6th of October",
				"state": "Giza",
				"country": "Egypt",
				"is_primary_address": 1,
				"links": [{"link_doctype": "Customer", "link_name": name}],
			}
		).insert()
	return name


def make_item():
	code = "_Test ETA Linalool"
	if not frappe.db.exists("Item", code):
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_group": "All Item Groups",
				"stock_uom": "Kg",
				"is_stock_item": 0,
				"cas_number": "78-70-6",
				"eta_item_type": "EGS",
				"eta_item_code": "EG-100324932-1001",
				"eta_unit_type": "KGM",
			}
		).insert()
	return code


def vat_account(company):
	abbr = frappe.get_cached_value("Company", company, "abbr")
	name = f"VAT 14% - {abbr}"
	if not frappe.db.exists("Account", name):
		parent = frappe.db.get_value("Account", {"company": company, "account_type": "Tax", "is_group": 1}) or frappe.db.get_value(
			"Account", {"company": company, "root_type": "Liability", "is_group": 1}
		)
		frappe.get_doc(
			{
				"doctype": "Account",
				"account_name": "VAT 14%",
				"company": company,
				"parent_account": parent,
				"account_type": "Tax",
				"tax_rate": 14,
			}
		).insert()
	return name


def make_invoice(qty=25, rate=480):
	company = get_company()
	si = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"company": company,
			"customer": make_customer(),
			"posting_date": nowdate(),
			"set_posting_time": 1,
			"posting_time": "12:00:00",
			"due_date": nowdate(),
			"items": [{"item_code": make_item(), "qty": qty, "rate": rate}],
			"taxes": [
				{"charge_type": "On Net Total", "account_head": vat_account(company), "rate": 14, "description": "VAT 14%"}
			],
		}
	).insert()
	si.submit()
	return si


def fake_response(status, body):
	response = MagicMock()
	response.status_code = status
	response.json.return_value = body
	response.text = json.dumps(body)
	return response


class TestETA(FrappeTestCase):
	def setUp(self):
		self.settings = setup_eta_settings()
		frappe.cache().delete_value("viochem:eta_access_token")

	def test_build_invoice_from_sales_invoice(self):
		si = make_invoice()
		doc = build_invoice(si, self.settings).to_eta()

		self.assertEqual(doc["internalID"], si.name)
		self.assertEqual(doc["documentTypeVersion"], "0.9")
		self.assertTrue(doc["dateTimeIssued"].endswith("Z"))
		self.assertEqual(doc["receiver"]["id"], "200111222")
		self.assertEqual(doc["receiver"]["address"]["country"], "EG")
		self.assertEqual(doc["receiver"]["address"]["buildingNumber"], "7")
		self.assertEqual(doc["invoiceLines"][0]["itemCode"], "EG-100324932-1001")
		self.assertEqual(doc["totalSalesAmount"], 12000.0)
		self.assertEqual(doc["taxTotals"], [{"taxType": "T1", "amount": 1680.0}])
		self.assertAlmostEqual(doc["totalAmount"], si.base_grand_total, places=2)

	def test_accepted_submission_is_recorded(self):
		si = make_invoice()
		token = fake_response(200, {"access_token": "tok", "token_type": "Bearer", "expires_in": 3600})
		accepted = fake_response(
			202,
			{
				"submissionUUID": "SUB123",
				"acceptedDocuments": [{"uuid": "UUID123", "longId": "LONG123", "internalId": si.name}],
				"rejectedDocuments": [],
			},
		)
		with patch("viochem.eta.requests.post", side_effect=[token, accepted]) as post:
			result = submit_invoice(si.name)

		self.assertEqual(result["eta_status"], "Submitted")
		si.reload()
		self.assertEqual((si.eta_uuid, si.eta_long_id, si.eta_submission_uuid), ("UUID123", "LONG123", "SUB123"))

		submit_call = post.call_args_list[1]
		self.assertTrue(submit_call.args[0].endswith("/api/v1.0/documentsubmissions/"))
		self.assertEqual(submit_call.kwargs["json"]["documents"][0]["internalID"], si.name)

		with self.assertRaises(frappe.ValidationError):
			submit_invoice(si.name)

	def test_rejected_submission_keeps_error(self):
		si = make_invoice()
		token = fake_response(200, {"access_token": "tok", "expires_in": 3600})
		rejected = fake_response(
			202,
			{
				"submissionUUID": "SUB999",
				"acceptedDocuments": [],
				"rejectedDocuments": [{"internalId": si.name, "error": {"code": "BadStructure", "message": "Invalid"}}],
			},
		)
		with patch("viochem.eta.requests.post", side_effect=[token, rejected]):
			result = submit_invoice(si.name)

		self.assertEqual(result["eta_status"], "Rejected")
		si.reload()
		self.assertIn("BadStructure", si.eta_error)
		self.assertFalse(si.eta_uuid)

	def test_version_1_needs_signing_service(self):
		setup_eta_settings(version="1.0")
		si = make_invoice()
		with self.assertRaises(frappe.ValidationError):
			submit_invoice(si.name)

	def test_print_format_renders(self):
		si = make_invoice()
		html = frappe.get_print("Sales Invoice", si.name, print_format="VIOCHEM Sales Invoice")
		self.assertIn("فاتورة ضريبية", html)
		self.assertIn("CAS 78-70-6", html)
