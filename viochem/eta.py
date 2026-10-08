"""Send ERPNext Sales Invoices to the Egyptian Tax Authority (ETA) e-invoicing system."""

import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import frappe
import requests
from frappe import _
from frappe.utils import cint, flt, get_datetime, get_system_timezone

from viochem.eta_document import Invoice, Line, Party, serialize, signed_document

URLS = {
	"Pre-production": ("https://id.preprod.eta.gov.eg", "https://api.preprod.invoicing.eta.gov.eg"),
	"Production": ("https://id.eta.gov.eg", "https://api.invoicing.eta.gov.eg"),
}
TOKEN_CACHE_KEY = "viochem:eta_access_token"
TIMEOUT = 60


def get_settings():
	settings = frappe.get_single("ETA Settings")
	if not settings.enabled:
		frappe.throw(_("ETA e-invoicing is not enabled. Turn it on in ETA Settings."))
	return settings


def to_utc_string(posting_date, posting_time) -> str:
	local = get_datetime(f"{posting_date} {posting_time}").replace(tzinfo=ZoneInfo(get_system_timezone()))
	return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def party_from_address(party_type, party_id, name, address_name):
	if not address_name:
		frappe.throw(_("Customer {0} needs an address to send an e-invoice.").format(name))
	address = frappe.get_doc("Address", address_name)
	country_code = (frappe.db.get_value("Country", address.country, "code") or "").upper()
	return Party(
		type=party_type,
		id=party_id or "",
		name=name,
		country=country_code,
		governate=address.state or "",
		region_city=address.city or "",
		street=address.address_line1 or "",
		building_number=address.get("building_number") or "",
		postal_code=address.pincode or None,
	)


def build_invoice(si, settings) -> Invoice:
	issuer = Party(
		type="B",
		id=settings.issuer_id,
		name=settings.issuer_name,
		governate=settings.governate,
		region_city=settings.region_city,
		street=settings.street,
		building_number=settings.building_number,
		branch_id=settings.branch_id or "0",
		postal_code=settings.postal_code or None,
	)

	customer = frappe.get_cached_doc("Customer", si.customer)
	receiver_type = customer.get("eta_receiver_type") or "B"
	if receiver_type == "B" and not customer.tax_id:
		frappe.throw(_("Customer {0} needs a Tax ID (registration number) for an ETA e-invoice.").format(si.customer))
	receiver = party_from_address(receiver_type, customer.tax_id, si.customer_name, si.customer_address)

	vat_rate = sum(flt(t.rate) for t in si.taxes if t.charge_type == "On Net Total")
	foreign = si.currency != "EGP"

	lines = []
	for row in si.items:
		item = frappe.get_cached_doc("Item", row.item_code)
		if not item.get("eta_item_code"):
			frappe.throw(_("Item {0} has no ETA Item Code.").format(row.item_code))
		lines.append(
			Line(
				description=row.item_name,
				item_type=item.get("eta_item_type") or "EGS",
				item_code=item.eta_item_code,
				unit_type=item.get("eta_unit_type") or "KGM",
				quantity=flt(row.qty),
				unit_price_egp=flt(row.base_net_rate),
				vat_rate=vat_rate,
				internal_code=row.item_code,
				currency=si.currency,
				unit_price_sold=flt(row.net_rate) if foreign else None,
				exchange_rate=flt(si.conversion_rate) if foreign else None,
			)
		)

	return Invoice(
		issuer=issuer,
		receiver=receiver,
		internal_id=si.name,
		date_time_issued=to_utc_string(si.posting_date, si.posting_time),
		activity_code=settings.activity_code,
		lines=lines,
		version=settings.document_version or "0.9",
		document_type="C" if cint(si.is_return) else "I",
	)


def get_access_token(settings) -> str:
	token = frappe.cache().get_value(TOKEN_CACHE_KEY)
	if token:
		return token
	identity_url, _api = URLS[settings.environment]
	response = requests.post(
		f"{identity_url}/connect/token",
		data={"grant_type": "client_credentials", "scope": "InvoicingAPI"},
		auth=(settings.client_id, settings.get_password("client_secret")),
		timeout=TIMEOUT,
	)
	if response.status_code != 200:
		frappe.throw(_("ETA login failed: {0}").format(response.text[:500]))
	data = response.json()
	frappe.cache().set_value(
		TOKEN_CACHE_KEY, data["access_token"], expires_in_sec=max(cint(data.get("expires_in")) - 120, 60)
	)
	return data["access_token"]


def sign(document: dict, settings) -> str | None:
	if settings.document_version == "0.9":
		return None
	if not settings.signer_url:
		frappe.throw(_("Version 1.0 needs a signature. Set the Signing Service URL in ETA Settings."))
	response = requests.post(
		settings.signer_url,
		json={"serialized": serialize(document)},
		headers={"Authorization": f"Bearer {settings.get_password('signer_token', raise_exception=False) or ''}"},
		timeout=TIMEOUT,
	)
	if response.status_code != 200:
		frappe.throw(_("The signing service failed: {0}").format(response.text[:500]))
	return response.json()["signature"]


@frappe.whitelist()
def submit_invoice(sales_invoice):
	"""Build, sign and send one submitted Sales Invoice to ETA, then store the result on it."""
	si = frappe.get_doc("Sales Invoice", sales_invoice)
	si.check_permission("submit")
	if si.docstatus != 1:
		frappe.throw(_("Submit the invoice in ERPNext before sending it to ETA."))
	if si.get("eta_uuid"):
		frappe.throw(_("This invoice was already accepted by ETA ({0}).").format(si.eta_uuid))

	settings = get_settings()
	document = build_invoice(si, settings).to_eta()
	document = signed_document(document, sign(document, settings))

	_identity, api_url = URLS[settings.environment]
	response = requests.post(
		f"{api_url}/api/v1.0/documentsubmissions/",
		json={"documents": [document]},
		headers={"Authorization": f"Bearer {get_access_token(settings)}"},
		timeout=TIMEOUT,
	)
	return record_response(si, response)


def record_response(si, response):
	try:
		data = response.json()
	except ValueError:
		data = {}

	accepted = data.get("acceptedDocuments") or []
	rejected = data.get("rejectedDocuments") or []

	if response.status_code == 202 and accepted:
		doc = accepted[0]
		values = {
			"eta_status": "Submitted",
			"eta_uuid": doc.get("uuid"),
			"eta_long_id": doc.get("longId"),
			"eta_submission_uuid": data.get("submissionUUID"),
			"eta_error": None,
		}
	else:
		error = rejected[0].get("error") if rejected else data.get("error") or response.text[:1000]
		values = {"eta_status": "Rejected", "eta_error": json.dumps(error, ensure_ascii=False, indent=1)}

	si.db_set(values)
	return values


def on_submit(doc, method=None):
	"""Sales Invoice on_submit hook: queue the ETA submission when auto-send is on."""
	settings = frappe.get_single("ETA Settings")
	if not (settings.enabled and settings.auto_submit):
		return
	doc.db_set("eta_status", "Not Sent")
	frappe.enqueue(
		"viochem.eta.submit_invoice", sales_invoice=doc.name, queue="short", enqueue_after_commit=True
	)
