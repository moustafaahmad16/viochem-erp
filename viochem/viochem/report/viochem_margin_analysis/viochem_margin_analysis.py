"""Margin on sold lots, grouped by import shipment, customer or item.

Cost comes from the lot's stock valuation at the time of sale, so it includes the
freight, duty and fees added by landed cost vouchers.
"""

import frappe
from frappe import _
from frappe.utils import flt

GROUPS = {
	"Shipment": ("shipment", _("Import Shipment"), "Link", "Import Shipment"),
	"Customer": ("customer", _("Customer"), "Link", "Customer"),
	"Item": ("item_code", _("Item"), "Link", "Item"),
	"Lot": ("batch_no", _("Lot"), "Link", "Batch"),
}


def execute(filters=None):
	filters = frappe._dict(filters or {})
	group_by = filters.get("group_by") or "Shipment"
	key, label, fieldtype, options = GROUPS[group_by]

	lines = get_sold_lines(filters)
	add_shipments(lines)

	grouped = {}
	for line in lines:
		group = line.get(key) or _("Not linked to a shipment")
		row = grouped.setdefault(group, {"group": group, "qty": 0.0, "revenue": 0.0, "cost": 0.0})
		row["qty"] += line.qty
		row["revenue"] += line.revenue
		row["cost"] += line.cost

	data = []
	for row in sorted(grouped.values(), key=lambda r: r["revenue"] - r["cost"], reverse=True):
		row["margin"] = row["revenue"] - row["cost"]
		row["margin_pct"] = row["margin"] / row["revenue"] * 100 if row["revenue"] else 0
		row["cost_per_kg"] = row["cost"] / row["qty"] if row["qty"] else 0
		row["price_per_kg"] = row["revenue"] / row["qty"] if row["qty"] else 0
		data.append(row)

	columns = [
		{"fieldname": "group", "label": label, "fieldtype": fieldtype if group_by != "Shipment" else "Data", "options": options, "width": 200},
		{"fieldname": "qty", "label": _("Qty Sold"), "fieldtype": "Float", "width": 110},
		{"fieldname": "revenue", "label": _("Revenue (EGP)"), "fieldtype": "Currency", "width": 140},
		{"fieldname": "cost", "label": _("Landed Cost (EGP)"), "fieldtype": "Currency", "width": 140},
		{"fieldname": "margin", "label": _("Margin (EGP)"), "fieldtype": "Currency", "width": 140},
		{"fieldname": "margin_pct", "label": _("Margin %"), "fieldtype": "Percent", "width": 100},
		{"fieldname": "price_per_kg", "label": _("Avg Price / Unit"), "fieldtype": "Currency", "width": 130},
		{"fieldname": "cost_per_kg", "label": _("Avg Cost / Unit"), "fieldtype": "Currency", "width": 130},
	]

	chart = None
	if data:
		top = data[:10]
		chart = {
			"data": {
				"labels": [str(r["group"]) for r in top],
				"datasets": [{"name": _("Margin (EGP)"), "values": [flt(r["margin"], 2) for r in top]}],
			},
			"type": "bar",
		}
	return columns, data, None, chart


def get_sold_lines(filters):
	"""One row per lot per sales line, from submitted Sales Invoices (with stock) and Delivery Notes."""
	conditions = ["b.docstatus = 1", "b.is_cancelled = 0", "b.type_of_transaction = 'Outward'"]
	values = {}
	if filters.get("company"):
		conditions.append("b.company = %(company)s")
		values["company"] = filters.company
	if filters.get("from_date"):
		conditions.append("date(b.posting_datetime) >= %(from_date)s")
		values["from_date"] = filters.from_date
	if filters.get("to_date"):
		conditions.append("date(b.posting_datetime) <= %(to_date)s")
		values["to_date"] = filters.to_date
	where = " and ".join(conditions)

	lines = []
	for voucher_type, child in (("Sales Invoice", "Sales Invoice Item"), ("Delivery Note", "Delivery Note Item")):
		lines += frappe.db.sql(
			f"""
			select e.batch_no, b.item_code, p.customer,
				abs(e.qty) as qty,
				abs(e.qty) * i.base_net_rate as revenue,
				abs(e.qty) * e.incoming_rate as cost
			from `tabSerial and Batch Entry` e
			join `tabSerial and Batch Bundle` b on b.name = e.parent
			join `tab{child}` i on i.name = b.voucher_detail_no
			join `tab{voucher_type}` p on p.name = b.voucher_no
			where b.voucher_type = %(voucher_type)s and p.is_return = 0 and {where}
			""",
			{**values, "voucher_type": voucher_type},
			as_dict=True,
		)
	for line in lines:
		line.qty, line.revenue, line.cost = flt(line.qty), flt(line.revenue), flt(line.cost)
	return lines


def add_shipments(lines):
	"""Link each lot to the import shipment whose purchase receipt brought it in."""
	batches = {line.batch_no for line in lines if line.batch_no}
	if not batches:
		return
	rows = frappe.db.sql(
		"""
		select distinct e.batch_no, si.parent as shipment
		from `tabImport Shipment Item` si
		join `tabSerial and Batch Bundle` b
			on b.voucher_type = 'Purchase Receipt' and b.voucher_no = si.purchase_receipt
			and b.docstatus = 1 and b.is_cancelled = 0
		join `tabSerial and Batch Entry` e on e.parent = b.name
		where e.batch_no in %(batches)s
		""",
		{"batches": tuple(batches)},
		as_dict=True,
	)
	shipment_of = {r.batch_no: r.shipment for r in rows}
	shipment_of.update(
		{
			b.name: b.import_shipment
			for b in frappe.get_all("Batch", {"name": ("in", list(batches)), "import_shipment": ("is", "set")}, ["name", "import_shipment"])
		}
	)
	for line in lines:
		line.shipment = shipment_of.get(line.batch_no)
