import type { Customer } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import { toInputDate } from "@/lib/dates";
import { getT } from "@/i18n/server";

export async function CustomerFields({ c }: { c?: Customer }) {
  const t = await getT();
  return (
    <>
      <Field label={t("Name")} name="name" defaultValue={c?.name} required />
      <Field label={t("Tax registration number")} name="taxId" defaultValue={c?.taxId ?? ""} hint={t("9 digits; for a person, their national ID")} dir="ltr" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Phone")} name="phone" defaultValue={c?.phone ?? ""} dir="ltr" />
        <Field label={t("Email")} name="email" type="email" defaultValue={c?.email ?? ""} dir="ltr" />
      </div>
      <TextArea label={t("Address")} name="address" defaultValue={c?.address ?? ""} hint={t("As printed on invoices")} />
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-500">{t("For e-invoices")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <Select label={t("Customer type")} name="etaType" defaultValue={c?.etaType ?? "B"} options={[{ value: "B", label: t("Company") }, { value: "P", label: t("Person") }, { value: "F", label: t("Foreign") }]} />
          <Field label={t("Country code")} name="country" defaultValue={c?.country ?? "EG"} maxLength={2} dir="ltr" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Governorate")} name="governate" defaultValue={c?.governate ?? ""} />
          <Field label={t("City or area")} name="city" defaultValue={c?.city ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Street")} name="street" defaultValue={c?.street ?? ""} />
          <Field label={t("Building no.")} name="buildingNo" defaultValue={c?.buildingNo ?? ""} />
        </div>
      </fieldset>
      <Field label={t("Payment terms (days)")} name="paymentTermsDays" type="number" min={0} max={365} defaultValue={c?.paymentTermsDays ?? 30} hint={t("Invoices fall due this many days after their date. 0 means cash on delivery.")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Opening balance (EGP)")} name="openingBalance" inputMode="decimal" defaultValue={c ? c.openingBalance.toString() : ""} hint={t("Owed before this system. Negative for credit.")} />
        <Field label={t("As of")} name="openingBalanceDate" type="date" defaultValue={toInputDate(c?.openingBalanceDate)} />
      </div>
      <TextArea label={t("Notes")} name="notes" defaultValue={c?.notes ?? ""} />
      <Submit>{c ? t("Save changes") : t("Add customer")}</Submit>
    </>
  );
}
