app_name = "viochem"
app_title = "VIOCHEM"
app_publisher = "VIOCHEM"
app_description = "ERPNext add-on for VIOCHEM: aroma chemical imports, lots, SDS and landed cost"
app_email = "admin@viochem.local"
app_license = "mit"
required_apps = ["erpnext"]

after_install = "viochem.install.after_install"

# Custom fields on standard ERPNext doctypes ship as fixtures.
fixtures = [{"dt": "Custom Field", "filters": [["module", "=", "Viochem"]]}]

doctype_js = {"Sales Invoice": "public/js/sales_invoice.js"}

doc_events = {
	"Item": {"validate": "viochem.chemistry.validate_item"},
	"Sales Invoice": {"on_submit": "viochem.eta.on_submit"},
}
