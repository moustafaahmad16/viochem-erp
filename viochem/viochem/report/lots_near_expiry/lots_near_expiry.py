"""Lots in stock whose expiry or retest date falls within the next N days (or has passed)."""

import frappe
from frappe import _
from frappe.utils import add_days, date_diff, flt, getdate, today


def execute(filters=None):
	filters = frappe._dict(filters or {})
	days = int(filters.get("days") or 90)
	horizon = add_days(today(), days)

	batches = frappe.db.sql(
		"""
		select b.name as batch_no, b.item as item_code, i.item_name, i.cas_number, i.stock_uom,
			b.supplier_batch_no, b.expiry_date, b.retest_date, b.batch_qty as qty
		from `tabBatch` b
		join `tabItem` i on i.name = b.item
		where b.disabled = 0 and b.batch_qty > 0
			and ((b.expiry_date is not null and b.expiry_date <= %(horizon)s)
				or (b.retest_date is not null and b.retest_date <= %(horizon)s))
		""",
		{"horizon": horizon},
		as_dict=True,
	)

	data = []
	for b in batches:
		dates = [d for d in (b.expiry_date, b.retest_date) if d and getdate(d) <= getdate(horizon)]
		first = min(dates)
		b.days_left = date_diff(first, today())
		if b.expiry_date and getdate(b.expiry_date) < getdate(today()):
			b.status = _("Expired")
		elif b.retest_date and getdate(b.retest_date) <= getdate(today()):
			b.status = _("Retest due")
		elif b.expiry_date and getdate(b.expiry_date) <= getdate(horizon):
			b.status = _("Expiring")
		else:
			b.status = _("Retest soon")
		b.qty = flt(b.qty)
		data.append(b)

	data.sort(key=lambda r: r.days_left)

	columns = [
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 110},
		{"fieldname": "days_left", "label": _("Days Left"), "fieldtype": "Int", "width": 90},
		{"fieldname": "item_code", "label": _("Item"), "fieldtype": "Link", "options": "Item", "width": 160},
		{"fieldname": "item_name", "label": _("Item Name"), "fieldtype": "Data", "width": 180},
		{"fieldname": "cas_number", "label": _("CAS"), "fieldtype": "Data", "width": 100},
		{"fieldname": "batch_no", "label": _("Lot"), "fieldtype": "Link", "options": "Batch", "width": 130},
		{"fieldname": "supplier_batch_no", "label": _("Supplier Lot"), "fieldtype": "Data", "width": 120},
		{"fieldname": "expiry_date", "label": _("Expiry Date"), "fieldtype": "Date", "width": 110},
		{"fieldname": "retest_date", "label": _("Retest Date"), "fieldtype": "Date", "width": 110},
		{"fieldname": "qty", "label": _("Qty in Stock"), "fieldtype": "Float", "width": 110},
		{"fieldname": "stock_uom", "label": _("UOM"), "fieldtype": "Link", "options": "UOM", "width": 70},
	]
	return columns, data
