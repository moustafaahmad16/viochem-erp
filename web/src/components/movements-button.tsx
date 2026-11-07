"use client";

import { useRef, useState, useTransition } from "react";
import { productMoves } from "@/app/(app)/products/actions";
import { useT } from "@/i18n/client";
import { qty } from "@/lib/format";
import { MovementsTable } from "./movements-table";

type Moves = NonNullable<Awaited<ReturnType<typeof productMoves>>>;

/** A button that shows a product's movement history (سجل الحركة) in a pop-up, without leaving the page. */
export function MovementsButton({ itemId, className = "" }: { itemId: number; className?: string }) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ id: number; moves: Moves | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const moves = data?.id === itemId ? data.moves : undefined;

  const open = () => {
    dialog.current?.showModal();
    setFailed(false);
    start(async () => {
      try {
        setData({ id: itemId, moves: await productMoves(itemId) });
      } catch {
        setFailed(true);
      }
    });
  };
  const last = moves?.rows.at(-1);

  return (
    <>
      <button type="button" onClick={open} className={`inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline ${className}`}>
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4"><path d="M3 4.75A.75.75 0 0 1 3.75 4h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 4.75Zm0 5A.75.75 0 0 1 3.75 9h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 9.75Zm0 5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Z" /></svg>
        {t("Movement history")}
      </button>
      <dialog
        ref={dialog}
        dir={t.dir}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
        className="m-auto w-[min(72rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{t("Movement history")}{moves && <> · {moves.item.name}</>}</h2>
            {moves && (
              <p className="text-xs text-slate-500">
                {moves.item.code}
                {last && <> · {t("{qty} in stock", { qty: `${qty(last.balance)} ${t(moves.item.unit)}` })}</>}
                {" · "}
                <a href={`/products/${moves.item.id}?tab=movements`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{t("Open product page")}</a>
              </p>
            )}
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t("Close")} className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 9rem)" }}>
          {failed ? (
            <p className="px-5 py-10 text-center text-sm text-red-700">{t("Couldn't load the movements. Try again.")}</p>
          ) : pending && !moves ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{t("Loading…")}</p>
          ) : moves ? (
            <MovementsTable rows={moves.rows} unit={t(moves.item.unit)} t={t} newTab />
          ) : moves === null ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{t("This product no longer exists.")}</p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
