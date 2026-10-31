import type { Item } from "@prisma/client";
import { Field, Select, Submit, TextArea } from "@/components/forms";
import type { T } from "@/i18n/core";

export function ItemFields({ item, t }: { item?: Item; t: T }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("Code")} name="code" defaultValue={item?.code} required placeholder={t("Your own short code, e.g. {value}", { value: "LIN-001" })} />
      <Field label={t("Name")} name="name" defaultValue={item?.name} required placeholder={t("The product name, e.g. {value}", { value: "Linalool" })} />
      <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
        <Field label={t("CAS number")} name="casNumber" defaultValue={item?.casNumber ?? ""} placeholder={t("e.g. {value}", { value: "78-70-6" })} dir="ltr" hint={t("Checked automatically")} />
        <Field label={t("HS code")} name="hsCode" defaultValue={item?.hsCode ?? ""} placeholder={t("e.g. {value}", { value: "2905.22.00" })} dir="ltr" hint={t("The customs tariff code.")} />
        <Field label={t("EGS code")} name="etaItemCode" defaultValue={item?.etaItemCode ?? ""} placeholder={t("e.g. {value}", { value: "EG-100324932-LIN001" })} dir="ltr" hint={t("As registered on the ETA portal. Needed to send e-invoices.")} />
      </div>
      <Select label={t("Unit")} name="unit" defaultValue={item?.unit ?? "kg"} options={["kg", "L", "g", "pcs"].map((u) => ({ value: u, label: t(u) }))} />
      <Field label={t("Hazard class")} name="hazardClass" defaultValue={item?.hazardClass ?? ""} placeholder={t("e.g. Flammable liquid, Class 3")} />
      <Select label={t("ETA code type")} name="etaItemType" defaultValue={item?.etaItemType ?? "EGS"} options={[{ value: "EGS", label: t("EGS (your own code)") }, { value: "GS1", label: t("GS1 (barcode)") }]} />
      <Field label={t("Alert when stock falls to")} name="minQty" inputMode="decimal" placeholder={t("e.g. {value}", { value: "100" })} defaultValue={item?.minQty?.toString() ?? ""} hint={t("In the product's unit. Leave empty for no alert.")} />
      <TextArea label={t("Notes")} name="notes" defaultValue={item?.notes ?? ""} placeholder={t("Anything the team should know, e.g. storage or handling")} className="sm:col-span-2" />
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
