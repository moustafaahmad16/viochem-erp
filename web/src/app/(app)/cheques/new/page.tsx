import { ActionForm, Field, Select, Submit, TextArea } from "@/components/forms";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { toInputDate, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { customerAccounts, supplierAccounts } from "@/lib/services/accounts";
import { getT } from "@/i18n/server";
import { accountOptions } from "../../payments/parts";
import { issueCheque, receiveCheque } from "../actions";

export async function generateMetadata({ searchParams }: PageProps<"/cheques/new">) {
  const t = await getT();
  return { title: (await searchParams).direction === "issued" ? t("Issue a cheque") : t("Receive a cheque") };
}

export default async function NewChequePage({ searchParams }: PageProps<"/cheques/new">) {
  const t = await getT();
  const sp = await searchParams;
  const issued = sp.direction === "issued";
  const back = { href: "/cheques", label: t("Cheques") };

  const dates = (
    <div className="grid grid-cols-2 gap-3">
      <Field label={issued ? t("Written on") : t("Received on")} name="date" type="date" defaultValue={toInputDate(today())} required />
      <Field label={t("Date on the cheque")} name="dueDate" type="date" required hint={t("It can't be cashed before this day")} />
    </div>
  );
  const numbers = (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("Cheque number")} name="chequeNo" required />
      <Field label={t("Amount (EGP)")} name="amount" inputMode="decimal" required />
    </div>
  );

  if (!issued) {
    const selected = sp.customer ? Number(sp.customer) : undefined;
    const accounts = await customerAccounts(selected ? { id: selected } : {});
    const all = selected ? await db.customer.findMany({ orderBy: { name: "asc" } }) : accounts.map((a) => a.customer);
    const invoices = accounts.flatMap((a) =>
      a.bills
        .filter((b) => b.outstanding.gt(0) && b.key !== "opening")
        .map((b) => ({ value: String(b.key).replace("inv:", ""), label: `${b.label} · ${t("{amount} owed", { amount: money(b.outstanding) })}`, group: a.customer.name })),
    );
    return (
      <>
        <PageHeader title={t("Receive a cheque")} back={back} />
        <Card className="max-w-xl">
          {all.length === 0 ? (
            <div className="space-y-3 text-sm text-slate-600">
              <p>{t("Add a customer first.")}</p>
              <ButtonLink href="/customers">{t("Add a customer")}</ButtonLink>
            </div>
          ) : (
            <ActionForm action={receiveCheque}>
              <Select label={t("Customer")} name="customerId" defaultValue={selected ?? ""} options={all.map((c) => ({ value: c.id, label: c.name }))} placeholder={t("Choose…")} required />
              {numbers}
              <Field label={t("Bank")} name="bank" hint={t("The bank the cheque is drawn on")} />
              {dates}
              <Select label={t("For invoice")} name="invoiceId" placeholder={t("Oldest unpaid first")} options={invoices} hint={t("The invoice must be for the same customer")} />
              <TextArea label={t("Notes")} name="notes" />
              <Submit>{t("Save cheque")}</Submit>
            </ActionForm>
          )}
        </Card>
      </>
    );
  }

  const selected = sp.supplier ? Number(sp.supplier) : undefined;
  const [suppliers, owed, banks] = await Promise.all([db.supplier.findMany({ orderBy: { name: "asc" } }), supplierAccounts(selected ? { id: selected } : {}), accountOptions({ egpOnly: true })]);
  const shipments = owed.flatMap((s) =>
    s.accounts
      .filter((a) => a.currency === "EGP")
      .flatMap((a) =>
        a.bills
          .filter((b) => b.outstanding.gt(0) && b.key !== "opening")
          .map((b) => ({ value: String(b.key).replace("shp:", ""), label: `${b.label} · ${t("{amount} owed", { amount: money(b.outstanding) })}`, group: s.supplier.name })),
      ),
  );
  return (
    <>
      <PageHeader title={t("Issue a cheque")} back={back} />
      <Card className="max-w-xl">
        {suppliers.length === 0 ? (
          <p className="text-sm text-slate-600">{t("Add a supplier first.")}</p>
        ) : (
          <ActionForm action={issueCheque}>
            <Select label={t("Supplier")} name="supplierId" defaultValue={selected ?? ""} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} placeholder={t("Choose…")} required />
            {numbers}
            <Select
              label={t("Drawn on")}
              name="accountId"
              defaultValue={banks[0]?.value ?? ""}
              options={banks}
              placeholder={t("Choose…")}
              required
              hint={banks.length ? t("Cheques are written in EGP") : t("Add your bank accounts and cash box under Bank & cash to track balances.")}
            />
            {dates}
            <Select label={t("For shipment")} name="shipmentId" placeholder={t("Oldest unpaid first")} options={shipments} hint={t("Only shipments billed in EGP can be paid by cheque")} />
            <TextArea label={t("Notes")} name="notes" />
            <Submit>{t("Save cheque")}</Submit>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
