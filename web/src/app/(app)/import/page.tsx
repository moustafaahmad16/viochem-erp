import { ActionForm, Submit } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { KINDS, type KindName } from "@/lib/import/kinds";
import { importFile } from "./actions";

export const metadata = { title: "Import from Excel" };

const ORDER: KindName[] = ["products", "suppliers", "customers", "stock"];

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import from Excel" subtitle="Download a template, fill it in, and upload it. If any row has a problem, nothing is saved and you'll see every problem at once." />
      <div className="grid gap-6 md:grid-cols-2">
        {ORDER.map((kind, i) => {
          const k = KINDS[kind];
          return (
            <Card key={kind} title={`${i + 1}. ${k.label}`}>
              <p className="mb-3 text-sm text-slate-600">{k.description}</p>
              <a href={`/import/template/${kind}`} className="mb-4 inline-block text-sm font-medium text-brand-700 hover:underline">
                Download the {k.label.toLowerCase()} template (.xlsx)
              </a>
              <ActionForm action={importFile.bind(null, kind)} resetOnSuccess>
                <input
                  type="file"
                  name="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  aria-label={`${k.label} Excel file`}
                  className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
                />
                <Submit variant="secondary">Import {k.label.toLowerCase()}</Submit>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
