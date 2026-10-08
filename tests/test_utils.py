from datetime import date

from viochem.utils import (
	REQUIRED_IMPORT_DOCUMENTS,
	date_order_problem,
	is_valid_cas,
	missing_documents,
)


def test_valid_cas_numbers():
	# Water, linalool, vanillin, limonene, benzyl acetate
	for cas in ("7732-18-5", "78-70-6", "121-33-5", "138-86-3", "140-11-4"):
		assert is_valid_cas(cas), cas


def test_cas_whitespace_is_ignored():
	assert is_valid_cas("  78-70-6 ")


def test_wrong_check_digit():
	assert not is_valid_cas("78-70-5")


def test_bad_format():
	for cas in ("", None, "78706", "7-70-6", "78-7-6", "78-70-66", "abc-de-f"):
		assert not is_valid_cas(cas), cas


def test_dates_in_order():
	assert date_order_problem(date(2026, 10, 1), date(2026, 10, 20), date(2026, 10, 22)) is None
	assert date_order_problem(None, None, None) is None


def test_eta_before_etd():
	assert date_order_problem(date(2026, 10, 20), date(2026, 10, 1), None) == "ETA cannot be before ETD."


def test_arrival_before_etd():
	assert date_order_problem(date(2026, 10, 20), None, date(2026, 10, 1)) == "Arrival date cannot be before ETD."


def test_missing_documents():
	assert missing_documents([]) == list(REQUIRED_IMPORT_DOCUMENTS)
	assert missing_documents(list(REQUIRED_IMPORT_DOCUMENTS)) == []
	assert missing_documents(["Packing List", "Other"])[0] == "Proforma Invoice"
	assert "Packing List" not in missing_documents(["Packing List"])
