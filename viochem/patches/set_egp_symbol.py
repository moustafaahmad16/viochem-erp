import frappe


def execute():
	"""ERPNext ships EGP with the symbol "£ or ج.م", which prints on every amount. Use "EGP"."""
	if frappe.db.exists("Currency", "EGP"):
		frappe.db.set_value("Currency", "EGP", "symbol", "EGP")
