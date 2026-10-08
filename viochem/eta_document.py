"""Egyptian Tax Authority (ETA) e-invoice document building, with no Frappe dependency.

References (ETA SDK):
- Invoice v1.0 structure: https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/
- Serialization for signing: https://sdk.invoicing.eta.gov.eg/document-serialization-approach/
- Tax types (T1 = VAT, V009 = general item sales): https://sdk.invoicing.eta.gov.eg/codes/tax-types/
"""

import json
from dataclasses import dataclass, field

DECIMALS = 5
VAT_TAX_TYPE = "T1"
VAT_SUBTYPE_GENERAL = "V009"


def money(value) -> float:
	return round(float(value or 0), DECIMALS)


def _scalar(value) -> str:
	# Values are serialized exactly as they appear in the JSON we send, so numbers use json.dumps.
	if isinstance(value, bool):
		return json.dumps(value)
	if isinstance(value, int | float):
		return json.dumps(value)
	return "" if value is None else str(value)


def serialize(value) -> str:
	"""Canonical ETA serialization of a JSON document, the input to the issuer signature.

	Property names are upper-cased and quoted, simple values are quoted as-is, objects
	recurse, and each array element is preceded by the array's property name.
	"""
	if isinstance(value, dict):
		out = []
		for name, item in value.items():
			key = f'"{name.upper()}"'
			if isinstance(item, list):
				out.append(key)
				for element in item:
					out.append(key)
					out.append(serialize(element))
			else:
				out.append(key)
				out.append(serialize(item))
		return "".join(out)
	return f'"{_scalar(value)}"'


@dataclass
class Party:
	type: str  # B (business), P (person) or F (foreign)
	id: str
	name: str
	country: str = "EG"
	governate: str = ""
	region_city: str = ""
	street: str = ""
	building_number: str = ""
	branch_id: str | None = None  # issuer only
	postal_code: str | None = None

	def to_eta(self) -> dict:
		address = {}
		if self.branch_id is not None:
			address["branchID"] = self.branch_id
		address.update(
			{
				"country": self.country,
				"governate": self.governate,
				"regionCity": self.region_city,
				"street": self.street,
				"buildingNumber": self.building_number,
			}
		)
		if self.postal_code:
			address["postalCode"] = self.postal_code
		return {"address": address, "type": self.type, "id": self.id, "name": self.name}


@dataclass
class Line:
	description: str
	item_type: str  # GS1 or EGS
	item_code: str
	unit_type: str  # ETA unit code, e.g. KGM
	quantity: float
	unit_price_egp: float  # net unit price after discounts, in EGP
	vat_rate: float = 14.0
	internal_code: str = ""
	currency: str = "EGP"
	unit_price_sold: float | None = None  # in the invoice currency, when not EGP
	exchange_rate: float | None = None

	def to_eta(self) -> dict:
		unit_value = {"currencySold": self.currency, "amountEGP": money(self.unit_price_egp)}
		if self.currency != "EGP":
			unit_value["amountSold"] = money(self.unit_price_sold)
			unit_value["currencyExchangeRate"] = money(self.exchange_rate)

		sales_total = money(self.quantity * self.unit_price_egp)
		net_total = sales_total
		vat = money(net_total * self.vat_rate / 100)
		return {
			"description": self.description,
			"itemType": self.item_type,
			"itemCode": self.item_code,
			"unitType": self.unit_type,
			"quantity": money(self.quantity),
			"internalCode": self.internal_code,
			"salesTotal": sales_total,
			"total": money(net_total + vat),
			"valueDifference": 0.0,
			"totalTaxableFees": 0.0,
			"netTotal": net_total,
			"itemsDiscount": 0.0,
			"unitValue": unit_value,
			"discount": {"rate": 0.0, "amount": 0.0},
			"taxableItems": [
				{"taxType": VAT_TAX_TYPE, "amount": vat, "subType": VAT_SUBTYPE_GENERAL, "rate": money(self.vat_rate)}
			],
		}


@dataclass
class Invoice:
	issuer: Party
	receiver: Party
	internal_id: str
	date_time_issued: str  # UTC, e.g. 2026-10-08T10:00:00Z
	activity_code: str
	lines: list[Line] = field(default_factory=list)
	version: str = "1.0"
	document_type: str = "I"  # I invoice, C credit note, D debit note

	def to_eta(self) -> dict:
		lines = [line.to_eta() for line in self.lines]
		total_sales = money(sum(l["salesTotal"] for l in lines))
		total_discount = money(sum(l["discount"]["amount"] for l in lines))
		net = money(sum(l["netTotal"] for l in lines))
		vat = money(sum(t["amount"] for l in lines for t in l["taxableItems"] if t["taxType"] == VAT_TAX_TYPE))
		return {
			"issuer": self.issuer.to_eta(),
			"receiver": self.receiver.to_eta(),
			"documentType": self.document_type,
			"documentTypeVersion": self.version,
			"dateTimeIssued": self.date_time_issued,
			"taxpayerActivityCode": self.activity_code,
			"internalID": self.internal_id,
			"invoiceLines": lines,
			"totalDiscountAmount": total_discount,
			"totalSalesAmount": total_sales,
			"netAmount": net,
			"taxTotals": [{"taxType": VAT_TAX_TYPE, "amount": vat}],
			"totalAmount": money(net + vat),
			"extraDiscountAmount": 0.0,
			"totalItemsDiscountAmount": 0.0,
		}


def signed_document(document: dict, signature: str | None) -> dict:
	"""Attach the issuer signature. Version 0.9 (pre-production testing) needs none."""
	if signature:
		return {**document, "signatures": [{"signatureType": "I", "value": signature}]}
	return document
