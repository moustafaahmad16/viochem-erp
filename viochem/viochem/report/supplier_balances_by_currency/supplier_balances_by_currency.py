"""Unpaid supplier invoices in foreign currency, valued at the booked rate and at today's rate.

The difference is the exchange gain or loss VIOCHEM would book if it paid everything today.
Today's rate is the latest Currency Exchange record entered in ERPNext.
"""

import frappe
from frappe import _
from frappe.utils import flt, today


def latest_rate(from_currency, to_currency):
	rate = frappe.db.get_value(
		"Currency Exchange",
		{"from_currency": from_currency, "to_currency": to_currency, "date": ("<=", today())},
		"exchange_rate",
		order_by="date desc",
	)
	return flt(rate) or None


def execute(filters=None):
	filters = frappe._dict(filters or {})
	company = filters.get("company") or frappe.defaults.get_user_default("Company")
	company_currency = frappe.get_cached_value("Company", company, "default_currency")

	invoices = frappe.get_all(
		"Purchase Invoice",
		filters={
			"company": company,
			"docstatus": 1,
			"outstanding_amount": (">", 0),
			"currency": ("!=", company_currency),
		},
		fields=["supplier", "currency", "outstanding_amount", "conversion_rate"],
	)

	grouped = {}
	for inv in invoices:
		row = grouped.setdefault(
			(inv.currency, inv.supplier),
			{"currency": inv.currency, "supplier": inv.supplier, "outstanding": 0.0, "booked": 0.0, "invoices": 0},
		)
		row["outstanding"] += flt(inv.outstanding_amount)
		row["booked"] += flt(inv.outstanding_amount) * flt(inv.conversion_rate)
		row["invoices"] += 1

	rates = {}
	data = []
	for row in sorted(grouped.values(), key=lambda r: (r["currency"], -r["booked"])):
		currency = row["currency"]
		if currency not in rates:
			rates[currency] = latest_rate(currency, company_currency)
		rate = rates[currency]
		row["booked_rate"] = row["booked"] / row["outstanding"] if row["outstanding"] else 0
		row["current_rate"] = rate
		row["current"] = row["outstanding"] * rate if rate else None
		# Positive = it costs more EGP to pay now than when booked (a loss).
		row["fx_difference"] = row["current"] - row["booked"] if rate else None
		data.append(row)

	columns = [
		{"fieldname": "currency", "label": _("Currency"), "fieldtype": "Link", "options": "Currency", "width": 80},
		{"fieldname": "supplier", "label": _("Supplier"), "fieldtype": "Link", "options": "Supplier", "width": 200},
		{"fieldname": "invoices", "label": _("Invoices"), "fieldtype": "Int", "width": 80},
		{"fieldname": "outstanding", "label": _("Owed (Invoice Currency)"), "fieldtype": "Float", "precision": 2, "width": 160},
		{"fieldname": "booked_rate", "label": _("Booked Rate"), "fieldtype": "Float", "precision": 4, "width": 110},
		{"fieldname": "booked", "label": _("Owed at Booked Rate"), "fieldtype": "Currency", "width": 160},
		{"fieldname": "current_rate", "label": _("Today's Rate"), "fieldtype": "Float", "precision": 4, "width": 110},
		{"fieldname": "current", "label": _("Owed at Today's Rate"), "fieldtype": "Currency", "width": 160},
		{"fieldname": "fx_difference", "label": _("Exchange Loss (+) / Gain (-)"), "fieldtype": "Currency", "width": 180},
	]
	message = None
	missing = sorted(c for c, r in rates.items() if not r)
	if missing:
		message = _("No exchange rate entered for {0}. Add a Currency Exchange record to see today's value.").format(
			", ".join(missing)
		)
	return columns, data, message
