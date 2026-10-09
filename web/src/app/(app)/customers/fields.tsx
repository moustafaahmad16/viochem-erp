import type { Customer } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import { toInputDate } from "@/lib/dates";

export function CustomerFields({ c }: { c?: Customer }) {
  return (
    <>
      <Field label="Name" name="name" defaultValue={c?.name} required />
      <Field label="Tax registration number" name="taxId" defaultValue={c?.taxId ?? ""} hint="9 digits; for a person, their national ID" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" name="phone" defaultValue={c?.phone ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={c?.email ?? ""} />
      </div>
      <TextArea label="Address" name="address" defaultValue={c?.address ?? ""} hint="As printed on invoices" />
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-medium text-slate-500">For e-invoices</legend>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Customer type" name="etaType" defaultValue={c?.etaType ?? "B"} options={[{ value: "B", label: "Company" }, { value: "P", label: "Person" }, { value: "F", label: "Foreign" }]} />
          <Field label="Country code" name="country" defaultValue={c?.country ?? "EG"} maxLength={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Governorate" name="governate" defaultValue={c?.governate ?? ""} />
          <Field label="City or area" name="city" defaultValue={c?.city ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Street" name="street" defaultValue={c?.street ?? ""} />
          <Field label="Building no." name="buildingNo" defaultValue={c?.buildingNo ?? ""} />
        </div>
      </fieldset>
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
