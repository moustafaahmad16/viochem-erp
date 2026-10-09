import type { Supplier } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import { toInputDate } from "@/lib/dates";

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CNY", "INR", "EGP"].map((c) => ({ value: c, label: c }));

export function SupplierFields({ s }: { s?: Supplier }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={s?.name} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country" name="country" defaultValue={s?.country ?? ""} />
        <Select label="Currency" name="currency" defaultValue={s?.currency ?? "USD"} options={CURRENCIES} />
      </div>
      <Field label="Email" name="email" type="email" defaultValue={s?.email ?? ""} />
      <Field label="Phone" name="phone" defaultValue={s?.phone ?? ""} />
      <Field label="Payment terms (days)" name="paymentTermsDays" type="number" min={0} max={365} defaultValue={s?.paymentTermsDays ?? 0} hint="Days after the order date that goods are due to be paid. 0 means paid when ordered." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance" name="openingBalance" inputMode="decimal" defaultValue={s ? s.openingBalance.toString() : ""} hint="Owed before this system, in their currency." />
        <Field label="As of" name="openingBalanceDate" type="date" defaultValue={toInputDate(s?.openingBalanceDate)} />
      </div>
      <Field label="Rate on that date" name="openingFxRate" inputMode="decimal" defaultValue={s?.openingFxRate?.toString() ?? ""} hint="EGP for 1 unit, to value the opening balance in the books. Not needed for EGP." />
      <TextArea label="Notes" name="notes" defaultValue={s?.notes ?? ""} />
      <Submit>{s ? "Save changes" : "Add supplier"}</Submit>
    </>
  );
}
