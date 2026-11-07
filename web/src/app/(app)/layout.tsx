import { Suspense } from "react";
import { TrailRecorder } from "@/components/back-link";
import { Nav } from "@/components/nav";
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
        <div className="mx-auto hidden max-w-6xl justify-end px-4 pt-4 sm:px-6 lg:flex">
          <QuickNew isAdmin={user.role === "ADMIN"} />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:pt-2 lg:pb-8">{children}</div>
      </main>
    </div>
  );
}
