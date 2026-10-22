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
      <Select label={t("Customer type")} name="etaType" defaultValue={c?.etaType ?? "B"} options={[{ value: "B", label: t("Company") }, { value: "P", label: t("Person") }, { value: "F", label: t("Foreign") }]} />
      <TextArea label={t("Address")} name="address" defaultValue={c?.address ?? ""} hint={t("As printed on invoices, and sent on e-invoices")} />
      {/* Only if ETA ever asks for them apart; otherwise the address above fills them in. */}
      <details className="rounded-lg border border-slate-200 p-3" open={Boolean(c?.governate || c?.city || c?.street || c?.buildingNo || (c?.country && c.country !== "EG"))}>
        <summary className="cursor-pointer text-xs font-medium text-slate-500">{t("Address in parts (optional)")}</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Governorate")} name="governate" defaultValue={c?.governate ?? ""} />
            <Field label={t("City or area")} name="city" defaultValue={c?.city ?? ""} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("Street")} name="street" defaultValue={c?.street ?? ""} />
            <Field label={t("Building no.")} name="buildingNo" defaultValue={c?.buildingNo ?? ""} />
            <Field label={t("Country code")} name="country" defaultValue={c?.country ?? "EG"} maxLength={2} dir="ltr" />
          </div>
        </div>
      </details>
      <Field label={t("Payment terms (days)")} name="paymentTermsDays" type="number" min={0} max={365} defaultValue={c?.paymentTermsDays ?? 30} hint={t("Invoices fall due this many days after their date. 0 means cash on delivery.")} />
      <Field label={t("Credit limit (EGP)")} name="creditLimit" inputMode="decimal" defaultValue={c?.creditLimit?.toString() ?? ""} hint={t("The most they may owe at once. Leave empty for no limit.")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Opening balance (EGP)")} name="openingBalance" inputMode="decimal" defaultValue={c ? c.openingBalance.toString() : ""} hint={t("Owed before this system. Negative for credit.")} />
        <Field label={t("As of")} name="openingBalanceDate" type="date" defaultValue={toInputDate(c?.openingBalanceDate)} />
      </div>
      <TextArea label={t("Notes")} name="notes" defaultValue={c?.notes ?? ""} />
      <Submit>{c ? t("Save changes") : t("Add customer")}</Submit>
    </>
  );
}
