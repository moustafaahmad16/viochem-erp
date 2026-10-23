import { ViewOnly } from "@/components/forms";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { isDesktop } from "@/lib/desktop/config";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const viewOnly = user.role === "VIEWER";
  return (
    <div data-view-only={viewOnly || undefined}>
      <Nav user={user.name} isAdmin={user.role === "ADMIN"} desktop={isDesktop()} viewOnly={viewOnly} logout={logout} />
      <main className="lg:ps-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          <ViewOnly on={viewOnly}>{children}</ViewOnly>
        </div>
      </main>
    </div>
  );
}
