"""Pure helpers with no Frappe dependency, so they can be unit tested on their own."""

import re
from datetime import date

CAS_PATTERN = re.compile(r"^(\d{2,7})-(\d{2})-(\d)$")

# Documents every import shipment should collect before customs clearance.
REQUIRED_IMPORT_DOCUMENTS = (
	"Proforma Invoice",
	"Commercial Invoice",
	"Packing List",
	"Bill of Lading",
	"Certificate of Origin",
	"Certificate of Analysis",
	"Safety Data Sheet",
	"Customs Declaration",
)


def normalize_cas(cas: str | None) -> str:
	return (cas or "").strip()


def is_valid_cas(cas: str | None) -> bool:
	"""Check a CAS Registry Number's format and check digit.

	The check digit is the sum of every other digit times its position counted
	from the right (starting at 1), modulo 10. Example: 7732-18-5 (water).
	"""
	match = CAS_PATTERN.match(normalize_cas(cas))
	if not match:
		return False
	digits = match.group(1) + match.group(2)
	check = int(match.group(3))
	total = sum(int(d) * i for i, d in enumerate(reversed(digits), start=1))
	return total % 10 == check


def date_order_problem(etd: date | None, eta: date | None, arrival: date | None) -> str | None:
	"""Return a message when shipment dates are out of order, else None."""
	if etd and eta and eta < etd:
		return "ETA cannot be before ETD."
	if etd and arrival and arrival < etd:
		return "Arrival date cannot be before ETD."
	return None


def missing_documents(received: list[str]) -> list[str]:
	"""Required import documents not yet marked as received, in checklist order."""
	have = set(received)
	return [d for d in REQUIRED_IMPORT_DOCUMENTS if d not in have]
