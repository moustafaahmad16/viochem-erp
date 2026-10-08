import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from viochem.utils import is_valid_cas, normalize_cas


def validate_item(doc, method=None):
	"""Item validate hook: clean and check chemical fields."""
	if doc.get("cas_number"):
		doc.cas_number = normalize_cas(doc.cas_number)
		if not is_valid_cas(doc.cas_number):
			frappe.throw(
				_("CAS number {0} is not valid. Use the format 1234-56-7 and check the last digit.").format(
					doc.cas_number
				)
			)

	if doc.get("sds_review_date") and getdate(doc.sds_review_date) < getdate(nowdate()):
		frappe.msgprint(
			_("The SDS for {0} is past its review date. Upload the latest revision.").format(doc.name),
			indicator="orange",
			alert=True,
		)
