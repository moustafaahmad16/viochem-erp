import type { MoneyAccount } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import { getT } from "@/i18n/server";
import { toInputDate } from "@/lib/dates";
import { CURRENCIES } from "../suppliers/fields";

export async function AccountFields({ a }: { a?: MoneyAccount }) {
  const t = await getT();
  return (
    <>
      <Field label={t("Name")} name="name" defaultValue={a?.name} required hint={t("Like CIB current account or Office cash")} />
      <div className="grid grid-cols-2 gap-3">
        <Select label={t("Type")} name="kind" defaultValue={a?.kind ?? "BANK"} options={[{ value: "BANK", label: t("Bank") }, { value: "CASH", label: t("Cash") }]} />
        <Select label={t("Currency")} name="currency" defaultValue={a?.currency ?? "EGP"} options={CURRENCIES} disabled={Boolean(a)} />
      </div>
      {a && <input type="hidden" name="currency" value={a.currency} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Opening balance")} name="openingBalance" inputMode="decimal" defaultValue={a ? a.openingBalance.toString() : ""} hint={t("From the bank statement")} />
        <Field label={t("On")} name="openingDate" type="date" defaultValue={toInputDate(a?.openingDate)} />
      </div>
      {a?.currency !== "EGP" && (
        <Field label={t("Rate on that date")} name="openingFxRate" inputMode="decimal" defaultValue={a?.openingFxRate?.toString() ?? ""} hint={t("EGP for 1 unit, to value a foreign currency balance in the books. Not needed for EGP.")} />
      )}
      <TextArea label={t("Notes")} name="notes" defaultValue={a?.notes ?? ""} hint={t("Account number, branch")} />
      {a && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={a.active} /> {t("In use")}
        </label>
      )}
      <Submit>{t(a ? "Save changes" : "Add account")}</Submit>
    </>
  );
}
