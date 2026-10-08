import type { Supplier } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";

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
      <TextArea label="Notes" name="notes" defaultValue={s?.notes ?? ""} />
      <Submit>{s ? "Save changes" : "Add supplier"}</Submit>
    </>
  );
}
