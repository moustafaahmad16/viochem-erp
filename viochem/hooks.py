app_name = "viochem"
app_title = "VIOCHEM"
app_publisher = "VIOCHEM"
app_description = "ERPNext add-on for VIOCHEM: aroma chemical imports, lots, SDS and landed cost"
app_email = "admin@viochem.local"
app_license = "mit"
required_apps = ["erpnext"]

# Custom fields on standard ERPNext doctypes (Item, Batch) ship as fixtures.
fixtures = [{"dt": "Custom Field", "filters": [["module", "=", "Viochem"]]}]

doc_events = {
	"Item": {"validate": "viochem.chemistry.validate_item"},
}
