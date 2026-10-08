import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Creates the first admin user from ADMIN_EMAIL and ADMIN_PASSWORD, if there are no users yet.
const db = new PrismaClient();

async function main() {
  if (await db.user.count()) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first user");
  await db.user.create({ data: { email, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Created admin user ${email}`);
}

main().finally(() => db.$disconnect());
