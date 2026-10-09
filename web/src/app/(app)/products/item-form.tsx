import type { Item } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import type { T } from "@/i18n/core";

export function ItemFields({ item, t }: { item?: Item; t: T }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("Code")} name="code" defaultValue={item?.code} required placeholder="LIN-001" />
      <Field label={t("Name")} name="name" defaultValue={item?.name} required placeholder="Linalool" />
      <Field label={t("CAS number")} name="casNumber" defaultValue={item?.casNumber ?? ""} placeholder="78-70-6" hint={t("Checked automatically")} />
      <Select label={t("Unit")} name="unit" defaultValue={item?.unit ?? "kg"} options={["kg", "L", "g", "pcs"].map((u) => ({ value: u, label: t(u) }))} />
      <Field label={t("Hazard class")} name="hazardClass" defaultValue={item?.hazardClass ?? ""} placeholder={t("e.g. Flammable liquid, Class 3")} />
      <Field label={t("ETA item code")} name="etaItemCode" defaultValue={item?.etaItemCode ?? ""} placeholder="EG-100324932-LIN001" hint={t("As registered on the ETA portal. Needed to send e-invoices.")} />
      <Select label={t("ETA code type")} name="etaItemType" defaultValue={item?.etaItemType ?? "EGS"} options={[{ value: "EGS", label: t("EGS (your own code)") }, { value: "GS1", label: t("GS1 (barcode)") }]} />
      <TextArea label={t("Notes")} name="notes" defaultValue={item?.notes ?? ""} className="sm:col-span-2" />
      {item && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="active" defaultChecked={item.active} /> {t("Active (shows in lists for new invoices and shipments)")}
        </label>
      )}
      <div className="sm:col-span-2">
        <Submit>{item ? t("Save changes") : t("Add product")}</Submit>
      </div>
    </div>
  );
}
