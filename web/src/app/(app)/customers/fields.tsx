import type { Customer } from "@prisma/client";
import { Field, Submit, TextArea } from "@/components/forms";
import { toInputDate } from "@/lib/dates";

export function CustomerFields({ c }: { c?: Customer }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={c?.name} required />
      <Field label="Tax registration number" name="taxId" defaultValue={c?.taxId ?? ""} hint="Needed for e-invoices" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" defaultValue={c?.phone ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={c?.email ?? ""} />
      </div>
      <TextArea label="Address" name="address" defaultValue={c?.address ?? ""} />
      <Field label="Payment terms (days)" name="paymentTermsDays" type="number" min={0} max={365} defaultValue={c?.paymentTermsDays ?? 30} hint="Invoices fall due this many days after their date. 0 means cash on delivery." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance (EGP)" name="openingBalance" inputMode="decimal" defaultValue={c ? c.openingBalance.toString() : ""} hint="Owed before this system. Negative for credit." />
        <Field label="As of" name="openingBalanceDate" type="date" defaultValue={toInputDate(c?.openingBalanceDate)} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={c?.notes ?? ""} />
      <Submit>{c ? "Save changes" : "Add customer"}</Submit>
    </>
  );
}
