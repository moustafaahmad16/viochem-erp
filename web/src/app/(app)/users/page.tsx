import { revalidatePath } from "next/cache";
import { ActionForm, Field, Select, Submit, type FormState } from "@/components/forms";
import { Badge, Card, PageHeader, Table } from "@/components/ui";
import { fail, required } from "@/lib/actions";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { UserError } from "@/lib/services/errors";

export const metadata = { title: "Users" };

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
  const users = await db.user.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Users" subtitle="People who can sign in to VIOCHEM" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2">
          <Table head={<tr><th>Name</th><th>Email</th><th>Role</th><th>Added</th><th /></tr>}>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === "ADMIN" ? <Badge color="blue">Admin</Badge> : "Staff"}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td className="text-end">
                  {u.id !== me.id && (
                    <form action={toggleUser.bind(null, u.id)}>
                      <button className="text-xs text-slate-500 hover:text-slate-900">{u.active ? "Turn off" : "Turn on"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add a user">
          <ActionForm action={addUser} resetOnSuccess>
            <Field label="Name" name="name" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Password" name="password" type="text" required hint="At least 8 characters" />
            <Select label="Role" name="role" options={[{ value: "STAFF", label: "Staff" }, { value: "ADMIN", label: "Admin (can manage users)" }]} />
            <Submit>Add user</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
