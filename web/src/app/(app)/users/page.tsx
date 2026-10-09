import { revalidatePath } from "next/cache";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { fail, required } from "@/lib/actions";
import { getT } from "@/i18n/server";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserError } from "@/lib/services/errors";

export async function generateMetadata() {
  return { title: (await getT())("Users") };
}

async function addUser(_: FormState, fd: FormData): Promise<FormState> {
  "use server";
  await requireAdmin();
  try {
    const password = required(fd, "password", "Password");
    if (password.length < 8) throw new UserError("Password must be at least 8 characters.");
    await db.user.create({
      data: {
        name: required(fd, "name", "Name"),
        email: required(fd, "email", "Email").toLowerCase(),
        role: fd.get("role") === "ADMIN" ? "ADMIN" : "STAFF",
        passwordHash: await hashPassword(password),
      },
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/users");
  return { ok: "User added. Send them the email and password." };
}

async function toggleUser(id: number) {
  "use server";
  const me = await requireAdmin();
  if (me.id === id) return;
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  await db.user.update({ where: { id }, data: { active: !u.active } });
  revalidatePath("/users");
}

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, t] = await Promise.all([db.user.findMany({ orderBy: { name: "asc" } }), getT()]);
  return (
    <>
      <PageHeader title={t("Users")} subtitle={t("People who can sign in to VIOCHEM")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Role")}</th><th>{t("Added")}</th><th /></tr>}>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === "ADMIN" ? <Badge color="blue">{t("Admin")}</Badge> : t("Staff")}</td>
                <td>{t.date(u.createdAt)}</td>
                <td className="text-end">
                  {u.id !== me.id && (
                    <form action={toggleUser.bind(null, u.id)}>
                      <button className="text-xs text-slate-500 hover:text-slate-900">{t(u.active ? "Turn off" : "Turn on")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={t("Add a user")}>
          <ActionForm action={addUser} resetOnSuccess>
            <Field label={t("Name")} name="name" required />
            <Field label={t("Email")} name="email" type="email" required />
            <Field label={t("Password")} name="password" type="text" required hint={t("At least 8 characters")} />
            <Select label={t("Role")} name="role" options={[{ value: "STAFF", label: t("Staff") }, { value: "ADMIN", label: t("Admin (can manage users)") }]} />
            <Submit>{t("Add user")}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
