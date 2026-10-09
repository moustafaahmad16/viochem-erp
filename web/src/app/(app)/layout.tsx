import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div>
      <Nav user={user.name} isAdmin={user.role === "ADMIN"} logout={logout} />
      <main className="lg:ps-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
