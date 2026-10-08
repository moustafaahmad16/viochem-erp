import frappe


def execute():
	"""VIOCHEM tracks every product by lot. ERPNext 16 turns batch numbers off by default."""
	if frappe.get_meta("Stock Settings").has_field("enable_serial_and_batch_no_for_item"):
		frappe.db.set_single_value("Stock Settings", "enable_serial_and_batch_no_for_item", 1)
