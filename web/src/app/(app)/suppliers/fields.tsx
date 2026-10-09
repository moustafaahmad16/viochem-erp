import type { Supplier } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import type { T } from "@/i18n/core";
import { toInputDate } from "@/lib/dates";

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CNY", "INR", "EGP"].map((c) => ({ value: c, label: c }));

export function SupplierFields({ s, t }: { s?: Supplier; t: T }) {
  return (
    <>
      <Field label={t("Name")} name="name" defaultValue={s?.name} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Country")} name="country" defaultValue={s?.country ?? ""} />
        <Select label={t("Currency")} name="currency" defaultValue={s?.currency ?? "USD"} options={CURRENCIES} />
      </div>
      <Field label={t("Email")} name="email" type="email" defaultValue={s?.email ?? ""} />
      <Field label={t("Phone")} name="phone" defaultValue={s?.phone ?? ""} />
      <Field label={t("Payment terms (days)")} name="paymentTermsDays" type="number" min={0} max={365} defaultValue={s?.paymentTermsDays ?? 0} hint={t("Days after the order date that goods are due to be paid. 0 means paid when ordered.")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Opening balance")} name="openingBalance" inputMode="decimal" defaultValue={s ? s.openingBalance.toString() : ""} hint={t("Owed before this system, in their currency.")} />
        <Field label={t("As of")} name="openingBalanceDate" type="date" defaultValue={toInputDate(s?.openingBalanceDate)} />
      </div>
      <Field label={t("Rate on that date")} name="openingFxRate" inputMode="decimal" defaultValue={s?.openingFxRate?.toString() ?? ""} hint={t("EGP for 1 unit, to value the opening balance in the books. Not needed for EGP.")} />
      <TextArea label={t("Notes")} name="notes" defaultValue={s?.notes ?? ""} />
      <Submit>{s ? t("Save changes") : t("Add supplier")}</Submit>
    </>
  );
}
