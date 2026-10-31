import { redirect } from "next/navigation";

/** Batches used to be called lots; old links still work. */
export default async function OldLotPage({ params }: PageProps<"/stock/lots/[id]">) {
  redirect(`/stock/batches/${(await params).id}`);
}
