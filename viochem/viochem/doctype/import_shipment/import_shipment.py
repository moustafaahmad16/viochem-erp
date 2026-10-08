import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from viochem.utils import REQUIRED_IMPORT_DOCUMENTS, date_order_problem, missing_documents


def get_valuation_expense_account(company):
	"""The company's "Expenses Included In Valuation" account, where landed costs are booked."""
	return frappe.db.get_value(
		"Account",
		{"company": company, "account_type": "Expenses Included In Valuation", "is_group": 0, "disabled": 0},
	)


class ImportShipment(Document):
	def before_validate(self):
		default_account = None
		for charge in self.charges:
			if not charge.expense_account:
				default_account = default_account or get_valuation_expense_account(self.company)
				charge.expense_account = default_account

	def validate(self):
		self.check_dates()
		self.add_document_checklist()
		self.documents_complete = 0 if self.get_missing_documents() else 1
		self.total_charges = sum(flt(c.amount) for c in self.charges)

	def check_dates(self):
		problem = date_order_problem(
			getdate(self.etd) if self.etd else None,
			getdate(self.eta) if self.eta else None,
			getdate(self.arrival_date) if self.arrival_date else None,
		)
		if problem:
			frappe.throw(_(problem))

	def add_document_checklist(self):
		"""Seed the checklist with every required document the first time."""
		if self.documents:
			return
		for document_type in REQUIRED_IMPORT_DOCUMENTS:
			self.append("documents", {"document_type": document_type})

	def get_missing_documents(self):
		return missing_documents([d.document_type for d in self.documents if d.received])


@frappe.whitelist()
def make_landed_cost_voucher(shipment):
	"""Create a draft Landed Cost Voucher that spreads this shipment's charges over its receipts."""
	doc = frappe.get_doc("Import Shipment", shipment)
	doc.check_permission("write")

	if doc.landed_cost_voucher:
		frappe.throw(_("Landed Cost Voucher {0} already exists for this shipment.").format(doc.landed_cost_voucher))

	receipts = sorted({row.purchase_receipt for row in doc.items if row.purchase_receipt})
	if not receipts:
		frappe.throw(_("Set the Purchase Receipt on the shipment items before creating landed costs."))
	if not doc.charges:
		frappe.throw(_("Add at least one charge before creating landed costs."))

	lcv = frappe.new_doc("Landed Cost Voucher")
	lcv.company = doc.company
	lcv.distribute_charges_based_on = doc.distribute_charges_based_on or "Amount"

	for name in receipts:
		pr = frappe.db.get_value(
			"Purchase Receipt", name, ["supplier", "posting_date", "base_grand_total", "docstatus"], as_dict=True
		)
		if pr.docstatus != 1:
			frappe.throw(_("Purchase Receipt {0} must be submitted first.").format(name))
		lcv.append(
			"purchase_receipts",
			{
				"receipt_document_type": "Purchase Receipt",
				"receipt_document": name,
				"supplier": pr.supplier,
				"posting_date": pr.posting_date,
				"grand_total": pr.base_grand_total,
			},
		)

	for charge in doc.charges:
		lcv.append(
			"taxes",
			{
				"expense_account": charge.expense_account,
				"description": f"{doc.name}: {charge.charge_type}" + (f" - {charge.description}" if charge.description else ""),
				"amount": charge.amount,
			},
		)

	lcv.get_items_from_purchase_receipts()
	lcv.insert()

	doc.db_set("landed_cost_voucher", lcv.name)
	return lcv.name
