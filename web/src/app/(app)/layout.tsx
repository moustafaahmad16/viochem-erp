import { Suspense } from "react";
import { TrailRecorder } from "@/components/back-link";
import { Nav } from "@/components/nav";
import { PageTabs } from "@/components/page-tabs";
import { QuickNew } from "@/components/quick-new";
import { requireUser } from "@/lib/auth";
import { isDesktop } from "@/lib/desktop/config";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div>
      <Nav user={user.name} isAdmin={user.role === "ADMIN"} desktop={isDesktop()} logout={logout} />
      <Suspense>
        <TrailRecorder />
      </Suspense>
      <main className="lg:ps-16">
        {/* On wide screens: the open pages as tabs, and the "+ New" menu. */}
        <div className="sticky top-0 z-20 hidden items-end gap-3 border-b border-slate-200 bg-white px-4 pt-2 lg:flex">
          <Suspense fallback={<div className="min-w-0 flex-1" />}>
            <PageTabs />
          </Suspense>
          <QuickNew isAdmin={user.role === "ADMIN"} className="mb-1.5 shrink-0" />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
