frappe.query_reports["Lots Near Expiry"] = {
	filters: [
		{
			fieldname: "days",
			label: __("Within Days"),
			fieldtype: "Int",
			default: 90,
		},
	],
	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "status" && data) {
			const color = { Expired: "red", "Retest due": "orange" }[data.status] || "blue";
			value = `<span class="indicator-pill ${color}">${value}</span>`;
		}
		return value;
	},
};
