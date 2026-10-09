import type { Item } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";

export function ItemFields({ item }: { item?: Item }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Code" name="code" defaultValue={item?.code} required placeholder="LIN-001" />
      <Field label="Name" name="name" defaultValue={item?.name} required placeholder="Linalool" />
      <Field label="CAS number" name="casNumber" defaultValue={item?.casNumber ?? ""} placeholder="78-70-6" hint="Checked automatically" />
      <Select label="Unit" name="unit" defaultValue={item?.unit ?? "kg"} options={["kg", "L", "g", "pcs"].map((u) => ({ value: u, label: u }))} />
      <Field label="Hazard class" name="hazardClass" defaultValue={item?.hazardClass ?? ""} placeholder="e.g. Flammable liquid, Class 3" />
      <Field label="ETA item code" name="etaItemCode" defaultValue={item?.etaItemCode ?? ""} placeholder="EG-100324932-LIN001" hint="As registered on the ETA portal. Needed to send e-invoices." />
      <Select label="ETA code type" name="etaItemType" defaultValue={item?.etaItemType ?? "EGS"} options={[{ value: "EGS", label: "EGS (your own code)" }, { value: "GS1", label: "GS1 (barcode)" }]} />
      <TextArea label="Notes" name="notes" defaultValue={item?.notes ?? ""} className="sm:col-span-2" />
      {item && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="active" defaultChecked={item.active} /> Active (shows in lists for new invoices and shipments)
        </label>
      )}
      <div className="sm:col-span-2">
        <Submit>{item ? "Save changes" : "Add product"}</Submit>
      </div>
    </div>
  );
}
