frappe.ui.form.on("Import Shipment", {
	refresh(frm) {
		if (frm.is_new()) return;

		if (!frm.doc.documents_complete) {
			const missing = (frm.doc.documents || [])
				.filter((d) => !d.received)
				.map((d) => d.document_type);
			if (missing.length) {
				frm.dashboard.set_headline_alert(
					__("Missing documents: {0}", [missing.join(", ")]),
					"orange"
				);
			}
		}

		if (frm.doc.landed_cost_voucher) {
			frm.add_custom_button(__("Landed Cost Voucher"), () =>
				frappe.set_route("Form", "Landed Cost Voucher", frm.doc.landed_cost_voucher)
			);
		} else {
			frm.add_custom_button(__("Create Landed Cost Voucher"), () =>
				frappe
					.call("viochem.viochem.doctype.import_shipment.import_shipment.make_landed_cost_voucher", {
						shipment: frm.doc.name,
					})
					.then((r) => {
						frm.reload_doc();
						frappe.set_route("Form", "Landed Cost Voucher", r.message);
					})
			);
		}
	},
});
