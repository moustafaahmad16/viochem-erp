import type { MoneyAccount } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import { toInputDate } from "@/lib/dates";
import { CURRENCIES } from "../suppliers/fields";

export function AccountFields({ a }: { a?: MoneyAccount }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={a?.name} required hint="Like CIB current account or Office cash" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" name="kind" defaultValue={a?.kind ?? "BANK"} options={[{ value: "BANK", label: "Bank" }, { value: "CASH", label: "Cash" }]} />
        <Select label="Currency" name="currency" defaultValue={a?.currency ?? "EGP"} options={CURRENCIES} disabled={Boolean(a)} />
      </div>
      {a && <input type="hidden" name="currency" value={a.currency} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance" name="openingBalance" inputMode="decimal" defaultValue={a ? a.openingBalance.toString() : ""} hint="From the bank statement" />
        <Field label="On" name="openingDate" type="date" defaultValue={toInputDate(a?.openingDate)} />
      </div>
      {a?.currency !== "EGP" && (
        <Field label="Rate on that date" name="openingFxRate" inputMode="decimal" defaultValue={a?.openingFxRate?.toString() ?? ""} hint="EGP for 1 unit, to value a foreign currency balance in the books. Not needed for EGP." />
      )}
      <TextArea label="Notes" name="notes" defaultValue={a?.notes ?? ""} hint="Account number, branch" />
      {a && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={a.active} /> In use
        </label>
      )}
      <Submit>{a ? "Save changes" : "Add account"}</Submit>
    </>
  );
}
