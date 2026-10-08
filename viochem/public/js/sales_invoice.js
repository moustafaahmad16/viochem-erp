frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1 || frm.doc.eta_uuid) return;

		frm.add_custom_button(__("Send to ETA"), () =>
			frappe
				.call({
					method: "viochem.eta.submit_invoice",
					args: { sales_invoice: frm.doc.name },
					freeze: true,
					freeze_message: __("Sending to the Tax Authority..."),
				})
				.then((r) => {
					frm.reload_doc();
					const ok = r.message && r.message.eta_status === "Submitted";
					frappe.show_alert({
						message: ok ? __("Accepted by ETA") : __("ETA rejected the invoice. See ETA Error."),
						indicator: ok ? "green" : "red",
					});
				})
		);
	},
});
