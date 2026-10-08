import type { Customer } from "@prisma/client";
import { Field, Submit, TextArea } from "@/components/forms";

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
      <TextArea label="Notes" name="notes" defaultValue={c?.notes ?? ""} />
      <Submit>{c ? "Save changes" : "Add customer"}</Submit>
    </>
  );
}
