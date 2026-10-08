import json

from viochem.eta_document import Invoice, Line, Party, serialize, signed_document


def issuer():
	return Party(
		type="B",
		id="100324932",
		name="VIOCHEM",
		governate="Cairo",
		region_city="Nasr City",
		street="Abbas El Akkad",
		building_number="12",
		branch_id="0",
	)


def receiver():
	return Party(
		type="B",
		id="200111222",
		name="Fragrance Co",
		governate="Giza",
		region_city="6th of October",
		street="Industrial Zone",
		building_number="7",
	)


def test_serialize_names_values_and_arrays():
	doc = {"a": "x", "nested": {"b": 1.5}, "items": [{"c": "1"}, {"c": "2"}]}
	assert serialize(doc) == '"A""x""NESTED""B""1.5""ITEMS""ITEMS""C""1""ITEMS""C""2"'


def test_serialize_keeps_number_text_as_sent():
	# 0.0 must stay 0.0, exactly as json.dumps writes it in the request body.
	doc = {"amount": 0.0, "qty": 100.0, "rate": 14}
	assert serialize(doc) == '"AMOUNT""0.0""QTY""100.0""RATE""14"'
	assert json.dumps(doc) == '{"amount": 0.0, "qty": 100.0, "rate": 14}'


def test_egp_line_math():
	line = Line("Linalool", "EGS", "EG-100324932-1", "KGM", quantity=25, unit_price_egp=480).to_eta()
	assert line["salesTotal"] == 12000.0
	assert line["netTotal"] == 12000.0
	assert line["taxableItems"] == [{"taxType": "T1", "amount": 1680.0, "subType": "V009", "rate": 14.0}]
	assert line["total"] == 13680.0
	assert line["unitValue"] == {"currencySold": "EGP", "amountEGP": 480.0}


def test_foreign_currency_line():
	line = Line(
		"Vanillin", "EGS", "EG-100324932-2", "KGM", quantity=10, unit_price_egp=1450.5,
		currency="USD", unit_price_sold=30, exchange_rate=48.35,
	).to_eta()
	assert line["unitValue"] == {
		"currencySold": "USD",
		"amountEGP": 1450.5,
		"amountSold": 30.0,
		"currencyExchangeRate": 48.35,
	}


def test_invoice_totals():
	invoice = Invoice(
		issuer=issuer(),
		receiver=receiver(),
		internal_id="ACC-SINV-2026-00001",
		date_time_issued="2026-10-08T10:00:00Z",
		activity_code="4669",
		lines=[
			Line("Linalool", "EGS", "EG-1", "KGM", quantity=25, unit_price_egp=480),
			Line("Vanillin", "EGS", "EG-2", "KGM", quantity=3, unit_price_egp=333.33333),
		],
	).to_eta()
	assert invoice["totalSalesAmount"] == 12999.99999
	assert invoice["netAmount"] == 12999.99999
	assert invoice["taxTotals"] == [{"taxType": "T1", "amount": 1820.0}]
	assert invoice["totalAmount"] == 14819.99999
	assert invoice["issuer"]["address"]["branchID"] == "0"
	assert "branchID" not in invoice["receiver"]["address"]
	assert invoice["documentType"] == "I"


def test_signature_attached_only_when_given():
	doc = {"internalID": "1"}
	assert signed_document(doc, None) == doc
	assert signed_document(doc, "abc")["signatures"] == [{"signatureType": "I", "value": "abc"}]
